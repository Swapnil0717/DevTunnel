import unittest

import improvement as imp


def full_dims(overrides=None):
    overrides = overrides or {}
    out = []
    for d in imp.REGRESSION_DIMENSIONS:
        out.append({"dimension": d, "result": overrides.get(d, "unchanged"), "significance": None})
    return out


class TestChangeClassification(unittest.TestCase):
    def test_all_nine_change_types_present(self):
        self.assertEqual(len(imp.CHANGE_TYPES), 9)
        for ct in imp.CHANGE_TYPES:
            self.assertIn(ct, imp.CHANGE_TYPE_TABLE)

    def test_unknown_change_type_raises(self):
        with self.assertRaises(ValueError):
            imp.classify_change("Rewrite everything")

    def test_default_broad_for_architecture_training_schema(self):
        for ct in ("Architecture changes", "Training-objective changes", "Output-schema changes"):
            self.assertEqual(imp.default_blast_radius(ct), "broad")

    def test_default_not_broad_for_targeted_changes(self):
        self.assertEqual(imp.default_blast_radius("Better annotations"), "narrow")
        self.assertEqual(imp.default_blast_radius("More training data"), "narrow")

    def test_narrow_blast_radius_requires_evidence(self):
        self.assertFalse(imp.narrow_blast_radius_allowed("Architecture changes", clean_regression_check=False))
        self.assertTrue(imp.narrow_blast_radius_allowed("Architecture changes", clean_regression_check=True))
        # Non-broad-by-default types aren't governed by this narrowing rule at all
        self.assertFalse(imp.narrow_blast_radius_allowed("Better retrieval", clean_regression_check=True))

    def test_separate_candidates_for_cluster_dedupes_and_validates(self):
        out = imp.separate_candidates_for_cluster(["More training data", "Better uncertainty handling", "More training data"])
        self.assertEqual(out, ["More training data", "Better uncertainty handling"])
        with self.assertRaises(ValueError):
            imp.separate_candidates_for_cluster(["not a real type"])


class TestLifecycle(unittest.TestCase):
    def test_legal_forward_sequence(self):
        self.assertEqual(imp.validate_transition("proposed", "scoped"), [])
        self.assertEqual(imp.validate_transition("scoped", "executed"), [])
        self.assertEqual(imp.validate_transition("executed", "regression_checked"), [])
        self.assertEqual(imp.validate_transition("regression_checked", "accepted"), [])
        self.assertEqual(imp.validate_transition("regression_checked", "rejected"), [])
        self.assertEqual(imp.validate_transition("accepted", "released"), [])
        self.assertEqual(imp.validate_transition("released", "monitored"), [])
        self.assertEqual(imp.validate_transition("monitored", "rolled_back"), [])

    def test_skip_state_is_illegal(self):
        v = imp.validate_transition("proposed", "executed")
        self.assertTrue(v)
        self.assertIn("illegal transition", v[0])

    def test_rejected_and_rolled_back_are_terminal(self):
        self.assertEqual(imp.ALLOWED_TRANSITIONS["rejected"], frozenset())
        self.assertEqual(imp.ALLOWED_TRANSITIONS["rolled_back"], frozenset())
        v = imp.validate_transition("rejected", "proposed")
        self.assertTrue(v)

    def test_reentry_into_later_state_without_restart_is_illegal(self):
        # A candidate that failed at regression_checked->rejected cannot later
        # be pushed straight to accepted.
        v = imp.validate_transition("rejected", "accepted")
        self.assertTrue(v)

    def test_validate_history_clean_path(self):
        history = [
            {"from_state": "proposed", "to_state": "scoped"},
            {"from_state": "scoped", "to_state": "executed"},
            {"from_state": "executed", "to_state": "regression_checked"},
            {"from_state": "regression_checked", "to_state": "accepted"},
        ]
        self.assertEqual(imp.validate_history(history), [])
        self.assertEqual(imp.current_state(history), "accepted")

    def test_validate_history_empty_defaults_to_proposed(self):
        self.assertEqual(imp.validate_history([]), [])
        self.assertEqual(imp.current_state([]), "proposed")

    def test_validate_history_catches_gap(self):
        history = [
            {"from_state": "proposed", "to_state": "scoped"},
            {"from_state": "executed", "to_state": "regression_checked"},  # gap: skipped 'executed' entry
        ]
        v = imp.validate_history(history)
        self.assertTrue(any("does not follow" in x for x in v))

    def test_validate_history_catches_illegal_transition(self):
        history = [{"from_state": "proposed", "to_state": "accepted"}]
        v = imp.validate_history(history)
        self.assertTrue(any("illegal transition" in x for x in v))

    def test_rejected_candidate_feeds_phase16(self):
        out = imp.rejected_candidate_to_failure_input("cand-1", [{"dimension": "Grounding", "result": "regressed_fail"}])
        self.assertEqual(out["source_candidate_id"], "cand-1")
        self.assertEqual(len(out["regression_findings"]), 1)


