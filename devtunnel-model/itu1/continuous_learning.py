"""
ITU-1 -- Phase 20: Continuous Learning and Improvement

Phase 20's own scope note: it designs how real-world feedback becomes
better model versions without losing existing capabilities. It does not
design deployment infrastructure, and -- per its own Assumptions -- it
invents no baselines: Section 12's decision record ships PROPOSED, with
approvals, owners, and measured thresholds left for the caller to fill in
from real evidence. As with every phase since Phase 9, nothing here is a
trained system; this module implements the parts of the design that are
checkable rules, reusing what already exists rather than re-deriving it:

    schema.py / derived.py     -- Phases 1-2, the record and its rules
    example.py                 -- Phase 3, context-tier and leakage checks
    dataset.py                 -- Phase 7, partitions, leakage L1-L7, caps
    evaluation.py              -- Phase 14, classification/calibration/ECE
    error_analysis.py          -- Phase 16, root-cause families
    improvement.py             -- Phase 17, the candidate lifecycle pattern
    versioning.py              -- Phase 18, semver bump table
    production_readiness.py    -- Phase 19, the release gate this phase
                                   never weakens

    FeedbackRecord / validate_feedback_record(fb)        -- Section 2.2
    classify_feedback(signals)                            -- Section 3.1/3.2
    destination_for_verdict(verdict)                      -- Section 3.1
    g1_violations(fb, ...)                                -- Section 3.3
    triage_sample_rate(tier, passes_g1, enters_training)  -- Section 3.4
    reliability_promotion_eligible(...)                   -- Section 3.5
    missing_example_types(counts)                         -- Section 4.2
    gold_seed_violation(accuracy)                         -- Section 4.3
    annotation_contamination_violation(...)               -- Section 4.4
    trained_on(partition)                                 -- Section 5.2
    overfitting_cap_violations(increment)                 -- Section 5.1.5
    partition_straddle_violation(...)                     -- Section 5.1.2
    trigger_fired(name, metrics)                          -- Section 6.1
    change_axis_version_impact(axis)                      -- Section 6.2
    training_mix_violations(mix)                          -- Section 6.3
    prohibition_violated(action)                          -- Section 6.4
    candidate_acceptance(...)                             -- Section 6.5
    regression_gate_violations(results)                   -- Section 7.2
    forgetting_metric_violation(...)                      -- Section 7.3
    overfitting_slice_violation(...)                      -- Section 7.4
    drift_alert(signal, value, persists=None)             -- Section 8.2
    alert_response(severity)                              -- Section 8.4
    quarantine_required(signals)                          -- Section 9.2/9.3
    bad_label_reaudit_violation(error_rate)               -- Section 9.4
    recovery_required(...)                                -- Section 9.5
    bundle_completeness_violations(bundle)                -- Section 10.1
    required_eval_suites(level)                           -- Section 10.2
    validate_lifecycle_history(states)                    -- Section 10.3
    rollback_trigger_fired(signals)                       -- Section 10.4
    weights_change_justified(kind, condition_met)         -- Section 11.1
    health_metric_violations(metrics)                     -- Section 11.4
    Phase20DecisionRecord / decision_record_violations(r) -- Section 12
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

# ---------------------------------------------------------------------------
# Section 2.2 -- Feedback record
# ---------------------------------------------------------------------------

FEEDBACK_REQUIRED_FIELDS = [
    "feedback_id", "received_at", "task_id", "source_issue",
    "model_version", "prompt_version", "schema_version", "context_version",
    "target", "submitter_id", "submitter_role", "trust_tier", "channel",
]

# A feedback item must give a corrected value, or say the model was right,
# or say Unknown was the right call -- exactly one of these three.
VALUE_KEYS = ("proposed_value", "model_was_correct", "unknown_is_correct")

TARGET_PREFIXES = ("task.", "provenance.", "review.")

CHANNELS = {
    "explicit correction", "accept/reject", "reviewer edit", "implicit outcome",
}


@dataclass
class FeedbackRecord:
    feedback_id: str
    received_at: str
    task_id: str
    source_issue: dict  # {repo, issue_number, snapshot_fetched_at}
    model_version: str
    prompt_version: str
    schema_version: str
    context_version: str
    target: str
    submitter_id: str
    submitter_role: str
    trust_tier: str
    channel: str
    original_value: Any = None
    proposed_value: Any = None
    model_was_correct: bool | None = None
    unknown_is_correct: bool | None = None
    evidence_locator: str | None = None
    free_text_rationale: str | None = None


def validate_feedback_record(fb: dict) -> list[str]:
    """Section 2.2 minimum-fields + target-path + value-slot checks (G0)."""
    violations = []
    for f in FEEDBACK_REQUIRED_FIELDS:
        if fb.get(f) in (None, ""):
            violations.append(f"missing required field: {f}")

    target = fb.get("target")
    if isinstance(target, str) and not target.startswith(TARGET_PREFIXES):
        violations.append(
            f"target must be dotted path under task./provenance./review., got: {target!r}"
        )

    filled = [k for k in VALUE_KEYS if fb.get(k) not in (None, False)]
    # model_was_correct=False / unknown_is_correct=False are meaningful "no"
    # answers, not fills; only a truthy proposed_value or an explicit True
    # counts as the record's answer.
    filled = [
        k for k in VALUE_KEYS
        if (k == "proposed_value" and fb.get(k) is not None)
        or (k != "proposed_value" and fb.get(k) is True)
    ]
    if len(filled) != 1:
        violations.append(
            "exactly one of proposed_value / model_was_correct / "
            f"unknown_is_correct must be set, found {len(filled)}"
        )

    channel = fb.get("channel")
    if channel is not None and channel not in CHANNELS:
        violations.append(f"unknown channel: {channel!r}")

    si = fb.get("source_issue")
    if isinstance(si, dict):
        for k in ("repo", "issue_number", "snapshot_fetched_at"):
            if not si.get(k):
                violations.append(f"source_issue missing {k}")

    return violations


def g0_gate(fb: dict) -> bool:
    """Section 2.1 stage 1: complete record, else rejected as unusable."""
    return not validate_feedback_record(fb)


# ---------------------------------------------------------------------------
# Section 3.1/3.2 -- Feedback classification
# ---------------------------------------------------------------------------

VERDICTS = {
    "useful_correction", "noisy_feedback", "subjective_preference",
    "incorrect_correction", "duplicate", "suspected_manipulation",
}

VERDICT_DESTINATION = {
    "useful_correction": "annotation_to_dataset_candidate",
    "noisy_feedback": "analytics_only",
    "subjective_preference": "configuration_or_style_layer",
    "incorrect_correction": "rejected_negative",
    "duplicate": "merged_into_existing_cluster",
    "suspected_manipulation": "quarantine",
}


def destination_for_verdict(verdict: str) -> str:
    if verdict not in VERDICTS:
        raise ValueError(f"unknown verdict: {verdict!r}")
    return VERDICT_DESTINATION[verdict]


def classify_feedback(signals: dict) -> str:
    """Section 3.2's five-step decision procedure, as a pure function.

    Expected keys (any may be omitted/None meaning "not yet known" -- an
    unknown answer for a required branch raises, since the procedure has
    no fallback for that):
        manipulation: bool
        duplicate: bool
        tied_to_field: bool
        objectively_checkable: bool
        evidence_supports: bool | None   (only consulted if checkable)
        convention_dependent: bool | None (only consulted if not checkable)
        ambiguous: bool                  (genuinely disputed, gold=Unknown)
    """
    if signals.get("manipulation"):
        return "suspected_manipulation"
    if signals.get("duplicate"):
        return "duplicate"
    if not signals.get("tied_to_field"):
        return "noisy_feedback"
    checkable = signals.get("objectively_checkable")
    if checkable is None:
        raise ValueError("objectively_checkable must be determined")
    if checkable:
        supports = signals.get("evidence_supports")
        if supports is None:
            raise ValueError("evidence_supports must be determined for a checkable item")
        return "useful_correction" if supports else "incorrect_correction"
    convention = signals.get("convention_dependent")
    if convention:
        return "subjective_preference"
    if signals.get("ambiguous"):
        return "noisy_feedback"  # hard-case candidate; still not a direct label
    return "noisy_feedback"


# ---------------------------------------------------------------------------
# Section 3.3 -- Automated checks (G1)
# ---------------------------------------------------------------------------

def g1_violations(
    fb: dict,
    *,
    snapshot_text: str = "",
    context_text: str = "",
    proposed_record: dict | None = None,
    unsupported_entities: Iterable[str] = (),
    submitter_prior_corrections: Iterable[dict] = (),
) -> list[str]:
    """Section 3.3's six automated checks. Each check only fires if the
    caller supplied enough to evaluate it -- this function never guesses.
    """
    violations = []

    locator = fb.get("evidence_locator")
    if locator and locator not in snapshot_text and locator not in context_text:
        violations.append("evidence_locator span not found in snapshot or context (check 1)")

    if proposed_record is not None:
        import derived
        rule_violations = derived.validate_all(proposed_record)
        if rule_violations:
            violations.append(f"proposed record fails schema/invariants (check 2): {rule_violations}")

    for ent in unsupported_entities:
        violations.append(f"proposal introduces unsupported entity (check 3): {ent}")

    proposed_value = fb.get("proposed_value")
    original_value = fb.get("original_value")
    if original_value == "Unknown" and proposed_value not in (None, "Unknown") and not locator:
        violations.append("Unknown converted to a value with no evidence (check 4)")

    target = fb.get("target")
    for prior in submitter_prior_corrections:
        if prior.get("target") == target and prior.get("task_id") == fb.get("task_id"):
            if prior.get("proposed_value") not in (None, proposed_value):
                violations.append("contradicts submitter's own earlier correction on this item (check 5)")

    return violations


# ---------------------------------------------------------------------------
# Section 3.4 -- Human triage sampling (G2)
# ---------------------------------------------------------------------------

TRIAGE_SAMPLE_RATES = {
    # (trust_tier_group, enters_training) -> default rate
    ("trusted_or_mid", True): 1.0,
    ("trusted", False): 0.10,       # trusted-tier, analytics-only
    ("low_or_unverified", True): 1.0,
    ("low_or_unverified", False): 1.0,
    ("confirmation", True): 0.20,          # "model was right"
    ("confirmation_overriding_prior", True): 1.0,
}


def triage_sample_rate(
    *, tier_group: str, enters_training: bool, passes_g1: bool = True,
    is_confirmation: bool = False, overrides_prior_accepted: bool = False,
) -> float:
    """Section 3.4 default sample rates. Anything failing G1 is quarantined
    or rejected outright and gets the fixed 10% false-rejection audit."""
    if not passes_g1:
        return 0.10
    if is_confirmation:
        key = "confirmation_overriding_prior" if overrides_prior_accepted else "confirmation"
        return TRIAGE_SAMPLE_RATES[(key, True)]
    key = (tier_group, enters_training)
    if key not in TRIAGE_SAMPLE_RATES:
        raise ValueError(f"unknown triage combination: {key}")
    return TRIAGE_SAMPLE_RATES[key]


# ---------------------------------------------------------------------------
# Section 3.5 -- Source trust
# ---------------------------------------------------------------------------

TRUST_TIERS = {
    "A": "trained reviewers -- corrections enter annotation without extra corroboration",
    "B": "verified maintainers/contributors above a reliability threshold -- corrections need evidence",
    "C": "authenticated users, limited history -- corrections need evidence and independent confirmation",
    "D": "anonymous or new -- analytics and monitoring only until confirmed by a higher tier",
}

MIN_ADJUDICATED_FOR_PROMOTION = 20  # default


def reliability_promotion_eligible(adjudicated_item_count: int) -> bool:
    """Section 3.5: reliability, and therefore any tier promotion, requires
    at least this many adjudicated items for that submitter/field type."""
    return adjudicated_item_count >= MIN_ADJUDICATED_FOR_PROMOTION


def new_account_tier() -> str:
    return "D"


# ---------------------------------------------------------------------------
# Section 4 -- Annotation workflow
# ---------------------------------------------------------------------------

EXAMPLE_TYPES = {
    "correction_pair", "confirmation", "abstention_example",
    "hard_negative", "context_variant", "adversarial",
}

GOLD_SEED_ACCURACY_THRESHOLD = 0.90  # default


def missing_example_types(counts: dict) -> list[str]:
    """Section 4.2: 'all required, not just corrections'. Any type with
    zero examples in a batch that has examples at all is a gap."""
    if not counts or sum(counts.values()) == 0:
        return []
    return sorted(t for t in EXAMPLE_TYPES if counts.get(t, 0) == 0)


def gold_seed_violation(accuracy: float) -> bool:
    """Section 4.3: below-threshold seed accuracy means the annotator must
    be paused and recalibrated."""
    return accuracy < GOLD_SEED_ACCURACY_THRESHOLD


def blind_labeling_violation(annotator_saw_model_output: bool, annotator_saw_proposed_correction: bool) -> bool:
    """Section 4.1 step 2: blind independent labeling, to avoid anchoring."""
    return annotator_saw_model_output or annotator_saw_proposed_correction


def annotator_independence_violation(benchmark_annotator: str, training_near_dup_annotator: str) -> bool:
    """Section 4.3: a benchmark item's annotator may not also label its
    near-duplicates for training."""
    return benchmark_annotator == training_near_dup_annotator


def annotation_contamination_violation(annotator_sees_sealed_content: bool) -> bool:
    """Section 4.4: annotators never see benchmark/sealed content for the
    same repository thread."""
    return annotator_sees_sealed_content


def guideline_relabel_required(guideline_changed: bool) -> bool:
    """Section 4.3: a guideline change triggers relabeling a stratified
    sample -- existing training data is never silently relabeled."""
    return guideline_changed


# ---------------------------------------------------------------------------
# Section 5 -- Dataset update process
# ---------------------------------------------------------------------------

PARTITIONS = {
    "train": True,
    "dev": False,
    "current_benchmark": False,       # sealed, never
    "regression": False,
    "adversarial": False,             # sealed half never; see trained_on note
    "hard_cases": False,
    "historical_failures": False,
    "phase19_release_suite": False,   # sealed, never
}

NEVER_TRAINED_PARTITIONS = {"current_benchmark", "phase19_release_suite"}

OVERFITTING_CAPS = {
    "repository_share": 0.05,
    "submitter_share": 0.02,
    "near_dup_cluster_share": 0.005,
}


def trained_on(partition: str) -> bool:
    if partition not in PARTITIONS:
        raise ValueError(f"unknown partition: {partition!r}")
    return PARTITIONS[partition]


def partition_straddle_violation(repo: str, issue_thread_id: str, existing_assignment: dict) -> bool:
    """Section 5.1 step 2: assignment is by repository/issue thread, once,
    permanently -- a related item cannot straddle train and eval."""
    key = (repo, issue_thread_id)
    return key in existing_assignment and existing_assignment[key] is None


def overfitting_cap_violations(increment: dict) -> list[str]:
    """increment: {'repository_shares': {...}, 'submitter_shares': {...},
    'cluster_shares': {...}} each mapping id -> fraction of the increment."""
    violations = []
    for repo, share in increment.get("repository_shares", {}).items():
        if share > OVERFITTING_CAPS["repository_share"]:
            violations.append(f"repository {repo} exceeds 5% cap: {share:.3f}")
    for sub, share in increment.get("submitter_shares", {}).items():
        if share > OVERFITTING_CAPS["submitter_share"]:
            violations.append(f"submitter {sub} exceeds 2% cap: {share:.3f}")
    for cluster, share in increment.get("cluster_shares", {}).items():
        if share > OVERFITTING_CAPS["near_dup_cluster_share"]:
            violations.append(f"near-dup cluster {cluster} exceeds 0.5% cap: {share:.3f}")
    return violations


def eval_contamination_match(example_signature: str, eval_signatures: Iterable[str]) -> bool:
    """Section 5.1 step 4: any match against an evaluation partition means
    the example is eval-only or excluded, never trained on."""
    return example_signature in set(eval_signatures)


# ---------------------------------------------------------------------------
# Section 6 -- Retraining policy
# ---------------------------------------------------------------------------

RETRAIN_TRIGGERS = {
    "volume": {"min_examples": 500, "min_repos": 20},
    "failure_cluster": {"min_examples": 20, "min_s1_examples": 5},
    "s0_in_production": {"min_occurrences": 1},
    "drift_alert": {"min_windows_persisted": 2},
    "capability_gap": {},   # registry entry promoted + benchmark slice fails
    "schema_change": {},
    "scheduled": {"max_per_year": 4},  # "at most quarterly"
}


def trigger_fired(name: str, metrics: dict) -> bool:
    if name not in RETRAIN_TRIGGERS:
        raise ValueError(f"unknown trigger: {name!r}")
    cfg = RETRAIN_TRIGGERS[name]
    if name == "volume":
        return metrics.get("new_examples", 0) >= cfg["min_examples"] and \
            metrics.get("new_repos", 0) >= cfg["min_repos"]
    if name == "failure_cluster":
        return metrics.get("cluster_examples", 0) >= cfg["min_examples"] or \
            metrics.get("s1_examples", 0) >= cfg["min_s1_examples"]
    if name == "s0_in_production":
        return metrics.get("s0_occurrences", 0) >= cfg["min_occurrences"]
    if name == "drift_alert":
        return bool(metrics.get("breach")) and metrics.get("windows_persisted", 0) >= cfg["min_windows_persisted"]
    if name == "capability_gap":
        return bool(metrics.get("registry_entry_promoted")) and bool(metrics.get("benchmark_slice_fails"))
    if name == "schema_change":
        return bool(metrics.get("schema_bumped"))
    if name == "scheduled":
        return bool(metrics.get("material_improvement_expected"))
    return False


CHANGE_AXIS_VERSION_IMPACT = {
    "configuration": None,
    "prompt_decoding_postprocessing": "PATCH",
    "finetune_or_adapter": "MINOR",
    "full_retrain": "MAJOR_OR_MINOR",  # MINOR only if empirically equivalent
    "schema_change": "SCHEMA_BUMP",
}


def change_axis_version_impact(axis: str) -> str | None:
    if axis not in CHANGE_AXIS_VERSION_IMPACT:
        raise ValueError(f"unknown change axis: {axis!r}")
    return CHANGE_AXIS_VERSION_IMPACT[axis]


TRAINING_MIX_MINIMUMS = {
    "new_validated_max": 0.40,
    "replay_min": 0.40,
    "historical_failure_variants_min": 0.10,
    "confirmations_abstentions_hard_negatives_min": 0.25,
    "abstentions_min": 0.10,
    "corrections_of_new_max": 0.50,
}


def training_mix_violations(mix: dict) -> list[str]:
    """mix keys: new_validated, replay, historical_failure_variants,
    confirmations_abstentions_hard_negatives, abstentions,
    corrections_share_of_new (fraction of the *new* component, not the whole mix)."""
    violations = []
    if mix.get("new_validated", 0) > TRAINING_MIX_MINIMUMS["new_validated_max"]:
        violations.append("new validated examples exceed 40% of mix")
    if mix.get("replay", 0) < TRAINING_MIX_MINIMUMS["replay_min"]:
        violations.append("replay of prior training data below 40% of mix")
    if mix.get("historical_failure_variants", 0) < TRAINING_MIX_MINIMUMS["historical_failure_variants_min"]:
        violations.append("historical-failure variants below 10% of mix")
    if mix.get("confirmations_abstentions_hard_negatives", 0) < TRAINING_MIX_MINIMUMS["confirmations_abstentions_hard_negatives_min"]:
        violations.append("confirmations+abstentions+hard-negatives below 25% combined")
    if mix.get("abstentions", 0) < TRAINING_MIX_MINIMUMS["abstentions_min"]:
        violations.append("abstentions below 10% of mix")
    if mix.get("corrections_share_of_new", 0) > TRAINING_MIX_MINIMUMS["corrections_of_new_max"]:
        violations.append("corrections exceed 50% of the new-examples component")
    return violations


PROHIBITIONS = [
    "online_or_per_feedback_weight_update",
    "train_on_benchmark_release_suite_or_sealed_adversarial",
    "train_on_regression_or_historical_originals",
    "train_on_unadjudicated_or_quarantined_feedback",
    "self_training_without_independent_adjudication",
    "automatic_deployment",
    "per_repo_or_per_user_finetune_of_shared_weights",
]


def prohibition_violated(action: str) -> bool:
    """Section 6.4: any of these named actions is categorically disallowed,
    regardless of who requests it or why."""
    return action in PROHIBITIONS


def candidate_acceptance(
    *, relative_error_reduction: float | None, absolute_improvement_ci_supported: bool,
    all_gates_passed: bool, relative_threshold: float = 0.30,
) -> bool:
    """Section 6.5: proceed only if it measurably fixes the targeted cluster
    AND passes every §7 gate. Retraining is never a goal in itself."""
    fixed_something = (
        (relative_error_reduction is not None and relative_error_reduction >= relative_threshold)
        or absolute_improvement_ci_supported
    )
    return fixed_something and all_gates_passed


# ---------------------------------------------------------------------------
# Section 7 -- Regression protection
# ---------------------------------------------------------------------------

REGRESSION_EVAL_SUITES = [
    "current_benchmark", "regression_dataset", "adversarial_dataset",
    "hard_cases", "historical_failures", "targeted_cluster_set",
    "phase19_release_suite",
]

REGRESSION_GATE_DEFAULTS = {
    "new_s0_max": 0,
    "new_s1_on_previously_passing_max": 0,
    "capability_ci_lower_bound_min": -1.0,
    "capability_absolute_drop_max": 2.0,
    "slice_drop_max": 3.0,
    "fixed_stays_fixed_min_rate": 0.98,
    "calibration_ece_worse_by_max": 0.02,
}


def regression_gate_violations(results: dict) -> list[str]:
    """results carries the measured values for each §7.2 gate; a gate whose
    value is absent is not asserted (this function never invents a result)."""
    v = []
    d = REGRESSION_GATE_DEFAULTS
    if "new_s0" in results and results["new_s0"] > d["new_s0_max"]:
        v.append("new S0 failure introduced")
    if "new_s1_on_previously_passing" in results and results["new_s1_on_previously_passing"] > d["new_s1_on_previously_passing_max"]:
        v.append("new S1 on a previously-passing case")
    for cap, ci_lower in results.get("capability_ci_lower_bounds", {}).items():
        if ci_lower < d["capability_ci_lower_bound_min"]:
            v.append(f"capability {cap} CI lower bound below -1 point")
    for cap, drop in results.get("capability_absolute_drops", {}).items():
        if drop > d["capability_absolute_drop_max"]:
            v.append(f"capability {cap} absolute drop exceeds 2 points")
    for sl, drop in results.get("slice_drops", {}).items():
        if drop > d["slice_drop_max"]:
            v.append(f"slice {sl} drop exceeds 3 points")
    if "fixed_stays_fixed_rate" in results and results["fixed_stays_fixed_rate"] < d["fixed_stays_fixed_min_rate"]:
        v.append("fewer than 98% of regression cases marked fixed still pass")
    if results.get("fixed_s0_s1_all_pass") is False:
        v.append("a previously fixed S0/S1 regression case no longer passes")
    if results.get("historical_regression"):
        v.append("a previously fixed historical failure regressed")
    if "ece_delta" in results and results["ece_delta"] > d["calibration_ece_worse_by_max"]:
        v.append("ECE worse than current model by more than 0.02")
    if results.get("abstention_rate_dropped"):
        v.append("correct-abstention rate on no-evidence/T3-T4 cases fell")
    if results.get("hallucination_count_increased"):
        v.append("fabrication count rose above the current model")
    return v


def forgetting_metric_violation(rate: float, *, is_s0_s1: bool = False, limit: float = 0.01) -> bool:
    """Section 7.3: proportion of previously-passing cases the candidate now
    fails. Default limit 1% overall, 0 for S0/S1 cases."""
    if is_s0_s1:
        return rate > 0
    return rate > limit


def overfitting_slice_violation(seen_repo_delta: float, unseen_repo_delta: float) -> bool:
    """Section 7.4: seen-repo performance rising while unseen-repo
    performance stagnates or drops is repository overfitting."""
    return seen_repo_delta > 0 and unseen_repo_delta <= 0


# ---------------------------------------------------------------------------
# Section 8 -- Model-drift monitoring
# ---------------------------------------------------------------------------

DRIFT_ALERT_DEFAULTS = {
    "input_psi_threshold": 0.2,
    "output_sigma_threshold": 2.0,
    "unknown_rate_point_change": 5.0,
    "performance_capability_drop": 2.0,
    "calibration_ece_delta": 0.03,
}


def drift_alert(signal_type: str, value: float, *, persists_two_windows: bool | None = None) -> bool:
    d = DRIFT_ALERT_DEFAULTS
    if signal_type == "input_psi":
        return value > d["input_psi_threshold"] and bool(persists_two_windows)
    if signal_type == "output_sigma":
        return abs(value) > d["output_sigma_threshold"]
    if signal_type == "unknown_rate_change_points":
        return abs(value) > d["unknown_rate_point_change"]
    if signal_type == "performance_capability_drop":
        return value > d["performance_capability_drop"]
    if signal_type == "calibration_ece_delta":
        return value > d["calibration_ece_delta"]
    if signal_type == "any_s0":
        return bool(value)
    raise ValueError(f"unknown drift signal type: {signal_type!r}")


ALERT_RESPONSES = {
    "s0_in_production": "immediate_rollback_and_incident_review",
    "calibration_or_accuracy_drift": "investigate_within_defined_window_restrict_scope",
    "input_drift": "check_test_coverage_add_slices_consider_retrain",
    "feedback_drift": "poisoning_review_before_use",
}


def alert_response(alert_type: str) -> str:
    if alert_type not in ALERT_RESPONSES:
        raise ValueError(f"unknown alert type: {alert_type!r}")
    return ALERT_RESPONSES[alert_type]


# ---------------------------------------------------------------------------
# Section 9 -- Feedback-poisoning protection
# ---------------------------------------------------------------------------

POISONING_THREATS = [
    "label_flipping", "unsupported_inflation_pushing", "fabrication_injection",
    "backdoor_trigger_insertion", "prompt_injection_via_feedback_text",
    "sybil_bot_flood", "repository_capture", "insider_annotator_collusion",
    "benchmark_poisoning",
]

BAD_LABEL_REAUDIT_ERROR_THRESHOLD = 0.03  # default, per slice
RECOVERY_MISLABEL_THRESHOLD = 0.005       # default, per slice


def quarantine_required(signals: dict) -> bool:
    """Section 9.2/9.3: any of manipulation, a statistical-anomaly cluster,
    or a failed honeypot triggers quarantine of the item (or the cluster)."""
    return bool(
        signals.get("manipulation_detected")
        or signals.get("statistical_anomaly_cluster")
        or signals.get("honeypot_failed")
    )


def bad_label_reaudit_violation(error_rate: float, threshold: float = BAD_LABEL_REAUDIT_ERROR_THRESHOLD) -> bool:
    """Section 9.4: exceeding this in a re-audited slice freezes and
    relabels that slice."""
    return error_rate > threshold


def recovery_required(
    *, malicious_confirmed: bool = False, mislabeled_fraction: float = 0.0,
    threshold: float = RECOVERY_MISLABEL_THRESHOLD,
) -> bool:
    """Section 9.5: any confirmed malicious record, or exceeding the
    mislabel threshold in a slice, triggers retrain-from-clean or rollback."""
    return malicious_confirmed or mislabeled_fraction > threshold


# ---------------------------------------------------------------------------
# Section 10 -- Versioning workflow
# ---------------------------------------------------------------------------

ARTIFACT_BUNDLE_FIELDS = [
    "model_weights_or_adapter_id", "base_model_id", "prompt_version",
    "schema_version", "decoding_settings", "postprocessing_validator_version",
    "aggregation_weights", "dataset_manifest", "guideline_version",
    "evaluation_suite_versions", "configuration_layer_version",
]


def bundle_completeness_violations(bundle: dict) -> list[str]:
    return [f"missing bundle field: {f}" for f in ARTIFACT_BUNDLE_FIELDS if not bundle.get(f)]


REQUIRED_EVAL_SUITES_BY_LEVEL = {
    "MAJOR": ["full_phase19_suite", "new_baseline"],
    "MINOR": ["all_section7_gates", "full_phase19_suite"],
    "PATCH": ["all_section7_gates", "benchmark", "regression", "adversarial", "historical"],
}


def required_eval_suites(level: str) -> list[str]:
    if level not in REQUIRED_EVAL_SUITES_BY_LEVEL:
        raise ValueError(f"unknown version level: {level!r}")
    return REQUIRED_EVAL_SUITES_BY_LEVEL[level]


LIFECYCLE_STATES = [
    "candidate", "offline_evaluated", "shadow", "benchmarked",
    "release_candidate", "released", "monitored", "superseded",
    "deprecated", "archived",
]

# "shadow" is explicitly optional (Section 10.3), and a decision of
# CONDITIONAL/NO-GO can end the line before "released".
LIFECYCLE_OPTIONAL = {"shadow"}
LIFECYCLE_TERMINAL_EARLY = {"rejected_at_decision"}


def validate_lifecycle_history(states: list[str]) -> list[str]:
    """Section 10.3: transitions occur in order; 'shadow' may be skipped;
    a NO-GO/rejected candidate may terminate before 'released'."""
    violations = []
    idx = {s: i for i, s in enumerate(LIFECYCLE_STATES)}
    last_idx = -1
    for s in states:
        if s in LIFECYCLE_TERMINAL_EARLY:
            continue
        if s not in idx:
            violations.append(f"unknown lifecycle state: {s}")
            continue
        if idx[s] < last_idx:
            violations.append(f"state {s} occurs out of order")
        last_idx = max(last_idx, idx[s])
    return violations


ROLLBACK_TRIGGERS = {
    "s0_in_production", "drift_beyond_hard_alert",
    "discovered_poisoning", "discovered_benchmark_contamination",
}


def rollback_trigger_fired(signals: dict) -> bool:
    """Section 10.4: any named trigger fires rollback to the last
    GO/CONDITIONAL-GO bundle; rollback needs no builder approval, only a
    post-incident record."""
    return any(signals.get(t) for t in ROLLBACK_TRIGGERS)


# ---------------------------------------------------------------------------
# Section 11 -- Long-term improvement strategy
# ---------------------------------------------------------------------------

WEIGHTS_CHANGE_CONDITIONS = {
    "new_technology": "consistent failure to *use* supplied context (capability gap)",
    "new_repo_structure": "failures persist across multiple unseen repos",
    "team_convention": "never, unless convention converges across independent repos and guidelines change",
    "new_engineering_pattern": "pattern shows a systematic error guidelines cannot fix",
    "new_task_category": "category accepted, benchmark slice built, model fails it",
}


def weights_change_justified(kind_of_change: str, condition_met: bool) -> bool:
    """Section 11.1: new knowledge goes to context/configuration first.
    Weights change only if the named condition for that kind of change
    is actually met -- 'team_convention' can never justify a weight change
    through this path (it belongs in configuration, full stop)."""
    if kind_of_change not in WEIGHTS_CHANGE_CONDITIONS:
        raise ValueError(f"unknown kind of change: {kind_of_change!r}")
    if kind_of_change == "team_convention":
        return False
    return bool(condition_met)


HEALTH_METRIC_DEFAULTS = {
    "incorrect_correction_share_rising": False,  # caller-computed trend flag
    "repeat_failure_rate_max": None,  # no fixed default given by the spec
    "old_knowledge_retention_min": None,
    "held_out_seen_gap_max": None,
}


def health_metric_violations(metrics: dict) -> list[str]:
    """Section 11.4: reviewed each cycle. Only the trend the spec names
    explicitly (a rising 'incorrect correction' share) has a hard-coded
    rule; everything else needs a caller-supplied threshold, since the
    spec gives none, matching Decision-style honesty in prior phases."""
    violations = []
    if metrics.get("incorrect_correction_share_trend") == "rising":
        violations.append("rising 'incorrect correction' share -- warning sign")
    for key, limit in metrics.get("caller_thresholds", {}).items():
        value = metrics.get(key)
        if value is not None and limit is not None and value > limit:
            violations.append(f"{key} exceeds caller-supplied threshold {limit}")
    if metrics.get("cycles_with_no_improvement", 0) >= metrics.get("stop_after_cycles", 3):
        violations.append("no measurable improvement for several cycles -- stop retraining, fix the bottleneck instead")
    return violations


# ---------------------------------------------------------------------------
# Section 12 -- Phase-20 decision record
# ---------------------------------------------------------------------------

@dataclass
class Phase20DecisionRecord:
    status: str = "PROPOSED"  # PROPOSED | APPROVED
    approvals: list[str] = field(default_factory=list)
    owners: dict = field(default_factory=dict)   # role -> name
    measured_baselines: dict = field(default_factory=dict)
    thresholds_reconciled_with: list[str] = field(default_factory=list)  # e.g. ["Phase14","Phase18","Phase19"]


def decision_record_violations(record: Phase20DecisionRecord) -> list[str]:
    """The spec is explicit this ships PROPOSED with blanks -- so a
    PROPOSED record with content isn't wrong, but an APPROVED one without
    real approvals/owners/baselines would be an invented result, which
    every phase since Phase 9 refuses to produce."""
    violations = []
    if record.status not in ("PROPOSED", "APPROVED"):
        violations.append(f"unknown status: {record.status}")
    if record.status == "APPROVED":
        if not record.approvals:
            violations.append("APPROVED record has no approvals")
        if not record.owners:
            violations.append("APPROVED record has no named owners")
        if not record.measured_baselines:
            violations.append("APPROVED record has no measured baselines (thresholds must be reconciled with real evidence)")
    return violations
