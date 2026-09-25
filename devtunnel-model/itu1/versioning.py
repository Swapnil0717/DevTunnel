"""
ITU-1 -- Step 18: Model Versioning & Benchmarking (Phase 18)

Phase 18 is explicitly *not* a training or evaluation phase (Section "Scope boundary"): it
consolidates identity, comparability and contamination guarantees across everything Phases 1-17
already produce. It trains nothing and decides no release (Phase 17 keeps that authority). What
this module implements is the checkable rule layer the spec itself defines:

    valid_ref / parse_ref                         -> reference format (Section 1.4)
    required_bump(change_type, *, weights_changed) -> "MAJOR"|"MINOR"|"PATCH"  (Section 2.2)
    validate_model_version_record(record)          -> list[str]     (Section 2.4, registry invariants)
    validate_status_transition(frm, to, has_decision_ref)
                                                     -> list[str]     (Section 2.7)
    validate_known_limitations / validate_known_regressions / validate_supported_context
                                                     -> list[str]     (Section 2.6, "fields most often faked")
    annotation_version_histogram_valid(hist, *, is_frozen_benchmark)
                                                     -> list[str]     (Section 3.2 D-c)
    regression_is_monotone(prev_ids, new_ids)       -> list[str]     (Section 3.2 D-c')
    validate_generation_stamp(stamp, *, registered_models)
                                                     -> list[str]     (Section 4.4, Rules 13-15)
    schema_ripple(change_kind)                      -> dict           (Section 4.2)
    edition_bump_type(...)                          -> "MAJOR"|"MINOR"|"PATCH" (Section 5.2/5.5)
    ExposureLedger                                   class            (Section 5.4)
    evalsuite_bump_type(...)                        -> str            (Section 5.7)
    bc1_ledger_preflight ... bc9_derivative_audit    -> list[str]     (Section 6.4 BC-tests)
    propagate_taint(...)                             -> set[str]      (Section 6.4 C3)
    REPRO_LEVELS / validate_repro_manifest           -> ...           (Section 8)
    release_record_completeness_violations(record)  -> list[str]     (Section 9)

Everything Phase 18 explicitly defers -- base-model choice, numeric thresholds (exposure budgets,
power floors, temporal margins), the contract-freeze decision, Vault custody -- is left as a
required argument or an open item, never a default (Decision #20, Section 10.3).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# ================================================================== Section 1.4: reference format

REF_RE = re.compile(r"^[a-z0-9][a-z0-9:._-]*@\d+\.\d+\.\d+\+[0-9a-f]{12}$")
MODEL_REF_RE = re.compile(r"^[a-z0-9-]+@\d+\.\d+\.\d+\+[0-9a-f]{12}$")
UNRECORDED_RE = re.compile(r"^UNRECORDED\([a-z0-9_]+\)$")


def valid_ref(value: str, *, allow_unrecorded: bool = False) -> bool:
    """Section 1.4 / I3, I4: `name@MAJOR.MINOR.PATCH+hash12`. A label alone or a hash alone
    is invalid. `UNRECORDED(reason)` is only ever valid on a back-filled record (I7, R11)."""
    if allow_unrecorded and UNRECORDED_RE.match(value):
        return True
    return bool(REF_RE.match(value))


def valid_model_ref(value: str) -> bool:
    return bool(MODEL_REF_RE.match(value))


def parse_ref(value: str) -> tuple[str, str, str] | None:
    """Returns (name, semver, hash12), or None if not a well-formed pinned reference."""
    if not valid_ref(value):
        return None
    name_part, rest = value.split("@", 1)
    semver, hash12 = rest.split("+", 1)
    return name_part, semver, hash12


# ================================================================== Section 2.2: version numbering

# Trigger -> bump. Matches the master table; the highest applicable trigger wins (rule stated
# in the spec text, enforced by required_bump taking the *set* of triggers that fired).
CHANGE_TYPE_BUMP: dict[str, str] = {
    "initial": "MAJOR",
    "Architecture changes": "MAJOR",
    "base_model_swap": "MAJOR",
    "Output-schema changes": "MAJOR",  # only when the schema change itself is MAJOR (Section 4.2)
    "behavior_contract_major": "MAJOR",
    "More training data": "MINOR",
    "Better annotations": "MINOR",
    "Better data balance": "MINOR",
    "Better context": "MINOR",
    "Better retrieval": "MINOR",
    "Training-objective changes": "MINOR",
    "Better uncertainty handling": "MINOR",
    "context_tier_promoted": "MINOR",
    "calibrator_refit": "MINOR",
    "schema_minor_consumed": "MINOR",
    "behavior_contract_minor": "MINOR",
    "metadata_only": "PATCH",
    "packaging_conversion": "PATCH",
}

_BUMP_RANK = {"PATCH": 0, "MINOR": 1, "MAJOR": 2}


def required_bump(change_types: str | list[str], *, weights_changed: bool,
                   equivalence_run_passed: bool = False) -> str:
    """Section 2.2 bump table. `change_types` may be one trigger or several that fired together
    (e.g. a candidate that both adds training data and refits the calibrator); the highest wins.
    "Any change to weights is at least MINOR." A PATCH claim without a passing equivalence run
    is invalid and is rejected here rather than silently upgraded, so the caller sees the error."""
    if isinstance(change_types, str):
        change_types = [change_types]
    if not change_types:
        raise ValueError("required_bump: at least one change_type is required")
    unknown = [c for c in change_types if c not in CHANGE_TYPE_BUMP]
    if unknown:
        raise ValueError(f"required_bump: unknown change_type(s) {unknown}")
    bump = max((CHANGE_TYPE_BUMP[c] for c in change_types), key=lambda b: _BUMP_RANK[b])
    if bump == "PATCH":
        if weights_changed:
            return "MINOR"
        if not equivalence_run_passed:
            raise ValueError(
                "required_bump: a PATCH claim requires a passing equivalence run "
                "(Section 2.2); none was supplied"
            )
    if weights_changed and bump == "PATCH":
        return "MINOR"
    return bump


def semver_gt(a: str, b: str) -> bool:
    """Compare two `X.Y.Z` strings (no hash/name prefix)."""
    return tuple(int(x) for x in a.split(".")) > tuple(int(x) for x in b.split("."))


def bump_version(version: str, kind: str) -> str:
    major, minor, patch = (int(x) for x in version.split("."))
    if kind == "MAJOR":
        return f"{major + 1}.0.0"
    if kind == "MINOR":
        return f"{major}.{minor + 1}.0"
    if kind == "PATCH":
        return f"{major}.{minor}.{patch + 1}"
    raise ValueError(f"bump_version: unknown kind {kind!r}")


# ================================================================== Section 2.4/2.8: ModelVersionRecord

MODEL_CORE_REQUIRED = (
    "model_ref", "registered_at", "registered_by", "lineage", "components",
    "output_schema_ref", "annotation_refs", "data", "training", "integrity",
)
MODEL_EVIDENCE_FIELDS = ("evaluation_results", "known_limitations", "known_regressions", "supported_context")
LINEAGE_CHANGE_TYPES = (
    "initial", "More training data", "Better annotations", "Better data balance",
    "Better context", "Better retrieval", "Architecture changes",
    "Training-objective changes", "Output-schema changes", "Better uncertainty handling",
)
BLAST_RADII = ("narrow", "moderate", "broad", "UNRECORDED(pre_registry)")
COMPONENT_KEYS = ("calibrated_checkpoint", "tokenizer", "heads", "assembly",
                   "behavior_contract", "context_config", "inference_config")


def validate_model_version_record(record: dict, *, evidence_sealed: bool = True) -> list[str]:
    """Section 2.4 shape plus the registry invariants (Section 2.8) that are checkable on the
    record alone, without a live registry to cross-reference (R1-R3, R9, R10 need registry
    context and are exposed as separate functions below). `evidence_sealed=False` validates the
    view at status `registered`, before the `evidence_sealed` event (Section 2.4 description)."""
    errors: list[str] = []
    required = MODEL_CORE_REQUIRED + (MODEL_EVIDENCE_FIELDS if evidence_sealed else ())
    for f in required:
        if f not in record:
            errors.append(f"missing required field '{f}'")
    if not evidence_sealed:
        for f in MODEL_EVIDENCE_FIELDS:
            if f in record:
                errors.append(f"'{f}' present before evidence_sealed (Section 2.4)")
        return errors  # nothing else to check pre-seal

    is_legacy = bool(record.get("legacy_names"))

    if "model_ref" in record and not valid_model_ref(record["model_ref"]):
        errors.append("model_ref is not a well-formed modelRef")

    lineage = record.get("lineage", {})
    if lineage:
        for f in ("parent", "change_type", "blast_radius", "candidate_id",
                   "checkpoint_chain", "root_base_model"):
            if f not in lineage:
                errors.append(f"lineage.{f} missing")
        ct = lineage.get("change_type")
        if ct is not None and ct not in LINEAGE_CHANGE_TYPES:
            errors.append(f"lineage.change_type {ct!r} not one of the nine named types")
        parent = lineage.get("parent")
        if parent is not None and not valid_model_ref(parent):
            errors.append("lineage.parent is set but not a valid modelRef")
        if parent is None and ct != "initial":
            errors.append("lineage.parent is null but change_type is not 'initial'")
        br = lineage.get("blast_radius")
        if br is not None and br not in BLAST_RADII:
            errors.append(f"lineage.blast_radius {br!r} invalid")
        if br == "UNRECORDED(pre_registry)" and not is_legacy:
            errors.append("blast_radius UNRECORDED(pre_registry) on a non-legacy record (I7/R11)")
        for c in lineage.get("checkpoint_chain", []):
            if not valid_ref(c, allow_unrecorded=is_legacy):
                errors.append(f"lineage.checkpoint_chain entry {c!r} is not a valid ref")
        rbm = lineage.get("root_base_model", {})
        if rbm:
            for f in ("name", "version", "license", "declared_data_cutoff"):
                if f not in rbm:
                    errors.append(f"lineage.root_base_model.{f} missing")

    components = record.get("components", {})
    if components:
        for f in COMPONENT_KEYS:
            if f not in components:
                errors.append(f"components.{f} missing")
            elif not valid_ref(components[f], allow_unrecorded=is_legacy):
                errors.append(f"components.{f} = {components[f]!r} is not a valid ref")

    if "output_schema_ref" in record and not valid_ref(record["output_schema_ref"], allow_unrecorded=is_legacy):
        errors.append("output_schema_ref is not a valid ref")

    annotation_refs = record.get("annotation_refs", [])
    if "annotation_refs" in record and not annotation_refs:
        errors.append("annotation_refs must be non-empty (minItems 1)")
    for a in annotation_refs:
        if not valid_ref(a, allow_unrecorded=is_legacy):
            errors.append(f"annotation_refs entry {a!r} is not a valid ref")

    data = record.get("data", {})
    if data:
        for f in ("training_datasets", "corpus_manifests", "exclusion_ledger_state", "benchmark_preflight"):
            if f not in data:
                errors.append(f"data.{f} missing")
        tds = data.get("training_datasets", [])
        if "training_datasets" in data and not tds:
            errors.append("data.training_datasets must be non-empty (minItems 1)")
        for entry in tds:
            for f in ("stage", "dataset_ref", "role"):
                if f not in entry:
                    errors.append(f"data.training_datasets[] missing '{f}'")
            role = entry.get("role")
            if role is not None and role not in ("train", "validation", "calibration", "model_selection"):
                errors.append(f"data.training_datasets[].role {role!r} invalid")

    training = record.get("training", {})
    if training:
        for f in ("trainconfig_ref", "training_run_ids"):
            if f not in training:
                errors.append(f"training.{f} missing")
        if "training_run_ids" in training and not training["training_run_ids"]:
            errors.append("training.training_run_ids must be non-empty (minItems 1)")

    integrity = record.get("integrity", {})
    if "integrity" in record:
        sha = integrity.get("record_sha256", "")
        if not re.match(r"^[0-9a-f]{64}$", sha or ""):
            errors.append("integrity.record_sha256 is not a 64-char hex sha256")

    errors.extend(validate_known_limitations(record.get("known_limitations", []),
                                              evaluation_runs=record.get("_evaluation_runs")))
    errors.extend(validate_known_regressions(record.get("known_regressions", {})))
    errors.extend(validate_supported_context(record.get("supported_context", {})))

    return errors


# ================================================================== Section 2.6: the three most-faked fields

def validate_known_limitations(limitations: list[dict], *, evaluation_runs: list[dict] | None = None) -> list[str]:
    """Section 2.6 Rule 1: known limitations are derived before authored. If evaluation_runs is
    supplied (each a dict with 'insufficient_data_cells', 'not_active_tiers', 'blocked_tiers',
    'below_threshold_adversarial_groups'), every such item must appear among `limitations`, or
    the record is malformed -- an author cannot silently drop what the runs already show. This
    function does not fabricate limitations; it only checks that none were omitted."""
    errors: list[str] = []
    for i, item in enumerate(limitations):
        for f in ("id", "category", "statement", "evidence_refs"):
            if f not in item:
                errors.append(f"known_limitations[{i}] missing '{f}'")
        if item.get("evidence_refs") == []:
            errors.append(f"known_limitations[{i}].evidence_refs must be non-empty")
        cat = item.get("category")
        if cat is not None and cat not in (
            "context_ceiling", "insufficient_data_cell", "adversarial_group",
            "coverage_gap", "calibration_cell", "blocked_capability", "other",
        ):
            errors.append(f"known_limitations[{i}].category {cat!r} invalid")
    if evaluation_runs:
        statements = {(it.get("category"), it.get("statement")) for it in limitations}
        derived: set[tuple[str, str]] = set()
        for run in evaluation_runs:
            for cell in run.get("insufficient_data_cells", []):
                derived.add(("insufficient_data_cell", cell))
            for tier in run.get("not_active_tiers", []):
                derived.add(("context_ceiling", f"tier {tier} not active"))
            for tier in run.get("blocked_tiers", []):
                derived.add(("context_ceiling", f"tier {tier} blocked"))
            for grp in run.get("below_threshold_adversarial_groups", []):
                derived.add(("adversarial_group", grp))
        missing = derived - statements
        for cat, stmt in sorted(missing):
            errors.append(f"known_limitations omits a run-derived limitation: ({cat}, {stmt!r})")
    return errors


def validate_known_regressions(known_regressions: dict) -> list[str]:
    """Section 2.6 Rule 2: `items: []` is valid only when `regression_check_ref` points at a
    complete Phase 17 Section 4.2 ten-dimension table. An empty list with no reference is the
    exact omission the rule exists to catch."""
    errors: list[str] = []
    if not known_regressions:
        return ["known_regressions is missing"]
    if "regression_check_ref" not in known_regressions:
        errors.append("known_regressions.regression_check_ref missing")
    items = known_regressions.get("items")
    if items is None:
        errors.append("known_regressions.items missing")
    elif items == [] and not known_regressions.get("regression_check_ref"):
        errors.append("known_regressions.items is empty but no regression_check_ref is present "
                       "('no regressions' without the check that would have found them)")
    for i, it in enumerate(items or []):
        for f in ("dimension", "cell", "versus", "severity", "tolerance_granted", "evidence_refs"):
            if f not in it:
                errors.append(f"known_regressions.items[{i}] missing '{f}'")
        sev = it.get("severity")
        if sev is not None and sev not in ("Critical", "High", "Medium", "Low"):
            errors.append(f"known_regressions.items[{i}].severity {sev!r} invalid")
        if it.get("evidence_refs") == []:
            errors.append(f"known_regressions.items[{i}].evidence_refs must be non-empty")
    return errors


def validate_supported_context(supported_context: dict) -> list[str]:
    """Section 2.6 Rule 3: a tier is `active` only if `per_tier_evidence` resolves to a run that
    cleared the Phase 8 Section 11.2 / Phase 12 Section 7 advance rule. Absence of evidence means
    not_active, never assumed fine."""
    errors: list[str] = []
    if not supported_context:
        return ["supported_context is missing"]
    required = ("max_active_tier", "active_tiers", "not_active_tiers", "blocked_tiers",
                "per_tier_evidence", "ceiling_behavior")
    for f in required:
        if f not in supported_context:
            errors.append(f"supported_context.{f} missing")
    active = set(supported_context.get("active_tiers", []))
    evidence = supported_context.get("per_tier_evidence", {})
    for t in active:
        if str(t) not in evidence and t not in evidence:
            errors.append(f"supported_context: tier {t} is active but has no per_tier_evidence")
    not_active = set(supported_context.get("not_active_tiers", []))
    blocked = set(supported_context.get("blocked_tiers", []))
    overlap = active & not_active | active & blocked | not_active & blocked
    if overlap:
        errors.append(f"supported_context: tiers {sorted(overlap)} appear in more than one of "
                       f"active/not_active/blocked")
    max_tier = supported_context.get("max_active_tier")
    if max_tier is not None and active and max_tier != max(active):
        errors.append("supported_context.max_active_tier does not equal max(active_tiers)")
    if supported_context.get("ceiling_behavior") not in (None, "clamp_and_record"):
        errors.append("supported_context.ceiling_behavior must be 'clamp_and_record'")
    return errors


# ================================================================== Section 2.7: status lifecycle

STATUS_GRAPH: dict[str, set[str]] = {
    "registered": {"evaluated", "rejected", "withdrawn"},
    "evaluated": {"release_candidate", "rejected", "withdrawn"},
    "release_candidate": {"released", "rejected", "withdrawn"},
    "released": {"deprecated", "rolled_back", "withdrawn"},
    "deprecated": {"withdrawn"},
    "rolled_back": set(),
    "rejected": set(),
    "withdrawn": set(),
}
# Withdrawn is reachable from any non-terminal state (Section 2.7 diagram's vertical arrow).
# rejected/rolled_back/withdrawn are themselves terminal and stay with no outgoing edges.
for _s in list(STATUS_GRAPH):
    if _s not in ("rejected", "rolled_back", "withdrawn"):
        STATUS_GRAPH[_s] = STATUS_GRAPH[_s] | {"withdrawn"}

TRANSITIONS_NEEDING_DECISION_REF = {
    ("evaluated", "release_candidate"),
    ("release_candidate", "released"),
    ("registered", "rejected"),
    ("evaluated", "rejected"),
    ("release_candidate", "rejected"),
    ("released", "rolled_back"),
}


def validate_status_transition(frm: str, to: str, *, has_phase17_decision_ref: bool) -> list[str]:
    """Section 2.7 (R6): status moves only as events, never skip, and Phase 17 remains the
    authority for release_candidate/released/rejected/rolled_back -- the registry refuses a
    transition into one of those without the corresponding decision reference."""
    errors: list[str] = []
    if frm not in STATUS_GRAPH:
        errors.append(f"unknown source status {frm!r}")
        return errors
    if to not in STATUS_GRAPH[frm]:
        errors.append(f"illegal transition {frm!r} -> {to!r} (not adjacent in the status graph; "
                       f"skipping is prohibited)")
    if (frm, to) in TRANSITIONS_NEEDING_DECISION_REF and not has_phase17_decision_ref:
        errors.append(f"transition {frm!r} -> {to!r} requires a Phase 17 decision reference")
    return errors


# ================================================================== Section 3.2: dataset-layer additions

def annotation_version_histogram_valid(histogram: dict[str, int], *, is_frozen_benchmark: bool) -> list[str]:
    """Section 3.2 D-c (proposal). A Training set's `annotation_versions` is a histogram across
    guideline versions; a frozen benchmark dataset must contain exactly one."""
    errors: list[str] = []
    if not histogram:
        errors.append("annotation_versions histogram is empty")
        return errors
    if any(count < 0 for count in histogram.values()):
        errors.append("annotation_versions histogram has a negative count")
    if is_frozen_benchmark and len(histogram) != 1:
        errors.append(f"frozen benchmark dataset must contain exactly one guideline version, "
                       f"found {len(histogram)}")
    return errors


def regression_is_monotone(prev_ids: set[str], new_ids: set[str]) -> list[str]:
    """Section 3.2 D-c': Regression-dataset membership only grows. Pruning (other than sharding
    for run cost, which is out of scope for a membership check) is prohibited."""
    removed = prev_ids - new_ids
    if removed:
        return [f"regression dataset is not monotone: {len(removed)} item(s) removed "
                 f"(e.g. {sorted(removed)[:3]})"]
    return []


# ================================================================== Section 4.2: schema ripple

SCHEMA_RIPPLE: dict[str, dict[str, str]] = {
    "MAJOR": {
        "model": "MAJOR", "datasets": "MAJOR", "guidelines": "review_or_major",
        "evalsuite": "MAJOR", "benchmark_edition": "new_edition",
    },
    "MINOR_new_field": {
        "model": "MINOR", "datasets": "none_unless_populated", "guidelines": "review",
        "evalsuite": "minor_if_consumed", "benchmark_edition": "same_edition_additive",
    },
    "MINOR_new_enum": {
        "model": "minor_if_emittable", "datasets": "none_until_new_batches",
        "guidelines": "MINOR", "evalsuite": "MINOR", "benchmark_edition": "same_edition_insufficient_data",
    },
    "PATCH": {
        "model": "none", "datasets": "none", "guidelines": "none",
        "evalsuite": "none", "benchmark_edition": "none",
    },
}


def schema_ripple(change_kind: str) -> dict[str, str]:
    """Section 4.2: what a schema change does to every other line. `change_kind` is one of
    'MAJOR', 'MINOR_new_field', 'MINOR_new_enum', 'PATCH'."""
    if change_kind not in SCHEMA_RIPPLE:
        raise ValueError(f"schema_ripple: unknown change_kind {change_kind!r}")
    return dict(SCHEMA_RIPPLE[change_kind])


# ================================================================== Section 4.4: generation stamp

def validate_generation_stamp(stamp: dict, *, registered_model_refs: set[str],
                               model_max_active_tier: int | None = None) -> list[str]:
    """Section 4.4 Rules 13-15. `generator_type='model'` requires model_ref/assembly_ref/
    inference_run_id/both tier fields, and model_ref must resolve in the registry (Rule 13).
    A stamp is applied by the deterministic layer, never asserted by the model itself (Rule 14
    -- callers are expected to reject any model output that already contains a 'generation'
    object at H1, before it ever reaches this function). Rule 15: tier_effective <=
    tier_requested and <= the model's supported max tier."""
    errors: list[str] = []
    for f in ("generator_type", "stamped_at"):
        if f not in stamp:
            errors.append(f"generation.{f} missing")
    gt = stamp.get("generator_type")
    if gt is not None and gt not in ("model", "human_annotation", "rule_derived", "migrated"):
        errors.append(f"generation.generator_type {gt!r} invalid")
    if gt == "model":
        for f in ("model_ref", "assembly_ref", "inference_run_id",
                   "context_tier_requested", "context_tier_effective"):
            if f not in stamp:
                errors.append(f"generation.{f} required when generator_type='model' (Rule 13)")
        mref = stamp.get("model_ref")
        if mref is not None:
            if not valid_model_ref(mref):
                errors.append("generation.model_ref is not a well-formed modelRef")
            elif mref not in registered_model_refs:
                errors.append(f"generation.model_ref {mref!r} does not resolve in the registry (Rule 13)")
        requested = stamp.get("context_tier_requested")
        effective = stamp.get("context_tier_effective")
        if requested is not None and effective is not None and effective > requested:
            errors.append("generation.context_tier_effective > context_tier_requested (Rule 15)")
        if effective is not None and model_max_active_tier is not None and effective > model_max_active_tier:
            errors.append("generation.context_tier_effective exceeds the model's supported_context.max_active_tier (Rule 15)")
    if gt == "human_annotation" and "annotation_ref" not in stamp:
        errors.append("generation.annotation_ref expected when generator_type='human_annotation'")
    return errors


