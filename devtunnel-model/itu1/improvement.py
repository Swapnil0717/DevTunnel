"""
ITU-1 -- Phase 17: Iterative Improvement

Closes the loop Phase 16 Section 5 left open: a diagnosed failure is routed
to an owning phase as a corrective action, but nothing before this phase
governed how that phase's *change* gets tested before it's trusted, how
"improved" is distinguished from "moved," or who is authorized to call a
checkpoint released. This module is that governance layer.

Does NOT:
  - perform any corrective action itself (collect data, re-annotate, change
    architecture, retrain) -- the change remains owned by whichever phase
    Phase 16 Section 5 named
  - redefine any Phase 14 metric or Phase 15 test -- both are consumed as
    fixed instruments, not re-derived
  - redefine Phase 16's error taxonomy or root-cause methodology -- Section
    2 here is the *other side* of Phase 16 Section 5's routing table
  - own deployment/serving mechanics -- Section 6 defines what a rollback
    must preserve and who confirms it, not a serving architecture

No third-party dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

# ---------------------------------------------------------------------------
# Section 2 -- Change classification
# ---------------------------------------------------------------------------

CHANGE_TYPES = (
    "More training data", "Better annotations", "Better data balance",
    "Better context", "Better retrieval", "Architecture changes",
    "Training-objective changes", "Output-schema changes",
    "Better uncertainty handling",
)

# Change types whose true blast radius is uncertain at proposal time and
# must therefore default to broad (Section 2's default-to-broad rule).
BROAD_BY_DEFAULT = frozenset({
    "Architecture changes", "Training-objective changes",
    "Output-schema changes",
})

CHANGE_TYPE_TABLE = {
    "More training data": {
        "root_cause_families": ("Data problem",),
        "owning_phase": "Phase 4, 7, 10-13",
        "blast_radius_hint": "narrow",  # broad if the addition shifts overall distribution
        "dimensions_at_risk": ("<targeted>", "Task Type", "Technical understanding"),
    },
    "Better annotations": {
        "root_cause_families": ("Annotation problem",),
        "owning_phase": "Phase 6, 7",
        "blast_radius_hint": "narrow",
        "dimensions_at_risk": ("<targeted>",),  # Role/Experience/Complexity/Task Type, whichever re-adjudicated
    },
    "Better data balance": {
        "root_cause_families": ("Data problem",),
        "owning_phase": "Phase 7",
        "blast_radius_hint": "broad",
        "dimensions_at_risk": ("Role", "Experience", "Complexity", "Task Type", "Uncertainty"),
    },
    "Better context": {
        "root_cause_families": ("Context problem",),
        "owning_phase": "Phase 12",
        "blast_radius_hint": "moderate",
        "dimensions_at_risk": ("Context understanding", "Role", "Task Type"),
    },
    "Better retrieval": {
        "root_cause_families": ("Context problem",),
        "owning_phase": "Phase 12",
        "blast_radius_hint": "moderate",
        "dimensions_at_risk": ("Context understanding", "Grounding"),
    },
    "Architecture changes": {
        "root_cause_families": ("Architecture problem",),
        "owning_phase": "Phase 8",
        "blast_radius_hint": "broad",
        "dimensions_at_risk": "ALL",
    },
    "Training-objective changes": {
        "root_cause_families": ("Training problem",),
        "owning_phase": "Phase 10-13",
        "blast_radius_hint": "broad",
        "dimensions_at_risk": "ALL",
    },
    "Output-schema changes": {
        "root_cause_families": ("Architecture problem", "Annotation problem"),
        "owning_phase": "Phase 2, 8",
        "blast_radius_hint": "broad",
        "dimensions_at_risk": "ALL",  # L0 directly, everything else indirectly
    },
    "Better uncertainty handling": {
        "root_cause_families": ("Training problem", "Context problem"),
        "owning_phase": "Phase 11, 12",
        "blast_radius_hint": "moderate",
        "dimensions_at_risk": ("Uncertainty", "Hallucination", "Grounding"),
    },
}


def classify_change(change_type: str) -> dict:
    if change_type not in CHANGE_TYPE_TABLE:
        raise ValueError(f"unknown change type: {change_type!r}")
    return CHANGE_TYPE_TABLE[change_type]


def default_blast_radius(change_type: str) -> str:
    """Section 2's default-to-broad rule: #6/#7/#8 are always broad at
    proposal time regardless of how targeted the fix looks."""
    if change_type not in CHANGE_TYPE_TABLE:
        raise ValueError(f"unknown change type: {change_type!r}")
    if change_type in BROAD_BY_DEFAULT:
        return "broad"
    return CHANGE_TYPE_TABLE[change_type]["blast_radius_hint"]


def narrow_blast_radius_allowed(change_type: str, *, clean_regression_check: bool) -> bool:
    """A broad-by-default change type can only be narrowed for *future*
    iterations of the same change type, and only after evidence (a clean
    regression check) supports it -- never assumed at proposal time."""
    return change_type in BROAD_BY_DEFAULT and clean_regression_check


def separate_candidates_for_cluster(change_types: Iterable[str]) -> list[str]:
    """Section 2's multiple-change-types rule: a systematic-cluster
    reassignment implicating more than one change type must be tested as
    separate candidates, so the regression check (Section 4) can attribute
    a new regression to the correct change -- bundling would reproduce the
    exact attribution problem Phase 16 Section 3 exists to avoid."""
    out: list[str] = []
    for ct in change_types:
        if ct not in CHANGE_TYPE_TABLE:
            raise ValueError(f"unknown change type: {ct!r}")
        if ct not in out:
            out.append(ct)
    return out


# ---------------------------------------------------------------------------
# Section 1 -- Improvement lifecycle (strict state machine)
# ---------------------------------------------------------------------------

LIFECYCLE_STATES = (
    "proposed", "scoped", "executed", "regression_checked",
    "accepted", "rejected", "released", "monitored", "rolled_back",
)

# No state may be skipped, and no candidate may re-enter a later state after
# failing an earlier one without restarting (as a new candidate) from
# "proposed" -- so "rejected" and "rolled_back" are terminal for this
# candidate_id.
ALLOWED_TRANSITIONS: dict[str, frozenset] = {
    "proposed": frozenset({"scoped"}),
    "scoped": frozenset({"executed"}),
    "executed": frozenset({"regression_checked"}),
    "regression_checked": frozenset({"accepted", "rejected"}),
    "accepted": frozenset({"released"}),
    "released": frozenset({"monitored"}),
    "monitored": frozenset({"rolled_back"}),
    "rejected": frozenset(),
    "rolled_back": frozenset(),
}


def validate_transition(from_state: str, to_state: str) -> list[str]:
    if from_state not in ALLOWED_TRANSITIONS:
        return [f"unknown state: {from_state!r}"]
    if to_state not in LIFECYCLE_STATES:
        return [f"unknown state: {to_state!r}"]
    if to_state not in ALLOWED_TRANSITIONS[from_state]:
        return [f"illegal transition {from_state!r} -> {to_state!r}: "
                f"no state may be skipped or re-entered"]
    return []


def validate_history(history: list[dict]) -> list[str]:
    """Section 7's append-only transition log is what makes Section 1's
    lifecycle rule a process, not a policy: a record that only stores
    current state cannot later prove a rejected candidate wasn't quietly
    re-accepted without a fresh regression check."""
    violations: list[str] = []
    prev_to = "proposed"
    for i, h in enumerate(history):
        from_state, to_state = h.get("from_state"), h.get("to_state")
        if from_state != prev_to:
            violations.append(
                f"history[{i}]: from_state {from_state!r} does not follow "
                f"previous to_state {prev_to!r} -- a gap is itself a process defect"
            )
        violations.extend(f"history[{i}]: {v}" for v in validate_transition(from_state, to_state))
        prev_to = to_state
    return violations


def current_state(history: list[dict]) -> str:
    return history[-1]["to_state"] if history else "proposed"


def rejected_candidate_to_failure_input(candidate_id: str, regression_findings: list[dict]) -> dict:
    """A rejected candidate is not discarded: its full EvaluationRun and
    regression-check results become new diagnostic input to Phase 16 --
    a rejected candidate that regressed Grounding while fixing Role
    classification is itself a diagnosable failure. Closes the loop the
    master prompt's diagram implies but does not spell out."""
    return {
        "source_candidate_id": candidate_id,
        "note": "rejected candidate regression findings routed to Phase 16 "
                "as new diagnostic input, not just a retry queue",
        "regression_findings": list(regression_findings),
    }


