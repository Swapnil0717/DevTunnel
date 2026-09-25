"""
ITU-1 -- Step 1: Task Understanding Record schema (Phase 2, schema_version 2.x)

Scope of this step
------------------
Defines the record shape and the validation rules that can be checked from
the record alone:

    Rule 1   provenance completeness
    Rule 2   UNKNOWN  => evidence None, confidence None
    Rule 3   non-UNKNOWN => non-empty evidence, confidence in [0, 1]
    Rule 5   acceptance_criteria minimum
    Rule 7   experience_level / complexity evidence not identical
    Rule 8   components / systems disjoint
    Rule 9   dependency refs resolve
    Rule 12  schema_version gate
    (+ structural checks: required sections, closed enums, types)

Deliberately NOT in this step (they need the derived-field logic, Step 2):

    Rule 4   EXPLICIT confidence calibration (statistical, not per-record)
    Rule 6   uncertainty <-> provenance consistency
    Rule 10  overall_confidence recomputation
    Rule 11  review_required recomputation

Records are plain JSON-shaped dicts. No third-party dependencies.
"""

from __future__ import annotations

import re
from typing import Any

SCHEMA_VERSION_PATTERN = re.compile(r"^2\.\d+\.\d+$")
ISSUE_REF_PATTERN = re.compile(r"^(#\d+|[A-Za-z0-9_.-]+#\d+)$")

# --- Closed enums -----------------------------------------------------------
ROLE = {"Frontend", "Backend", "Fullstack", "Unknown"}
EXPERIENCE_LEVEL = {"Beginner", "Intermediate", "Advanced", "Unknown"}
COMPLEXITY = {"Low", "Medium", "High", "Unknown"}
PROVENANCE_SOURCE = {"EXPLICIT", "SUPPORTED_BY_CONTEXT", "INFERRED", "UNKNOWN"}
DEPENDENCY_TYPE = {"blocks", "blocked_by", "relates_to", "requires"}

# --- Extensible enum (new values only via a MINOR schema bump) ---------------
TASK_TYPE_REGISTRY = {
    "Bug", "Feature", "Improvement", "Refactor", "Performance",
    "Security", "Maintenance", "Documentation", "Other", "Unknown",
}

# --- Field groups -------------------------------------------------------------
REQUIRED_SECTIONS = (
    "schema_version", "task_identity", "task",
    "provenance", "uncertainty", "confidence", "review",
)

STRING_FIELDS_REQUIRED = ("title", "summary", "objective", "expected_outcome")
STRING_FIELDS_OPTIONAL = ("description",)
ENUM_FIELDS = {
    "role": ROLE,
    "experience_level": EXPERIENCE_LEVEL,
    "complexity": COMPLEXITY,
}
LIST_FIELDS_OPTIONAL = (
    "technologies", "languages", "frameworks", "technical_areas",
    "components", "systems", "affected_areas", "constraints",
)

# Fields that MUST have a provenance entry (Rule 1).
PROVENANCE_REQUIRED = (
    "title", "summary", "objective", "expected_outcome",
    "role", "experience_level", "complexity", "task_type",
    "technologies", "languages", "frameworks", "technical_areas",
    "components", "systems", "dependencies", "scope", "acceptance_criteria",
)
# Tracked only when the field is present in `task` (optional-tracked fields).
PROVENANCE_IF_PRESENT = ("constraints",)


