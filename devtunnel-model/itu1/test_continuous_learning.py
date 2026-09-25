import unittest

import continuous_learning as cl


def base_feedback(**overrides):
    fb = {
        "feedback_id": "fb-1",
        "received_at": "2026-09-01T00:00:00Z",
        "task_id": "task-1",
        "source_issue": {"repo": "org/repo", "issue_number": 42, "snapshot_fetched_at": "2026-08-30T00:00:00Z"},
        "model_version": "itu1-v1@1.2.3+abcdef012345",
        "prompt_version": "p3",
        "schema_version": "2.1",
        "context_version": "c1",
        "target": "task.role",
        "submitter_id": "sub-1",
        "submitter_role": "maintainer",
        "trust_tier": "B",
        "channel": "explicit correction",
        "original_value": "Backend",
        "proposed_value": "Frontend",
        "evidence_locator": "the button styling is wrong",
    }
    fb.update(overrides)
    return fb


class TestFeedbackRecord(unittest.TestCase):
    def test_valid_record_no_violations(self):
        self.assertEqual(cl.validate_feedback_record(base_feedback()), [])

    def test_missing_required_field(self):
        fb = base_feedback()
        del fb["model_version"]
        self.assertIn("missing required field: model_version", cl.validate_feedback_record(fb))

    def test_bad_target_prefix(self):
        fb = base_feedback(target="role")
        v = cl.validate_feedback_record(fb)
        self.assertTrue(any("target must be dotted path" in x for x in v))

    def test_valid_target_prefixes(self):
        for prefix in ("task.role", "provenance.dependencies", "review.review_required"):
            fb = base_feedback(target=prefix)
            self.assertEqual(cl.validate_feedback_record(fb), [])

    def test_no_value_slot_filled(self):
        fb = base_feedback(proposed_value=None)
        v = cl.validate_feedback_record(fb)
        self.assertTrue(any("exactly one of" in x for x in v))

    def test_model_was_correct_slot(self):
        fb = base_feedback(proposed_value=None, model_was_correct=True)
        self.assertEqual(cl.validate_feedback_record(fb), [])

    def test_unknown_is_correct_slot(self):
        fb = base_feedback(proposed_value=None, unknown_is_correct=True)
        self.assertEqual(cl.validate_feedback_record(fb), [])

    def test_two_slots_filled_is_violation(self):
        fb = base_feedback(model_was_correct=True)  # proposed_value also set
        v = cl.validate_feedback_record(fb)
        self.assertTrue(any("exactly one of" in x for x in v))

    def test_unknown_channel(self):
        fb = base_feedback(channel="carrier pigeon")
        v = cl.validate_feedback_record(fb)
        self.assertTrue(any("unknown channel" in x for x in v))

    def test_source_issue_missing_subfield(self):
        fb = base_feedback(source_issue={"repo": "org/repo", "issue_number": 1})
        v = cl.validate_feedback_record(fb)
        self.assertTrue(any("snapshot_fetched_at" in x for x in v))

    def test_g0_gate(self):
        self.assertTrue(cl.g0_gate(base_feedback()))
        self.assertFalse(cl.g0_gate(base_feedback(feedback_id=None)))