# ================================================================== Section 5.2/5.5: benchmark edition

EDITION_TRIGGERS: dict[str, bool] = {
    "guideline_major_changes_frozen_labels": True,
    "task_schema_major": True,
    "evalsuite_major": True,
    "exposure_saturation_renewal": True,
    "contamination_below_power_floor": True,
    "context_tier_activated": False,
    "new_adversarial_group": False,
    "additive_items_no_rescoring": False,
    "contamination_small_finding": False,
    "evalsuite_minor_or_patch": False,
}


def edition_bump_type(triggers: list[str]) -> str:
    """Section 5.5: which triggers force a new edition (MAJOR = a comparability boundary) versus
    stay within the current one (MINOR/PATCH handled by the caller's own dataset-versioning
    logic). Unknown triggers are a hard error rather than silently ignored."""
    unknown = [t for t in triggers if t not in EDITION_TRIGGERS]
    if unknown:
        raise ValueError(f"edition_bump_type: unknown trigger(s) {unknown}")
    if not triggers:
        raise ValueError("edition_bump_type: at least one trigger is required")
    return "MAJOR" if any(EDITION_TRIGGERS[t] for t in triggers) else "MINOR"


BENCHMARK_EDITION_REQUIRED = (
    "edition_ref", "built_at", "edition_build_seed", "exclusion_ledger_state", "pins",
    "partitions", "exposure_policy", "power_statement", "cells_insufficient_data",
    "contamination_build_report", "file_hashes",
)