def _is_number(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _is_str_list(x: Any) -> bool:
    return isinstance(x, list) and all(isinstance(i, str) for i in x)


def validate(record: dict) -> list[str]:
    """Return a list of violation messages. Empty list means the record is valid
    for the rules covered in this step."""
    errors: list[str] = []

    if not isinstance(record, dict):
        return ["record must be an object"]

    # --- Structure: required top-level sections ------------------------------
    for section in REQUIRED_SECTIONS:
        if section not in record:
            errors.append(f"structure: missing top-level section '{section}'")
    if errors:
        return errors  # nothing else is checkable without the skeleton

    # --- Rule 12: schema_version gate ----------------------------------------
    version = record["schema_version"]
    if not isinstance(version, str) or not SCHEMA_VERSION_PATTERN.match(version):
        errors.append(
            f"rule 12: schema_version {version!r} does not match ^2\\.\\d+\\.\\d+$ "
            "(v1 records must be migrated first)"
        )

    task = record["task"]
    prov = record["provenance"]
    if not isinstance(task, dict):
        return errors + ["structure: 'task' must be an object"]
    if not isinstance(prov, dict):
        return errors + ["structure: 'provenance' must be an object"]

    errors += _check_task_structure(task)
    errors += _check_provenance(task, prov)
    errors += _check_cross_field(task, prov)
    return errors


# ----------------------------------------------------------------------------
def _check_task_structure(task: dict) -> list[str]:
    errors: list[str] = []

    for f in STRING_FIELDS_REQUIRED:
        if not isinstance(task.get(f), str):
            errors.append(f"structure: task.{f} must be a string")
    for f in STRING_FIELDS_OPTIONAL:
        if f in task and not isinstance(task[f], str):
            errors.append(f"structure: task.{f} must be a string")

    for f, allowed in ENUM_FIELDS.items():
        if task.get(f) not in allowed:
            errors.append(f"structure: task.{f}={task.get(f)!r} not in {sorted(allowed)}")

    if task.get("task_type") not in TASK_TYPE_REGISTRY:
        errors.append(
            f"structure: task.task_type={task.get('task_type')!r} is not in the "
            "registry (new values require a MINOR schema bump)"
        )

    for f in LIST_FIELDS_OPTIONAL:
        if f in task and not _is_str_list(task[f]):
            errors.append(f"structure: task.{f} must be a list of strings")

    if not _is_str_list(task.get("acceptance_criteria")):
        errors.append("structure: task.acceptance_criteria must be a list of strings")

    scope = task.get("scope")
    if not (isinstance(scope, dict)
            and _is_str_list(scope.get("in_scope"))
            and _is_str_list(scope.get("out_of_scope"))):
        errors.append("structure: task.scope needs list-of-string in_scope and out_of_scope")

    deps = task.get("dependencies", [])
    if not isinstance(deps, list):
        errors.append("structure: task.dependencies must be a list")
    else:
        for i, d in enumerate(deps):
            if not isinstance(d, dict):
                errors.append(f"structure: dependencies[{i}] must be an object")
                continue
            if d.get("type") not in DEPENDENCY_TYPE:
                errors.append(f"structure: dependencies[{i}].type={d.get('type')!r} invalid")
            if not isinstance(d.get("ref"), str):
                errors.append(f"structure: dependencies[{i}].ref must be a string")
            if not isinstance(d.get("description"), str):
                errors.append(f"structure: dependencies[{i}].description must be a string")
    return errors


def _check_provenance(task: dict, prov: dict) -> list[str]:
    errors: list[str] = []

    # Rule 1: completeness
    required = list(PROVENANCE_REQUIRED) + [f for f in PROVENANCE_IF_PRESENT if f in task]
    for f in required:
        if f not in prov:
            errors.append(f"rule 1: missing provenance entry for '{f}'")

    # Rules 2 and 3: per-entry consistency
    for field, entry in prov.items():
        if not isinstance(entry, dict):
            errors.append(f"structure: provenance.{field} must be an object")
            continue
        source = entry.get("source")
        evidence = entry.get("evidence")
        confidence = entry.get("confidence")

        if source not in PROVENANCE_SOURCE:
            errors.append(f"structure: provenance.{field}.source={source!r} invalid")
            continue

        if source == "UNKNOWN":
            if evidence is not None or confidence is not None:
                errors.append(
                    f"rule 2: provenance.{field} is UNKNOWN so evidence and "
                    "confidence must both be null"
                )
        else:
            if not (isinstance(evidence, str) and evidence.strip()):
                errors.append(
                    f"rule 3: provenance.{field} is {source} so evidence must be "
                    "a non-empty string"
                )
            if not (_is_number(confidence) and 0.0 <= confidence <= 1.0):
                errors.append(
                    f"rule 3: provenance.{field}.confidence must be a number in [0, 1]"
                )
    return errors


def _check_cross_field(task: dict, prov: dict) -> list[str]:
    errors: list[str] = []

    # Rule 5: acceptance criteria minimum
    classification = ("role", "experience_level", "complexity", "task_type")
    all_unknown = all(task.get(f) == "Unknown" for f in classification)
    if not task.get("acceptance_criteria") and not all_unknown:
        errors.append(
            "rule 5: acceptance_criteria is empty but at least one of role/"
            "experience_level/complexity/task_type is classified"
        )

    # Rule 7: experience and complexity must not share identical evidence
    exp_ev = (prov.get("experience_level") or {}).get("evidence")
    cpx_ev = (prov.get("complexity") or {}).get("evidence")
    if exp_ev is not None and exp_ev == cpx_ev:
        errors.append(
            "rule 7: experience_level and complexity have identical evidence "
            "(dimensions appear collapsed)"
        )

    # Rule 8: components / systems disjoint
    overlap = set(task.get("components", [])) & set(task.get("systems", []))
    if overlap:
        errors.append(f"rule 8: components and systems overlap: {sorted(overlap)}")

    # Rule 9: dependency refs must resolve
    known_units = set(task.get("components", [])) | set(task.get("systems", []))
    for i, d in enumerate(task.get("dependencies", [])):
        ref = d.get("ref") if isinstance(d, dict) else None
        if isinstance(ref, str) and ref not in known_units and not ISSUE_REF_PATTERN.match(ref):
            errors.append(
                f"rule 9: dependencies[{i}].ref={ref!r} is neither a known "
                "component/system nor an issue reference"
            )
    return errors
