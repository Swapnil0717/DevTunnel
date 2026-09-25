#!/usr/bin/env python3
"""
ITU-1 -- Step 4: Claude-assisted labeling pass (Section 4.3 / 5 Step 4 of
the master build prompt)

Reads collected.jsonl (Step 2) + weak_labels.jsonl (Step 3, pre-fill hints
only), asks the Claude API to propose a full set of FieldProposals per
issue using the EXACT contract itu1/architecture.py's real heads must
satisfy, feeds those proposals through the EXISTING, unmodified
architecture.understand() -> assemble() pipeline (grounding, the rule
engine, the degradation lattice, derived-field computation), and wraps
every record that comes out valid as a TrainingExample (itu1/example.py)
with:

    label_provenance.labeling_method = "MODEL_ASSISTED_HUMAN_CORRECTED"
    quality_status.tier              = "SILVER"   (never GOLD -- example.py
                                                     enforces this, correctly)

This script does NOT build the separate hand-labeled GOLD eval set --
that's intentionally out of scope here. It DOES implement the human
spot-check step the master build prompt requires for the SILVER tier to
mean anything (~15-20% random sample -> spot_check_needed.jsonl -> your
corrections go in a corrections.jsonl -> --apply-corrections folds them
back in and re-derives/re-validates).

Why this is thin
-----------------
All the actual intelligence (grounding rules, the rule engine, the
degradation lattice, confidence/uncertainty/review derivation) already
lives in itu1/architecture.py and itu1/derived.py, untouched. This script
only has to do two things architecture.py deliberately leaves to a real
"engine": (1) turn issue segments into FieldProposals by asking Claude,
(2) a belt-and-suspenders check that every EXPLICIT/SUPPORTED_BY_CONTEXT/
INFERRED claim's evidence_text is actually a verbatim substring of the
segment(s) it points to -- downgrading to INFERRED (or UNKNOWN with no
pointers) if not, since a hallucinated quote is worse than an honest
"can't ground this."

Usage
-----
    export ANTHROPIC_API_KEY=sk-ant-...
    python claude_label.py \
        --collected data/collected.jsonl \
        --weak-labels data/weak_labels.jsonl \
        --batches data/labeling_batches.jsonl \
        --out data/training_examples.jsonl \
        --spot-check-out data/spot_check_needed.jsonl \
        --rejects-out data/rejected.jsonl \
        --spot-check-rate 0.175 \
        --model claude-sonnet-4-6 \
        --license MIT

Then, after you've reviewed data/spot_check_needed.jsonl and written your
corrections to data/corrections.jsonl (one line per correction:
{"example_id": "...", "corrections": {"task_type": "Bug", ...},
"annotator_id": "you"}):

    python claude_label.py --apply-corrections data/corrections.jsonl \
        --out data/training_examples.jsonl

(--apply-corrections rewrites --out in place, re-deriving and
re-validating every corrected example; it does not re-call Claude.)

Cost note: claude-haiku-4-5 is far cheaper for a 1,500-3,000-issue bulk
pass; claude-sonnet-4-6 is more careful on ambiguous cases. Consider Haiku
for the bulk pass and Sonnet only for issues the batch sizes below flag as
low-confidence, if cost matters to you.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
import uuid
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent / "itu1"))
import architecture  # noqa: E402
import example as example_mod  # noqa: E402
import schema  # noqa: E402
from derived import finalize, validate_all  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect_issues import is_labelable  # noqa: E402

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
TOOL_VERSION = "claude-label-0.1"

# Fields Claude is always asked to fill in, with an UNKNOWN/empty default
# for anything it skips or gets rejected by post-processing. Must match
# itu1/schema.py's PROVENANCE_REQUIRED -- see the comment on
# `default_fill_proposals` for why every one of these needs an entry.
CLASSIFICATION_FIELDS = ("role", "experience_level", "complexity", "task_type")
PROSE_FIELDS = ("title", "summary", "objective", "expected_outcome")
LIST_FIELDS = ("technologies", "languages", "frameworks", "technical_areas",
                "components", "systems", "affected_areas")

SYSTEM_PROMPT = """You are labeling a GitHub issue for the ITU-1 dataset. \
You are given numbered TEXT SEGMENTS (verbatim, never paraphrase them) and \
must output a JSON array of field proposals -- nothing else, no markdown \
fences, no commentary.