def validate_benchmark_edition(edition: dict) -> list[str]:
    errors: list[str] = []
    for f in BENCHMARK_EDITION_REQUIRED:
        if f not in edition:
            errors.append(f"BenchmarkEdition.{f} missing")
    if "edition_ref" in edition and not valid_ref(edition["edition_ref"]):
        errors.append("edition_ref is not a well-formed ref")
    pins = edition.get("pins", {})
    for f in ("schema", "guidelines", "evalsuite", "datasets", "partitions"):
        if pins and f not in pins:
            errors.append(f"pins.{f} missing")
    return errors


# ================================================================== Section 5.4: exposure control

EXPOSURE_STATES = ("sealed", "scored_aggregate", "opened")
TIER_PARTITIONS = {
    "open": ("validation_dev", "hard_case_open", "adversarial_open", "regression"),
    "gate": ("test_gate", "hard_case_gate", "adversarial_gate", "context_siblings", "understanding_probes"),
    "sealed": ("vault", "private_authored"),
}


def partition_tier(partition: str) -> str | None:
    for tier, names in TIER_PARTITIONS.items():
        if partition in names:
            return tier
    return None


@dataclass
class ExposureLedger:
    """Section 5.4: per-item exposure state, append-only. `opened` items leave Gate scoring
    permanently, are never eligible for Training, and only become eligible for relocation to
    Regression (Phase 7 Section 2.7) at the next dataset release."""

    states: dict[str, str] = field(default_factory=dict)      # item_id -> state
    events: list[dict] = field(default_factory=list)          # append-only

    def open_item(self, item_id: str, *, reason: str, at: str) -> None:
        prev = self.states.get(item_id, "sealed")
        if prev == "opened":
            return  # idempotent: already burned
        self.states[item_id] = "opened"
        self.events.append({"item_id": item_id, "from": prev, "to": "opened", "reason": reason, "at": at})

    def score(self, item_id: str, *, at: str) -> None:
        prev = self.states.get(item_id, "sealed")
        if prev == "opened":
            raise ValueError(f"{item_id!r} is opened (burned); cannot be scored on a Gate run")
        self.states[item_id] = "scored_aggregate"
        self.events.append({"item_id": item_id, "from": prev, "to": "scored_aggregate", "at": at})

    def is_gate_eligible(self, item_id: str) -> bool:
        return self.states.get(item_id, "sealed") != "opened"

    def eligible_for_training(self, item_id: str) -> bool:
        """Section 5.4 rule 4 / Gap G6: a burned item is never eligible for Training, regardless
        of what it is later relocated to."""
        return False

    def burn_fraction(self, item_ids: list[str]) -> float:
        if not item_ids:
            return 0.0
        opened = sum(1 for i in item_ids if self.states.get(i, "sealed") == "opened")
        return opened / len(item_ids)


