"""
ITU-1 -- Step 6: Annotation & Ground Truth (Phase 6)

Phase 6 defines no new representation -- it defines the human process that
produces trustworthy labels for the Phase 2 Task Understanding Record. This
module covers the pieces of that process that are checkable in code:

    Section 2   annotation_meta block (added to a Phase-2 record while it is
                being annotated, stripped before the record becomes ground
                truth)
    Section 6   inter-annotator agreement metrics (Cohen's kappa for closed
                enums and provenance source type, Jaccard for array fields)
    Section 6.3 the ground-truth promotion gate
    Section 7   disagreement detection, severity triage, adjudication
    Section 8   QA checks: calibration gate, fabrication check, empty-
                uncertainty check, experience/complexity collapse check,
                confidence/source mismatch check, Unknown-rate outliers

Out of scope (Phase 6 Section 0 is explicit about this): no annotation UI,
queue, or storage. This module only encodes the rules such a tool would need
to enforce.

Public API
----------
    validate_annotation(record)            -> list[str]
    strip_annotation_meta(record)          -> dict   (ready for ground truth)

    cohens_kappa(a, b)                     -> float
    jaccard_similarity(a, b)               -> float
    closed_enum_agreement(pairs, field)    -> float  (kappa)
    provenance_source_agreement(pairs, field) -> float (kappa)
    array_agreement(pairs, field)          -> float  (mean Jaccard)
    agreement_level(kappa)                 -> "unstable" | "substantial" | "solved"
    unknown_usage_rate(records, field)     -> float
    unknown_rate_outlier(rate, population) -> bool

    detect_disagreements(a, b)             -> list[dict]  (disagreement_log entries)
    disagreement_severity(field, va, vb)   -> "minor" | "major"
    valid_adjudicator(adjudicator_id, annotator_ids) -> bool
    resolve_disagreement(entry, value, resolved_by, rationale) -> dict

    ready_for_ground_truth(record)         -> (bool, list[str])

    passes_calibration(kappa, fabrication_flag_count) -> bool
    fabrication_check(record, issue_text)  -> list[str]
    empty_uncertainty_check(record)        -> bool
    collapse_check(record, threshold=0.9)  -> bool
    confidence_source_mismatch(record)     -> list[str]
    run_qa_checks(record, issue_text)      -> dict

    annotation_tier(task_type, annotator_notes, domain_kappa) -> "tier_1" | "tier_2"
"""

from __future__ import annotations

import re
import statistics
from difflib import SequenceMatcher
from typing import Any

from derived import validate_all
from schema import PROVENANCE_SOURCE

# --- annotation_meta enums ---------------------------------------------------
AGREEMENT_STATUS = {"agreed", "disagreed", "adjudicated", "single_annotated"}

# Closed-enum classification fields, in Phase-6-defined operational order
# (Section 3.2, 3.3) -- used for "adjacent value" minor-disagreement checks.
CLOSED_ENUM_FIELDS = ("role", "experience_level", "complexity", "task_type")
ORDERED_LEVELS = {
    "experience_level": ["Beginner", "Intermediate", "Advanced"],
    "complexity": ["Low", "Medium", "High"],
}

# Section 6.2 thresholds.
KAPPA_SUBSTANTIAL = 0.7
KAPPA_SOLVED = 0.85

# Section 8.1 calibration gate.
CALIBRATION_KAPPA_FLOOR = 0.7

# Section 8.3.4 confidence/source mismatch bands.
EXPLICIT_MISMATCH_FLOOR = 0.6
INFERRED_MISMATCH_CEILING = 0.9

# Fields whose disagreement blocks ground-truth promotion per Section 6.3.3
# (these are exactly the inputs to the Phase 2 review_required trigger rules).
REVIEW_TRIGGER_FIELDS = {
    "task.role", "task.experience_level", "task.complexity",
    "task.task_type", "task.acceptance_criteria", "confidence.overall_confidence",
}

_WORD = re.compile(r"[A-Za-z0-9_]+")
_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "to", "of", "in", "on",
    "for", "and", "or", "this", "that", "it", "be", "as", "at", "by", "with",
}