class TestClassifyFeedback(unittest.TestCase):
    def test_manipulation_wins_first(self):
        self.assertEqual(
            cl.classify_feedback({"manipulation": True, "duplicate": True}),
            "suspected_manipulation",
        )

    def test_duplicate_before_field_check(self):
        self.assertEqual(cl.classify_feedback({"duplicate": True}), "duplicate")

    def test_not_tied_to_field_is_noisy(self):
        self.assertEqual(cl.classify_feedback({"tied_to_field": False}), "noisy_feedback")

    def test_checkable_and_supported_is_useful(self):
        sig = {"tied_to_field": True, "objectively_checkable": True, "evidence_supports": True}
        self.assertEqual(cl.classify_feedback(sig), "useful_correction")

    def test_checkable_and_unsupported_is_incorrect(self):
        sig = {"tied_to_field": True, "objectively_checkable": True, "evidence_supports": False}
        self.assertEqual(cl.classify_feedback(sig), "incorrect_correction")

    def test_not_checkable_convention_dependent(self):
        sig = {"tied_to_field": True, "objectively_checkable": False, "convention_dependent": True}
        self.assertEqual(cl.classify_feedback(sig), "subjective_preference")

    def test_not_checkable_not_convention_ambiguous(self):
        sig = {
            "tied_to_field": True, "objectively_checkable": False,
            "convention_dependent": False, "ambiguous": True,
        }
        self.assertEqual(cl.classify_feedback(sig), "noisy_feedback")

    def test_missing_checkable_raises(self):
        with self.assertRaises(ValueError):
            cl.classify_feedback({"tied_to_field": True})

    def test_missing_evidence_supports_raises(self):
        with self.assertRaises(ValueError):
            cl.classify_feedback({"tied_to_field": True, "objectively_checkable": True})

    def test_destination_lookup(self):
        self.assertEqual(cl.destination_for_verdict("useful_correction"), "annotation_to_dataset_candidate")
        self.assertEqual(cl.destination_for_verdict("suspected_manipulation"), "quarantine")

    def test_destination_unknown_verdict_raises(self):
        with self.assertRaises(ValueError):
            cl.destination_for_verdict("nope")


class TestG1Violations(unittest.TestCase):
    def test_clean_feedback_no_violations(self):
        fb = base_feedback()
        v = cl.g1_violations(fb, snapshot_text="the button styling is wrong on mobile")
        self.assertEqual(v, [])

    def test_missing_evidence_span(self):
        fb = base_feedback()
        v = cl.g1_violations(fb, snapshot_text="totally unrelated text")
        self.assertTrue(any("evidence_locator span not found" in x for x in v))

    def test_evidence_in_context_counts(self):
        fb = base_feedback()
        v = cl.g1_violations(fb, snapshot_text="unrelated", context_text="the button styling is wrong")
        self.assertEqual(v, [])

    def test_unsupported_entity_flagged(self):
        fb = base_feedback()
        v = cl.g1_violations(fb, snapshot_text="the button styling is wrong",
                              unsupported_entities=["src/fabricated.ts"])
        self.assertTrue(any("fabricated.ts" in x for x in v))

    def test_unknown_to_value_without_evidence(self):
        fb = base_feedback(original_value="Unknown", proposed_value="Advanced", evidence_locator=None)
        v = cl.g1_violations(fb, snapshot_text="")
        self.assertTrue(any("Unknown converted" in x for x in v))

    def test_unknown_to_value_with_evidence_ok(self):
        fb = base_feedback(original_value="Unknown", proposed_value="Advanced",
                            evidence_locator="clearly senior-level work")
        v = cl.g1_violations(fb, snapshot_text="clearly senior-level work")
        self.assertFalse(any("Unknown converted" in x for x in v))

    def test_contradicts_own_prior_correction(self):
        fb = base_feedback(task_id="t1", target="task.role", proposed_value="Frontend")
        prior = [{"task_id": "t1", "target": "task.role", "proposed_value": "Backend"}]
        v = cl.g1_violations(fb, snapshot_text="the button styling is wrong",
                              submitter_prior_corrections=prior)
        self.assertTrue(any("contradicts" in x for x in v))


class TestTriageSampleRate(unittest.TestCase):
    def test_failing_g1_gets_ten_percent(self):
        self.assertEqual(cl.triage_sample_rate(tier_group="trusted_or_mid", enters_training=True, passes_g1=False), 0.10)

    def test_trusted_entering_training_full(self):
        self.assertEqual(cl.triage_sample_rate(tier_group="trusted_or_mid", enters_training=True), 1.0)

    def test_confirmation_default(self):
        self.assertEqual(cl.triage_sample_rate(tier_group="trusted_or_mid", enters_training=True, is_confirmation=True), 0.20)

    def test_confirmation_overriding_prior_full(self):
        self.assertEqual(
            cl.triage_sample_rate(tier_group="trusted_or_mid", enters_training=True,
                                   is_confirmation=True, overrides_prior_accepted=True),
            1.0,
        )

    def test_unknown_combo_raises(self):
        with self.assertRaises(ValueError):
            cl.triage_sample_rate(tier_group="mystery_tier", enters_training=True)