def gate_run_allowed_uses(candidate_id: str, partition: str, completed_runs: list[dict]) -> list[str]:
    """Section 5.4 Gate rule: one completed gated run per candidate per partition, unless a prior
    run was voided for a recorded harness fault (a void is itself an event, and does not count)."""
    errors: list[str] = []
    completed = [r for r in completed_runs
                 if r.get("candidate_id") == candidate_id and r.get("partition") == partition
                 and not r.get("voided")]
    if len(completed) > 1:
        errors.append(f"candidate {candidate_id!r} has {len(completed)} completed (non-voided) "
                       f"gated runs on partition {partition!r}; only one is permitted")
    return errors


# ================================================================== Section 5.7: evalsuite versioning

def evalsuite_bump_type(*, metric_definition_changed: bool = False,
                         reference_derivation_changed: bool = False,
                         scoring_or_significance_changed: bool = False,
                         reporting_axes_changed: bool = False,
                         new_metric_or_axis_additive: bool = False,
                         numbers_unchanged_fix: bool = False) -> str:
    if metric_definition_changed or reference_derivation_changed or scoring_or_significance_changed or reporting_axes_changed:
        return "MAJOR"
    if new_metric_or_axis_additive:
        return "MINOR"
    if numbers_unchanged_fix:
        return "PATCH"
    raise ValueError("evalsuite_bump_type: no recognized change was declared")