# ============================================================ annotation_meta
def _is_str(x: Any) -> bool:
    return isinstance(x, str) and bool(x.strip())


def _check_annotation_meta(meta: Any, base: dict) -> list[str]:
    if not isinstance(meta, dict):
        return ["structure: annotation_meta must be an object"]
    errors: list[str] = []

    annotator = meta.get("annotator_id")
    if not _is_str(annotator):
        errors.append("meta: annotation_meta.annotator_id must be a non-empty string")

    round_ = meta.get("annotation_round")
    if isinstance(round_, bool) or not isinstance(round_, int) or round_ < 1:
        errors.append("meta: annotation_meta.annotation_round must be an integer >= 1")

    second = meta.get("second_annotator_id")
    if second is not None and not _is_str(second):
        errors.append("meta: annotation_meta.second_annotator_id must be a string or null")

    status = meta.get("agreement_status")
    if status not in AGREEMENT_STATUS:
        errors.append(f"meta: agreement_status={status!r} not in {sorted(AGREEMENT_STATUS)}")

    adjudicator = meta.get("adjudicator_id")
    if adjudicator is not None and not _is_str(adjudicator):
        errors.append("meta: annotation_meta.adjudicator_id must be a string or null")

    spent = meta.get("time_spent_seconds")
    if isinstance(spent, bool) or not isinstance(spent, int) or spent < 0:
        errors.append("meta: annotation_meta.time_spent_seconds must be a non-negative integer")

    notes = meta.get("annotator_notes")
    if notes is not None and not isinstance(notes, str):
        errors.append("meta: annotation_meta.annotator_notes must be a string or null")

    log = meta.get("disagreement_log")
    if not isinstance(log, list):
        errors.append("meta: annotation_meta.disagreement_log must be a list")
        log = []
    for i, entry in enumerate(log):
        errors += [f"meta: disagreement_log[{i}]: {e}" for e in _check_log_entry(entry)]

    # --- Rule: agreement_status = single_annotated is only valid for the
    # single-annotator tier -- every other status requires two independent
    # submissions to have existed (Section 2, "Rules specific to annotation_meta").
    if status == "single_annotated":
        if second is not None:
            errors.append("meta: single_annotated status may not carry a second_annotator_id")
        if adjudicator is not None:
            errors.append("meta: single_annotated status may not carry an adjudicator_id")
        if log:
            errors.append("meta: single_annotated status may not carry disagreement_log entries")
    elif status in {"agreed", "disagreed", "adjudicated"}:
        if not _is_str(second):
            errors.append(f"meta: {status} status requires a second_annotator_id")
        elif _is_str(annotator) and second == annotator:
            errors.append("meta: second_annotator_id must differ from annotator_id")

    if status == "disagreed" and not log:
        errors.append("meta: disagreed status requires at least one disagreement_log entry")

    if status == "adjudicated":
        if not _is_str(adjudicator):
            errors.append("meta: adjudicated status requires an adjudicator_id")
        elif _is_str(annotator) and adjudicator == annotator:
            errors.append("meta: adjudicator_id must not equal annotator_id (Section 7.6)")
        elif _is_str(second) and adjudicator == second:
            errors.append("meta: adjudicator_id must not equal second_annotator_id (Section 7.6)")
        for i, entry in enumerate(log):
            if isinstance(entry, dict):
                if not _is_str(entry.get("resolution")):
                    errors.append(f"meta: disagreement_log[{i}] is unresolved but status is adjudicated")
                if not _is_str(entry.get("resolved_by")):
                    errors.append(f"meta: disagreement_log[{i}].resolved_by missing but status is adjudicated")

    return errors


