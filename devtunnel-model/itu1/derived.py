"""
ITU-1 -- Step 2: derived fields (Phase 2, Sections 3-4)

Three parts of a Task Understanding Record are *computed*, never authored:

    confidence.overall_confidence   weighted mean of per-field confidence
    uncertainty.explicit/inferred/uncertain_information   rollups of provenance
    review.review_required / review_reasons               six trigger rules

This module provides:

    derive_confidence(record)      -> {"overall_confidence", "method"}
    derive_uncertainty(record)     -> rollups (keeps model-judged extras + missing_information)
    derive_review(record)          -> {"review_required", "review_reasons"}
    finalize(record)               -> copy of record with all three filled in
    validate_derived(record)       -> violations of rules 6, 10, 11
    validate_all(record)           -> schema.validate + validate_derived
    explicit_low_confidence(record)-> rule 4 calibration smells (advisory only)
"""

from __future__ import annotations

import copy

from schema import validate

METHOD = "weighted_mean_v1"
UNCERTAINTY_THRESHOLD = 0.6
CONFIDENCE_TOLERANCE = 0.01
EXPLICIT_CONFIDENCE_FLOOR = 0.75  # rule 4 (statistical expectation)

# Fields that are required in `task` get weight 2, everything else weight 1.
REQUIRED_TASK_FIELDS = {
    "title", "summary", "objective", "description", "expected_outcome",
    "role", "experience_level", "complexity", "task_type",
    "scope", "acceptance_criteria",
}

# Canonical review reason strings, one per trigger rule (Section 4).
REVIEW_REASONS = {
    1: "R1: role, experience_level or complexity is Unknown",
    2: "R2: acceptance_criteria is empty",
    3: "R3: overall_confidence is below 0.5",
    4: "R4: task_type is Security",
    5: "R5: complexity is High and experience_level is Unknown",
    6: "R6: role, complexity or task_type is listed as uncertain",
}


def _is_known(entry: dict) -> bool:
    return isinstance(entry, dict) and entry.get("source") not in (None, "UNKNOWN")


def _weight(field: str) -> int:
    return 2 if field in REQUIRED_TASK_FIELDS else 1


# ---------------------------------------------------------------- confidence
def compute_overall_confidence(provenance: dict) -> float:
    num = den = 0.0
    for field, entry in provenance.items():
        if not _is_known(entry):
            continue
        conf = entry.get("confidence")
        if isinstance(conf, bool) or not isinstance(conf, (int, float)):
            continue  # malformed entry; schema.validate reports it
        w = _weight(field)
        num += conf * w
        den += w
    return round(num / den, 2) if den else 0.0


def derive_confidence(record: dict) -> dict:
    return {
        "overall_confidence": compute_overall_confidence(record["provenance"]),
        "method": METHOD,
    }


# --------------------------------------------------------------- uncertainty
def _below_threshold(provenance: dict, threshold: float) -> list[str]:
    out = []
    for field, entry in provenance.items():
        conf = entry.get("confidence") if isinstance(entry, dict) else None
        if _is_known(entry) and isinstance(conf, (int, float)) and conf < threshold:
            out.append(field)
    return out


def derive_uncertainty(record: dict, threshold: float = UNCERTAINTY_THRESHOLD) -> dict:
    """Rebuild explicit/inferred rollups from provenance. `uncertain_information`
    keeps any model-judged entries that are still valid (field known) and adds
    every below-threshold field. `missing_information` is authored, kept as is."""
    prov = record["provenance"]
    old = record.get("uncertainty", {})

    explicit = [{"field": f, "evidence": e["evidence"]}
                for f, e in prov.items() if e.get("source") == "EXPLICIT"]
    inferred = [{"field": f, "evidence": e["evidence"]}
                for f, e in prov.items() if e.get("source") == "INFERRED"]

    uncertain = [u for u in old.get("uncertain_information", [])
                 if u.get("field") in prov and _is_known(prov[u["field"]])]
    present = {u["field"] for u in uncertain}
    for f in _below_threshold(prov, threshold):
        if f not in present:
            uncertain.append({
                "field": f,
                "evidence": prov[f]["evidence"],
                "note": f"confidence {prov[f]['confidence']} is below {threshold}",
            })

    return {
        "explicit_information": explicit,
        "inferred_information": inferred,
        "uncertain_information": uncertain,
        "missing_information": list(old.get("missing_information", [])),
    }


# -------------------------------------------------------------------- review
def fired_review_rules(task: dict, overall: float, uncertain_fields: set[str]) -> list[int]:
    fired = []
    if any(task.get(f) == "Unknown" for f in ("role", "experience_level", "complexity")):
        fired.append(1)
    if not task.get("acceptance_criteria"):
        fired.append(2)
    if overall < 0.5:
        fired.append(3)
    if task.get("task_type") == "Security":
        fired.append(4)
    if task.get("complexity") == "High" and task.get("experience_level") == "Unknown":
        fired.append(5)
    if uncertain_fields & {"role", "complexity", "task_type"}:
        fired.append(6)
    return fired


