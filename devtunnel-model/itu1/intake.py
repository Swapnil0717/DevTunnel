"""
ITU-1 -- Step 4: intake (Phase 4 Data Collection System)

What is here
    CollectedRecord   the Issue Capture record (Phase 4 Section 2.1) + validator
    CorpusIndex       exact-hash + simhash index for Q-DUP / Q-NEARDUP / repo ceilings
    LineageLog        append-only per-(record, stage) audit log (Section 5.2)
    process()         runs every Phase 4 gate that needs NO network and NO human:

        0  source qualification (licence)          8  snapshot normalization / hashing
        9  spam, vulnerability hook, secret/PII    10 language identification
           screen (flag + HOLD, never redact)      11 exact dedup + near-dup clustering
        12 context-tier integrity                  13 contamination reservation
        14 per-repo ceiling                        15 routing

What is NOT here (needs network / people): Stages 1-7 (fetching from GitHub).
`process()` takes a record whose content was already fetched. ground_truth is
always None in this phase.

Judgement calls where the spec is silent are marked  # DECISION.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

import sensitive

COLLECTOR_VERSION = "itu1-intake-0.1"

STAGES = {"RAW", "CONTEXT_FETCHED", "GATED", "READY_FOR_LABELING", "DEDUP_HELD",
          "REDACTION_HELD", "EVAL_RESERVED", "EXCLUDED"}

# Context tier -> (bundle key, allowed content keys). Tier 6 is QUARANTINED: it may
# be stored, but model_visible_bundle() never returns it.
TIER_KEYS = {
    2: ("tier_2", {"repo_structure", "readme", "repo_metadata", "fetched_at"}),
    3: ("tier_3", {"source_excerpts", "config", "fetched_at"}),
    4: ("tier_4", {"docs", "fetched_at"}),
    5: ("tier_5", {"dependency_graph", "fetched_at"}),
    6: ("tier_6", {"related_prs", "commit_history", "fetched_at"}),
    7: ("tier_7", {"project_conventions", "fetched_at"}),
}
QUARANTINED_TIER = 6


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class Config:
    # DECISION: licence allowlist is a placeholder policy, NOT legal advice (IR-1).
    allowed_licenses: frozenset = frozenset({
        "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD",
        "Unlicense", "CC0-1.0", "MPL-2.0"})
    authorized_repos: frozenset = frozenset()       # owner-authorized regardless of licence
    covered_languages: frozenset = frozenset({"en"})  # annotator coverage (Section 7)
    eval_repos: frozenset = frozenset()             # repository-level eval reservation (CP-1/CP-5)
    benchmark_simhashes: tuple = ()                 # known public-benchmark overlap (CP-6)
    near_dup_max_hamming: int = 8                   # PLACEHOLDER tuned on toy text; spec says "set empirically"
    repo_ceiling: float = 0.03                      # "low single-digit %" per repo (Phase 3 8.3)
    repo_ceiling_min_total: int = 100               # ceilings are meaningless on tiny corpora
    vuln_check: Callable[[dict], bool | None] | None = None  # True => active unpatched vuln
    collector_version: str = COLLECTOR_VERSION


# ------------------------------------------------------------------ record
def new_collected_record(*, collection_id: str, repo: str, issue_number: int, issue_url: str,
                         title: str, body: str, labels: list | None = None,
                         comments: list | None = None, snapshot_fetched_at: str,
                         license: str, fetch_run_id: str = "run-0",
                         collection_method: str = "manual",
                         context_bundle: dict | None = None) -> dict:
    bundle = {"tier_2": None, "tier_3": None, "tier_4": None, "tier_5": None,
              "tier_6": None, "tier_7": None, "max_tier_available": 1}
    bundle.update(context_bundle or {})
    return {
        "collection_id": collection_id,
        "identity": {"source_repo": repo, "source_issue_url": issue_url, "issue_number": issue_number},
        "input_core": {"title": title, "body": body, "labels": list(labels or []),
                       "comments": list(comments or []), "snapshot_fetched_at": snapshot_fetched_at},
        "context_bundle": bundle,
        "ground_truth": None,
        "data_provenance": {"license": license, "collection_method": collection_method,
                            "collector_version": COLLECTOR_VERSION, "fetch_run_id": fetch_run_id,
                            "lineage_log_ref": f"lineage/{collection_id}"},
        "quality_status": {"collection_stage": "CONTEXT_FETCHED", "quality_flags": [],
                           "dedup_cluster_id": None, "exclusion_reason": None},
    }


def validate_collected(rec: dict) -> list[str]:
    if not isinstance(rec, dict):
        return ["record must be an object"]
    errors = [f"structure: missing '{k}'" for k in
              ("collection_id", "identity", "input_core", "context_bundle", "data_provenance",
               "quality_status") if k not in rec]
    if errors:
        return errors
    if rec.get("ground_truth") is not None:
        errors.append("phase4: ground_truth must be null in a CollectedRecord")

    ident, core, prov, qs = rec["identity"], rec["input_core"], rec["data_provenance"], rec["quality_status"]
    for f in ("source_repo", "source_issue_url"):
        if not (isinstance(ident.get(f), str) and ident[f]):
            errors.append(f"structure: identity.{f} must be a non-empty string")
    if isinstance(ident.get("issue_number"), bool) or not isinstance(ident.get("issue_number"), int):
        errors.append("structure: identity.issue_number must be an integer")
    for f in ("title", "body", "snapshot_fetched_at"):
        if not isinstance(core.get(f), str):
            errors.append(f"structure: input_core.{f} must be a string")
    if not (isinstance(core.get("labels"), list) and all(isinstance(x, str) for x in core["labels"])):
        errors.append("structure: input_core.labels must be a list of strings")
    comments = core.get("comments")
    if not isinstance(comments, list):
        errors.append("structure: input_core.comments must be a list")
    else:
        for i, c in enumerate(comments):
            if not (isinstance(c, dict) and isinstance(c.get("body"), str)
                    and isinstance(c.get("author_role"), str)):
                errors.append(f"structure: comments[{i}] needs author_role and body strings")
    for f in ("license", "collection_method", "collector_version", "fetch_run_id", "lineage_log_ref"):
        if not (isinstance(prov.get(f), str) and prov[f]):
            errors.append(f"structure: data_provenance.{f} must be a non-empty string")
    if qs.get("collection_stage") not in STAGES:
        errors.append(f"structure: collection_stage={qs.get('collection_stage')!r} invalid")
    if qs.get("collection_stage") == "EXCLUDED" and not qs.get("exclusion_reason"):
        errors.append("phase4: EXCLUDED records need an exclusion_reason")
    if qs.get("collection_stage") != "EXCLUDED" and qs.get("exclusion_reason"):
        errors.append("phase4: exclusion_reason only allowed when EXCLUDED")

    bundle = rec["context_bundle"]
    for tier, (key, allowed) in TIER_KEYS.items():
        content = bundle.get(key)
        if content is None:
            continue
        if not isinstance(content, dict):
            errors.append(f"structure: context_bundle.{key} must be an object or null")
            continue
    if bundle.get("max_tier_available") not in range(1, 8):
        errors.append("structure: context_bundle.max_tier_available must be 1-7")
    return errors


def model_visible_bundle(rec: dict) -> dict:
    """Context that may ever reach a model input. Tier 6 (PR/commits) is never included."""
    out = {}
    for tier, (key, _) in TIER_KEYS.items():
        if tier == QUARANTINED_TIER:
            continue
        content = rec["context_bundle"].get(key)
        if content:
            out[key] = copy.deepcopy(content)
    return out


def source_hash(rec: dict) -> str:
    """Hash of the immutable source content (input_core + context_bundle)."""
    payload = json.dumps({"input_core": rec["input_core"], "context_bundle": rec["context_bundle"]},
                         sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# ------------------------------------------------------------------ lineage
@dataclass
class LineageLog:
    entries: list[dict] = field(default_factory=list)

    def add(self, collection_id: str, stage: str, action: str, result: str,
            reason: str | None = None, version: str = COLLECTOR_VERSION, ts: str | None = None):
        assert result in {"pass", "fail", "hold", "info"}
        self.entries.append({"collection_id": collection_id, "stage": stage, "timestamp": ts or _now(),
                             "collector_version": version, "action": action, "result": result,
                             "reason": reason})

    def for_record(self, collection_id: str) -> list[dict]:
        return [e for e in self.entries if e["collection_id"] == collection_id]

    def dump_jsonl(self, path: str):
        with open(path, "a", encoding="utf-8") as fh:
            for e in self.entries:
                fh.write(json.dumps(e, ensure_ascii=False) + "\n")


# ------------------------------------------------------------------ hashing
_MD_NOISE = re.compile(r"[*_`~>#|]+")


def normalize_for_hash(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    text = _MD_NOISE.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def exact_hash(title: str, body: str) -> str:
    norm = normalize_for_hash(title) + "\n" + normalize_for_hash(body)
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def simhash64(text: str, shingle: int = 2) -> int:
    words = re.findall(r"\w+", normalize_for_hash(text))
    if not words:
        return 0
    grams = [" ".join(words[i:i + shingle]) for i in range(max(1, len(words) - shingle + 1))]
    votes = [0] * 64
    for g in grams:
        h = int.from_bytes(hashlib.blake2b(g.encode("utf-8"), digest_size=8).digest(), "big")
        for bit in range(64):
            votes[bit] += 1 if (h >> bit) & 1 else -1
    return sum(1 << b for b in range(64) if votes[b] > 0)


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


@dataclass
class DedupResult:
    exact_of: str | None            # collection_id of the representative, if exact duplicate
    cluster_id: str | None
    neighbours: list[str]


class CorpusIndex:
    """Corpus-wide index (all repositories -- forks cluster too). JSON-serializable."""

    def __init__(self):
        self.exact: dict[str, str] = {}
        self.sims: list[dict] = []                # {id, sim, cluster}
        self.repo_counts: dict[str, int] = {}
        self.total = 0

    def lookup(self, exact: str, sim: int, max_hamming: int) -> DedupResult:
        if exact in self.exact:
            return DedupResult(self.exact[exact], None, [])
        near = [e for e in self.sims if hamming(e["sim"], sim) <= max_hamming]
        cluster = None
        for e in near:
            cluster = e["cluster"] or cluster
        if near and cluster is None:
            cluster = "c-" + near[0]["id"][:12]
        return DedupResult(None, cluster, [e["id"] for e in near])

    def add(self, collection_id: str, repo: str, exact: str, sim: int, cluster: str | None,
            representative: bool = True, neighbours: tuple | list = ()):
        if representative:
            self.exact.setdefault(exact, collection_id)
        if cluster:                                # back-fill the cluster id on earlier members
            near = set(neighbours)
            for e in self.sims:
                if e["id"] in near and e["cluster"] is None:
                    e["cluster"] = cluster
        self.sims.append({"id": collection_id, "sim": sim, "cluster": cluster})
        self.repo_counts[repo] = self.repo_counts.get(repo, 0) + 1
        self.total += 1

    def repo_share(self, repo: str) -> float:
        return (self.repo_counts.get(repo, 0) / self.total) if self.total else 0.0

    def to_dict(self) -> dict:
        return {"exact": self.exact, "sims": self.sims, "repo_counts": self.repo_counts, "total": self.total}

    @classmethod
    def from_dict(cls, d: dict) -> "CorpusIndex":
        idx = cls()
        idx.exact, idx.sims = dict(d["exact"]), list(d["sims"])
        idx.repo_counts, idx.total = dict(d["repo_counts"]), d["total"]
        return idx


# ------------------------------------------------------------------ language
# DECISION: no third-party language-ID library is available, so this is a small
# heuristic (Unicode script + stopwords). Swap in a real detector by passing a
# callable to process(..., detect_language=...). Text with fewer than
# MIN_LETTERS letters is "too short to tell", NOT "unidentified", so minimal
# issues (Phase 3 Example 3 pattern) are kept as the inclusion rules require.
MIN_LETTERS = 25
_SCRIPTS = [
    ("zh", re.compile(r"[\u4e00-\u9fff]")), ("ja", re.compile(r"[\u3040-\u30ff]")),
    ("ko", re.compile(r"[\uac00-\ud7af]")), ("ru", re.compile(r"[\u0400-\u04ff]")),
    ("ar", re.compile(r"[\u0600-\u06ff]")), ("hi", re.compile(r"[\u0900-\u097f]")),
]
_STOP = {
    "en": {"the", "and", "is", "to", "of", "in", "it", "not", "when", "this", "that", "for", "with", "on", "are", "be", "i"},
    "es": {"el", "la", "de", "que", "y", "en", "los", "un", "no", "con", "para", "es", "se", "por"},
    "de": {"der", "die", "und", "das", "nicht", "ist", "ein", "zu", "mit", "den", "von", "auf"},
    "fr": {"le", "la", "les", "des", "et", "est", "pas", "un", "une", "pour", "dans", "que", "qui"},
    "pt": {"o", "a", "os", "de", "que", "e", "não", "um", "uma", "para", "com", "em", "é"},
}
_CODE_FENCE = re.compile(r"```.*?```", re.S)


def detect_language(text: str) -> tuple[str, str]:
    """Returns (tag, status): status is 'identified' | 'too_short' | 'unidentified'."""
    prose = _CODE_FENCE.sub(" ", text)
    letters = re.findall(r"[^\W\d_]", prose)
    if len(letters) < MIN_LETTERS:
        return "und", "too_short"
    for tag, pat in _SCRIPTS:
        if len(pat.findall(prose)) >= 0.3 * len(letters):
            return tag, "identified"
    words = re.findall(r"[^\W\d_]+", prose.lower())
    scores = {lang: sum(w in sw for w in words) / max(1, len(words)) for lang, sw in _STOP.items()}
    best = max(scores, key=scores.get)
    if scores[best] >= 0.12:
        return best, "identified"
    return "und", "unidentified"


# ------------------------------------------------------------------ screens
_URL = re.compile(r"https?://\S+")
_TEMPLATE_LINE = re.compile(r"^\s*(?:#{1,6}\s.*|[-*]\s*\[[ xX]\].*|<!--.*?-->|\s*)$")


def _all_text(rec: dict) -> str:
    core = rec["input_core"]
    return "\n".join([core["title"], core["body"]] + [c["body"] for c in core["comments"]])


def looks_like_spam(rec: dict) -> str | None:
    """ER-1 heuristics. Returns a reason string or None. DECISION: heuristics only --
    deliberately narrow so terse-but-real issues are never filtered (Q-LOWQ)."""
    core = rec["input_core"]
    title, body = core["title"].strip(), core["body"]
    comments = core["comments"]
    if not title and not body.strip() and comments and all(c.get("author_role") == "bot" for c in comments):
        return "bot_only_content"
    urls = _URL.findall(_all_text(rec))
    prose_words = re.findall(r"[^\W\d_]+", _URL.sub(" ", title + " " + body))
    if len(urls) >= 3 and len(prose_words) < 15:
        return "link_farm"
    if body.strip():
        lines = body.splitlines()
        scaffold = [ln for ln in lines if ln.strip() and _TEMPLATE_LINE.match(ln)]
        content = [ln for ln in lines if ln.strip() and not _TEMPLATE_LINE.match(ln)]
        if scaffold and not content:
            return "template_only"
    return None


def scan_sensitive(rec: dict) -> list[str]:
    """Detect (never redact) secrets/PII across every text the record carries."""
    kinds: set[str] = set()
    texts = [rec["input_core"]["title"], rec["input_core"]["body"]]
    texts += [c["body"] for c in rec["input_core"]["comments"]]
    texts += _context_strings(rec)
    for t in texts:
        for f in sensitive.detect(t):
            kinds.add(f"{f.kind}")
    return sorted(kinds)


def _context_strings(rec: dict) -> list[str]:
    out: list[str] = []

    def walk(x: Any):
        if isinstance(x, str):
            out.append(x)
        elif isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    for tier, (key, _) in TIER_KEYS.items():
        walk(rec["context_bundle"].get(key))
    return out


# ------------------------------------------------------------------ tier integrity
def enforce_tier_integrity(rec: dict) -> list[str]:
    """Stage 12. Drop any tier bundle holding another tier's fields (IR-3) and
    recompute max_tier_available. Returns the list of dropped bundle keys."""
    bundle = rec["context_bundle"]
    dropped = []
    for tier, (key, allowed) in TIER_KEYS.items():
        content = bundle.get(key)
        if isinstance(content, dict) and set(content) - allowed:
            bundle[key] = None
            dropped.append(key)
    # DECISION: max tier = highest non-null model-visible tier; the quarantined
    # tier 6 never counts toward what a model may see.
    present = [t for t, (k, _) in TIER_KEYS.items() if t != QUARANTINED_TIER and bundle.get(k)]
    bundle["max_tier_available"] = max([1] + present)
    return dropped


# ------------------------------------------------------------------ process
def qualify_source(repo: str, license: str | None, cfg: Config) -> tuple[bool, str | None]:
    """Stage 0. Run BEFORE any fetch (IR-1, ER-2, PS-4)."""
    if repo in cfg.authorized_repos:
        return True, None
    if not license:
        return False, "unknown_license"
    if license not in cfg.allowed_licenses:
        return False, f"license_not_permitted:{license}"
    return True, None


def process(record: dict, cfg: Config, index: CorpusIndex, log: LineageLog,
            detect_language_fn: Callable[[str], tuple[str, str]] = detect_language,
            now: str | None = None) -> tuple[dict, dict]:
    """Run Stages 0, 8-15 on an already-fetched record.

    Returns (updated_record, CollectionMetadataRecord). The input is not mutated;
    the index and log are (that is their job).
    """
    errors = validate_collected(record)
    if errors:
        raise ValueError(f"invalid CollectedRecord: {errors}")

    rec = copy.deepcopy(record)
    cid = rec["collection_id"]
    repo = rec["identity"]["source_repo"]
    qs = rec["quality_status"]
    flags: list[str] = list(qs["quality_flags"])
    ts = now or _now()

    def exclude(stage: str, reason: str) -> tuple[dict, dict]:
        log.add(cid, stage, "gate", "fail", reason, cfg.collector_version, ts)
        qs.update(collection_stage="EXCLUDED", exclusion_reason=reason, quality_flags=_uniq(flags))
        log.add(cid, "15_routing", "route", "info", "EXCLUDED", cfg.collector_version, ts)
        return rec, _metadata(rec, cfg, None, None, "und", ts)

    # Stage 0
    ok, why = qualify_source(repo, rec["data_provenance"]["license"], cfg)
    if not ok:
        return exclude("0_source_qualification", why)
    log.add(cid, "0_source_qualification", "licence check", "pass", None, cfg.collector_version, ts)

    # Stage 8
    rec["data_provenance"]["source_sha256"] = source_hash(rec)
    core = rec["input_core"]
    ex_hash = exact_hash(core["title"], core["body"])
    sim = simhash64(core["title"] + "\n" + core["body"])
    log.add(cid, "8_snapshot_normalization", "hash", "pass", None, cfg.collector_version, ts)

    # Stage 9
    spam = looks_like_spam(rec)
    if spam:
        return exclude("9_screen", f"spam:{spam}")
    if cfg.vuln_check is None:
        flags.append("vuln_screen_not_run")
    elif cfg.vuln_check(rec):
        return exclude("9_screen", "active_unpatched_vulnerability")
    sens = scan_sensitive(rec)
    hold_redaction = bool(sens)
    if hold_redaction:
        flags.append("pii_suspected")
        log.add(cid, "9_screen", "secret/PII detection", "hold", ",".join(sens), cfg.collector_version, ts)
    else:
        log.add(cid, "9_screen", "spam/vuln/secret screen", "pass", None, cfg.collector_version, ts)

    # Stage 10
    lang_text = core["title"] + "\n" + core["body"]
    lang, status = detect_language_fn(lang_text)
    hold_language = False
    if status == "unidentified":
        flags.append("unidentified_language")
        return exclude("10_language", "unidentified_language")
    if status == "too_short":
        flags.append("language_unverified_short_text")
    elif lang not in cfg.covered_languages:
        flags.append(f"awaiting_annotator_coverage:{lang}")
        hold_language = True
    log.add(cid, "10_language", "language id", "hold" if hold_language else "pass", lang,
            cfg.collector_version, ts)

    # Stage 11
    dd = index.lookup(ex_hash, sim, cfg.near_dup_max_hamming)
    exact_dup = dd.exact_of is not None
    if exact_dup:
        flags.append(f"exact_duplicate_of:{dd.exact_of}")
        log.add(cid, "11_dedup", "exact hash", "hold", dd.exact_of, cfg.collector_version, ts)
    else:
        if dd.cluster_id:
            flags.append(f"near_dup_cluster:{dd.cluster_id}")
            qs["dedup_cluster_id"] = dd.cluster_id
        log.add(cid, "11_dedup", "near-dup clustering", "pass", dd.cluster_id, cfg.collector_version, ts)

    # Stage 12
    dropped = enforce_tier_integrity(rec)
    for key in dropped:
        flags.append(f"tier_bundle_dropped:{key}")
    log.add(cid, "12_tier_integrity", "tier check", "fail" if dropped else "pass",
            ",".join(dropped) or None, cfg.collector_version, ts)

    # Stage 13
    eval_reserved = repo in cfg.eval_repos
    if any(hamming(sim, b) <= cfg.near_dup_max_hamming for b in cfg.benchmark_simhashes):
        flags.append("benchmark_overlap")
    log.add(cid, "13_contamination", "eval/benchmark check", "hold" if eval_reserved else "pass",
            "eval_repo" if eval_reserved else None, cfg.collector_version, ts)

    # Stage 14
    over_cap = (index.total >= cfg.repo_ceiling_min_total
                and index.repo_share(repo) >= cfg.repo_ceiling)
    if over_cap:
        flags.append(f"over_cap:{repo}")
    log.add(cid, "14_diversity", "repo ceiling", "hold" if over_cap else "pass", None, cfg.collector_version, ts)

    # Stage 15 -- DECISION: precedence EVAL_RESERVED > REDACTION_HELD > DEDUP_HELD > GATED > READY
    if eval_reserved:
        stage = "EVAL_RESERVED"
    elif hold_redaction:
        stage = "REDACTION_HELD"
    elif exact_dup:
        stage = "DEDUP_HELD"
    elif hold_language or over_cap:
        stage = "GATED"
    else:
        stage = "READY_FOR_LABELING"
    qs.update(collection_stage=stage, quality_flags=_uniq(flags))
    log.add(cid, "15_routing", "route", "info", stage, cfg.collector_version, ts)

    index.add(cid, repo, ex_hash, sim, dd.cluster_id, representative=not exact_dup,
              neighbours=dd.neighbours)
    return rec, _metadata(rec, cfg, ex_hash, sim, lang, ts)


def _uniq(seq):
    seen, out = set(), []
    for s in seq:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _metadata(rec: dict, cfg: Config, ex_hash: str | None, sim: int | None, lang: str, ts: str) -> dict:
    """CollectionMetadataRecord (Section 4): operational data kept off the content record."""
    core = rec["input_core"]
    return {
        "collection_id": rec["collection_id"],
        "fetch_run_id": rec["data_provenance"]["fetch_run_id"],
        "collector_version": cfg.collector_version,
        "per_artifact_fetched_at": {"issue": core["snapshot_fetched_at"],
                                    **{k: (rec["context_bundle"].get(k) or {}).get("fetched_at")
                                       for _, (k, _a) in TIER_KEYS.items()}},
        "content_hashes": {"exact": ex_hash, "simhash64": sim,
                           "source_sha256": rec["data_provenance"].get("source_sha256")},
        "max_tier_available": rec["context_bundle"]["max_tier_available"],
        "size_metrics": {"title_chars": len(core["title"]), "body_chars": len(core["body"]),
                         "comments": len(core["comments"])},
        "language_tag": "unidentified" if lang == "und" else lang,
        "processed_at": ts,
    }