class TestExperimentMethodology(unittest.TestCase):
    def test_select_baseline_prefers_released(self):
        self.assertEqual(imp.select_baseline_checkpoint("ckpt-released", "ckpt-candidate"), "ckpt-released")

    def test_select_baseline_falls_back_to_accepted_candidate(self):
        self.assertEqual(imp.select_baseline_checkpoint(None, "ckpt-candidate"), "ckpt-candidate")

    def test_select_baseline_raises_with_nothing(self):
        with self.assertRaises(ValueError):
            imp.select_baseline_checkpoint(None, None)

    def test_benchmark_coverage_all_five_required(self):
        runs = {"current": "run1", "previous": "run2", "regression": None,
                "adversarial": "run4", "hard_case": "run5"}
        v = imp.benchmark_coverage_violations(runs)
        self.assertEqual(len(v), 1)
        self.assertFalse(imp.eligible_for_acceptance(runs))

    def test_benchmark_coverage_complete(self):
        runs = {k: f"run-{k}" for k in imp.REQUIRED_BENCHMARKS}
        self.assertEqual(imp.benchmark_coverage_violations(runs), [])
        self.assertTrue(imp.eligible_for_acceptance(runs))

    def test_validate_target_metric(self):
        self.assertEqual(imp.validate_target_metric(
            {"field": "role", "reporting_axis_cell": "role=Backend", "pre_registered_threshold": 0.02}), [])
        v = imp.validate_target_metric({"field": "role"})
        self.assertEqual(len(v), 2)

    def test_cell_conclusiveness(self):
        self.assertEqual(imp.cell_conclusiveness(5, insufficient_data_threshold=30), "inconclusive")
        self.assertEqual(imp.cell_conclusiveness(50, insufficient_data_threshold=30), "conclusive")

    def test_classify_dimension_raw_result_insufficient_data(self):
        r = imp.classify_dimension_raw_result(delta=0.05, p_value=0.01, alpha=0.05,
                                                direction_is_improvement_when_positive=True,
                                                sample_size=5, insufficient_data_threshold=30)
        self.assertEqual(r, "inconclusive")

    def test_classify_dimension_raw_result_not_significant(self):
        r = imp.classify_dimension_raw_result(delta=0.05, p_value=0.5, alpha=0.05,
                                                direction_is_improvement_when_positive=True,
                                                sample_size=100, insufficient_data_threshold=30)
        self.assertEqual(r, "unchanged")

    def test_classify_dimension_raw_result_improved_and_regressed(self):
        improved = imp.classify_dimension_raw_result(delta=0.05, p_value=0.01, alpha=0.05,
                                                       direction_is_improvement_when_positive=True,
                                                       sample_size=100, insufficient_data_threshold=30)
        self.assertEqual(improved, "improved")
        regressed = imp.classify_dimension_raw_result(delta=-0.05, p_value=0.01, alpha=0.05,
                                                        direction_is_improvement_when_positive=True,
                                                        sample_size=100, insufficient_data_threshold=30)
        self.assertEqual(regressed, "regressed")


