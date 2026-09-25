"""
ITU-1 -- Phase 14: Validation & Evaluation

Consolidates Phase 11 Section 6, Phase 12 Section 7 and Phase 13 Section 7's
local evaluation procedures into one reusable Evaluation Framework
(Decision #1). Measurement-only: no training happens here (Decision #2).

Layers (Section 1), run in order for any checkpoint under evaluation:

    L0  Structural   -- reuses schema.py / derived.py (H1/H3/H4/H5), a hard
                        exclusion filter, not a scored component
    L1  Classification
    L2  Generation & Grounding
    L3  Uncertainty & Behavior

No third-party dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

import schema
import derived
import context_training as ct
import instruction_training as it
import dataset as ds

# --------------------------------------------------------------------------
# L0 -- structural gate (Section 1, Decision #3)
# --------------------------------------------------------------------------


def l0_gate(record: dict) -> list[str]:
    """H1/H3/H4/H5 reused, not re-derived. Non-empty -> record fails L0 and
    is excluded from L1-L3 aggregates."""
    return derived.validate_all(record)


def evaluate_l0(records: Iterable[dict]) -> dict:
    passed, failed = [], []
    for r in records:
        errs = l0_gate(r)
        (failed if errs else passed).append((r, errs))
    total = len(passed) + len(failed)
    rate = (len(passed) / total) if total else None
    return {"passed": passed, "failed": failed, "total": total,
            "structural_validity": rate}


# --------------------------------------------------------------------------
# 2.1 -- classification metrics
# --------------------------------------------------------------------------

CLASSIFICATION_FIELDS = ("role", "experience_level", "complexity", "task_type")


def confusion_matrix(pairs: list[tuple[Any, Any]]) -> dict[str, dict[str, int]]:
    """pairs: list of (predicted, reference). Full NxN, Unknown included."""
    m: dict[str, dict[str, int]] = {}
    for pred, ref in pairs:
        m.setdefault(ref, {})
        m[ref][pred] = m[ref].get(pred, 0) + 1
    return m


def classification_report(pairs: list[tuple[Any, Any]]) -> dict:
    """Accuracy (exact match, Unknown counts as a class), macro P/R/F1, and
    a per-class row for every class value seen (Section 2.1)."""
    if not pairs:
        return {"accuracy": None, "macro_precision": None, "macro_recall": None,
                "macro_f1": None, "per_class": {}, "n": 0}
    classes = sorted({c for pr in pairs for c in pr})
    correct = sum(1 for p, r in pairs if p == r)
    per_class = {}
    precisions, recalls, f1s = [], [], []
    for c in classes:
        tp = sum(1 for p, r in pairs if p == c and r == c)
        fp = sum(1 for p, r in pairs if p == c and r != c)
        fn = sum(1 for p, r in pairs if p != c and r == c)
        prec = tp / (tp + fp) if (tp + fp) else 0.0
        rec = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) else 0.0
        per_class[c] = {"precision": prec, "recall": rec, "f1": f1,
                         "support": sum(1 for _, r in pairs if r == c)}
        precisions.append(prec)
        recalls.append(rec)
        f1s.append(f1)
    return {
        "accuracy": correct / len(pairs),
        "macro_precision": sum(precisions) / len(precisions),
        "macro_recall": sum(recalls) / len(recalls),
        "macro_f1": sum(f1s) / len(f1s),
        "per_class": per_class,
        "n": len(pairs),
    }


def classification_metrics_for_field(field_name: str, rows: list[dict]) -> dict:
    """rows: [{'pred': ..., 'gt_value':..., 'evidence_tiers':[...], 'ceiling':int}]
    Scored against the tier-appropriate reference (Phase 12 Section 7.2,
    reused unchanged -- an honest lower-tier 'Unknown' is not an error)."""
    pairs = []
    for row in rows:
        ref = ct.tier_appropriate_reference(row["gt_value"], row.get("evidence_tiers"),
                                             row["ceiling"])
        # score_against_reference distinguishes correct/incorrect/overclaim/
        # missed/correct_abstention/excluded; for a classification report we
        # collapse to predicted-vs-reference class labels (excluded rows
        # skipped -- unaligned evidence cannot be placed on a tier).
        if ref.kind == "unaligned":
            continue
        pairs.append((row["pred"], ref.value))
    return classification_report(pairs)


# --------------------------------------------------------------------------
# 2.2 -- consistency: cross-field agreement + re-run stability (Section 2.2)
# --------------------------------------------------------------------------

# The one worked example the spec gives: Documentation task_type should not
# carry a Backend role justified by database-schema reasoning.
_CROSS_FIELD_RULES = (
    {
        "name": "documentation_backend_db_reasoning",
        "check": lambda rec: (
            rec.get("task", {}).get("task_type") == "Documentation"
            and rec.get("task", {}).get("role") == "Backend"
            and "database" in (rec.get("provenance", {}).get("role", {})
                                   .get("evidence") or "").lower()
        ),
        "message": "task_type=Documentation with role=Backend justified by "
                   "database-schema reasoning",
    },
)


def cross_field_agreement_violations(record: dict) -> list[str]:
    """Section 2.2's worked example, encoded as a rule table (there is no
    general algorithm in the spec for semantic cross-field conflicts)."""
    out = []
    for rule in _CROSS_FIELD_RULES:
        if rule["check"](record):
            out.append(rule["message"])
    return out


def rerun_stability_violations(runs: list[dict], *, justified_fields=frozenset()) -> list[str]:
    """Re-run stability, Phase 13 Section 2's determinism check reused as a
    standing metric (Section 2.2)."""
    return it.consistency_check(runs, justified_fields=justified_fields)


# --------------------------------------------------------------------------
# Section 6 -- grounding evaluation
# --------------------------------------------------------------------------

# Evaluation-time five-way taxonomy -> production sourceType (Section 6 table).
GROUNDING_TAXONOMY = {
    "EXPLICITLY_STATED": "EXPLICIT",
    "STRONGLY_SUPPORTED": "SUPPORTED_BY_CONTEXT",
    "INFERRED_FROM_CONTEXT": "SUPPORTED_BY_CONTEXT",  # or INFERRED, see below
    "UNCERTAIN": None,       # any non-UNKNOWN source below threshold, or flagged
    "UNSUPPORTED": None,     # no valid production mapping (Decision #4)
}


def evidence_resolves(evidence_text: str, source_segments: list[str]) -> bool:
    """H2 stand-in: does the evidence pointer resolve to actual input text?
    Case-insensitive substring match -- a real evidence check, not a full
    semantic entailment check (README judgment call)."""
    if not evidence_text:
        return False
    needle = evidence_text.strip().lower()
    return any(needle in seg.lower() for seg in source_segments)


def categorize_grounding(field_name: str, provenance_entry: dict, *,
                          source_segments: list[str],
                          confidence_threshold: float,
                          flagged_uncertain: bool) -> str:
    """Maps one field's provenance onto the evaluation-time taxonomy.
    Unsupported is checked before Uncertain (README: tie-break order is a
    judgment call, the spec doesn't state it)."""
    source = provenance_entry.get("source")
    if source == "UNKNOWN":
        return "UNKNOWN"  # not part of the five-way taxonomy; nothing to grade
    evidence = provenance_entry.get("evidence") or ""
    confidence = provenance_entry.get("confidence")
    if not evidence_resolves(evidence, source_segments):
        return "UNSUPPORTED"
    if flagged_uncertain or (confidence is not None and confidence < confidence_threshold):
        return "UNCERTAIN"
    if source == "EXPLICIT":
        return "EXPLICITLY_STATED"
    if source == "SUPPORTED_BY_CONTEXT":
        return "STRONGLY_SUPPORTED"
    if source == "INFERRED":
        return "INFERRED_FROM_CONTEXT"
    return "UNSUPPORTED"


def grounding_breakdown(record: dict, *, source_segments: list[str],
                         confidence_threshold: float,
                         uncertain_fields: set[str]) -> dict[str, str]:
    """Every technical claim in task (Section 6, para 3)."""
    out = {}
    for f, entry in record.get("provenance", {}).items():
        out[f] = categorize_grounding(f, entry, source_segments=source_segments,
                                       confidence_threshold=confidence_threshold,
                                       flagged_uncertain=f in uncertain_fields)
    return out


# --------------------------------------------------------------------------
# Section 7 -- hallucination evaluation
# --------------------------------------------------------------------------

HALLUCINATION_TYPES = (
    "fabricated_entity",
    "fabricated_dependency",
    "unrequested_scope_expansion",
    "overclaimed_confidence",
    "keyword_triggered_classification",
    "evidence_claimed_for_unknown",
)


def hallucination_breakdown(records_with_context: list[dict]) -> dict:
    """records_with_context: [{'record':..., 'grounding': {field: category}}]
    Reports rate broken out by type, never a single score (Section 7,
    Decision #5). This routes to existing detectors rather than
    re-detecting: UNSUPPORTED categorization (Section 6) covers
    fabricated_entity/dependency/evidence_claimed_for_unknown depending on
    which check flagged it; the caller supplies the finer type when known."""
    by_type = {t: {"count": 0, "total": 0} for t in HALLUCINATION_TYPES}
    total_claims = 0
    total_unsupported = 0
    for item in records_with_context:
        grounding = item.get("grounding", {})
        types = item.get("hallucination_types", {})  # field -> type name
        for f, category in grounding.items():
            total_claims += 1
            if category == "UNSUPPORTED":
                total_unsupported += 1
                t = types.get(f, "fabricated_entity")
                if t in by_type:
                    by_type[t]["count"] += 1
            if types.get(f) in by_type:
                by_type[types[f]]["total"] += 1
    rate = (total_unsupported / total_claims) if total_claims else None
    return {
        "hallucination_rate": rate,
        "total_claims": total_claims,
        "unsupported_claims": total_unsupported,
        "by_type": by_type,
    }


def evidence_claimed_for_unknown_violations(record: dict) -> list[str]:
    """Automated, all benchmarks (Section 7 table, last row) -- reuses
    schema.py's Rule 2 rather than re-detecting."""
    return [e for e in schema.validate(record) if "UNKNOWN" in e and "evidence" in e]


# --------------------------------------------------------------------------
# Section 8 -- uncertainty evaluation
# --------------------------------------------------------------------------


def calibration_curve(rows: list[tuple[float, bool]], *, n_buckets: int = 10) -> list[dict]:
    """rows: [(confidence, was_correct)]. One row per confidence bucket."""
    buckets = [[] for _ in range(n_buckets)]
    for conf, correct in rows:
        idx = min(int(conf * n_buckets), n_buckets - 1)
        buckets[idx].append(correct)
    out = []
    for i, b in enumerate(buckets):
        lo, hi = i / n_buckets, (i + 1) / n_buckets
        acc = (sum(b) / len(b)) if b else None
        out.append({"bucket": (lo, hi), "n": len(b), "empirical_accuracy": acc})
    return out


def expected_calibration_error(rows: list[tuple[float, bool]], *, n_buckets: int = 10) -> float | None:
    if not rows:
        return None
    curve = calibration_curve(rows, n_buckets=n_buckets)
    total = len(rows)
    ece = 0.0
    for i, cell in enumerate(curve):
        if cell["n"] == 0:
            continue
        mid = (cell["bucket"][0] + cell["bucket"][1]) / 2
        ece += (cell["n"] / total) * abs(cell["empirical_accuracy"] - mid)
    return ece


def abstention_precision_recall(predictions: list[tuple[bool, bool]]) -> dict:
    """predictions: [(predicted_abstain, genuinely_warranted)]."""
    tp = sum(1 for p, g in predictions if p and g)
    fp = sum(1 for p, g in predictions if p and not g)
    fn = sum(1 for p, g in predictions if not p and g)
    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    return {"precision": precision, "recall": recall, "tp": tp, "fp": fp, "fn": fn}


# --------------------------------------------------------------------------
# Section 3 -- benchmark bindings
# --------------------------------------------------------------------------

BENCHMARKS = {
    "generalization": {"datasets": ("test",),
                        "answers": "realistic unseen performance"},
    "calibration": {"datasets": ("test", "hard_case"),
                     "answers": "is confidence trustworthy near the abstention boundary"},
    "hallucination": {"datasets": ("adversarial",),
                       "answers": "does the checkpoint fabricate grounding under bait"},
    "framing_robustness": {"datasets": ("adversarial",),
                            "answers": "Phase 13's 12-category battery, standing"},
    "regression": {"datasets": ("regression",),
                    "answers": "has any previously-fixed failure reappeared"},
    "context_tier": {"datasets": ("test",),
                      "answers": "Section 9, tier-sibling comparison"},
}


def benchmark_scope_violations(benchmark_name: str, dataset_ids_used: set[str]) -> list[str]:
    """Catches e.g. Adversarial silently pooled into a Test-based number."""
    spec = BENCHMARKS.get(benchmark_name)
    if spec is None:
        return [f"unknown benchmark: {benchmark_name}"]
    allowed = set(spec["datasets"])
    bad = dataset_ids_used - allowed
    return [f"{benchmark_name} must not pool dataset '{d}'" for d in sorted(bad)]


# --------------------------------------------------------------------------
# Section 5 -- human evaluation
# --------------------------------------------------------------------------


def stratified_sample(records: list[dict], *, strata_key, n_per_stratum: int) -> list[dict]:
    """Deterministic stratified sample: first n_per_stratum records per
    stratum, in input order (no randomness -- reproducible)."""
    buckets: dict[Any, list[dict]] = {}
    for r in records:
        buckets.setdefault(strata_key(r), []).append(r)
    out = []
    for key in sorted(buckets, key=str):
        out.extend(buckets[key][:n_per_stratum])
    return out


def human_agreement_rate(judgments: list[tuple[Any, Any]]) -> float | None:
    """judgments: [(model_value, human_value)] for one Section 2.2 metric."""
    if not judgments:
        return None
    return sum(1 for m, h in judgments if m == h) / len(judgments)


def escalation_required(review: dict, *, fact_not_style: bool) -> bool:
    """Section 5's escalation rule, reusing Phase 6's fact-vs-intent
    distinction (a stylistic preference is not a faithfulness failure)."""
    return bool(review.get("faithfulness_violation") or review.get("technically_incorrect")) \
        and fact_not_style


# --------------------------------------------------------------------------
# Section 9 -- context evaluation
# --------------------------------------------------------------------------

CONTEXT_LADDER = (
    ("issue_only", 1),
    ("issue_and_comments", 1),
    ("issue_and_repository", 2),
    ("issue_and_relevant_code", 3),
    ("issue_and_deeper_context", 4),  # tiers 4-7
)


def context_tier_comparison(rung_name: str, promoted_tiers: set[int],
                             deltas: dict | None) -> dict:
    """[NOT ACTIVE] shown for any tier Phase 12 hasn't promoted (Section 9)."""
    tier = dict(CONTEXT_LADDER).get(rung_name)
    if tier is None:
        return {"rung": rung_name, "status": "UNKNOWN_RUNG"}
    if tier not in promoted_tiers:
        return {"rung": rung_name, "tier": tier, "status": "[NOT ACTIVE]"}
    return {"rung": rung_name, "tier": tier, "status": "active", "deltas": deltas or {}}


# --------------------------------------------------------------------------
# Section 10 -- reporting cube
# --------------------------------------------------------------------------

REPORTING_AXES = (
    "role", "experience_level", "complexity", "task_type",
    "technology", "repository_type", "context_level",
)


@dataclass
class EvaluationRun:
    checkpoint_id: str
    benchmark: str
    l0: dict
    l1: dict = field(default_factory=dict)
    l2: dict = field(default_factory=dict)
    l3: dict = field(default_factory=dict)
    grounding: dict = field(default_factory=dict)
    hallucination: dict = field(default_factory=dict)
    calibration: dict = field(default_factory=dict)
    context_tier: dict = field(default_factory=dict)
    by_axis: dict = field(default_factory=dict)          # axis -> {value: metrics}
    human_columns: dict = field(default_factory=dict)    # metric -> {value: rate}, labeled separately


def malformed_report_violations(run: EvaluationRun) -> list[str]:
    """No bare overall score, no unlabeled human/automated blend (Section
    10). A heuristic keyed on matching metric names between by_axis and
    human_columns, not a full schema validator (README)."""
    out = []
    if not run.by_axis:
        out.append("report has no per-reporting-axis breakdown (bare scalar report)")
    for axis in run.by_axis:
        if axis not in REPORTING_AXES:
            out.append(f"unknown reporting axis: {axis}")
    for metric in run.human_columns:
        if metric in run.l1 or metric in run.l2 or metric in run.l3:
            out.append(f"human-derived metric '{metric}' appears blended with an "
                       f"automated metric of the same name -- must stay a separate column")
    return out


# --------------------------------------------------------------------------
# Section 11 -- acceptance thresholds
# --------------------------------------------------------------------------


def acceptance_verdict(run: EvaluationRun, *, per_cell_thresholds: dict,
                        hallucination_ceilings: dict,
                        regression_reappearances: int) -> dict:
    """L0 must be exactly 100% (hard). Hallucination has hard per-type
    ceilings. Any Regression reappearance blocks. Everything else is
    empirical, per-cell, [INSUFFICIENT DATA] rather than defaulted."""
    blockers = []
    if run.l0.get("structural_validity") not in (1.0, None) and run.l0.get("structural_validity") != 1.0:
        blockers.append("L0 structural_validity below 100%")
    for h_type, ceiling in hallucination_ceilings.items():
        rate = (run.hallucination.get("by_type", {}).get(h_type, {}).get("count", 0)
                / run.hallucination.get("by_type", {}).get(h_type, {}).get("total", 1)
                if run.hallucination.get("by_type", {}).get(h_type, {}).get("total") else 0.0)
        if rate > ceiling:
            blockers.append(f"hallucination type '{h_type}' rate {rate} exceeds ceiling {ceiling}")
    if regression_reappearances > 0:
        blockers.append(f"{regression_reappearances} regression case(s) reappeared")
    cells = {}
    for cell, threshold in per_cell_thresholds.items():
        actual = threshold.get("actual") if isinstance(threshold, dict) else None
        if actual is None:
            cells[cell] = "[INSUFFICIENT DATA]"
        else:
            cells[cell] = "pass" if actual >= threshold.get("min", 0) else "fail"
            if cells[cell] == "fail":
                blockers.append(f"cell {cell} below empirical threshold")
    return {"verdict": "blocked" if blockers else "clear", "blockers": blockers, "cells": cells}