# ---------------------------------------------------------------------------
# Section 3 -- Experiment methodology
# ---------------------------------------------------------------------------

REQUIRED_BENCHMARKS = ("current", "previous", "regression", "adversarial", "hard_case")


def select_baseline_checkpoint(previous_accepted_checkpoint: str | None,
                                most_recent_accepted_candidate: str | None) -> str:
    """3.1: compare against the previous accepted checkpoint (the current
    release), or the most recent accepted candidate if nothing has been
    released yet. Never an unaccepted intermediate -- that would let
    successive small regressions accumulate invisibly."""
    if previous_accepted_checkpoint:
        return previous_accepted_checkpoint
    if most_recent_accepted_candidate:
        return most_recent_accepted_candidate
    raise ValueError("no accepted checkpoint or candidate exists to serve as a baseline")


def benchmark_coverage_violations(benchmark_runs: dict) -> list[str]:
    """3.2: all five required, not a favorable subset. An incomplete set is
    excluded from the acceptance decision, not defaulted to pass -- the same
    treatment Phase 14 gives a malformed L0 record."""
    return [f"benchmark '{name}' not run -- candidate not eligible for "
            f"Section 5 acceptance"
            for name in REQUIRED_BENCHMARKS if not benchmark_runs.get(name)]


def eligible_for_acceptance(benchmark_runs: dict) -> bool:
    return not benchmark_coverage_violations(benchmark_runs)


