#!/usr/bin/env python3
"""
ITU-1 -- Step 4, free/local variant of claude_label.py.

Identical pipeline to claude_label.py (same SYSTEM_PROMPT, same grounding
verification, same architecture.assemble() call, same TrainingExample
shape) -- the only thing that changes is where the labeling engine's text
comes from: instead of POSTing to api.anthropic.com with an
ANTHROPIC_API_KEY, this calls a LOCAL Ollama server. No API key, no
per-request cost, nothing leaves your machine.

Setup (one-time)
-----------------
1. Install Ollama: https://ollama.com/download  (Windows/Mac/Linux, free)
2. Pull a model that's reasonably good at following JSON instructions.
   Bigger = better instruction-following = more issues actually get
   a value instead of silently degrading to UNKNOWN. If your machine can
   run it, prefer something in the 8B+ instruct-tuned range, e.g.:

       ollama pull llama3.1:8b
       ollama pull qwen2.5:7b-instruct

   (qwen2.5 tends to be noticeably more reliable at strict JSON output).
3. Make sure the Ollama server is running (it starts automatically after
   install / on login; `ollama list` should work in a terminal without
   errors).

Usage
-----
    python local_label.py \
        --collected data/collected.jsonl \
        --weak-labels data/weak_labels.jsonl \
        --batches data/labeling_batches.jsonl \
        --out data/training_examples.jsonl \
        --spot-check-out data/spot_check_needed.jsonl \
        --rejects-out data/rejected.jsonl \
        --spot-check-rate 0.175 \
        --model llama3.1:8b \
        --limit 10          # small test batch first, same as claude_label.py

Then drop --limit to run the rest. --apply-corrections works exactly like
claude_label.py (re-derives/re-validates from data/corrections.jsonl,
doesn't call the model again).

Reality check on quality
-------------------------
A local 7-8B model will be noticeably weaker than Claude at: staying
strictly inside the JSON contract, correctly choosing EXPLICIT vs
INFERRED vs UNKNOWN, and not hallucinating evidence_text. This script
compensates where it safely can (format="json" constraint, a
regex-fallback JSON extractor, retries on unparseable output) but the
verify_grounding() step is your real safety net -- it already discards
any claim whose evidence_text doesn't verbatim-match the source segment,
same as claude_label.py. Keep the --spot-check-rate meaningfully high
(the 0.175 default is a reasonable floor) since a weaker model means the
sampled error rate you find is likely higher than Claude would have given
you, and that's the number that (per the original build prompt) estimates
the error rate across the whole unreviewed set.
"""

from __future__ import annotations

import argparse
import json
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
from derived import finalize, validate_all  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect_issues import is_labelable  # noqa: E402

TOOL_VERSION = "local-label-0.1"

CLASSIFICATION_FIELDS = ("role", "experience_level", "complexity", "task_type")
LIST_FIELDS = ("technologies", "languages", "frameworks", "technical_areas",
                "components", "systems", "affected_areas")

# Same contract claude_label.py uses -- keep in sync if you edit either.
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


# ------------------------------------------------------- Ollama API client