class TestRegressionMethodology(unittest.TestCase):
    def test_apply_tolerance_hallucination_never_tolerated(self):
        r = imp.apply_tolerance("Hallucination", "regressed", severity="Low", is_targeted=False)
        self.assertEqual(r, "regressed_fail")

    def test_apply_tolerance_targeted_dimension_never_tolerated(self):
        r = imp.apply_tolerance("Role", "regressed", severity="Low", is_targeted=True)
        self.assertEqual(r, "regressed_fail")

    def test_apply_tolerance_low_severity_non_targeted_tolerated(self):
        r = imp.apply_tolerance("Grounding", "regressed", severity="Low", is_targeted=False)
        self.assertEqual(r, "regressed_within_tolerance")

    def test_apply_tolerance_medium_or_above_never_tolerated(self):
        for sev in ("Medium", "High", "Critical"):
            r = imp.apply_tolerance("Grounding", "regressed", severity=sev, is_targeted=False)
            self.assertEqual(r, "regressed_fail")

    def test_apply_tolerance_passthrough_for_non_regressed(self):
        self.assertEqual(imp.apply_tolerance("Role", "improved", severity=None, is_targeted=False), "improved")
        self.assertEqual(imp.apply_tolerance("Role", "unchanged", severity=None, is_targeted=False), "unchanged")

    def test_regression_table_completeness_all_present(self):
        self.assertEqual(imp.regression_table_completeness_violations(full_dims()), [])

    def test_regression_table_completeness_missing_dimension(self):
        dims = full_dims()
        dims.pop()
        v = imp.regression_table_completeness_violations(dims)
        self.assertTrue(v)

    def test_net_acceptability_clean_pass(self):
        self.assertEqual(imp.net_acceptability(full_dims()), [])
        self.assertTrue(imp.regression_methodology_passes(full_dims()))

    def test_net_acceptability_one_tolerated_regression_ok(self):
        dims = full_dims({"Grounding": "regressed_within_tolerance"})
        self.assertEqual(imp.net_acceptability(dims), [])

    def test_net_acceptability_two_tolerated_regressions_fail(self):
        dims = full_dims({"Grounding": "regressed_within_tolerance", "Uncertainty": "regressed_within_tolerance"})
        v = imp.net_acceptability(dims)
        self.assertTrue(any("more than one dimension" in x for x in v))

    def test_net_acceptability_any_hard_fail_blocks(self):
        dims = full_dims({"Role": "regressed_fail"})
        v = imp.net_acceptability(dims)
        self.assertTrue(any("regressed_fail" in x for x in v))

    def test_net_acceptability_hallucination_tolerance_is_a_violation(self):
        dims = full_dims({"Hallucination": "regressed_within_tolerance"})
        v = imp.net_acceptability(dims)
        self.assertTrue(any("never eligible" in x for x in v))

    def test_net_acceptability_incomplete_table_is_a_violation(self):
        dims = full_dims()[:-1]
        v = imp.net_acceptability(dims)
        self.assertTrue(v)