def validate_target_metric(target_metric: dict) -> list[str]:
    """3.3 pre-registration: the target cell(s) and threshold are fixed
    before the experiment runs, preventing after-the-fact cube-scanning for
    whichever cell happened to move."""
    required = ("field", "reporting_axis_cell", "pre_registered_threshold")
    return [f"target_metric missing required key: {k!r}"
            for k in required if target_metric.get(k) is None]


def cell_conclusiveness(sample_size: int, *, insufficient_data_threshold: int) -> str:
    """A cell below Phase 14's [INSUFFICIENT DATA] threshold cannot be used
    to claim either an improvement or a non-regression."""
    return "inconclusive" if sample_size < insufficient_data_threshold else "conclusive"


def classify_dimension_raw_result(*, delta: float, p_value: float | None, alpha: float,
                                   direction_is_improvement_when_positive: bool,
                                   sample_size: int, insufficient_data_threshold: int) -> str:
    """Pre-registered significance test, not a point-estimate comparison.
    Returns one of 'inconclusive', 'improved', 'unchanged', 'regressed' --
    the raw call, before Section 4.1's tolerance is applied."""
    if sample_size < insufficient_data_threshold:
        return "inconclusive"
    if p_value is None or p_value >= alpha:
        return "unchanged"
    moved_in_improving_direction = (delta > 0) == direction_is_improvement_when_positive
    return "improved" if moved_in_improving_direction else "regressed"


# ---------------------------------------------------------------------------
# Section 4 -- Regression methodology
# ---------------------------------------------------------------------------

REGRESSION_DIMENSIONS = (
    "Role", "Experience", "Complexity", "Task Type", "Task generation",
    "Technical understanding", "Grounding", "Hallucination", "Uncertainty",
    "Context understanding",
)

DIMENSION_RESULTS = ("improved", "unchanged", "regressed_within_tolerance", "regressed_fail")

# Hallucination carries Phase 14 Section 11's hard-ceiling status; it is
# never eligible for the Section 4.1 tolerance. (L0 structural validity is
# tracked as a separate Section 5 criterion, not a Section 4 dimension, and
# is equally non-negotiable.)
NON_TOLERABLE_DIMENSIONS = frozenset({"Hallucination"})

_TOLERABLE_SEVERITIES = ("Low",)


def apply_tolerance(dimension: str, raw_result: str, *, severity: str | None,
                     is_targeted: bool) -> str:
    """Section 4.1's net-acceptability rule applied to one dimension: a
    Low-severity dip in one *non-targeted* dimension may be tolerated; any
    Medium-or-above regression is an automatic fail, no netting permitted.
    Hallucination is never eligible."""
    if raw_result != "regressed":
        return raw_result
    if dimension in NON_TOLERABLE_DIMENSIONS:
        return "regressed_fail"
    if is_targeted:
        # The targeted dimension is expected to improve, not regress and be
        # excused by its own gain -- the tolerance is for *other* dimensions.
        return "regressed_fail"
    if severity in _TOLERABLE_SEVERITIES:
        return "regressed_within_tolerance"
    return "regressed_fail"


def regression_table_completeness_violations(dimensions: list[dict]) -> list[str]:
    """4.2's explicit anti-cherry-picking check: the full ten-dimension
    table is required, including dimensions where nothing changed. A record
    reporting only the targeted metric is an incomplete regression check,
    not an implicit pass on the missing nine."""
    names = {d.get("dimension") for d in dimensions}
    missing = set(REGRESSION_DIMENSIONS) - names
    violations = [f"regression table missing dimension: {m}" for m in sorted(missing)]
    if len(dimensions) < len(REGRESSION_DIMENSIONS):
        violations.append(
            f"regression_check.dimensions has {len(dimensions)} entries, "
            f"requires all {len(REGRESSION_DIMENSIONS)}"
        )
    return violations


