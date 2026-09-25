import unittest

import evaluation as ev
import derived
from test_schema import base_record, unknown_record


def finalized():
    return derived.finalize(base_record())


class L0Tests(unittest.TestCase):
    def test_valid_record_passes_l0(self):
        self.assertEqual(ev.l0_gate(finalized()), [])

    def test_malformed_record_fails_l0(self):
        rec = finalized()
        del rec["task"]["title"]
        self.assertTrue(ev.l0_gate(rec))

    def test_evaluate_l0_excludes_failed_from_passed(self):
        good = finalized()
        bad = finalized()
        del bad["task"]["title"]
        result = ev.evaluate_l0([good, bad])
        self.assertEqual(len(result["passed"]), 1)
        self.assertEqual(len(result["failed"]), 1)
        self.assertEqual(result["structural_validity"], 0.5)

    def test_evaluate_l0_empty(self):
        result = ev.evaluate_l0([])
        self.assertIsNone(result["structural_validity"])


class ClassificationReportTests(unittest.TestCase):
    def test_accuracy_exact_match(self):
        pairs = [("Bug", "Bug"), ("Feature", "Bug"), ("Bug", "Bug")]
        report = ev.classification_report(pairs)
        self.assertAlmostEqual(report["accuracy"], 2 / 3)
        self.assertEqual(report["n"], 3)

    def test_unknown_counts_as_a_class(self):
        pairs = [("Unknown", "Unknown"), ("Bug", "Unknown")]
        report = ev.classification_report(pairs)
        self.assertIn("Unknown", report["per_class"])
        self.assertEqual(report["per_class"]["Unknown"]["support"], 2)

    def test_per_class_precision_recall_f1(self):
        pairs = [("Bug", "Bug"), ("Bug", "Feature"), ("Feature", "Feature")]
        report = ev.classification_report(pairs)
        bug = report["per_class"]["Bug"]
        self.assertAlmostEqual(bug["precision"], 0.5)
        self.assertAlmostEqual(bug["recall"], 1.0)

    def test_empty_pairs(self):
        report = ev.classification_report([])
        self.assertIsNone(report["accuracy"])
        self.assertEqual(report["n"], 0)

    def test_macro_average_not_dominated_by_majority_class(self):
        # Nine "Feature" correct, one "Security" wrong -- macro F1 should
        # visibly punish the rare class, unlike a micro/accuracy number.
        pairs = [("Feature", "Feature")] * 9 + [("Feature", "Security")]
        report = ev.classification_report(pairs)
        self.assertLess(report["macro_f1"], report["accuracy"])


class ConfusionMatrixTests(unittest.TestCase):
    def test_full_matrix_with_unknown(self):
        pairs = [("Bug", "Bug"), ("Unknown", "Bug"), ("Unknown", "Unknown")]
        m = ev.confusion_matrix(pairs)
        self.assertEqual(m["Bug"]["Bug"], 1)
        self.assertEqual(m["Bug"]["Unknown"], 1)
        self.assertEqual(m["Unknown"]["Unknown"], 1)


class TierAwareClassificationTests(unittest.TestCase):
    def test_uses_tier_appropriate_reference(self):
        # ground truth's evidence is only visible at tier 3; a tier-1
        # checkpoint's honest "Unknown" must not be scored as an error.
        rows = [{"pred": "Unknown", "gt_value": "Backend",
                 "evidence_tiers": [3], "ceiling": 1}]
        report = ev.classification_metrics_for_field("role", rows)
        self.assertEqual(report["accuracy"], 1.0)  # Unknown == Unknown reference

    def test_overclaim_not_silently_correct(self):
        rows = [{"pred": "Backend", "gt_value": "Backend",
                 "evidence_tiers": [3], "ceiling": 1}]
        report = ev.classification_metrics_for_field("role", rows)
        # reference is forced Unknown at this ceiling; predicting Backend
        # anyway is scored against "Unknown", i.e. incorrect in the report.
        self.assertEqual(report["accuracy"], 0.0)

    def test_unaligned_evidence_excluded_not_guessed(self):
        rows = [{"pred": "Backend", "gt_value": "Backend",
                 "evidence_tiers": None, "ceiling": 1}]
        report = ev.classification_metrics_for_field("role", rows)
        self.assertEqual(report["n"], 0)