# ================================================================== Section 6.4: contamination (BC-tests)

def bc1_ledger_preflight(manifest_ids: set[str], ledger_ids: set[str]) -> list[str]:
    """BC1: training/calibration/synthetic-seed manifests intersect the Exclusion Ledger = fail.
    Runs pre-flight, before the first training step -- a manifest that intersects it cannot start."""
    overlap = manifest_ids & ledger_ids
    if overlap:
        return [f"BC1 fail: manifest intersects the Exclusion Ledger on {len(overlap)} item(s) "
                 f"(e.g. {sorted(overlap)[:3]}) -- training may not start"]
    return []


def bc2_content_scan(corpus_fingerprints: set[str], ledger_fingerprints: set[str]) -> list[str]:
    """BC2: exact hash / cleaned_view fingerprint / near-dup cluster match between a corpus and
    any frozen item. Simplified here to a fingerprint-set intersection; the spec's n-gram/MinHash
    and cross-lingual checks are out of scope without a real corpus to run them on."""
    overlap = corpus_fingerprints & ledger_fingerprints
    if overlap:
        return [f"BC2 fail: {len(overlap)} corpus fingerprint(s) match frozen benchmark items"]
    return []


def bc4_temporal_margin(item_created_at: str, item_last_edited_at: str, cutoff: str, *, margin_days: int) -> list[str]:
    """BC4/P2: every Gate/Sealed item's creation and last-edit date must post-date
    max(base_model cutoff, latest training-corpus cutoff) plus a margin. `margin_days` is
    required -- the spec leaves it an open, empirical item (Section 10.3)."""
    from datetime import datetime, timedelta
    errors = []
    threshold = datetime.fromisoformat(cutoff) + timedelta(days=margin_days)
    for label, value in (("created_at", item_created_at), ("last_edited_at", item_last_edited_at)):
        dt = datetime.fromisoformat(value)
        if dt <= threshold:
            errors.append(f"BC4 fail: item {label}={value} does not clear the temporal margin "
                           f"(cutoff {cutoff} + {margin_days}d = {threshold.isoformat()})")
    return errors