def net_acceptability(dimensions: list[dict]) -> list[str]:
    """4.1: all ten dimensions must be improved, unchanged, or -- for at
    most one non-targeted dimension -- regressed within a severity-weighted
    tolerance. Any regressed_fail, or more than one tolerated dimension,
    fails the candidate outright."""
    violations = regression_table_completeness_violations(dimensions)
    fails = [d["dimension"] for d in dimensions if d.get("result") == "regressed_fail"]
    if fails:
        violations.append(f"regressed_fail in dimension(s): {fails}")
    tolerated = [d["dimension"] for d in dimensions if d.get("result") == "regressed_within_tolerance"]
    if len(tolerated) > 1:
        violations.append(
            f"more than one dimension in the tolerance band: {tolerated} "
            f"(at most one permitted)"
        )
    for d in dimensions:
        if d.get("dimension") in NON_TOLERABLE_DIMENSIONS and d.get("result") == "regressed_within_tolerance":
            violations.append(
                f"{d['dimension']} is never eligible for the tolerance "
                f"(hard, matches Phase 14 Section 11)"
            )
    return violations


def regression_methodology_passes(dimensions: list[dict]) -> bool:
    return not net_acceptability(dimensions)


# ---------------------------------------------------------------------------
# Section 5 -- Acceptance criteria
# ---------------------------------------------------------------------------

ACCEPTANCE_CRITERIA = (
    "complete_benchmark_coverage",
    "l0_structural_validity_100",
    "no_hard_ceiling_violation",
    "regression_methodology_passes",
    "target_metric_significant_improvement",
    "adversarial_and_hard_case_holds",
    "human_review_agreement_not_dropped",
)


def acceptance_checklist(*, benchmark_runs: dict, l0_structural_validity: float,
                          hallucination_ceiling_violations: list,
                          regression_reappearances: int, dimensions: list[dict],
                          target_metric_significant: bool, adversarial_tests_pass: bool,
                          hard_confusable_pair_collapse: bool,
                          human_agreement_not_worse: bool) -> dict:
    """Section 5 criteria 1-7, in order, as the required boolean checklist.
    A candidate is accepted only if every entry is True, jointly -- criterion
    4's 'unchanged is acceptable' clause means the bar is not universal
    improvement, just no unaccounted-for regression beyond Section 4.1."""
    checklist = [
        not benchmark_coverage_violations(benchmark_runs),
        l0_structural_validity == 1.0,
        (not hallucination_ceiling_violations) and regression_reappearances == 0,
        regression_methodology_passes(dimensions),
        bool(target_metric_significant),
        bool(adversarial_tests_pass) and not hard_confusable_pair_collapse,
        bool(human_agreement_not_worse),
    ]
    decision = "accepted" if all(checklist) else "rejected"
    return {"decision": decision, "checklist": checklist, "criteria": ACCEPTANCE_CRITERIA}


def release_verdict(*, acceptance_decision: str, signed_off_by: str | None,
                     owning_phase: str, rollback_plan_exists: bool) -> dict:
    """Acceptance and release are two separate gates (Decision #8):
    criteria 8-9 -- independent sign-off and a rollback plan -- move an
    accepted candidate from release candidate to released."""
    violations = []
    if acceptance_decision != "accepted":
        violations.append("cannot release a candidate that is not accepted")
    if not signed_off_by:
        violations.append("sign-off is required before release (criterion 8)")
    elif signed_off_by == owning_phase:
        violations.append(
            "sign-off reviewer must be independent of the change's owning "
            "phase -- mirrors Phase 6's adjudication-independence principle"
        )
    if not rollback_plan_exists:
        violations.append("rollback plan must exist before release (criterion 9, Section 6)")
    return {"released": not violations, "violations": violations}


# ---------------------------------------------------------------------------
# Section 6 -- Rollback criteria
# ---------------------------------------------------------------------------

ROLLBACK_TRIGGERS = {
    "regression_reappearance": {
        "action": "immediate_rollback",
        "note": "matches Phase 14 Section 11's hard-blocker treatment of "
                "Regression, extended to post-release monitoring",
    },
    "hallucination_ceiling_exceeded_live": {
        "action": "immediate_rollback",
        "note": "dimension 8's hard-ceiling status does not relax after release",
    },
    "dimension_regression_beyond_tolerance_in_production": {
        "action": "rollback_and_set_threshold",
        "note": "closes the prior [INSUFFICIENT DATA] gap before any future "
                "candidate is evaluated against the newly-measurable cell",
    },
    "sign_off_based_on_incorrect_data": {
        "action": "rollback_and_route_evaluation_defect_to_phase16",
        "note": "the reporting/tooling bug is routed as a Data-quality-class "
                "failure of the evaluation pipeline, not the model",
    },
}