def call_ollama(system: str, user: str, model: str, base_url: str,
                 max_retries: int = 3, timeout: int = 180, num_predict: int = 900) -> str:
    url = base_url.rstrip("/") + "/api/chat"
    for attempt in range(max_retries):
        started = time.time()
        try:
            resp = requests.post(
                url,
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "stream": False,
                    "format": "json",   # constrains output to syntactically valid JSON
                    # num_predict caps how many tokens the model can generate --
                    # without this a slow/rambling model can run far past what
                    # this task needs, which is the main thing that turns into
                    # a timeout on weak CPUs. 900 is generous for one issue's
                    # JSON array but bounds the worst case.
                    "options": {"temperature": 0, "num_predict": num_predict},
                },
                timeout=timeout,
            )
        except requests.exceptions.ReadTimeout:
            elapsed = time.time() - started
            print(f"  timed out after {elapsed:.0f}s (limit {timeout}s) on attempt {attempt + 1}/{max_retries}",
                  file=sys.stderr)
            if attempt == max_retries - 1:
                raise
            continue
        except requests.ConnectionError:
            sys.exit(
                f"Could not reach Ollama at {base_url}. Is it running? "
                "Try `ollama list` in a terminal, or install from https://ollama.com/download"
            )
        if resp.status_code == 404 and attempt == 0:
            sys.exit(
                f"Ollama returned 404 for model '{model}'. Did you `ollama pull {model}` first?"
            )
        if resp.status_code >= 500:
            wait = min(30, 2 ** attempt)
            print(f"  Ollama {resp.status_code}, retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        data = resp.json()
        return data.get("message", {}).get("content", "")
    raise RuntimeError("Ollama: exhausted retries")


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


def _extract_json_array(text: str) -> str:
    """Local models sometimes wrap the array in prose despite format='json'
    (e.g. {"proposals": [...]}  or a stray leading sentence). Try the plain
    parse first; if that fails, grab the outermost [...] span and, failing
    that, look for a top-level object with one list-valued key."""
    start, end = text.find("["), text.rfind("]")
    if start != -1 and end != -1 and end > start:
        return text[start:end + 1]
    return text


def parse_claude_response(text: str) -> list[dict]:
    """Raises ValueError on unparseable output -- caller treats as a reject."""
    text = _strip_fences(text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = json.loads(_extract_json_array(text))
    if isinstance(data, dict):
        # Some local models wrap the array, e.g. {"proposals": [...]}
        list_vals = [v for v in data.values() if isinstance(v, list)]
        if len(list_vals) == 1:
            data = list_vals[0]
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
        if not isinstance(item, dict):
            continue
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


class OllamaEngine:
    """Satisfies the same engine.propose(segments) -> list[FieldProposal]
    contract as claude_label.py's ClaudeEngine, backed by a local model."""

    def __init__(self, model: str, base_url: str, timeout: int = 180, num_predict: int = 900):
        self.model = model
        self.base_url = base_url
        self.timeout = timeout
        self.num_predict = num_predict

    def propose(self, segments: list["architecture.Segment"], weak: dict | None = None
                 ) -> list["architecture.FieldProposal"]:
        user = (f"TEXT SEGMENTS:\n{render_segments(segments)}\n\n"
                f"PRE-FILL HINT (verify, do not trust blindly):\n{render_hint(weak)}")
        t0 = time.time()
        raw = call_ollama(SYSTEM_PROMPT, user, self.model, self.base_url,
                           timeout=self.timeout, num_predict=self.num_predict)
        print(f"  ({time.time() - t0:.1f}s)", file=sys.stderr)
        items = parse_claude_response(raw)
        proposals = verify_grounding(items, segments)
        return default_fill_proposals(proposals)


# --------------------------------------------------------- TrainingExample

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


def record_license(rec: dict, fallback: str) -> str:
    return (rec.get("data_provenance") or {}).get("license") or fallback


# ------------------------------------------------------------- corrections
# (identical to claude_label.py -- kept so this script is a drop-in
# replacement, including for the --apply-corrections workflow)

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

            gt = finalize(gt)
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
    ap.add_argument("--model", default="llama3.1:8b", help="Ollama model tag, e.g. llama3.1:8b, qwen2.5:7b-instruct")
    ap.add_argument("--ollama-url", default="http://localhost:11434")
    ap.add_argument("--timeout", type=int, default=180, help="seconds to wait for one issue's response")
    ap.add_argument("--num-predict", type=int, default=900, help="max tokens the model may generate per issue")
    ap.add_argument("--license", default="MIT", help="fallback if a record's own data_provenance.license is missing")
    ap.add_argument("--limit", type=int, default=None, help="label at most N issues (testing)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--apply-corrections", default=None,
                     help="path to a corrections.jsonl; if given, all other labeling is skipped")
    args = ap.parse_args()

    if args.apply_corrections:
        apply_corrections(Path(args.out), Path(args.apply_corrections))
        return

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
    engine = OllamaEngine(args.model, args.ollama_url, timeout=args.timeout, num_predict=args.num_predict)
    rng = random.Random(args.seed)
    model_label = f"local:{args.model}"

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

            print(f"[{i + 1}] {cid} ...", file=sys.stderr)
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

            lic = record_license(rec, args.license)
            ex = build_training_example(rec, ground_truth, lic, model_label)
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
    if n_written:
        reject_rate = n_rejected / (n_written + n_rejected)
        print(f"\nreject rate: {reject_rate:.0%} -- if this is high (>25-30%), the local model is "
              "probably struggling with the JSON contract; try a bigger/more instruction-tuned model.")
    print(f"\nNext: review {spot_path} ({args.spot_check_rate:.0%} sample), write corrections to "
          f"a corrections.jsonl (one line: "
          '{"example_id": "...", "corrections": {"task_type": "Bug"}, "annotator_id": "you"}), then:\n'
          f"  python local_label.py --apply-corrections data/corrections.jsonl --out {out_path}\n"
          "The spot-check error rate you find also estimates the error rate for the unreviewed 80-85%.")


if __name__ == "__main__":
    main()