class TestSourceTrust(unittest.TestCase):
    def test_promotion_threshold(self):
        self.assertFalse(cl.reliability_promotion_eligible(19))
        self.assertTrue(cl.reliability_promotion_eligible(20))

    def test_new_account_tier_is_d(self):
        self.assertEqual(cl.new_account_tier(), "D")

    def test_all_tiers_documented(self):
        self.assertEqual(set(cl.TRUST_TIERS), {"A", "B", "C", "D"})


class TestAnnotationWorkflow(unittest.TestCase):
    def test_empty_batch_no_missing(self):
        self.assertEqual(cl.missing_example_types({}), [])

    def test_missing_types_reported(self):
        counts = {"correction_pair": 5, "confirmation": 2}
        missing = cl.missing_example_types(counts)
        self.assertIn("abstention_example", missing)
        self.assertIn("hard_negative", missing)
        self.assertNotIn("correction_pair", missing)

    def test_all_types_present(self):
        counts = {t: 1 for t in cl.EXAMPLE_TYPES}
        self.assertEqual(cl.missing_example_types(counts), [])

    def test_gold_seed_violation(self):
        self.assertTrue(cl.gold_seed_violation(0.85))
        self.assertFalse(cl.gold_seed_violation(0.95))

    def test_blind_labeling_violation(self):
        self.assertTrue(cl.blind_labeling_violation(True, False))
        self.assertTrue(cl.blind_labeling_violation(False, True))
        self.assertFalse(cl.blind_labeling_violation(False, False))

    def test_annotator_independence(self):
        self.assertTrue(cl.annotator_independence_violation("alice", "alice"))
        self.assertFalse(cl.annotator_independence_violation("alice", "bob"))

    def test_annotation_contamination(self):
        self.assertTrue(cl.annotation_contamination_violation(True))
        self.assertFalse(cl.annotation_contamination_violation(False))

    def test_guideline_relabel_required(self):
        self.assertTrue(cl.guideline_relabel_required(True))
        self.assertFalse(cl.guideline_relabel_required(False))


class TestDatasetUpdate(unittest.TestCase):
    def test_trained_on(self):
        self.assertTrue(cl.trained_on("train"))
        self.assertFalse(cl.trained_on("dev"))
        self.assertFalse(cl.trained_on("current_benchmark"))

    def test_trained_on_unknown_raises(self):
        with self.assertRaises(ValueError):
            cl.trained_on("nope")

    def test_never_trained_partitions(self):
        self.assertEqual(cl.NEVER_TRAINED_PARTITIONS, {"current_benchmark", "phase19_release_suite"})

    def test_partition_straddle_violation(self):
        existing = {("org/repo", "issue-1"): None}
        self.assertTrue(cl.partition_straddle_violation("org/repo", "issue-1", existing))
        self.assertFalse(cl.partition_straddle_violation("org/repo", "issue-2", existing))

    def test_overfitting_caps_clean(self):
        increment = {
            "repository_shares": {"org/repo": 0.03},
            "submitter_shares": {"sub-1": 0.01},
            "cluster_shares": {"c1": 0.001},
        }
        self.assertEqual(cl.overfitting_cap_violations(increment), [])

    def test_overfitting_caps_violations(self):
        increment = {
            "repository_shares": {"org/repo": 0.10},
            "submitter_shares": {"sub-1": 0.05},
            "cluster_shares": {"c1": 0.01},
        }
        v = cl.overfitting_cap_violations(increment)
        self.assertEqual(len(v), 3)

    def test_eval_contamination_match(self):
        self.assertTrue(cl.eval_contamination_match("sig-1", ["sig-1", "sig-2"]))
        self.assertFalse(cl.eval_contamination_match("sig-3", ["sig-1", "sig-2"]))