def _check_log_entry(entry: Any) -> list[str]:
    if not isinstance(entry, dict):
        return ["must be an object"]
    errors = []
    if not _is_str(entry.get("field")):
        errors.append("field must be a non-empty string")
    if "annotator_1_value" not in entry:
        errors.append("missing annotator_1_value")
    if "annotator_2_value" not in entry:
        errors.append("missing annotator_2_value")
    resolution = entry.get("resolution")
    if resolution is not None and not isinstance(resolution, str):
        errors.append("resolution must be a string or null")
    resolved_by = entry.get("resolved_by")
    if resolved_by is not None and not _is_str(resolved_by):
        errors.append("resolved_by must be a non-empty string or null")
    if (resolution is None) != (resolved_by is None):
        errors.append("resolution and resolved_by must both be set or both be null")
    return errors


def validate_annotation(record: dict) -> list[str]:
    """Validate a record while it still carries annotation_meta: the base
    Phase 2/derived rules on the stripped record, plus the annotation_meta
    rules from Section 2."""
    if not isinstance(record, dict):
        return ["record must be an object"]
    if "annotation_meta" not in record:
        return ["structure: missing 'annotation_meta'"]
    base = {k: v for k, v in record.items() if k != "annotation_meta"}
    errors = [f"base: {e}" for e in validate_all(base)]
    errors += _check_annotation_meta(record["annotation_meta"], base)
    return errors


def strip_annotation_meta(record: dict) -> dict:
    """annotation_meta is process metadata, not a fact about the task -- it is
    dropped (not merely ignored) once a record is exported as ground truth
    (Section 2)."""
    return {k: v for k, v in record.items() if k != "annotation_meta"}


# ================================================================ agreement
def cohens_kappa(a: list, b: list) -> float:
    """Cohen's kappa for two annotators' paired categorical judgments."""
    n = len(a)
    if n == 0 or n != len(b):
        raise ValueError("cohens_kappa needs two equal-length, non-empty sequences")
    labels = sorted(set(a) | set(b), key=str)
    if len(labels) < 2:
        return 1.0  # only one label ever used -> perfect agreement by definition
    idx = {label: i for i, label in enumerate(labels)}
    k = len(labels)
    matrix = [[0] * k for _ in range(k)]
    for x, y in zip(a, b):
        matrix[idx[x]][idx[y]] += 1
    po = sum(matrix[i][i] for i in range(k)) / n
    row_totals = [sum(row) for row in matrix]
    col_totals = [sum(matrix[i][j] for i in range(k)) for j in range(k)]
    pe = sum(row_totals[i] * col_totals[i] for i in range(k)) / (n * n)
    if pe == 1.0:
        return 1.0
    return (po - pe) / (1 - pe)


def jaccard_similarity(a: Any, b: Any) -> float:
    a, b = set(a or []), set(b or [])
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)


def closed_enum_agreement(pairs: list[tuple[dict, dict]], field: str) -> float:
    """Section 6.2: Cohen's kappa on the raw task[field] values across a batch
    of (annotator_1_record, annotator_2_record) pairs."""
    a = [p[0]["task"][field] for p in pairs]
    b = [p[1]["task"][field] for p in pairs]
    return cohens_kappa(a, b)


def provenance_source_agreement(pairs: list[tuple[dict, dict]], field: str) -> float:
    """Section 6.2: kappa on provenance.<field>.source, tracked separately from
    the value agreement -- two annotators can agree on the value while
    disagreeing on whether it was EXPLICIT or INFERRED."""
    a = [p[0]["provenance"][field]["source"] for p in pairs]
    b = [p[1]["provenance"][field]["source"] for p in pairs]
    return cohens_kappa(a, b)


def array_agreement(pairs: list[tuple[dict, dict]], field: str) -> float:
    """Section 6.2: mean Jaccard similarity for array fields (technologies,
    components, systems, technical_areas, ...)."""
    scores = [jaccard_similarity(p[0]["task"].get(field, []), p[1]["task"].get(field, []))
              for p in pairs]
    return sum(scores) / len(scores) if scores else 1.0


def agreement_level(kappa: float) -> str:
    if kappa >= KAPPA_SOLVED:
        return "solved"
    if kappa >= KAPPA_SUBSTANTIAL:
        return "substantial"
    return "unstable"


def unknown_usage_rate(records: list[dict], field: str) -> float:
    """Section 6.2: fraction of an annotator's records where task[field] is
    Unknown, tracked per annotator (caller filters `records` to one annotator)."""
    if not records:
        return 0.0
    unknown = sum(1 for r in records if r["task"].get(field) == "Unknown")
    return unknown / len(records)