def derive_review(record: dict) -> dict:
    overall = compute_overall_confidence(record["provenance"])
    uncertain = {u["field"] for u in derive_uncertainty(record)["uncertain_information"]}
    fired = fired_review_rules(record["task"], overall, uncertain)
    return {
        "review_required": bool(fired),
        "review_reasons": [REVIEW_REASONS[n] for n in fired],
    }


def finalize(record: dict) -> dict:
    """Return a copy with confidence, uncertainty rollups and review filled in."""
    out = copy.deepcopy(record)
    out["uncertainty"] = derive_uncertainty(out)
    out["confidence"] = derive_confidence(out)
    out["review"] = derive_review(out)
    return out


# ---------------------------------------------------------------- validation
def validate_derived(record: dict) -> list[str]:
    errors: list[str] = []
    prov = record.get("provenance", {})
    task = record.get("task", {})
    unc = record.get("uncertainty", {})

    # Rule 6: uncertainty <-> provenance consistency
    for key, source in (("explicit_information", "EXPLICIT"),
                        ("inferred_information", "INFERRED")):
        entries = unc.get(key, [])
        listed = set()
        for item in entries:
            f = item.get("field")
            listed.add(f)
            if f not in prov or prov[f].get("source") != source:
                errors.append(f"rule 6: {key} lists '{f}' but its provenance source is not {source}")
            elif item.get("evidence") != prov[f].get("evidence"):
                errors.append(f"rule 6: {key} evidence for '{f}' differs from provenance")
        expected = {f for f, e in prov.items() if e.get("source") == source}
        for f in sorted(expected - listed):
            errors.append(f"rule 6: {key} is missing '{f}' (provenance source is {source})")

    uncertain_fields = set()
    for item in unc.get("uncertain_information", []):
        f = item.get("field")
        uncertain_fields.add(f)
        if f not in prov or not _is_known(prov[f]):
            errors.append(f"rule 6: uncertain_information lists '{f}', which is UNKNOWN or absent")
    for f in _below_threshold(prov, UNCERTAINTY_THRESHOLD):
        if f not in uncertain_fields:
            errors.append(
                f"rule 6: '{f}' has confidence below {UNCERTAINTY_THRESHOLD} "
                "but is not in uncertain_information"
            )

    # Rule 10: overall_confidence is derived
    expected_overall = compute_overall_confidence(prov)
    conf = record.get("confidence", {})
    stored = conf.get("overall_confidence")
    if isinstance(stored, bool) or not isinstance(stored, (int, float)):
        errors.append("rule 10: confidence.overall_confidence must be a number")
    elif abs(stored - expected_overall) > CONFIDENCE_TOLERANCE:
        errors.append(
            f"rule 10: overall_confidence {stored} differs from recomputed "
            f"{expected_overall} by more than {CONFIDENCE_TOLERANCE}"
        )
    if conf.get("method") != METHOD:
        errors.append(f"rule 10: confidence.method must be {METHOD!r}")

    # Rule 11: review_required / review_reasons are derived
    review = record.get("review", {})
    fired = fired_review_rules(task, expected_overall, uncertain_fields)
    required = review.get("review_required")
    reasons = review.get("review_reasons", [])
    if required is not bool(fired):
        errors.append(
            f"rule 11: review_required is {required!r} but trigger rules "
            f"{['R%d' % n for n in fired] or 'none'} fired"
        )
    if bool(reasons) != bool(required):
        errors.append("rule 11: review_reasons must be non-empty iff review_required is true")
    expected_reasons = {REVIEW_REASONS[n] for n in fired}
    if set(reasons) != expected_reasons:
        errors.append(
            f"rule 11: review_reasons {sorted(reasons)} do not match fired rules "
            f"{sorted(expected_reasons)}"
        )
    return errors


def validate_all(record: dict) -> list[str]:
    """Schema/provenance rules first; derived-field rules only if the record is
    structurally sound enough to recompute from."""
    errors = validate(record)
    if any(e.startswith("structure:") for e in errors):
        return errors
    return errors + validate_derived(record)


# --------------------------------------------------- rule 4 (advisory only)
def explicit_low_confidence(record: dict) -> list[str]:
    """EXPLICIT entries below the expected calibration floor. A smell to flag
    in review, not a schema violation (rule 4 is evaluated over a sample)."""
    return [f for f, e in record["provenance"].items()
            if e.get("source") == "EXPLICIT"
            and isinstance(e.get("confidence"), (int, float))
            and e["confidence"] < EXPLICIT_CONFIDENCE_FLOOR]