class TestRetrainingPolicy(unittest.TestCase):
    def test_volume_trigger(self):
        self.assertTrue(cl.trigger_fired("volume", {"new_examples": 600, "new_repos": 25}))
        self.assertFalse(cl.trigger_fired("volume", {"new_examples": 600, "new_repos": 10}))

    def test_failure_cluster_trigger(self):
        self.assertTrue(cl.trigger_fired("failure_cluster", {"cluster_examples": 20}))
        self.assertTrue(cl.trigger_fired("failure_cluster", {"s1_examples": 5}))
        self.assertFalse(cl.trigger_fired("failure_cluster", {"cluster_examples": 5, "s1_examples": 1}))

    def test_s0_trigger(self):
        self.assertTrue(cl.trigger_fired("s0_in_production", {"s0_occurrences": 1}))
        self.assertFalse(cl.trigger_fired("s0_in_production", {"s0_occurrences": 0}))

    def test_drift_alert_trigger_needs_persistence(self):
        self.assertTrue(cl.trigger_fired("drift_alert", {"breach": True, "windows_persisted": 2}))
        self.assertFalse(cl.trigger_fired("drift_alert", {"breach": True, "windows_persisted": 1}))

    def test_unknown_trigger_raises(self):
        with self.assertRaises(ValueError):
            cl.trigger_fired("nope", {})

    def test_change_axis_mapping(self):
        self.assertIsNone(cl.change_axis_version_impact("configuration"))
        self.assertEqual(cl.change_axis_version_impact("prompt_decoding_postprocessing"), "PATCH")
        self.assertEqual(cl.change_axis_version_impact("finetune_or_adapter"), "MINOR")

    def test_change_axis_unknown_raises(self):
        with self.assertRaises(ValueError):
            cl.change_axis_version_impact("nope")

    def test_training_mix_clean(self):
        mix = {
            "new_validated": 0.35, "replay": 0.45,
            "historical_failure_variants": 0.12,
            "confirmations_abstentions_hard_negatives": 0.30,
            "abstentions": 0.12, "corrections_share_of_new": 0.40,
        }
        self.assertEqual(cl.training_mix_violations(mix), [])

    def test_training_mix_all_violations(self):
        mix = {
            "new_validated": 0.60, "replay": 0.10,
            "historical_failure_variants": 0.02,
            "confirmations_abstentions_hard_negatives": 0.05,
            "abstentions": 0.02, "corrections_share_of_new": 0.90,
        }
        v = cl.training_mix_violations(mix)
        self.assertEqual(len(v), 6)

    def test_prohibition_violated(self):
        self.assertTrue(cl.prohibition_violated("automatic_deployment"))
        self.assertFalse(cl.prohibition_violated("human_reviewed_release"))

    def test_candidate_acceptance_relative(self):
        self.assertTrue(cl.candidate_acceptance(
            relative_error_reduction=0.35, absolute_improvement_ci_supported=False, all_gates_passed=True))

    def test_candidate_acceptance_fails_gates(self):
        self.assertFalse(cl.candidate_acceptance(
            relative_error_reduction=0.50, absolute_improvement_ci_supported=False, all_gates_passed=False))

    def test_candidate_acceptance_below_threshold_no_ci(self):
        self.assertFalse(cl.candidate_acceptance(
            relative_error_reduction=0.10, absolute_improvement_ci_supported=False, all_gates_passed=True))

    def test_candidate_acceptance_ci_supported(self):
        self.assertTrue(cl.candidate_acceptance(
            relative_error_reduction=None, absolute_improvement_ci_supported=True, all_gates_passed=True))


