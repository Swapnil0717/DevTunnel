"""
ITU-1 -- Step 10: Software engineering domain training (Phase 10)

Like Phase 9, this phase is representation-quality only -- no Phase 8 heads, no Phase 2/6/7
labels, no calibration (Section 0, Decision #7). It is explicitly an *additive continuation* of
Phase 9's pipeline (Decision #1): same tokenizer, same checkpoint-identity/retention/rollback
discipline, same contamination boundary -- just widened. So this module is deliberately thin: it
reuses pretrain.py's stage-gating, corpus-filtering and failure-dispatch machinery with Phase 10's
own stage names and an extra corpus exclusion, rather than re-implementing any of it.

New in this phase, not covered by pretrain.py:

    domain_corpus_inclusion_check(source, repo_split, allowed_licenses)  (Section 2.4)
        -- Phase 9's corpus_inclusion_check, widened: a Training-repo issue-resolving PR is
           excluded alongside issue text, per Section 2.1's "process and review-discussion text
           only, never the specific PR that resolves a specific issue" boundary.
    domain_contamination_reaudit(sources, repo_split)                    (Section 5.6)
    concept_coverage_gate(covered_categories)                            (Stage A gate, Section 4)
    relation_probe_gate(in_distribution, held_out_phrasing, baseline)    (Section 5.2, Section 7 row 1)
    next_expected_stage / validate_stage_advance / validate_checkpoint_identity
        -- pretrain.py's versions, called with PHASE10 STAGE_ORDER.
    select_deliverable_checkpoint(history)                               (Section 4's Stage-D exception)
    classify_failure(mode)                                               (Section 7, PHASE10_FAILURE_MODES)
"""

from __future__ import annotations

from dataclasses import dataclass

import pretrain
from pretrain import CorpusDecision, CorpusSource, FailureResponse, StageRecord  # re-exported for callers

# ================================================================== Section 4: curriculum

STAGE_ORDER = (
    "stageA_concept_coverage",
    "stageB_relational_specialization",
    "stageC_repository_integration",
    "stageD_task_shaped_narrowing",
)

_LAST_STAGE = STAGE_ORDER[-1]

# ================================================================== Section 2.1: new concept categories
# Only the categories Phase 9 §4.1 did not already cover (Section 2.1's own framing).

NEW_CONCEPT_CATEGORIES = frozenset({
    "frontend_backend_fullstack_boundary",
    "authorization",
    "networking_distributed_systems",
    "devops",
    "dependency_management",
    "repository_structures",
    "git",
    "pull_requests",
    "code_changes",
})

# ================================================================== Section 2.4: contamination boundary
# Widens Phase 9's exclusion: a Training-repo's issue-resolving PR text is excluded alongside
# issue text itself. Process/review-discussion PR text (content_type "pr_process") is unaffected.

EXCLUDED_TRAINING_REPO_CONTENT_TYPES: frozenset = frozenset({"issue_text", "pr_resolving"})


def domain_corpus_inclusion_check(source: CorpusSource, repo_split: dict[str, str],
                                   allowed_licenses: set[str]) -> CorpusDecision:
    """Section 2.4: same rule as Phase 9 §4.3 (repos not in Training are excluded outright), plus
    the widened Training-repo exclusion (issue text AND issue-resolving PR text; process/review
    discussion about PRs in general is fine)."""
    return pretrain.corpus_inclusion_check(
        source, repo_split, allowed_licenses,
        excluded_training_repo_content_types=EXCLUDED_TRAINING_REPO_CONTENT_TYPES,
    )


def domain_filter_corpus(sources: list[CorpusSource], repo_split: dict[str, str],
                          allowed_licenses: set[str]) -> tuple[list[CorpusDecision], list[CorpusDecision]]:
    return pretrain.filter_corpus(
        sources, repo_split, allowed_licenses,
        excluded_training_repo_content_types=EXCLUDED_TRAINING_REPO_CONTENT_TYPES,
    )


def domain_contamination_reaudit(sources: list[CorpusSource], repo_split: dict[str, str]) -> list[str]:
    """Section 5.6: Phase 9 §7.4's re-audit, re-run at every Phase 10 stage boundary, using the
    Section 2.4 widened exclusion set."""
    return pretrain.contamination_reaudit(
        sources, repo_split, excluded_training_repo_content_types=EXCLUDED_TRAINING_REPO_CONTENT_TYPES,
    )


# ================================================================== Stage gating (thin wrappers)

def next_expected_stage(history: list[StageRecord]) -> str | None:
    return pretrain.next_expected_stage(history, stage_order=STAGE_ORDER)


def validate_stage_advance(history: list[StageRecord], proposed_stage: str, gate_passed: bool) -> list[str]:
    return pretrain.validate_stage_advance(history, proposed_stage, gate_passed, stage_order=STAGE_ORDER)


def validate_checkpoint_identity(record: dict) -> list[str]:
    return pretrain.validate_checkpoint_identity(record, stage_order=STAGE_ORDER)


# ================================================================== Section 4, Stage A gate