def bc8_exposure_audit(ledger: ExposureLedger, gate_or_sealed_runs: list[dict]) -> list[str]:
    """BC8: every Gate/Sealed run must have a corresponding exposure event, no Sealed partition
    may appear in an Open-run configuration, and every item a run reports as opened must actually
    be 'opened' on the ledger."""
    errors: list[str] = []
    for run in gate_or_sealed_runs:
        partition = run.get("partition")
        tier = partition_tier(partition) if partition else None
        if tier == "sealed" and run.get("used_in_open_config"):
            errors.append(f"BC8 fail: sealed partition {partition!r} appears in an Open-run configuration")
        for item_id in run.get("opened_items", []):
            if ledger.states.get(item_id) != "opened":
                errors.append(f"BC8 fail: run reports {item_id!r} opened but the ledger disagrees")
        if run.get("gated") and not run.get("has_exposure_event"):
            errors.append(f"BC8 fail: gated run on {partition!r} has no exposure event")
    return errors


def bc9_derivative_audit(training_dataset_source_ids: set[str], benchmark_item_ids: set[str],
                          eval_informed_guideline_revisions: list[dict]) -> list[str]:
    """BC9 / Gap G6: no benchmark-sourced FailureRecord, eval-informed guideline revision, or
    synthetic seed may trace into a Training dataset (Section 4.4's P8 disposition rule, made
    checkable). An eval-informed revision that also touches a benchmark item and is itself listed
    as informing new Training labels is exactly the derivative leak Phase 3 CP-5 forbids."""
    errors: list[str] = []
    leaked = training_dataset_source_ids & benchmark_item_ids
    if leaked:
        errors.append(f"BC9 fail: {len(leaked)} Training-dataset record(s) trace to a benchmark "
                       f"item id (e.g. {sorted(leaked)[:3]})")
    for rev in eval_informed_guideline_revisions:
        if rev.get("eval_informed") and rev.get("informed_training_labels"):
            errors.append(f"BC9 fail: guideline revision {rev.get('id')!r} is eval_informed and "
                           f"informed new Training labels")
    return errors