class CrossFieldAgreementTests(unittest.TestCase):
    def test_documentation_backend_db_reasoning_flagged(self):
        rec = finalized()
        rec["task"]["task_type"] = "Documentation"
        rec["task"]["role"] = "Backend"
        rec["provenance"]["role"]["evidence"] = "reasoned from the database schema"
        self.assertTrue(ev.cross_field_agreement_violations(rec))

    def test_ordinary_record_clean(self):
        self.assertEqual(ev.cross_field_agreement_violations(finalized()), [])


class GroundingTests(unittest.TestCase):
    def test_evidence_resolves_substring_match(self):
        self.assertTrue(ev.evidence_resolves("crashes on empty value",
                                              ["The app crashes on empty value input."]))

    def test_evidence_does_not_resolve(self):
        self.assertFalse(ev.evidence_resolves("nonexistent claim", ["unrelated text"]))

    def test_categorize_explicit(self):
        entry = {"source": "EXPLICIT", "evidence": "crash", "confidence": 0.9}
        cat = ev.categorize_grounding("role", entry, source_segments=["a crash happens"],
                                       confidence_threshold=0.6, flagged_uncertain=False)
        self.assertEqual(cat, "EXPLICITLY_STATED")

    def test_categorize_unsupported_when_evidence_absent(self):
        entry = {"source": "EXPLICIT", "evidence": "never said", "confidence": 0.9}
        cat = ev.categorize_grounding("role", entry, source_segments=["totally different text"],
                                       confidence_threshold=0.6, flagged_uncertain=False)
        self.assertEqual(cat, "UNSUPPORTED")

    def test_unsupported_checked_before_uncertain(self):
        # low confidence AND unresolved evidence -- unsupported wins (README
        # tie-break judgment call)
        entry = {"source": "EXPLICIT", "evidence": "never said", "confidence": 0.2}
        cat = ev.categorize_grounding("role", entry, source_segments=["different"],
                                       confidence_threshold=0.6, flagged_uncertain=False)
        self.assertEqual(cat, "UNSUPPORTED")

    def test_unknown_source_not_graded(self):
        entry = {"source": "UNKNOWN", "evidence": None, "confidence": None}
        cat = ev.categorize_grounding("role", entry, source_segments=[],
                                       confidence_threshold=0.6, flagged_uncertain=False)
        self.assertEqual(cat, "UNKNOWN")

    def test_grounding_breakdown_covers_every_field(self):
        rec = finalized()
        breakdown = ev.grounding_breakdown(
            rec, source_segments=["Discount input throws when submitted empty.",
                                    "small UI fix, no deep context needed",
                                    "single component, one code path"],
            confidence_threshold=0.6, uncertain_fields=set())
        self.assertEqual(set(breakdown), set(rec["provenance"]))


class HallucinationTests(unittest.TestCase):
    def test_rate_computed_from_unsupported_claims(self):
        items = [
            {"grounding": {"role": "UNSUPPORTED", "task_type": "EXPLICITLY_STATED"},
             "hallucination_types": {"role": "fabricated_entity"}},
        ]
        result = ev.hallucination_breakdown(items)
        self.assertAlmostEqual(result["hallucination_rate"], 0.5)
        self.assertEqual(result["by_type"]["fabricated_entity"]["count"], 1)

    def test_no_claims_gives_none_rate(self):
        result = ev.hallucination_breakdown([{"grounding": {}}])
        self.assertIsNone(result["hallucination_rate"])

    def test_never_a_single_collapsed_score_by_type(self):
        result = ev.hallucination_breakdown([])
        self.assertIsInstance(result["by_type"], dict)
        self.assertIn("fabricated_dependency", result["by_type"])

    def test_evidence_claimed_for_unknown_reuses_schema_rule(self):
        rec = finalized()
        rec["task"]["role"] = "Unknown"
        rec["provenance"]["role"] = {"source": "UNKNOWN", "evidence": "should be null",
                                       "confidence": None}
        violations = ev.evidence_claimed_for_unknown_violations(rec)
        self.assertTrue(violations)