class TestRegressionProtection(unittest.TestCase):
    def test_no_results_no_violations(self):
        self.assertEqual(cl.regression_gate_violations({}), [])

    def test_new_s0_violation(self):
        self.assertIn("new S0 failure introduced", cl.regression_gate_violations({"new_s0": 1}))

    def test_capability_ci_lower_bound_violation(self):
        v = cl.regression_gate_violations({"capability_ci_lower_bounds": {"role": -2.0}})
        self.assertTrue(any("CI lower bound" in x for x in v))

    def test_slice_drop_violation(self):
        v = cl.regression_gate_violations({"slice_drops": {"non_english": 5.0}})
        self.assertTrue(any("slice non_english" in x for x in v))

    def test_fixed_stays_fixed_violation(self):
        v = cl.regression_gate_violations({"fixed_stays_fixed_rate": 0.9})
        self.assertTrue(any("98%" in x for x in v))

    def test_ece_delta_violation(self):
        v = cl.regression_gate_violations({"ece_delta": 0.05})
        self.assertTrue(any("ECE worse" in x for x in v))

    def test_forgetting_metric(self):
        self.assertFalse(cl.forgetting_metric_violation(0.005))
        self.assertTrue(cl.forgetting_metric_violation(0.02))
        self.assertTrue(cl.forgetting_metric_violation(0.001, is_s0_s1=True))

    def test_overfitting_slice(self):
        self.assertTrue(cl.overfitting_slice_violation(2.0, -0.5))
        self.assertFalse(cl.overfitting_slice_violation(2.0, 1.0))


class TestDriftMonitoring(unittest.TestCase):
    def test_input_psi_needs_persistence(self):
        self.assertTrue(cl.drift_alert("input_psi", 0.3, persists_two_windows=True))
        self.assertFalse(cl.drift_alert("input_psi", 0.3, persists_two_windows=False))

    def test_output_sigma(self):
        self.assertTrue(cl.drift_alert("output_sigma", 2.5))
        self.assertFalse(cl.drift_alert("output_sigma", 1.0))

    def test_unknown_rate_change(self):
        self.assertTrue(cl.drift_alert("unknown_rate_change_points", 6))
        self.assertFalse(cl.drift_alert("unknown_rate_change_points", 3))

    def test_any_s0(self):
        self.assertTrue(cl.drift_alert("any_s0", True))

    def test_unknown_signal_raises(self):
        with self.assertRaises(ValueError):
            cl.drift_alert("mystery", 1)

    def test_alert_response_lookup(self):
        self.assertEqual(cl.alert_response("s0_in_production"), "immediate_rollback_and_incident_review")

    def test_alert_response_unknown_raises(self):
        with self.assertRaises(ValueError):
            cl.alert_response("nope")


class TestPoisoningProtection(unittest.TestCase):
    def test_quarantine_on_manipulation(self):
        self.assertTrue(cl.quarantine_required({"manipulation_detected": True}))

    def test_quarantine_on_anomaly_cluster(self):
        self.assertTrue(cl.quarantine_required({"statistical_anomaly_cluster": True}))

    def test_quarantine_on_honeypot_failure(self):
        self.assertTrue(cl.quarantine_required({"honeypot_failed": True}))

    def test_no_quarantine_when_clean(self):
        self.assertFalse(cl.quarantine_required({}))

    def test_bad_label_reaudit(self):
        self.assertTrue(cl.bad_label_reaudit_violation(0.05))
        self.assertFalse(cl.bad_label_reaudit_violation(0.01))

    def test_recovery_required_malicious(self):
        self.assertTrue(cl.recovery_required(malicious_confirmed=True))

    def test_recovery_required_threshold(self):
        self.assertTrue(cl.recovery_required(mislabeled_fraction=0.01))
        self.assertFalse(cl.recovery_required(mislabeled_fraction=0.001))