def disposition_for_benchmark_sourced_failure(target_dataset: str, source_benchmark: str | None) -> list[str]:
    """Section 6.4 P8: a FailureRecord sourced from Test/Gate/Vault may target Regression or
    'none', never Training."""
    if source_benchmark in ("Test", "test_gate", "hard_case_gate", "adversarial_gate",
                             "vault", "understanding_probes", "context_siblings"):
        if target_dataset not in ("Regression", "none", None):
            return [f"P8 violation: a failure sourced from benchmark partition {source_benchmark!r} "
                     f"may not target {target_dataset!r} (only Regression or none)"]
    return []


# ---- C3: taint propagation

def propagate_taint(tainted_model_refs: set[str], lineage: dict[str, dict], *,
                     cleared: set[str] | None = None) -> set[str]:
    """Section 6.4 C3: if a model was trained on frozen benchmark items, every descendant along
    `parent` and `checkpoint_chain` is tainted until cleared by its own BC1/BC2 re-run (R10).
    `lineage` maps model_ref -> {'parent': ref|None, 'checkpoint_chain': [ref, ...]}. `cleared`
    is the set of refs explicitly cleared with evidence and does not propagate taint further,
    but a ref both tainted-by-inheritance and cleared is still reported as tainted (a clearance
    must be evidenced per-ref, it cannot pre-clear an ancestor that later turns out tainted)."""
    cleared = cleared or set()
    children: dict[str, list[str]] = {}
    for ref, info in lineage.items():
        parent = info.get("parent")
        if parent:
            children.setdefault(parent, []).append(ref)
        for ckpt in info.get("checkpoint_chain", []):
            children.setdefault(ckpt, []).append(ref)

    tainted = set(tainted_model_refs)
    frontier = list(tainted_model_refs)
    while frontier:
        cur = frontier.pop()
        for child in children.get(cur, []):
            if child not in tainted:
                tainted.add(child)
                if child not in cleared:
                    frontier.append(child)
            # a cleared child is still marked tainted-by-inheritance (a clearance must be
            # evidenced per-ref), but propagation stops there rather than continuing further.
    return tainted


# ================================================================== Section 8: reproducibility

REPRO_LEVELS = ("R0", "R1", "R2", "R3")

REPRO_MANIFEST_REQUIRED = (
    "code_commit_hashes", "dependency_lockfile_hash", "environment_image_digest",
    "hardware_class", "precision_and_determinism_flags", "rng_seeds",
    "refs", "entrypoint", "nondeterminism_declaration",
)


def validate_repro_manifest(manifest: dict) -> list[str]:
    """Section 8.2: a run without a complete manifest is stored but cannot support any Phase 17
    decision. This validates completeness only; it does not itself gate a decision."""
    return [f"repro_manifest.{f} missing" for f in REPRO_MANIFEST_REQUIRED if f not in manifest]


def gate_run_requires_r0(decoding: str) -> list[str]:
    """Section 8.1/8.3: gate and sealed generation must use deterministic decoding (R0)."""
    if decoding not in ("deterministic",):
        return [f"gate/sealed generation must be deterministic (R0); got decoding={decoding!r}"]
    return []