def rollback_required(trigger: str) -> bool:
    return trigger in ROLLBACK_TRIGGERS


def rollback_decision(trigger: str, *, confirmed_by_independent_reviewer: bool,
                       owning_phase: str, reviewer: str | None) -> dict:
    """Rollback authority is symmetric to Section 5 criterion 8: it can be
    initiated by any monitoring signal but is confirmed by a reviewer
    independent of the change's owning phase."""
    violations = []
    if trigger not in ROLLBACK_TRIGGERS:
        violations.append(f"unknown rollback trigger: {trigger!r}")
    if not confirmed_by_independent_reviewer or not reviewer:
        violations.append("rollback must be confirmed by an independent reviewer")
    elif reviewer == owning_phase:
        violations.append("rollback confirmer must be independent of owning_phase")
    return {
        "rolled_back": not violations,
        "violations": violations,
        "action": ROLLBACK_TRIGGERS.get(trigger, {}).get("action"),
    }


def rollback_to_failure_record(trigger: str, candidate_id: str, details: str) -> dict:
    """Section 6's rollback procedure: the triggering failure(s) become new
    FailureRecords (Phase 16 Section 2) and, once fixed and independently
    re-verified, permanent Regression-dataset cases (Phase 7) -- so the
    exact failure that caused this rollback is guaranteed to be checked on
    every subsequent candidate, permanently."""
    if trigger not in ROLLBACK_TRIGGERS:
        raise ValueError(f"unknown rollback trigger: {trigger!r}")
    return {
        "error_type": "Data quality" if trigger == "sign_off_based_on_incorrect_data"
                       else "Model misunderstanding",
        "source": "post_release_rollback",
        "trigger": trigger,
        "candidate_id": candidate_id,
        "details": details,
        "requires_regression_dataset_promotion_after_fix": True,
    }


# ---------------------------------------------------------------------------
# Section 7 -- Experiment tracking
# ---------------------------------------------------------------------------


@dataclass
class ImprovementCandidate:
    candidate_id: str
    created_at: str
    originating_failures: list[str]
    change_type: str
    owning_phase: str
    blast_radius: str
    baseline_checkpoint: str
    target_metric: dict
    state: str = "proposed"
    candidate_checkpoint: str | None = None
    benchmark_runs: dict = field(default_factory=lambda: {k: None for k in REQUIRED_BENCHMARKS})
    regression_check: dict = field(default_factory=lambda: {"dimensions": []})
    acceptance: dict = field(default_factory=lambda: {
        "decision": "pending", "checklist": [], "signed_off_by": None, "rollback_ref": None,
    })
    history: list = field(default_factory=list)


def validate_improvement_candidate(c: ImprovementCandidate) -> list[str]:
    violations: list[str] = []
    if not c.originating_failures:
        violations.append(
            "originating_failures must reference at least one FailureRecord "
            "(Phase 16 Section 2) -- an ImprovementCandidate is never proposed "
            "without a diagnosed origin"
        )
    if c.change_type not in CHANGE_TYPE_TABLE:
        violations.append(f"unknown change_type: {c.change_type!r}")
    if c.blast_radius not in ("narrow", "moderate", "broad"):
        violations.append(f"invalid blast_radius: {c.blast_radius!r}")
    violations.extend(f"target_metric: {v}" for v in validate_target_metric(c.target_metric))
    violations.extend(validate_history(c.history))
    computed = current_state(c.history)
    if c.state != computed:
        violations.append(
            f"state {c.state!r} does not match the state computed from "
            f"history ({computed!r})"
        )
    if c.acceptance.get("decision") == "rolled_back" and not c.acceptance.get("rollback_ref"):
        violations.append("acceptance.rollback_ref is required when decision is 'rolled_back'")
    return violations


def malformed_candidate_report_violations(c: ImprovementCandidate) -> list[str]:
    """A record with only the targeted metric and no full regression table,
    or a decision with no checklist backing it, is malformed -- the same
    'no bare aggregate' discipline Phase 14/16 apply to their reports."""
    violations: list[str] = []
    if c.state in ("regression_checked", "accepted", "rejected", "released", "monitored", "rolled_back"):
        violations.extend(regression_table_completeness_violations(
            c.regression_check.get("dimensions", [])
        ))
    if c.state in ("accepted", "rejected") and not c.acceptance.get("checklist"):
        violations.append(f"acceptance.decision={c.acceptance.get('decision')!r} "
                           f"recorded with no supporting checklist")
    return violations