class TestVersioningWorkflow(unittest.TestCase):
    def test_bundle_completeness_all_present(self):
        bundle = {f: "x" for f in cl.ARTIFACT_BUNDLE_FIELDS}
        self.assertEqual(cl.bundle_completeness_violations(bundle), [])

    def test_bundle_completeness_missing(self):
        v = cl.bundle_completeness_violations({})
        self.assertEqual(len(v), len(cl.ARTIFACT_BUNDLE_FIELDS))

    def test_required_eval_suites(self):
        self.assertIn("new_baseline", cl.required_eval_suites("MAJOR"))
        self.assertIn("full_phase19_suite", cl.required_eval_suites("MINOR"))
        self.assertIn("regression", cl.required_eval_suites("PATCH"))

    def test_required_eval_suites_unknown_raises(self):
        with self.assertRaises(ValueError):
            cl.required_eval_suites("nope")

    def test_lifecycle_in_order_clean(self):
        states = ["candidate", "offline_evaluated", "benchmarked", "release_candidate", "released", "monitored"]
        self.assertEqual(cl.validate_lifecycle_history(states), [])

    def test_lifecycle_shadow_optional(self):
        states = ["candidate", "offline_evaluated", "shadow", "benchmarked", "release_candidate"]
        self.assertEqual(cl.validate_lifecycle_history(states), [])

    def test_lifecycle_out_of_order(self):
        states = ["candidate", "released", "offline_evaluated"]
        v = cl.validate_lifecycle_history(states)
        self.assertTrue(any("out of order" in x for x in v))

    def test_lifecycle_unknown_state(self):
        v = cl.validate_lifecycle_history(["candidate", "teleported"])
        self.assertTrue(any("unknown lifecycle state" in x for x in v))

    def test_rollback_trigger(self):
        self.assertTrue(cl.rollback_trigger_fired({"s0_in_production": True}))
        self.assertTrue(cl.rollback_trigger_fired({"discovered_poisoning": True}))
        self.assertFalse(cl.rollback_trigger_fired({}))


class TestLongTermImprovement(unittest.TestCase):
    def test_new_technology_condition(self):
        self.assertTrue(cl.weights_change_justified("new_technology", True))
        self.assertFalse(cl.weights_change_justified("new_technology", False))

    def test_team_convention_never(self):
        self.assertFalse(cl.weights_change_justified("team_convention", True))

    def test_unknown_kind_raises(self):
        with self.assertRaises(ValueError):
            cl.weights_change_justified("nope", True)

    def test_health_metric_rising_incorrect_correction(self):
        v = cl.health_metric_violations({"incorrect_correction_share_trend": "rising"})
        self.assertTrue(any("incorrect correction" in x for x in v))

    def test_health_metric_no_violation_when_stable(self):
        self.assertEqual(cl.health_metric_violations({"incorrect_correction_share_trend": "stable"}), [])

    def test_health_metric_caller_threshold(self):
        metrics = {"repeat_failure_rate": 0.2, "caller_thresholds": {"repeat_failure_rate": 0.1}}
        v = cl.health_metric_violations(metrics)
        self.assertTrue(any("repeat_failure_rate" in x for x in v))

    def test_health_metric_no_improvement_cycles(self):
        v = cl.health_metric_violations({"cycles_with_no_improvement": 3, "stop_after_cycles": 3})
        self.assertTrue(any("stop retraining" in x for x in v))


class TestDecisionRecord(unittest.TestCase):
    def test_proposed_blank_is_fine(self):
        record = cl.Phase20DecisionRecord()
        self.assertEqual(cl.decision_record_violations(record), [])

    def test_approved_without_evidence_fails(self):
        record = cl.Phase20DecisionRecord(status="APPROVED")
        v = cl.decision_record_violations(record)
        self.assertEqual(len(v), 3)

    def test_approved_with_evidence_passes(self):
        record = cl.Phase20DecisionRecord(
            status="APPROVED", approvals=["release-lead"],
            owners={"data": "alice"}, measured_baselines={"forgetting_rate": 0.005},
        )
        self.assertEqual(cl.decision_record_violations(record), [])

    def test_unknown_status(self):
        record = cl.Phase20DecisionRecord(status="MAYBE")
        v = cl.decision_record_violations(record)
        self.assertTrue(any("unknown status" in x for x in v))


if __name__ == "__main__":
    unittest.main()