Each element of the array must be an object:
{
  "field": "<field name>",
  "value": <the value -- string, list of strings, or the scope object>,
  "source": "EXPLICIT" | "SUPPORTED_BY_CONTEXT" | "INFERRED" | "UNKNOWN",
  "pointers": ["S1", "S3", ...],   // segment_ids this claim is grounded in; [] if UNKNOWN
  "evidence_text": "<verbatim substring copied from a pointed segment>" | null,
  "confidence": <0.0-1.0> | null   // null only when source is UNKNOWN
}

Grounding rules (violating these gets the claim silently discarded):
- evidence_text must be an exact, verbatim substring of the text of a
  segment you listed in pointers. Never paraphrase, summarize, or
  reconstruct a quote from memory -- copy it exactly.
- source=EXPLICIT only when the issue's own title/body/label text directly
  states the value. source=SUPPORTED_BY_CONTEXT when a comment or label
  supports it. source=INFERRED when you are inferring from indirect signal
  (e.g. judging complexity from described scope). source=UNKNOWN with no
  pointers/evidence/confidence when you have no real signal -- prefer
  UNKNOWN over a low-confidence guess.

Required fields, every time (use source=UNKNOWN + empty/appropriate-default
value when you have no signal -- do not omit the field):
  task_type   one of: Bug, Feature, Improvement, Refactor, Performance,
              Security, Maintenance, Documentation, Other, Unknown
  role        one of: Frontend, Backend, Fullstack, Unknown
  experience_level  one of: Beginner, Intermediate, Advanced, Unknown
  complexity  one of: Low, Medium, High, Unknown
  title       short string
  summary     1-3 sentence string
  objective   string: what needs to be done
  expected_outcome  string: what "done" looks like
  acceptance_criteria  list of strings (can be [] with source UNKNOWN)
  scope       {"in_scope": [...], "out_of_scope": [...]} (empty lists OK)

Optional fields, include only when you have real signal, otherwise omit
entirely (do not send empty-UNKNOWN versions of these -- the caller fills
defaults for any you skip):
  technologies, languages, frameworks, technical_areas, components,
  systems, affected_areas (all lists of strings), dependencies (list of
  {"type": "blocks"|"blocked_by"|"relates_to"|"requires", "ref": "...",
  "description": "..."})

A pre-fill hint from a cheap heuristic may be given below. Treat it as a
suggestion only -- verify against the actual segment text and override or
discard it if it's wrong. Output the JSON array now."""


# ------------------------------------------------------- Claude API client