class CalibrationTests(unittest.TestCase):
    def test_calibration_curve_buckets(self):
        rows = [(0.95, True), (0.91, True), (0.1, False)]
        curve = ev.calibration_curve(rows, n_buckets=10)
        self.assertEqual(len(curve), 10)
        self.assertEqual(curve[9]["n"], 2)  # both high-confidence rows

    def test_ece_zero_for_perfect_calibration(self):
        # every confidence-0.5 bucket exactly 50% correct
        rows = [(0.55, True), (0.55, False)]
        ece = ev.expected_calibration_error(rows, n_buckets=10)
        self.assertLess(ece, 0.1)

    def test_ece_none_when_no_data(self):
        self.assertIsNone(ev.expected_calibration_error([]))

    def test_abstention_precision_recall(self):
        preds = [(True, True), (True, False), (False, True), (False, False)]
        result = ev.abstention_precision_recall(preds)
        self.assertAlmostEqual(result["precision"], 0.5)
        self.assertAlmostEqual(result["recall"], 0.5)

    def test_abstention_precision_recall_empty(self):
        result = ev.abstention_precision_recall([])
        self.assertIsNone(result["precision"])
        self.assertIsNone(result["recall"])


class BenchmarkScopeTests(unittest.TestCase):
    def test_generalization_only_test(self):
        self.assertEqual(ev.benchmark_scope_violations("generalization", {"test"}), [])

    def test_adversarial_pooled_into_generalization_flagged(self):
        violations = ev.benchmark_scope_violations("generalization", {"test", "adversarial"})
        self.assertTrue(violations)

    def test_unknown_benchmark(self):
        self.assertTrue(ev.benchmark_scope_violations("not_a_benchmark", {"test"}))

    def test_calibration_allows_test_and_hard_case(self):
        self.assertEqual(ev.benchmark_scope_violations("calibration", {"test", "hard_case"}), [])


class HumanEvalTests(unittest.TestCase):
    def test_stratified_sample_deterministic(self):
        records = [{"axis": "a", "id": i} for i in range(5)] + [{"axis": "b", "id": i} for i in range(5)]
        s1 = ev.stratified_sample(records, strata_key=lambda r: r["axis"], n_per_stratum=2)
        s2 = ev.stratified_sample(records, strata_key=lambda r: r["axis"], n_per_stratum=2)
        self.assertEqual(s1, s2)
        self.assertEqual(len(s1), 4)

    def test_human_agreement_rate(self):
        judgments = [("Backend", "Backend"), ("Frontend", "Backend")]
        self.assertAlmostEqual(ev.human_agreement_rate(judgments), 0.5)

    def test_human_agreement_rate_empty(self):
        self.assertIsNone(ev.human_agreement_rate([]))

    def test_escalation_required_on_fact_not_style(self):
        review = {"faithfulness_violation": True}
        self.assertTrue(ev.escalation_required(review, fact_not_style=True))

    def test_escalation_not_required_for_style_disagreement(self):
        review = {"faithfulness_violation": True}
        self.assertFalse(ev.escalation_required(review, fact_not_style=False))


class ContextEvaluationTests(unittest.TestCase):
    def test_not_active_for_unpromoted_tier(self):
        result = ev.context_tier_comparison("issue_and_relevant_code", {1}, None)
        self.assertEqual(result["status"], "[NOT ACTIVE]")

    def test_active_for_promoted_tier(self):
        result = ev.context_tier_comparison("issue_and_repository", {1, 2}, {"role_uplift": 0.05})
        self.assertEqual(result["status"], "active")

    def test_unknown_rung(self):
        result = ev.context_tier_comparison("not_a_rung", {1}, None)
        self.assertEqual(result["status"], "UNKNOWN_RUNG")


