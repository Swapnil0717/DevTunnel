#!/usr/bin/env python3
"""
ITU-1 -- Step 4, manual-copy-paste variant of claude_label.py.

Does the exact same job as claude_label.py's ClaudeEngine, minus the API
call: instead of POSTing to api.anthropic.com, it writes out the prompt
for one issue at a time so you can paste it into a Claude chat yourself,
then reads Claude's pasted-back JSON array response from a file and runs
it through the SAME verify_grounding -> default_fill_proposals ->
architecture.assemble() -> build_training_example pipeline claude_label.py
uses. No ANTHROPIC_API_KEY, nothing ever leaves your machine except what
you manually copy into the chat window yourself.

This does NOT scale to a 1,300-issue corpus by hand -- it's meant for a
demo-sized subset (a few dozen issues). Use claude_label.py with a real
API key for the full run.

Two-step workflow
------------------
1) emit -- pick the next N not-yet-queued issues and write one prompt
   file per issue under a prompts directory, e.g.:

       python claude_label_manual.py emit --count 5

   This writes data/manual_prompts/0001_<collection_id>.txt (etc.) and
   appends entries to data/manual_queue.jsonl so re-running `emit` later
   picks up where you left off instead of re-queuing the same issues.

2) For each prompt file: open it, copy the WHOLE contents (system prompt
   + text segments) into a message to Claude in chat, and ask Claude to
   return only the JSON array as specified. Copy Claude's reply -- just
   the JSON array, nothing else -- into a new file:

       data/manual_responses/<collection_id>.json

   (the prompt file's header tells you the exact collection_id / filename
   to use).

3) ingest -- once you have one or more response files saved, run:

       python claude_label_manual.py ingest

   This processes every queued issue that now has a matching response
   file, appends valid results to data/training_examples.jsonl (SILVER
   tier, same shape claude_label.py produces), samples some for
   data/spot_check_needed.jsonl, and logs failures to data/rejected.jsonl.
   It's safe to re-run `ingest` repeatedly as you accumulate more
   responses -- already-ingested issues are skipped.

Everything downstream (--apply-corrections, export_sft.py, etc.) is
unchanged and works on the same data/training_examples.jsonl this writes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "itu1"))
import architecture  # noqa: E402
import example as example_mod  # noqa: E402
from derived import finalize, validate_all  # noqa: E402  (imported for parity / future use)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect_issues import is_labelable  # noqa: E402

TOOL_VERSION = "claude-label-manual-0.1"

CLASSIFICATION_FIELDS = ("role", "experience_level", "complexity", "task_type")
LIST_FIELDS = ("technologies", "languages", "frameworks", "technical_areas",
                "components", "systems", "affected_areas")

# Identical prompt claude_label.py uses -- keep these in sync if you edit one.
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


# ------------------------------------------------------------ shared helpers
# (copied verbatim from claude_label.py so this script has zero dependency
# on `requests` or on claude_label.py itself)

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


def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def parse_claude_response(text: str) -> list[dict]:
    text = _strip_fences(text)
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("expected a JSON array of proposals")
    return data


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def verify_grounding(items: list[dict], segments: list["architecture.Segment"]
                      ) -> list["architecture.FieldProposal"]:
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
    for f in CLASSIFICATION_FIELDS:
        if f not in have:
            filled.append(architecture.FieldProposal(f, "Unknown", "UNKNOWN"))
    return filled


def build_training_example(rec: dict, ground_truth: dict, license_: str, model_label: str) -> dict:
    core = rec["input_core"]
    src = ground_truth["task_identity"]["source_issue"]
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
            "annotator_ids": [model_label],
            "source_repo": src["repo"],
            "source_issue_url": src["issue_url"],
            "snapshot_fetched_at": src["snapshot_fetched_at"],
            "license": license_,
            "labeled_at": architecture._now(),
            "labeling_tool_version": TOOL_VERSION,
        },
        "quality_status": {"tier": "SILVER", "quality_flags": [],
                            "reviewed_by": None, "review_notes": None},
        "collection_id": rec["collection_id"],
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


def load_weak_labels(path: Path) -> dict:
    weak = {}
    if path.exists():
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                row = json.loads(line)
                weak[row["collection_id"]] = row["weak_labels"]
    return weak


def iter_batched_records(records_by_id: dict, batches_path: Path):
    if batches_path.exists():
        with batches_path.open(encoding="utf-8") as fh:
            for line in fh:
                batch = json.loads(line)
                for cid in batch["collection_ids"]:
                    if cid in records_by_id:
                        yield cid
    else:
        yield from records_by_id.keys()


def record_license(rec: dict, fallback: str) -> str:
    return (rec.get("data_provenance") or {}).get("license") or fallback


def spot_check(collection_id: str, rate: float) -> bool:
    """Deterministic stand-in for the original script's rng.random() < rate --
    deterministic so repeated `ingest` runs (as responses trickle in) give a
    stable, reproducible sample instead of re-rolling each time."""
    h = int(hashlib.sha256(collection_id.encode()).hexdigest(), 16)
    return (h % 10_000) / 10_000 < rate


# ---------------------------------------------------------------- emit mode

def cmd_emit(args):
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

    queue_path = Path(args.queue)
    already = set()
    if queue_path.exists():
        with queue_path.open(encoding="utf-8") as fh:
            for line in fh:
                already.add(json.loads(line)["collection_id"])

    prompts_dir = Path(args.prompts_dir)
    prompts_dir.mkdir(parents=True, exist_ok=True)
    queue_path.parent.mkdir(parents=True, exist_ok=True)

    n = 0
    with queue_path.open("a", encoding="utf-8") as qfh:
        for cid in iter_batched_records(records_by_id, Path(args.batches)):
            if n >= args.count:
                break
            if cid in already:
                continue
            rec = records_by_id[cid]
            inp = to_inference_input(rec)
            segments = architecture.gate(architecture.segment_issue(inp), inp.context_tier_ceiling)
            user = (f"TEXT SEGMENTS:\n{render_segments(segments)}\n\n"
                    f"PRE-FILL HINT (verify, do not trust blindly):\n{render_hint(weak.get(cid))}")

            idx = len(already) + n + 1
            fname = f"{idx:04d}_{cid}.txt"
            fpath = prompts_dir / fname
            fpath.write_text(
                f"collection_id: {cid}\n"
                f"(save Claude's reply -- ONLY the JSON array -- to "
                f"{args.responses_dir}/{cid}.json)\n"
                f"{'=' * 70}\n"
                f"--- SYSTEM PROMPT (send this as context / instructions) ---\n\n"
                f"{SYSTEM_PROMPT}\n\n"
                f"--- USER MESSAGE (send this too) ---\n\n"
                f"{user}\n",
                encoding="utf-8",
            )
            qfh.write(json.dumps({"collection_id": cid, "prompt_file": str(fpath)}) + "\n")
            n += 1

    print(f"wrote {n} prompt file(s) to {prompts_dir}")
    print(f"queue: {queue_path}")
    if n:
        print("\nNext: open each prompt file, paste its full contents to Claude in chat, "
              f"and save the reply (JSON array only) as {args.responses_dir}/<collection_id>.json")
    else:
        print("nothing new to queue (increase --count, or all labelable issues are already queued)")


# -------------------------------------------------------------- ingest mode

def cmd_ingest(args):
    collected_path = Path(args.collected)
    records_by_id = {}
    with collected_path.open(encoding="utf-8") as fh:
        for line in fh:
            rec = json.loads(line)
            records_by_id[rec["collection_id"]] = rec

    queue_path = Path(args.queue)
    if not queue_path.exists():
        sys.exit(f"No queue at {queue_path} -- run `emit` first.")
    queue = []
    with queue_path.open(encoding="utf-8") as fh:
        for line in fh:
            queue.append(json.loads(line))

    done_path = Path(args.done_log)
    done = set()
    if done_path.exists():
        with done_path.open(encoding="utf-8") as fh:
            for line in fh:
                done.add(json.loads(line)["collection_id"])

    responses_dir = Path(args.responses_dir)
    out_path, spot_path, rej_path = Path(args.out), Path(args.spot_check_out), Path(args.rejects_out)
    for p in (out_path, spot_path, rej_path, done_path):
        p.parent.mkdir(parents=True, exist_ok=True)

    n_written = n_rejected = n_spot = n_skipped = 0
    with out_path.open("a", encoding="utf-8") as out_fh, \
         spot_path.open("a", encoding="utf-8") as spot_fh, \
         rej_path.open("a", encoding="utf-8") as rej_fh, \
         done_path.open("a", encoding="utf-8") as done_fh:

        for entry in queue:
            cid = entry["collection_id"]
            if cid in done:
                continue
            resp_path = responses_dir / f"{cid}.json"
            if not resp_path.exists():
                n_skipped += 1
                continue

            rec = records_by_id.get(cid)
            if rec is None:
                rej_fh.write(json.dumps({"collection_id": cid, "reason": "not_found_in_collected"}) + "\n")
                done_fh.write(json.dumps({"collection_id": cid}) + "\n")
                done.add(cid)
                n_rejected += 1
                continue

            inp = to_inference_input(rec)
            task_identity = architecture._task_identity(inp)
            segments = architecture.gate(architecture.segment_issue(inp), inp.context_tier_ceiling)

            try:
                raw = resp_path.read_text(encoding="utf-8")
                items = parse_claude_response(raw)
                proposals = verify_grounding(items, segments)
                proposals = default_fill_proposals(proposals)
            except (ValueError, json.JSONDecodeError) as e:
                rej_fh.write(json.dumps({"collection_id": cid, "reason": f"parse_error: {e}"}) + "\n")
                done_fh.write(json.dumps({"collection_id": cid}) + "\n")
                done.add(cid)
                n_rejected += 1
                continue

            ground_truth, trace = architecture.assemble(task_identity, proposals, segments)
            if isinstance(ground_truth, architecture.RejectedResult):
                rej_fh.write(json.dumps({"collection_id": cid, "reason_codes": ground_truth.reason_codes,
                                          "detail": ground_truth.detail}) + "\n")
                done_fh.write(json.dumps({"collection_id": cid}) + "\n")
                done.add(cid)
                n_rejected += 1
                continue

            lic = record_license(rec, args.license)
            ex = build_training_example(rec, ground_truth, lic, args.model_label)
            errors = example_mod.validate_example(ex)
            if errors:
                rej_fh.write(json.dumps({"collection_id": cid, "reason": "invalid_training_example",
                                          "errors": errors}) + "\n")
                done_fh.write(json.dumps({"collection_id": cid}) + "\n")
                done.add(cid)
                n_rejected += 1
                continue

            out_fh.write(json.dumps(ex, ensure_ascii=False) + "\n")
            done_fh.write(json.dumps({"collection_id": cid}) + "\n")
            done.add(cid)
            n_written += 1
            if spot_check(cid, args.spot_check_rate):
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

    print(f"written: {n_written}  rejected: {n_rejected}  flagged for spot-check: {n_spot}  "
          f"waiting on response: {n_skipped}")
    print(f"-> {out_path}\n-> {spot_path}\n-> {rej_path}")
    if n_skipped:
        print(f"\n{n_skipped} queued issue(s) still have no matching file in {responses_dir} -- "
              "save Claude's reply for those, then re-run ingest.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    common_paths = dict(
        collected=("--collected", "data/collected.jsonl"),
        weak_labels=("--weak-labels", "data/weak_labels.jsonl"),
        batches=("--batches", "data/labeling_batches.jsonl"),
        queue=("--queue", "data/manual_queue.jsonl"),
        prompts_dir=("--prompts-dir", "data/manual_prompts"),
        responses_dir=("--responses-dir", "data/manual_responses"),
    )

    e = sub.add_parser("emit", help="write the next batch of prompt files to paste into chat")
    e.add_argument("--collected", default="data/collected.jsonl")
    e.add_argument("--weak-labels", default="data/weak_labels.jsonl")
    e.add_argument("--batches", default="data/labeling_batches.jsonl")
    e.add_argument("--queue", default="data/manual_queue.jsonl")
    e.add_argument("--prompts-dir", default="data/manual_prompts")
    e.add_argument("--responses-dir", default="data/manual_responses")
    e.add_argument("--count", type=int, default=5, help="how many new issues to queue this run")
    e.set_defaults(func=cmd_emit)

    i = sub.add_parser("ingest", help="process any queued issues that now have a saved response")
    i.add_argument("--collected", default="data/collected.jsonl")
    i.add_argument("--queue", default="data/manual_queue.jsonl")
    i.add_argument("--responses-dir", default="data/manual_responses")
    i.add_argument("--done-log", default="data/manual_done.jsonl")
    i.add_argument("--out", default="data/training_examples.jsonl")
    i.add_argument("--spot-check-out", default="data/spot_check_needed.jsonl")
    i.add_argument("--rejects-out", default="data/rejected.jsonl")
    i.add_argument("--spot-check-rate", type=float, default=0.175)
    i.add_argument("--license", default="MIT", help="fallback if a record's own data_provenance.license is missing")
    i.add_argument("--model-label", default="claude:manual-chat",
                    help="written to label_provenance.annotator_ids in place of a real model string")
    i.set_defaults(func=cmd_ingest)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()