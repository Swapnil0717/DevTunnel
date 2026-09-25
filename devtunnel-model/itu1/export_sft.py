"""
ITU-1 -- bridge from validated TrainingExamples to a generic text-to-text fine-tuning file,
plus the inverse: turning a model's JSON answer back into a validated Phase 2 record.

READ THIS FIRST: the spec (Phase 8) describes a multi-head architecture (classification heads,
pointer/extraction heads, generation, calibration) trained on Phase 7 DatasetRecords. Phases 6-13
are NOT built here. This module is a STAND-IN so you can try the data on an off-the-shelf
instruction-tuned LLM. It is not the Phase 8 training interface.

    python export_sft.py examples.jsonl out_dir [--eval-fraction 0.1] [--seed 0] [--tiers GOLD,SILVER]

writes out_dir/train.jsonl and out_dir/eval.jsonl (chat format: {"messages": [system, user, assistant]}).

Rules enforced here
    * only examples that pass validate_example() and whose eligible_uses() allow the split
    * split at REPOSITORY level (CP-1); repositories that share a near-duplicate cluster are
      forced into the same split (CP-2)
    * eval split takes GOLD only; a repo assigned to eval never contributes to train (CP-5)
    * target = what the model must AUTHOR. confidence / review / explicit+inferred rollups are
      derived (derived.py), never learned, so they are left out of the target.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import uuid
from datetime import datetime, timezone

from derived import finalize, validate_all
from example import eligible_uses, model_input, validate_example

DEFAULT_TIERS = ("GOLD", "SILVER")     # DECISION: Phase 7 excludes BRONZE from Training; Phase 3 6.5 allows it.

SYSTEM_PROMPT = (
    "You convert a GitHub issue into a structured engineering task record. Return ONLY JSON with keys "
    "'task', 'provenance', 'missing_information'. Every field needs provenance {source, evidence, "
    "confidence}; use source UNKNOWN with null evidence and confidence when nothing supports a value. "
    "Never invent evidence."
)


def target_of(example: dict) -> dict:
    gt = example["ground_truth"]
    return {"task": gt["task"], "provenance": gt["provenance"],
            "missing_information": gt["uncertainty"].get("missing_information", [])}


def to_chat(example: dict) -> dict:
    return {"messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(model_input(example), ensure_ascii=False, sort_keys=True)},
        {"role": "assistant", "content": json.dumps(target_of(example), ensure_ascii=False, sort_keys=True)},
    ]}


# ------------------------------------------------------------------ splitting
def _repo(ex: dict) -> str:
    return ex["label_provenance"]["source_repo"]


def _clusters(ex: dict) -> list[str]:
    return [f.split(":", 1)[1] for f in ex["quality_status"]["quality_flags"] if f.startswith("near_dup_cluster:")]


def repo_groups(examples: list[dict]) -> dict[str, str]:
    """repo -> group id (union-find over repos that share a near-duplicate cluster)."""
    parent: dict[str, str] = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    seen_cluster: dict[str, str] = {}
    for ex in examples:
        r = _repo(ex)
        find(r)
        for c in _clusters(ex):
            if c in seen_cluster:
                parent[find(r)] = find(seen_cluster[c])
            else:
                seen_cluster[c] = r
    return {r: find(r) for r in parent}


def _bucket(group: str, seed: int) -> float:
    h = hashlib.sha256(f"{seed}:{group}".encode()).digest()
    return int.from_bytes(h[:8], "big") / 2**64


def split(examples: list[dict], eval_fraction: float = 0.1, seed: int = 0,
          tiers: tuple = DEFAULT_TIERS) -> tuple[list[dict], list[dict], list[str]]:
    """Returns (train, eval, problems). Invalid or ineligible examples are dropped and reported."""
    problems, usable = [], []
    for ex in examples:
        errs = validate_example(ex)
        if errs:
            problems.append(f"{ex.get('example_id', '?')}: invalid ({errs[0]})")
        else:
            usable.append(ex)
    groups = repo_groups(usable)
    train, evalset = [], []
    for ex in usable:
        uses = eligible_uses(ex)
        in_eval = _bucket(groups[_repo(ex)], seed) < eval_fraction
        if in_eval:
            if "eval" in uses:
                evalset.append(ex)              # GOLD only; everything else from an eval repo is dropped
        elif "train" in uses and ex["quality_status"]["tier"] in tiers:
            train.append(ex)
    return train, evalset, problems


# ------------------------------------------------------------------ inference side
def assemble_record(prediction: dict, source_issue: dict, task_id: str | None = None,
                    created_at: str | None = None) -> tuple[dict, list[str]]:
    """Model answer ({task, provenance, missing_information}) -> full Phase 2 record.

    source_issue = {repo, issue_number, issue_url, snapshot_fetched_at, issue_title_raw}.
    Derived fields are computed, then everything is validated. Returns (record, errors);
    a non-empty error list means the model output must be rejected or sent to review.
    """
    if not isinstance(prediction, dict) or not {"task", "provenance"} <= set(prediction):
        return {}, ["prediction must be an object with 'task' and 'provenance'"]
    record = {
        "schema_version": "2.0.0",
        "task_identity": {"task_id": task_id or str(uuid.uuid4()),
                          "created_at": created_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                          "source_issue": source_issue},
        "task": copy.deepcopy(prediction["task"]),
        "provenance": copy.deepcopy(prediction["provenance"]),
        "uncertainty": {"explicit_information": [], "inferred_information": [],
                        "uncertain_information": [],
                        "missing_information": list(prediction.get("missing_information", []))},
        "confidence": {"overall_confidence": 0.0, "method": "weighted_mean_v1"},
        "review": {"review_required": False, "review_reasons": []},
    }
    try:
        record = finalize(record)
    except (KeyError, TypeError, AttributeError) as exc:
        return record, [f"malformed prediction: {exc!r}"]
    return record, validate_all(record)


def parse_model_text(text: str) -> tuple[dict | None, str | None]:
    """Extract the JSON object from raw model text (tolerates ```json fences)."""
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None, "no JSON object found"
    try:
        return json.loads(m.group(0)), None
    except json.JSONDecodeError as exc:
        return None, f"invalid JSON: {exc}"


# ------------------------------------------------------------------ CLI
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("examples_jsonl")
    ap.add_argument("out_dir")
    ap.add_argument("--eval-fraction", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--tiers", default=",".join(DEFAULT_TIERS), help="train tiers, e.g. GOLD,SILVER")
    a = ap.parse_args(argv)

    with open(a.examples_jsonl, encoding="utf-8") as fh:
        examples = [json.loads(l) for l in fh if l.strip()]
    train, evalset, problems = split(examples, a.eval_fraction, a.seed, tuple(a.tiers.split(",")))
    os.makedirs(a.out_dir, exist_ok=True)
    for name, rows in (("train", train), ("eval", evalset)):
        with open(os.path.join(a.out_dir, f"{name}.jsonl"), "w", encoding="utf-8") as fh:
            for ex in rows:
                fh.write(json.dumps(to_chat(ex), ensure_ascii=False) + "\n")
    print(f"read {len(examples)} examples: train={len(train)} eval={len(evalset)} dropped={len(problems)}")
    for p in problems:
        print("  dropped:", p)


if __name__ == "__main__":
    main()