class ReportingCubeTests(unittest.TestCase):
    def test_bare_scalar_report_flagged(self):
        run = ev.EvaluationRun(checkpoint_id="c1", benchmark="generalization",
                                l0={"structural_validity": 1.0})
        violations = ev.malformed_report_violations(run)
        self.assertTrue(any("bare scalar" in v for v in violations))

    def test_full_cube_not_flagged_for_missing_axes(self):
        run = ev.EvaluationRun(checkpoint_id="c1", benchmark="generalization",
                                l0={"structural_validity": 1.0},
                                by_axis={"role": {"Backend": {"accuracy": 0.9}}})
        violations = ev.malformed_report_violations(run)
        self.assertEqual(violations, [])

    def test_unknown_axis_flagged(self):
        run = ev.EvaluationRun(checkpoint_id="c1", benchmark="generalization",
                                l0={"structural_validity": 1.0},
                                by_axis={"not_an_axis": {}})
        violations = ev.malformed_report_violations(run)
        self.assertTrue(any("unknown reporting axis" in v for v in violations))

    def test_blended_human_and_automated_column_flagged(self):
        run = ev.EvaluationRun(checkpoint_id="c1", benchmark="generalization",
                                l0={"structural_validity": 1.0},
                                by_axis={"role": {}},
                                l1={"faithfulness": 0.9},
                                human_columns={"faithfulness": {"Backend": 0.8}})
        violations = ev.malformed_report_violations(run)
        self.assertTrue(any("blended" in v for v in violations))


class AcceptanceVerdictTests(unittest.TestCase):
    def _run(self, **overrides):
        base = dict(checkpoint_id="c1", benchmark="generalization",
                    l0={"structural_validity": 1.0}, by_axis={"role": {}},
                    hallucination={"by_type": {}})
        base.update(overrides)
        return ev.EvaluationRun(**base)

    def test_clear_when_l0_perfect_and_no_blockers(self):
        run = self._run()
        verdict = ev.acceptance_verdict(run, per_cell_thresholds={},
                                         hallucination_ceilings={}, regression_reappearances=0)
        self.assertEqual(verdict["verdict"], "clear")

    def test_l0_below_100_blocks(self):
        run = self._run(l0={"structural_validity": 0.98})
        verdict = ev.acceptance_verdict(run, per_cell_thresholds={},
                                         hallucination_ceilings={}, regression_reappearances=0)
        self.assertEqual(verdict["verdict"], "blocked")

    def test_regression_reappearance_blocks(self):
        run = self._run()
        verdict = ev.acceptance_verdict(run, per_cell_thresholds={},
                                         hallucination_ceilings={}, regression_reappearances=1)
        self.assertEqual(verdict["verdict"], "blocked")

    def test_hallucination_ceiling_exceeded_blocks(self):
        run = self._run(hallucination={"by_type": {"fabricated_entity": {"count": 5, "total": 10}}})
        verdict = ev.acceptance_verdict(run, per_cell_thresholds={},
                                         hallucination_ceilings={"fabricated_entity": 0.1},
                                         regression_reappearances=0)
        self.assertEqual(verdict["verdict"], "blocked")

    def test_insufficient_data_cell_not_defaulted_to_pass_or_fail(self):
        run = self._run()
        verdict = ev.acceptance_verdict(
            run, per_cell_thresholds={("role", "Security"): {"actual": None, "min": 0.8}},
            hallucination_ceilings={}, regression_reappearances=0)
        self.assertEqual(verdict["cells"][("role", "Security")], "[INSUFFICIENT DATA]")

    def test_cell_below_threshold_fails_and_blocks(self):
        run = self._run()
        verdict = ev.acceptance_verdict(
            run, per_cell_thresholds={("role", "Security"): {"actual": 0.5, "min": 0.8}},
            hallucination_ceilings={}, regression_reappearances=0)
        self.assertEqual(verdict["cells"][("role", "Security")], "fail")
        self.assertEqual(verdict["verdict"], "blocked")


if __name__ == "__main__":
    unittest.main()
