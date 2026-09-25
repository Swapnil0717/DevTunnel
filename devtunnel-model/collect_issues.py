#!/usr/bin/env python3
"""
ITU-1 -- Step 2: free data collection (Section 4 / 5 of the master build prompt)

Pulls Tier-1 issue content (title, body, labels, top-level comments) from a
small list of permissively-licensed public repos using the free GitHub REST
API, then runs every record through the EXISTING itu1/intake.py pipeline
(licence gate, hashing, spam/secret/PII screen, language ID, dedup,
per-repo ceiling, routing) before anything is written to disk.

This script needs network access and a free GitHub Personal Access Token
(no scopes required for public repos -- classic PAT or fine-grained,
public-repo read access is enough). Run it on your own machine, not in a
sandboxed environment. It is intentionally slow/serial and rate-limit
aware: with a PAT you get 5,000 requests/hour, which is generous for
3-5 repos.

Usage
-----
    export GITHUB_TOKEN=ghp_xxx...
    python collect_issues.py \
        --repos psf/requests pallets/flask tiangolo/fastapi \
        --max-per-repo 800 \
        --out data/collected.jsonl \
        --lineage-out data/lineage.jsonl \
        --index-out data/corpus_index.json

Re-running is safe: it re-loads --index-out (if present) so exact/near-dup
counts and per-repo ceilings accumulate correctly across runs, and it skips
issue numbers already present in --out.

Output
------
One JSON object per line in --out: the itu1 CollectedRecord as returned by
intake.process(), i.e. AFTER Stages 0 and 8-15 have run. Records with
quality_status.collection_stage == "EXCLUDED" or "DEDUP_HELD" or
"REDACTION_HELD" are still written (so you can audit why), but Step 3/4
(labeling) should filter to collection_stage == "READY_FOR_LABELING" only
-- see the `is_labelable()` helper below, which Step 3/4 scripts should
import.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

# itu1's modules import each other as a flat namespace (e.g. intake.py does
# `import sensitive`, not a package-relative import), so the itu1/ directory
# itself -- not its parent -- must be on sys.path. Put this script next to
# the itu1/ folder, or pass --itu1-dir.
_HERE = Path(__file__).resolve().parent
_ITU1_DIR = _HERE / "itu1"
sys.path.insert(0, str(_ITU1_DIR if _ITU1_DIR.is_dir() else _HERE))
import intake  # noqa: E402

GITHUB_API = "https://api.github.com"


def is_labelable(rec: dict) -> bool:
    """The only stage Step 3/4 (labeling) should ever pull from."""
    return rec["quality_status"]["collection_stage"] == "READY_FOR_LABELING"


# --------------------------------------------------------------------- HTTP

class GitHubClient:
    def __init__(self, token: str):
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        })

    def _get(self, url: str, **params) -> requests.Response:
        while True:
            resp = self.session.get(url, params=params)
            if resp.status_code == 403 and "rate limit" in resp.text.lower():
                reset = int(resp.headers.get("X-RateLimit-Reset", time.time() + 60))
                wait = max(reset - time.time(), 1) + 2
                print(f"  rate limited, sleeping {wait:.0f}s", file=sys.stderr)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp

    def repo_license(self, repo: str) -> str | None:
        r = self._get(f"{GITHUB_API}/repos/{repo}")
        lic = r.json().get("license") or {}
        return lic.get("spdx_id") if lic.get("spdx_id") not in (None, "NOASSERTION") else None

    def issues(self, repo: str, max_count: int):
        """Yields raw issue dicts (PRs excluded), newest first, up to max_count.

        GitHub's REST issue-list endpoint refuses very deep pagination (422
        Unprocessable Entity, typically somewhere past page ~10-100 depending
        on the repo) rather than just returning an empty page like a normal
        end-of-results. That happens on repos where most /issues results are
        actually PRs (skipped here, not counted toward max_count), so it can
        take many pages to find enough real issues -- sometimes more pages
        than GitHub allows. Treat that specific error as "no more issues
        available from this repo" instead of letting it crash the whole
        multi-repo run.
        """
        page = 1
        seen = 0
        while seen < max_count:
            try:
                r = self._get(
                    f"{GITHUB_API}/repos/{repo}/issues",
                    state="all", per_page=100, page=page, sort="created", direction="desc",
                )
            except requests.exceptions.HTTPError as e:
                if e.response is not None and e.response.status_code == 422:
                    print(f"  {repo}: hit GitHub's pagination limit at page {page} "
                          f"({seen} real issues found so far) -- moving on", file=sys.stderr)
                    return
                raise
            batch = r.json()
            if not batch:
                return
            for issue in batch:
                if "pull_request" in issue:  # PRs show up in /issues too; skip them
                    continue
                yield issue
                seen += 1
                if seen >= max_count:
                    return
            page += 1

    def comments(self, repo: str, issue_number: int, reporter_login: str | None,
                 max_count: int = 20) -> list[dict]:
        r = self._get(
            f"{GITHUB_API}/repos/{repo}/issues/{issue_number}/comments",
            per_page=min(max_count, 100),
        )
        return [{"body": c.get("body") or "",
                  "author_role": _author_role(c, reporter_login),
                  "created_at": c.get("created_at")}
                for c in r.json()[:max_count]]


def _author_role(comment: dict, reporter_login: str | None) -> str:
    """Map GitHub's per-comment fields to itu1's author_role vocabulary
    (architecture.py checks specifically for "reporter" and "bot")."""
    user = comment.get("user") or {}
    if user.get("type") == "Bot" or (user.get("login") or "").endswith("[bot]"):
        return "bot"
    if reporter_login and user.get("login") == reporter_login:
        return "reporter"
    assoc = comment.get("author_association", "NONE")
    if assoc in ("OWNER", "MEMBER", "COLLABORATOR"):
        return "maintainer"
    if assoc in ("CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR"):
        return "contributor"
    return "commenter"


# ------------------------------------------------------------- record build

def build_record(repo: str, issue: dict, comments: list[dict], license_: str | None,
                  fetch_run_id: str, collection_id_counter: list[int]) -> dict:
    collection_id_counter[0] += 1
    cid = f"{repo.replace('/', '_')}-{issue['number']}"
    return intake.new_collected_record(
        collection_id=cid,
        repo=repo,
        issue_number=issue["number"],
        issue_url=issue["html_url"],
        title=issue.get("title") or "",
        body=issue.get("body") or "",
        labels=[lbl["name"] if isinstance(lbl, dict) else lbl for lbl in issue.get("labels", [])],
        comments=comments,
        snapshot_fetched_at=intake._now(),
        license=license_,
        fetch_run_id=fetch_run_id,
        collection_method="github_rest_api",
    )


# ---------------------------------------------------------------------- IO

def load_seen_issue_numbers(out_path: Path) -> dict[str, set[int]]:
    seen: dict[str, set[int]] = {}
    if not out_path.exists():
        return seen
    with out_path.open(encoding="utf-8") as fh:
        for line in fh:
            rec = json.loads(line)
            repo = rec["identity"]["source_repo"]
            seen.setdefault(repo, set()).add(rec["identity"]["issue_number"])
    return seen


def load_index(index_path: Path) -> intake.CorpusIndex:
    idx = intake.CorpusIndex()
    if index_path.exists():
        data = json.loads(index_path.read_text(encoding="utf-8"))
        idx.exact = data["exact"]
        idx.sims = data["sims"]
        idx.repo_counts = data["repo_counts"]
        idx.total = data["total"]
    return idx


def save_index(idx: intake.CorpusIndex, index_path: Path):
    index_path.write_text(json.dumps({
        "exact": idx.exact, "sims": idx.sims,
        "repo_counts": idx.repo_counts, "total": idx.total,
    }), encoding="utf-8")


# --------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repos", nargs="+", required=True, help="owner/name, e.g. psf/requests")
    ap.add_argument("--max-per-repo", type=int, default=800)
    ap.add_argument("--max-comments", type=int, default=20)
    ap.add_argument("--out", default="data/collected.jsonl")
    ap.add_argument("--lineage-out", default="data/lineage.jsonl")
    ap.add_argument("--index-out", default="data/corpus_index.json")
    ap.add_argument("--fetch-run-id", default=f"run-{int(time.time())}")
    ap.add_argument("--sleep", type=float, default=0.2, help="seconds between issues, be polite")
    ap.add_argument("--license-override", nargs="*", default=[],
                     metavar="OWNER/NAME=LICENSE",
                     help="Manually assert a repo's SPDX license when GitHub's "
                          "auto-detection returns none (common on repos with "
                          "multiple/bundled license files, e.g. numpy, celery). "
                          "Only use this when you have personally verified the "
                          "repo's actual license -- it bypasses GitHub's check, "
                          "not the allowed_licenses allowlist itself. "
                          "Example: --license-override numpy/numpy=BSD-3-Clause celery/celery=BSD-3-Clause")
    args = ap.parse_args()

    license_overrides: dict[str, str] = {}
    for item in args.license_override:
        if "=" not in item:
            sys.exit(f"--license-override entries must look like OWNER/NAME=LICENSE, got: {item!r}")
        repo_key, lic = item.split("=", 1)
        license_overrides[repo_key.strip()] = lic.strip()

    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        sys.exit("Set GITHUB_TOKEN to a free GitHub Personal Access Token (public repo read access).")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    lineage_path = Path(args.lineage_out)
    index_path = Path(args.index_out)

    client = GitHubClient(token)
    cfg = intake.Config()
    index = load_index(index_path)
    log = intake.LineageLog()
    already = load_seen_issue_numbers(out_path)
    counter = [0]

    stage_counts: dict[str, int] = {}
    per_repo_written: dict[str, int] = {}

    with out_path.open("a", encoding="utf-8") as out_fh:
        for repo in args.repos:
            print(f"== {repo} ==")
            license_ = client.repo_license(repo)
            if not license_ and repo in license_overrides:
                license_ = license_overrides[repo]
                print(f"  license: {license_}  (manual override -- GitHub auto-detection returned none)")
            else:
                print(f"  license: {license_}")
            if license_ and license_ not in cfg.allowed_licenses:
                print(f"  skipping repo: license {license_!r} is not in the allowed list "
                      f"{sorted(cfg.allowed_licenses)}", file=sys.stderr)
                continue
            skip = already.get(repo, set())
            n_written = 0
            for issue in client.issues(repo, args.max_per_repo):
                if issue["number"] in skip:
                    continue
                reporter_login = (issue.get("user") or {}).get("login")
                comments = client.comments(repo, issue["number"], reporter_login, args.max_comments) \
                    if issue.get("comments", 0) else []
                raw = build_record(repo, issue, comments, license_, args.fetch_run_id, counter)
                try:
                    processed, _meta = intake.process(raw, cfg, index, log)
                except ValueError as e:
                    print(f"  skip issue #{issue['number']}: {e}", file=sys.stderr)
                    continue
                out_fh.write(json.dumps(processed, ensure_ascii=False) + "\n")
                stage = processed["quality_status"]["collection_stage"]
                stage_counts[stage] = stage_counts.get(stage, 0) + 1
                if stage == "READY_FOR_LABELING":
                    n_written += 1
                time.sleep(args.sleep)
            per_repo_written[repo] = n_written
            print(f"  {n_written} issues reached READY_FOR_LABELING")

    log.dump_jsonl(str(lineage_path))
    save_index(index, index_path)

    print("\n== summary ==")
    for stage, n in sorted(stage_counts.items()):
        print(f"  {stage}: {n}")
    print(f"\nready-for-labeling by repo: {per_repo_written}")
    print(f"total ready-for-labeling so far (this run + prior, on disk): "
          f"{sum(1 for _ in out_path.open(encoding='utf-8') if True)} lines written total to {out_path}")
    print(f"\nNext: Step 3 (weak-label bootstrap + clustering) should read {out_path}, "
          f"filter with collect_issues.is_labelable(rec), and only then proceed.")


if __name__ == "__main__":
    main()