def unknown_rate_outlier(rate: float, population: list[float], z: float = 2.0) -> bool:
    """A rate more than `z` population standard deviations from the mean of
    `population` is flagged for guideline re-training (Section 6.2)."""
    if len(population) < 2:
        return False
    mean = statistics.mean(population)
    stdev = statistics.pstdev(population)
    if stdev == 0:
        return rate != mean
    return abs(rate - mean) / stdev > z


# ============================================================== disagreement
def _get_path(record: dict, path: str) -> Any:
    node: Any = record
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


_COMPARED_PATHS = (
    "task.role", "task.experience_level", "task.complexity", "task.task_type",
    "provenance.role.source", "provenance.experience_level.source",
    "provenance.complexity.source", "provenance.task_type.source",
    "review.review_required",
)


def detect_disagreements(record_a: dict, record_b: dict) -> list[dict]:
    """Section 7.1: auto-detection. Diffs two independent submissions field by
    field and generates unresolved disagreement_log entries (resolution and
    resolved_by both null) for every field that differs. Annotators never
    hand-report disagreement -- this is meant to be run by the tool."""
    entries = []
    for path in _COMPARED_PATHS:
        va, vb = _get_path(record_a, path), _get_path(record_b, path)
        if va != vb:
            entries.append({
                "field": path,
                "annotator_1_value": va,
                "annotator_2_value": vb,
                "resolution": None,
                "resolved_by": None,
            })
    return entries


def disagreement_severity(field: str, value_a: Any, value_b: Any) -> str:
    """Section 7.2 severity triage. Minor differences go to a tie-breaker;
    everything else -- role, task_type Security, any Unknown-vs-concrete split
    -- is escalated to a named adjudicator."""
    if value_a == value_b:
        raise ValueError("not a disagreement")
    if "Unknown" in (value_a, value_b):
        return "major"
    if field == "task.role":
        return "major"
    if field == "task.task_type":
        return "major" if "Security" in (value_a, value_b) else "minor"
    key = field.split(".")[-1]
    order = ORDERED_LEVELS.get(key)
    if order and value_a in order and value_b in order:
        if abs(order.index(value_a) - order.index(value_b)) == 1:
            return "minor"
        return "major"
    if field.endswith(".source"):
        return "minor"
    return "minor"


def valid_adjudicator(adjudicator_id: str, annotator_ids: list[str]) -> bool:
    """Section 7.6: an adjudicator may not adjudicate their own annotation."""
    return bool(adjudicator_id) and adjudicator_id not in (annotator_ids or [])


def resolve_disagreement(entry: dict, value: Any, resolved_by: str, rationale: str) -> dict:
    """Section 7.4: resolution is logged, not silent. Returns a new entry with
    `resolution`/`resolved_by` filled in; the original annotator_1_value and
    annotator_2_value are preserved (disagreement_log is append-only, Section 2)."""
    out = dict(entry)
    out["resolution"] = f"{rationale} -> {value!r}"
    out["resolved_by"] = resolved_by
    return out


# ============================================================ ground truth
def ready_for_ground_truth(record: dict) -> tuple[bool, list[str]]:
    """Section 6.3: the promotion gate. A record enters the training/eval
    ground-truth pool only if all three conditions hold."""
    reasons = []
    meta = record.get("annotation_meta", {})
    status = meta.get("agreement_status")
    if status not in {"agreed", "adjudicated"}:
        reasons.append(f"condition 1: agreement_status={status!r}, need agreed or adjudicated")

    base = strip_annotation_meta(record)
    schema_errors = validate_all(base)
    if schema_errors:
        reasons.append(f"condition 2: {len(schema_errors)} schema validation error(s)")

    for entry in meta.get("disagreement_log", []):
        if isinstance(entry, dict) and entry.get("field") in REVIEW_TRIGGER_FIELDS \
                and entry.get("resolution") is None:
            reasons.append(
                f"condition 3: unresolved disagreement on '{entry.get('field')}', "
                "which feeds review_required"
            )

    return (not reasons, reasons)