def can_support_decision(run_kind: str, purpose: str) -> bool:
    """Section 7.4: `run_kind` decides what a run may be used for. Only 'gate' runs support a
    Phase 17 acceptance criterion; only 'sealed' supports a release sign-off; 'dev' never
    supports either; 'bridge'/'equivalence' support comparability/PATCH claims; 'legacy'
    supports nothing but history."""
    allowed = {
        "acceptance_criterion": {"gate"},
        "release_signoff": {"sealed"},
        "comparability": {"bridge", "equivalence"},
        "patch_claim": {"equivalence"},
        "history": {"legacy", "dev", "gate", "sealed", "bridge", "equivalence"},
    }
    return run_kind in allowed.get(purpose, set())


def preregistration_ordering_valid(registered_at: str, first_gate_or_sealed_run_started_at: str) -> list[str]:
    """Section 7.5: pre-registration must precede the candidate's first Gate/Sealed run."""
    if registered_at >= first_gate_or_sealed_run_started_at:
        return ["preregistration.registered_at does not precede the first gate/sealed run's "
                "started_at; this run cannot support acceptance"]
    return []


# ================================================================== Section 9: ReleaseRecord

RELEASE_RECORD_REQUIRED_TOP = (
    "release_id", "release_kind", "released_at", "model_ref", "candidate_id", "baseline_ref",
    "identity", "benchmark", "regression_table", "acceptance_checklist", "hard_ceilings",
    "contamination", "reproducibility", "known_limitations", "known_regressions",
    "supported_context", "rollback", "signoff", "release_notes", "integrity",
)
RELEASE_IDENTITY_REQUIRED = (
    "output_schema_ref", "behavior_contract_ref", "assembly_ref", "annotation_refs",
    "dataset_release_refs", "trainconfig_ref", "evalsuite_ref",
)
RELEASE_GATE_RUNS_REQUIRED = (
    "current", "previous", "regression", "adversarial", "hard_case",
    "context_tier", "engineering_understanding",
)
ROLLBACK_DEFERRABLE_FIELD = "redeploy_bound"


def release_record_completeness_violations(record: dict) -> list[str]:
    """Section 9 Rule 1: a ReleaseRecord is complete iff every field is present and resolvable,
    except `rollback.redeploy_bound`, which alone may be `DEFERRED(...)`. Any other gap is
    malformed and the registry refuses `released` for it (R7)."""
    errors: list[str] = []
    for f in RELEASE_RECORD_REQUIRED_TOP:
        if f not in record:
            errors.append(f"ReleaseRecord.{f} missing")

    identity = record.get("identity", {})
    for f in RELEASE_IDENTITY_REQUIRED:
        if identity and f not in identity:
            errors.append(f"identity.{f} missing")

    benchmark = record.get("benchmark", {})
    if benchmark:
        for f in ("edition_ref", "gate_runs", "sealed_run", "exposure_snapshot"):
            if f not in benchmark:
                errors.append(f"benchmark.{f} missing")
        gate_runs = benchmark.get("gate_runs", {})
        for f in RELEASE_GATE_RUNS_REQUIRED:
            if gate_runs and f not in gate_runs:
                errors.append(f"benchmark.gate_runs.{f} missing")

    rollback = record.get("rollback", {})
    if rollback:
        for f in ("target_ref", "weights_retrievable_verified_at", "redeploy_bound", "triggering_event"):
            if f not in rollback:
                errors.append(f"rollback.{f} missing")
        rb_val = rollback.get(ROLLBACK_DEFERRABLE_FIELD)
        if rb_val is not None and not (isinstance(rb_val, str) and rb_val.startswith("DEFERRED(")):
            pass  # a resolved value is fine once the Phase 17 open item is closed
    else:
        errors.append("rollback missing")

    # every other None/empty top-level required sub-object is a gap, deferred field excepted
    for f in ("regression_table", "acceptance_checklist", "hard_ceilings", "contamination",
              "reproducibility", "known_limitations", "known_regressions", "supported_context",
              "signoff", "integrity"):
        if f in record and record[f] in (None, {}, []):
            errors.append(f"{f} is present but empty")

    contamination = record.get("contamination", {})
    if contamination.get("open_findings"):
        errors.append("contamination.open_findings is non-empty; release blocked (Rule 3)")
    bc_results = contamination.get("bc_results", {})
    for test, result in bc_results.items():
        if result == "fail":
            errors.append(f"contamination.bc_results.{test} = fail; release blocked (Rule 3)")

    return errors


def rollback_release_record(prior: dict, *, restored_model_ref: str, triggering_event_ref: str,
                             released_at: str, release_id: str) -> dict:
    """Section 9 Rule 4: reverting produces a NEW ReleaseRecord with release_kind='rollback'; the
    prior record is never edited (I5). This helper builds the new record's identifying fields
    from the record being restored; the caller fills in the rest via release_record fields."""
    new_record = dict(prior)
    new_record["release_id"] = release_id
    new_record["release_kind"] = "rollback"
    new_record["released_at"] = released_at
    new_record["model_ref"] = restored_model_ref
    new_record["supersedes"] = prior.get("model_ref")
    rollback = dict(prior.get("rollback", {}))
    rollback["triggering_event"] = triggering_event_ref
    new_record["rollback"] = rollback
    return new_record