class TestAcceptanceAndRelease(unittest.TestCase):
    def base_kwargs(self, **overrides):
        kwargs = dict(
            benchmark_runs={k: f"run-{k}" for k in imp.REQUIRED_BENCHMARKS},
            l0_structural_validity=1.0,
            hallucination_ceiling_violations=[],
            regression_reappearances=0,
            dimensions=full_dims(),
            target_metric_significant=True,
            adversarial_tests_pass=True,
            hard_confusable_pair_collapse=False,
            human_agreement_not_worse=True,
        )
        kwargs.update(overrides)
        return kwargs

    def test_all_criteria_met_accepts(self):
        r = imp.acceptance_checklist(**self.base_kwargs())
        self.assertEqual(r["decision"], "accepted")
        self.assertTrue(all(r["checklist"]))

    def test_missing_benchmark_rejects(self):
        runs = {k: f"run-{k}" for k in imp.REQUIRED_BENCHMARKS}
        runs["regression"] = None
        r = imp.acceptance_checklist(**self.base_kwargs(benchmark_runs=runs))
        self.assertEqual(r["decision"], "rejected")

    def test_l0_below_100_rejects(self):
        r = imp.acceptance_checklist(**self.base_kwargs(l0_structural_validity=0.99))
        self.assertEqual(r["decision"], "rejected")

    def test_hallucination_ceiling_violation_rejects(self):
        r = imp.acceptance_checklist(**self.base_kwargs(hallucination_ceiling_violations=["type X over ceiling"]))
        self.assertEqual(r["decision"], "rejected")

    def test_regression_reappearance_rejects(self):
        r = imp.acceptance_checklist(**self.base_kwargs(regression_reappearances=1))
        self.assertEqual(r["decision"], "rejected")

    def test_failing_regression_methodology_rejects(self):
        dims = full_dims({"Role": "regressed_fail"})
        r = imp.acceptance_checklist(**self.base_kwargs(dimensions=dims))
        self.assertEqual(r["decision"], "rejected")

    def test_insignificant_target_metric_rejects(self):
        r = imp.acceptance_checklist(**self.base_kwargs(target_metric_significant=False))
        self.assertEqual(r["decision"], "rejected")

    def test_hard_confusable_pair_collapse_rejects(self):
        r = imp.acceptance_checklist(**self.base_kwargs(hard_confusable_pair_collapse=True))
        self.assertEqual(r["decision"], "rejected")

    def test_human_agreement_drop_rejects(self):
        r = imp.acceptance_checklist(**self.base_kwargs(human_agreement_not_worse=False))
        self.assertEqual(r["decision"], "rejected")

    def test_unchanged_dimensions_do_not_block_acceptance(self):
        # criterion 4's clause: unchanged is fine, universal improvement isn't required
        r = imp.acceptance_checklist(**self.base_kwargs(dimensions=full_dims()))
        self.assertEqual(r["decision"], "accepted")

    def test_release_requires_accepted(self):
        r = imp.release_verdict(acceptance_decision="rejected", signed_off_by="reviewer-x",
                                 owning_phase="Phase 12", rollback_plan_exists=True)
        self.assertFalse(r["released"])

    def test_release_requires_signoff(self):
        r = imp.release_verdict(acceptance_decision="accepted", signed_off_by=None,
                                 owning_phase="Phase 12", rollback_plan_exists=True)
        self.assertFalse(r["released"])

    def test_release_requires_independent_signoff(self):
        r = imp.release_verdict(acceptance_decision="accepted", signed_off_by="Phase 12",
                                 owning_phase="Phase 12", rollback_plan_exists=True)
        self.assertFalse(r["released"])

    def test_release_requires_rollback_plan(self):
        r = imp.release_verdict(acceptance_decision="accepted", signed_off_by="reviewer-x",
                                 owning_phase="Phase 12", rollback_plan_exists=False)
        self.assertFalse(r["released"])

    def test_release_clean_path(self):
        r = imp.release_verdict(acceptance_decision="accepted", signed_off_by="reviewer-x",
                                 owning_phase="Phase 12", rollback_plan_exists=True)
        self.assertTrue(r["released"])
        self.assertEqual(r["violations"], [])


class TestRollback(unittest.TestCase):
    def test_rollback_required(self):
        self.assertTrue(imp.rollback_required("regression_reappearance"))
        self.assertFalse(imp.rollback_required("nonexistent_trigger"))

    def test_rollback_decision_requires_independent_reviewer(self):
        r = imp.rollback_decision("hallucination_ceiling_exceeded_live",
                                   confirmed_by_independent_reviewer=True,
                                   owning_phase="Phase 12", reviewer="Phase 12")
        self.assertFalse(r["rolled_back"])

    def test_rollback_decision_clean(self):
        r = imp.rollback_decision("hallucination_ceiling_exceeded_live",
                                   confirmed_by_independent_reviewer=True,
                                   owning_phase="Phase 12", reviewer="reviewer-x")
        self.assertTrue(r["rolled_back"])
        self.assertEqual(r["action"], "immediate_rollback")

    def test_rollback_decision_unconfirmed(self):
        r = imp.rollback_decision("regression_reappearance",
                                   confirmed_by_independent_reviewer=False,
                                   owning_phase="Phase 12", reviewer=None)
        self.assertFalse(r["rolled_back"])

    def test_rollback_decision_unknown_trigger(self):
        r = imp.rollback_decision("made_up_trigger", confirmed_by_independent_reviewer=True,
                                   owning_phase="Phase 12", reviewer="reviewer-x")
        self.assertFalse(r["rolled_back"])

    def test_rollback_to_failure_record_shape(self):
        rec = imp.rollback_to_failure_record("sign_off_based_on_incorrect_data", "cand-9", "bad EvaluationRun")
        self.assertEqual(rec["error_type"], "Data quality")
        self.assertTrue(rec["requires_regression_dataset_promotion_after_fix"])

    def test_rollback_to_failure_record_model_default(self):
        rec = imp.rollback_to_failure_record("regression_reappearance", "cand-9", "prod repro")
        self.assertEqual(rec["error_type"], "Model misunderstanding")

    def test_rollback_to_failure_record_unknown_trigger(self):
        with self.assertRaises(ValueError):
            imp.rollback_to_failure_record("nope", "cand-9", "x")