def concept_coverage_gate(covered_categories: set[str],
                           required: frozenset = NEW_CONCEPT_CATEGORIES) -> list[str]:
    """Stage A's gate: 'domain probes show measurable coverage on the previously-uncovered
    categories.' This function does not run a probe -- it takes the set of categories the
    caller's own probe suite (Section 5.1) has already confirmed adequate coverage for, and
    reports which of Section 2.1's required categories are still missing. Empty list = gate
    clears on coverage grounds (general-capability non-regression is a separate check, Section 5.6)."""
    missing = sorted(required - set(covered_categories))
    return [f"no measured coverage for category: {c}" for c in missing]


# ================================================================== Section 5.2 / 7: relation probes

def relation_probe_gate(in_distribution_score: float, held_out_phrasing_score: float,
                         phase9_baseline_score: float, *,
                         min_improvement_over_baseline: float = 0.0,
                         max_phrasing_gap: float = 0.15) -> list[str]:
    """Stage B's gate (Section 4) plus Section 7's first failure mode (relational objective
    overfitting to templated/synthetic phrasing rather than generalizing).

    All three scores are on the caller's own probe scale (e.g. AUC-style separation, higher is
    better); this function does not compute them, only applies the two decision rules Section
    5.2/Section 7 describe:

      1. In-distribution relation-probe score must exceed the Phase 9 baseline (which had no
         explicit relational signal) by more than ``min_improvement_over_baseline`` -- otherwise
         the relational objective added no measurable separation.
      2. The held-out relation-phrasing split must not trail the in-distribution score by more
         than ``max_phrasing_gap`` -- a larger gap is exactly Section 7's phrasing-overfit signal.

    Both thresholds are left as caller-supplied defaults, not asserted by the spec (Phase 9/10
    "Open items": probe thresholds are empirical)."""
    violations = []
    improvement = in_distribution_score - phase9_baseline_score
    if improvement <= min_improvement_over_baseline:
        violations.append(
            f"in-distribution relation score ({in_distribution_score}) does not exceed the Phase 9 "
            f"baseline ({phase9_baseline_score}) by the required margin ({min_improvement_over_baseline})"
        )
    gap = in_distribution_score - held_out_phrasing_score
    if gap > max_phrasing_gap:
        violations.append(
            f"held-out relation-phrasing score ({held_out_phrasing_score}) trails in-distribution "
            f"({in_distribution_score}) by {gap:.3f}, exceeding max_phrasing_gap ({max_phrasing_gap}) "
            "-- signal of overfitting to relation phrasing rather than the underlying concept"
        )
    return violations


# ================================================================== Section 4: Stage D deliverable exception

@dataclass
class DeliverableDecision:
    checkpoint_id: str | None
    stage: str | None
    stage_d_deferred: bool


def select_deliverable_checkpoint(history: list[StageRecord]) -> DeliverableDecision:
    """Section 4: 'Stage D is the only stage whose promoted checkpoint is not automatically
    treated as strictly superior to its predecessor for all purposes: if Section 5.6's
    regression check fails at Stage D but the Stage C checkpoint is clean, Stage C is retained
    as the phase's deliverable and Stage D is deferred rather than forced through.'

    The deliverable is the last checkpoint anywhere in ``history`` that passed its own gate --
    this already falls back to Stage C automatically if Stage D was attempted and failed (the
    same 'last gated checkpoint' rule pretrain.rollback_target uses), so this function's own job
    is mainly to make that outcome legible: it names the stage and flags explicitly whether
    Stage D was attempted-and-deferred, as distinct from never having been attempted at all."""
    last_passed: StageRecord | None = None
    for r in history:
        if r.gate_passed:
            last_passed = r
    stage_d_deferred = any(r.stage == _LAST_STAGE and not r.gate_passed for r in history)
    if last_passed is None:
        return DeliverableDecision(None, None, stage_d_deferred=stage_d_deferred)
    return DeliverableDecision(last_passed.checkpoint_id, last_passed.stage, stage_d_deferred=stage_d_deferred)


# ================================================================== Section 7: failure modes

PHASE10_FAILURE_MODES: dict[str, tuple[bool, str]] = {
    "relation_phrasing_overfit": (
        False,
        "reduce reliance on templated relation text; diversify the naturally-occurring relational "
        "sub-corpus rather than synthesizing more examples",
    ),
    "repo_convention_skew": (
        False,
        "diversify source repositories across ecosystems; if not feasible in this pass, document the "
        "skew as a known, bounded limitation",
    ),
    "stage_d_regression": (
        False,
        "roll back to the Stage C checkpoint; treat Stage C as the phase deliverable and defer Stage D "
        "rather than forcing promotion",
    ),
    "corpus_split_drift": (
        True,
        "hard blocker: affected corpus shard removed, stage re-run from the last clean checkpoint",
    ),
    "license_violation_new_category": (
        True,
        "hard blocker: source removed from manifest; any checkpoint trained on it is not promoted",
    ),
    "tokenizer_offset_drift_new_corpus": (
        True,
        "hard blocker: no further Phase 10 compute spent until resolved",
    ),
    "domain_fluency_without_grounding": (
        False,
        "named as a known, undetectable-at-this-phase limitation: fluent domain discussion does not "
        "imply grounded correctness; grounding remains untested until task-specific training",
    ),
}


def classify_failure(mode: str, *, traced_to_start: bool = False) -> FailureResponse:
    """Section 7 dispatch, using Phase 10's own failure table."""
    return pretrain.classify_failure(mode, traced_to_start=traced_to_start, table=PHASE10_FAILURE_MODES)