# ========================================================================= QA
def passes_calibration(kappa: float, fabrication_flag_count: int) -> bool:
    """Section 8.1: pre-annotation gate. Zero fabrication is a hard fail
    regardless of kappa; kappa below the floor also fails."""
    return fabrication_flag_count == 0 and kappa >= CALIBRATION_KAPPA_FLOOR


def _tokens(text: str) -> set[str]:
    return {w.lower() for w in _WORD.findall(text or "") if w.lower() not in _STOPWORDS}


def fabrication_check(record: dict, issue_text: str) -> list[str]:
    """Section 8.3.1: every EXPLICIT/SUPPORTED_BY_CONTEXT evidence string must
    share at least one token with the issue text. A cheap automatable proxy,
    not a semantic check -- genuine grounding is confirmed in human review."""
    issue_tokens = _tokens(issue_text)
    flagged = []
    for field, entry in record.get("provenance", {}).items():
        if not isinstance(entry, dict):
            continue
        if entry.get("source") in {"EXPLICIT", "SUPPORTED_BY_CONTEXT"}:
            evidence_tokens = _tokens(entry.get("evidence") or "")
            if not (evidence_tokens & issue_tokens):
                flagged.append(field)
    return flagged


def empty_uncertainty_check(record: dict) -> bool:
    """Section 8.3.2: a record with >= 2 Unknown fields but an empty
    missing_information array is a Section 4.2 violation."""
    unknown_count = sum(1 for e in record.get("provenance", {}).values()
                         if isinstance(e, dict) and e.get("source") == "UNKNOWN")
    missing = record.get("uncertainty", {}).get("missing_information", [])
    return unknown_count >= 2 and not missing


def collapse_check(record: dict, threshold: float = 0.9) -> bool:
    """Section 8.3.3: annotation-time enforcement of Phase 2 Rule 7, catching
    near-identical (not just byte-identical) evidence before schema validation."""
    prov = record.get("provenance", {})
    exp = (prov.get("experience_level") or {}).get("evidence")
    cpx = (prov.get("complexity") or {}).get("evidence")
    if not isinstance(exp, str) or not isinstance(cpx, str):
        return False
    return SequenceMatcher(None, exp, cpx).ratio() >= threshold


def confidence_source_mismatch(record: dict) -> list[str]:
    """Section 8.3.4: EXPLICIT below the floor or INFERRED above the ceiling
    is surfaced for a second look, not auto-rejected."""
    flagged = []
    for field, entry in record.get("provenance", {}).items():
        if not isinstance(entry, dict):
            continue
        source, conf = entry.get("source"), entry.get("confidence")
        if not isinstance(conf, (int, float)) or isinstance(conf, bool):
            continue
        if source == "EXPLICIT" and conf < EXPLICIT_MISMATCH_FLOOR:
            flagged.append(field)
        elif source == "INFERRED" and conf > INFERRED_MISMATCH_CEILING:
            flagged.append(field)
    return flagged


def run_qa_checks(record: dict, issue_text: str) -> dict:
    """Runs all Section 8.3 checks on a single submitted record."""
    return {
        "fabrication": fabrication_check(record, issue_text),
        "empty_uncertainty": empty_uncertainty_check(record),
        "experience_complexity_collapse": collapse_check(record),
        "confidence_source_mismatch": confidence_source_mismatch(record),
    }


# ============================================================== tier routing
def annotation_tier(task_type: str, annotator_notes: str | None = None,
                     domain_kappa: float | None = None) -> str:
    """Section 6.1. Security-flagged issues are always Tier 1, regardless of
    domain maturity. Otherwise Tier 1 is the default until the domain has
    demonstrated stable agreement (kappa >= KAPPA_SUBSTANTIAL)."""
    if task_type == "Security" or "security" in (annotator_notes or "").lower():
        return "tier_1"
    if domain_kappa is not None and domain_kappa >= KAPPA_SUBSTANTIAL:
        return "tier_2"
    return "tier_1"