def call_claude(system: str, user: str, model: str, api_key: str,
                 max_tokens: int = 2000, max_retries: int = 5) -> str:
    for attempt in range(max_retries):
        resp = requests.post(
            ANTHROPIC_API_URL,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": max_tokens,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
            timeout=120,
        )
        if resp.status_code == 429 or resp.status_code >= 500:
            wait = min(60, 2 ** attempt)
            print(f"  Claude API {resp.status_code}, retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        data = resp.json()
        return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    raise RuntimeError("Claude API: exhausted retries")


# ---------------------------------------------------------- prompt building

def render_segments(segments: list["architecture.Segment"]) -> str:
    lines = []
    for s in segments:
        lines.append(f"[{s.segment_id}] ({s.type}) {s.text}")
    return "\n".join(lines)


def render_hint(weak: dict | None) -> str:
    if not weak:
        return "(no pre-fill hint available)"
    parts = []
    for field, val in weak.items():
        if val:
            parts.append(f"{field}: {val['value']} (heuristic, confidence {val['confidence']})")
    return "\n".join(parts) if parts else "(no pre-fill hint available)"


# --------------------------------------------------- response parsing

def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def parse_claude_response(text: str) -> list[dict]:
    """Raises ValueError on unparseable output -- caller treats as a reject."""
    text = _strip_fences(text)
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("expected a JSON array of proposals")
    return data


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def verify_grounding(items: list[dict], segments: list["architecture.Segment"]
                      ) -> list["architecture.FieldProposal"]:
    """Belt-and-suspenders check beyond what architecture.py itself enforces:
    evidence_text must actually appear, verbatim (whitespace-normalized),
    in the text of a pointed segment. A hallucinated quote gets its claim
    downgraded, never trusted as-is."""
    by_id = {s.segment_id: s for s in segments}
    proposals = []
    for item in items:
        field = item.get("field")
        if not isinstance(field, str):
            continue
        value = item.get("value")
        source = item.get("source", "UNKNOWN")
        pointers = [p for p in (item.get("pointers") or []) if p in by_id]
        evidence = item.get("evidence_text")
        confidence = item.get("confidence")

        if source != "UNKNOWN" and evidence:
            pointed_text = " ".join(by_id[p].text for p in pointers)
            if _normalize(evidence) not in _normalize(pointed_text):
                source = "INFERRED" if pointers else "UNKNOWN"
                confidence = min(confidence, 0.4) if isinstance(confidence, (int, float)) else 0.3
                if source == "UNKNOWN":
                    pointers, evidence, confidence = [], None, None

        proposals.append(architecture.FieldProposal(
            field=field, value=value, source=source, pointers=pointers,
            evidence_text=evidence, confidence=confidence, note=item.get("note"),
        ))
    return proposals


def default_fill_proposals(proposals: list["architecture.FieldProposal"]
                            ) -> list["architecture.FieldProposal"]:
    """architecture._build_raw_record only writes a task/provenance entry
    for fields that received a proposal at all; a field with NO proposal
    fails schema Rule 1 (missing provenance) and, for non-classification
    fields, nothing in the degradation lattice repairs that below Level 4
    (see architecture._level1_repair). So -- exactly like
    HeuristicStubEngine does -- every optional field this pass didn't
    address gets an explicit UNKNOWN/empty proposal rather than being left
    absent."""
    have = {p.field for p in proposals}
    filled = list(proposals)
    for f in LIST_FIELDS:
        if f not in have:
            filled.append(architecture.FieldProposal(f, [], "UNKNOWN"))
    if "dependencies" not in have:
        filled.append(architecture.FieldProposal("dependencies", [], "UNKNOWN"))
    if "scope" not in have:
        filled.append(architecture.FieldProposal("scope", {"in_scope": [], "out_of_scope": []}, "UNKNOWN"))
    if "acceptance_criteria" not in have:
        filled.append(architecture.FieldProposal("acceptance_criteria", [], "UNKNOWN"))
    # Classification fields missing entirely -> UNKNOWN (mirrors what
    # _build_raw_record already does for a claim it can't ground).
    for f in CLASSIFICATION_FIELDS:
        if f not in have:
            filled.append(architecture.FieldProposal(f, "Unknown", "UNKNOWN"))
    return filled


class ClaudeEngine:
    """Satisfies architecture.py's `engine.propose(segments) ->
    list[FieldProposal]` contract (same contract NullEngine/
    HeuristicStubEngine satisfy) by asking the real Claude API."""

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    def propose(self, segments: list["architecture.Segment"], weak: dict | None = None
                 ) -> list["architecture.FieldProposal"]:
        user = (f"TEXT SEGMENTS:\n{render_segments(segments)}\n\n"
                f"PRE-FILL HINT (verify, do not trust blindly):\n{render_hint(weak)}")
        raw = call_claude(SYSTEM_PROMPT, user, self.model, self.api_key)
        items = parse_claude_response(raw)  # raises on bad JSON -> caller rejects
        proposals = verify_grounding(items, segments)
        return default_fill_proposals(proposals)


# --------------------------------------------------------- TrainingExample

def build_training_example(rec: dict, ground_truth: dict, fallback_license: str, model: str) -> dict:
    core = rec["input_core"]
    src = ground_truth["task_identity"]["source_issue"]
    # Use this record's own true license (set correctly per-repo back in
    # collect_issues.py), not a single global value -- the corpus mixes
    # MIT/Apache-2.0/BSD-3-Clause/etc. across repos, and stamping everything
    # with one license would corrupt label_provenance for most records.
    license_ = rec.get("data_provenance", {}).get("license") or fallback_license
    return {
        "example_id": str(uuid.uuid4()),
        "input": {
            "issue": {
                "title": core["title"], "body": core["body"],
                "labels": core["labels"], "comments": [c.get("body", "") for c in core["comments"]],
            },
            "context_tier": 1,
            "available_context": {},
        },
        "ground_truth": ground_truth,
        "label_provenance": {
            "labeling_method": "MODEL_ASSISTED_HUMAN_CORRECTED",
            "annotator_ids": [f"claude:{model}"],
            "source_repo": src["repo"],
            "source_issue_url": src["issue_url"],
            "snapshot_fetched_at": src["snapshot_fetched_at"],
            "license": license_,
            "labeled_at": architecture._now(),
            "labeling_tool_version": TOOL_VERSION,
        },
        "quality_status": {"tier": "SILVER", "quality_flags": [],
                            "reviewed_by": None, "review_notes": None},
        "collection_id": rec["collection_id"],  # convenience join key, not part of the itu1 schema
    }


def to_inference_input(rec: dict) -> "architecture.InferenceInput":
    core, ident = rec["input_core"], rec["identity"]
    return architecture.InferenceInput(
        repo=ident["source_repo"], issue_number=ident["issue_number"],
        issue_url=ident["source_issue_url"], snapshot_fetched_at=core["snapshot_fetched_at"],
        title=core["title"], body=core["body"], labels=core["labels"],
        comments=[{"author_role": "reporter" if i == 0 else "other", "body": c.get("body", ""),
                   "clarifies": False} for i, c in enumerate(core["comments"])],
        context_tier_ceiling=1,
    )


# ------------------------------------------------------------- corrections

def apply_corrections(out_path: Path, corrections_path: Path):
    examples = {}
    order = []
    with out_path.open(encoding="utf-8") as fh:
        for line in fh:
            ex = json.loads(line)
            examples[ex["example_id"]] = ex
            order.append(ex["example_id"])

    n_applied = 0
    with corrections_path.open(encoding="utf-8") as fh:
        for line in fh:
            corr = json.loads(line)
            ex = examples.get(corr["example_id"])
            if ex is None:
                print(f"  skip: unknown example_id {corr['example_id']}", file=sys.stderr)
                continue
            gt = ex["ground_truth"]
            for field, value in corr.get("corrections", {}).items():
                if field in gt["task"]:
                    gt["task"][field] = value
                    gt["provenance"][field] = {
                        "source": "EXPLICIT",
                        "evidence": "human-corrected during Step 4 spot-check",
                        "confidence": 1.0,
                    }
                    ex["quality_status"]["quality_flags"] = list(
                        set(ex["quality_status"]["quality_flags"]) | {f"human_corrected:{field}"})
            annotator = corr.get("annotator_id")
            if annotator and annotator not in ex["label_provenance"]["annotator_ids"]:
                ex["label_provenance"]["annotator_ids"].append(annotator)
            ex["quality_status"]["reviewed_by"] = annotator or ex["quality_status"]["reviewed_by"]

            gt = finalize(gt)  # re-derive confidence/uncertainty/review after edits
            errors = validate_all(gt)
            if errors:
                print(f"  {ex['example_id']}: correction produced an invalid record, "
                      f"skipping write-back: {errors}", file=sys.stderr)
                continue
            ex["ground_truth"] = gt
            n_applied += 1

    with out_path.open("w", encoding="utf-8") as fh:
        for eid in order:
            fh.write(json.dumps(examples[eid], ensure_ascii=False) + "\n")
    print(f"applied {n_applied} correction(s) to {out_path}")


# --------------------------------------------------------------------- main

def load_weak_labels(path: Path) -> dict:
    weak = {}
    if path.exists():
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                row = json.loads(line)
                weak[row["collection_id"]] = row["weak_labels"]
    return weak


def iter_batched_records(records_by_id: dict, batches_path: Path):
    """Yield collection_ids in cluster order if a batches file exists (keeps
    Claude's few-shot-like context topically stable run-to-run), else in
    the order they were loaded."""
    if batches_path.exists():
        with batches_path.open(encoding="utf-8") as fh:
            for line in fh:
                batch = json.loads(line)
                for cid in batch["collection_ids"]:
                    if cid in records_by_id:
                        yield cid
    else:
        yield from records_by_id.keys()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--collected", default="data/collected.jsonl")
    ap.add_argument("--weak-labels", default="data/weak_labels.jsonl")
    ap.add_argument("--batches", default="data/labeling_batches.jsonl")
    ap.add_argument("--out", default="data/training_examples.jsonl")
    ap.add_argument("--spot-check-out", default="data/spot_check_needed.jsonl")
    ap.add_argument("--rejects-out", default="data/rejected.jsonl")
    ap.add_argument("--spot-check-rate", type=float, default=0.175)
    ap.add_argument("--model", default="claude-sonnet-4-6")
    ap.add_argument("--license", default="MIT",
                     help="fallback for label_provenance.license only if a record's own "
                          "data_provenance.license is somehow missing; normally each "
                          "record's real per-repo license (set in Step 2) is used instead")
    ap.add_argument("--limit", type=int, default=None, help="label at most N issues (testing)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--apply-corrections", default=None,
                     help="path to a corrections.jsonl; if given, all other labeling is skipped")
    args = ap.parse_args()

    if args.apply_corrections:
        apply_corrections(Path(args.out), Path(args.apply_corrections))
        return

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit("Set ANTHROPIC_API_KEY (or run with --apply-corrections instead).")

    collected_path = Path(args.collected)
    records_by_id = {}
    with collected_path.open(encoding="utf-8") as fh:
        for line in fh:
            rec = json.loads(line)
            if is_labelable(rec):
                records_by_id[rec["collection_id"]] = rec
    if not records_by_id:
        sys.exit(f"No READY_FOR_LABELING records in {collected_path}. Run collect_issues.py first.")

    weak = load_weak_labels(Path(args.weak_labels))
    engine = ClaudeEngine(api_key, args.model)
    rng = random.Random(args.seed)

    out_path, spot_path, rej_path = Path(args.out), Path(args.spot_check_out), Path(args.rejects_out)
    for p in (out_path, spot_path, rej_path):
        p.parent.mkdir(parents=True, exist_ok=True)

    n_written = n_rejected = n_spot = 0
    with out_path.open("w", encoding="utf-8") as out_fh, \
         spot_path.open("w", encoding="utf-8") as spot_fh, \
         rej_path.open("w", encoding="utf-8") as rej_fh:

        for i, cid in enumerate(iter_batched_records(records_by_id, Path(args.batches))):
            if args.limit and i >= args.limit:
                break
            rec = records_by_id[cid]
            inp = to_inference_input(rec)
            task_identity = architecture._task_identity(inp)
            segments = architecture.gate(architecture.segment_issue(inp), inp.context_tier_ceiling)

            try:
                proposals = engine.propose(segments, weak.get(cid))
            except (ValueError, json.JSONDecodeError, requests.RequestException) as e:
                rej_fh.write(json.dumps({"collection_id": cid, "reason": f"engine_error: {e}"}) + "\n")
                n_rejected += 1
                continue

            ground_truth, trace = architecture.assemble(task_identity, proposals, segments)
            if isinstance(ground_truth, architecture.RejectedResult):
                rej_fh.write(json.dumps({"collection_id": cid, "reason_codes": ground_truth.reason_codes,
                                          "detail": ground_truth.detail}) + "\n")
                n_rejected += 1
                continue

            ex = build_training_example(rec, ground_truth, args.license, args.model)
            errors = example_mod.validate_example(ex)
            if errors:
                rej_fh.write(json.dumps({"collection_id": cid, "reason": "invalid_training_example",
                                          "errors": errors}) + "\n")
                n_rejected += 1
                continue

            out_fh.write(json.dumps(ex, ensure_ascii=False) + "\n")
            n_written += 1
            if rng.random() < args.spot_check_rate:
                spot_fh.write(json.dumps({
                    "example_id": ex["example_id"], "collection_id": cid,
                    "repo": rec["identity"]["source_repo"], "issue_number": rec["identity"]["issue_number"],
                    "issue_url": rec["identity"]["source_issue_url"],
                    "title": rec["input_core"]["title"],
                    "proposed": {f: ground_truth["task"].get(f) for f in
                                 (*CLASSIFICATION_FIELDS, "acceptance_criteria")},
                    "provenance": {f: ground_truth["provenance"].get(f) for f in CLASSIFICATION_FIELDS},
                    "review_required": ground_truth["review"]["review_required"],
                    "review_reasons": ground_truth["review"]["review_reasons"],
                }, ensure_ascii=False) + "\n")
                n_spot += 1

    print(f"\nwritten: {n_written}  rejected: {n_rejected}  flagged for spot-check: {n_spot}")
    print(f"-> {out_path}\n-> {spot_path}\n-> {rej_path}")
    print(f"\nNext: review {spot_path} ({args.spot_check_rate:.0%} sample), write corrections to "
          f"a corrections.jsonl (one line: "
          '{"example_id": "...", "corrections": {"task_type": "Bug"}, "annotator_id": "you"}), then:\n'
          f"  python claude_label.py --apply-corrections data/corrections.jsonl --out {out_path}\n"
          "The spot-check error rate you find also estimates the error rate for the unreviewed 80-85%, "
          "per the build prompt.")


if __name__ == "__main__":
    main()