class TestExperimentTracking(unittest.TestCase):
    def base_candidate(self, **overrides):
        kwargs = dict(
            candidate_id="cand-1",
            created_at="2026-01-01T00:00:00Z",
            originating_failures=["fail-1"],
            change_type="Better retrieval",
            owning_phase="Phase 12",
            blast_radius="moderate",
            baseline_checkpoint="ckpt-1",
            target_metric={"field": "context_understanding", "reporting_axis_cell": "tier=3",
                            "pre_registered_threshold": 0.02},
        )
        kwargs.update(overrides)
        return imp.ImprovementCandidate(**kwargs)

    def test_valid_candidate_in_proposed_state(self):
        c = self.base_candidate()
        self.assertEqual(imp.validate_improvement_candidate(c), [])

    def test_no_originating_failures_is_invalid(self):
        c = self.base_candidate(originating_failures=[])
        v = imp.validate_improvement_candidate(c)
        self.assertTrue(any("originating_failures" in x for x in v))

    def test_unknown_change_type_is_invalid(self):
        c = self.base_candidate(change_type="Rewrite the world")
        v = imp.validate_improvement_candidate(c)
        self.assertTrue(any("change_type" in x for x in v))

    def test_bad_blast_radius_is_invalid(self):
        c = self.base_candidate(blast_radius="huge")
        v = imp.validate_improvement_candidate(c)
        self.assertTrue(any("blast_radius" in x for x in v))

    def test_incomplete_target_metric_is_invalid(self):
        c = self.base_candidate(target_metric={"field": "role"})
        v = imp.validate_improvement_candidate(c)
        self.assertTrue(any("target_metric" in x for x in v))

    def test_state_must_match_history(self):
        c = self.base_candidate(state="accepted", history=[])
        v = imp.validate_improvement_candidate(c)
        self.assertTrue(any("does not match" in x for x in v))

    def test_state_matches_history_is_valid(self):
        c = self.base_candidate(state="scoped", history=[{"from_state": "proposed", "to_state": "scoped"}])
        self.assertEqual(imp.validate_improvement_candidate(c), [])

    def test_rolled_back_without_ref_is_invalid(self):
        c = self.base_candidate()
        c.acceptance["decision"] = "rolled_back"
        v = imp.validate_improvement_candidate(c)
        self.assertTrue(any("rollback_ref" in x for x in v))

    def test_malformed_report_incomplete_regression_table(self):
        c = self.base_candidate(state="accepted",
                                 history=[{"from_state": "proposed", "to_state": "scoped"},
                                          {"from_state": "scoped", "to_state": "executed"},
                                          {"from_state": "executed", "to_state": "regression_checked"},
                                          {"from_state": "regression_checked", "to_state": "accepted"}])
        c.regression_check = {"dimensions": full_dims()[:-1]}
        c.acceptance["checklist"] = [True] * 7
        v = imp.malformed_candidate_report_violations(c)
        self.assertTrue(v)

    def test_malformed_report_decision_without_checklist(self):
        c = self.base_candidate(state="accepted",
                                 history=[{"from_state": "proposed", "to_state": "scoped"},
                                          {"from_state": "scoped", "to_state": "executed"},
                                          {"from_state": "executed", "to_state": "regression_checked"},
                                          {"from_state": "regression_checked", "to_state": "accepted"}])
        c.regression_check = {"dimensions": full_dims()}
        c.acceptance["checklist"] = []
        v = imp.malformed_candidate_report_violations(c)
        self.assertTrue(any("no supporting checklist" in x for x in v))

    def test_well_formed_accepted_report_has_no_violations(self):
        c = self.base_candidate(state="accepted",
                                 history=[{"from_state": "proposed", "to_state": "scoped"},
                                          {"from_state": "scoped", "to_state": "executed"},
                                          {"from_state": "executed", "to_state": "regression_checked"},
                                          {"from_state": "regression_checked", "to_state": "accepted"}])
        c.regression_check = {"dimensions": full_dims()}
        c.acceptance["checklist"] = [True] * 7
        self.assertEqual(imp.malformed_candidate_report_violations(c), [])
        self.assertEqual(imp.validate_improvement_candidate(c), [])


if __name__ == "__main__":
    unittest.main()
