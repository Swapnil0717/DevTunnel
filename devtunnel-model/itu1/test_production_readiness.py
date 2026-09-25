import unittest
import uuid

import architecture as arch
import derived
import production_readiness as pr
from test_schema import base_record


def finalized():
    return derived.finalize(base_record())


def valid_task_id_record():
    rec = finalized()
    rec["task_identity"]["task_id"] = str(uuid.uuid4())
    return rec


# --------------------------------------------------------------- Section 1
class ChecklistTests(unittest.TestCase):
    def test_all_pass_is_clean(self):
        results = {i: "PASS" for i in pr.CHECKLIST_IDS}
        self.assertEqual(pr.checklist_violations(results), [])

    def test_missing_blocking_item_is_violation(self):
        results = {i: "PASS" for i in pr.CHECKLIST_IDS if i != 1}
        self.assertTrue(any("item 1" in v for v in pr.checklist_violations(results)))

    def test_blocking_item_na_is_violation(self):
        results = {i: "PASS" for i in pr.CHECKLIST_IDS}
        results[3] = "N/A"
        self.assertTrue(any("item 3" in v for v in pr.checklist_violations(results)))

    def test_major_item_fail_is_not_blocking_violation(self):
        results = {i: "PASS" for i in pr.CHECKLIST_IDS}
        results[11] = "FAIL"
        self.assertEqual(pr.checklist_violations(results), [])

    def test_unrecognized_status_flagged(self):
        results = {i: "PASS" for i in pr.CHECKLIST_IDS}
        results[1] = "MAYBE"
        self.assertTrue(any("unrecognized status" in v for v in pr.checklist_violations(results)))

    def test_major_shortfalls(self):
        results = {i: "PASS" for i in pr.CHECKLIST_IDS}
        results[11] = "FAIL"
        results[12] = "N/A"
        self.assertEqual(set(pr.major_shortfalls(results)), {11, 12})

    def test_blocking_items_are_exactly_spec_b_rows(self):
        self.assertEqual(pr.BLOCKING_ITEMS, {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16})
        self.assertEqual(pr.MAJOR_ITEMS, {11, 12, 13, 14})


# ------------------------------------------------------------- Section 2.1
class CapabilityTests(unittest.TestCase):
    def test_meets_threshold(self):
        r = pr.CapabilityResult("task_type", 0.9, 0.85, 250)
        self.assertEqual(pr.capability_violations(r, 0.80), [])

    def test_below_ci_lower_flagged(self):
        r = pr.CapabilityResult("role", 0.85, 0.79, 250)
        self.assertTrue(pr.capability_violations(r, 0.80))

    def test_small_sample_flagged(self):
        r = pr.CapabilityResult("role", 0.95, 0.9, 50)
        out = pr.capability_violations(r, 0.80)
        self.assertTrue(any("sample size" in v for v in out))

    def test_complexity_all_three_pass(self):
        out = pr.complexity_capability_violations(
            exact_match=pr.CapabilityResult("exact", 0.75, 0.72, 250),
            within_one_level=pr.CapabilityResult("within1", 0.97, 0.96, 250),
            overstatement_rate=0.03,
        )
        self.assertEqual(out, [])

    def test_complexity_overstatement_fails(self):
        out = pr.complexity_capability_violations(
            exact_match=pr.CapabilityResult("exact", 0.75, 0.72, 250),
            within_one_level=pr.CapabilityResult("within1", 0.97, 0.96, 250),
            overstatement_rate=0.10,
        )
        self.assertTrue(any("overstatement" in v for v in out))

    def test_experience_level_violations(self):
        out = pr.experience_level_violations(
            agreement_when_assigned=pr.CapabilityResult("agree", 0.5, 0.4, 250),
            abstention_on_no_evidence=pr.CapabilityResult("abstain", 0.99, 0.99, 250),
        )
        self.assertTrue(any("agree" in v for v in out))


# ------------------------------------------------------------- Section 2.2
class InvariantTests(unittest.TestCase):
    def test_valid_record_has_no_invariant_9_violations(self):
        self.assertEqual(pr.invariant_9_violations(valid_task_id_record()), [])

    def test_non_v4_uuid_violates(self):
        rec = finalized()  # task_id is 00000000-...-000000001, version 0
        self.assertTrue(pr.invariant_9_violations(rec))

    def test_task_id_derived_from_issue_number_violates(self):
        rec = valid_task_id_record()
        rec["task_identity"]["task_id"] = "42-" + rec["task_identity"]["task_id"][3:]
        self.assertTrue(pr.invariant_9_violations(rec))

    def test_missing_snapshot_fetched_at_violates(self):
        rec = valid_task_id_record()
        del rec["task_identity"]["source_issue"]["snapshot_fetched_at"]
        self.assertTrue(pr.invariant_9_violations(rec))

    def test_validate_invariants_clean_on_valid_record(self):
        self.assertEqual(pr.validate_invariants(valid_task_id_record()), [])

    def test_validate_invariants_catches_schema_and_derived_breaks(self):
        rec = valid_task_id_record()
        rec["review"]["review_required"] = not rec["review"]["review_required"]
        out = pr.validate_invariants(rec)
        self.assertTrue(any("rule 11" in v for v in out))


# ------------------------------------------------------------- Section 2.3
class CalibrationTests(unittest.TestCase):
    def _good_rows(self):
        rows = []
        rows += [(0.95, True)] * 20 + [(0.95, False)] * 1
        rows += [(0.8, True)] * 15 + [(0.8, False)] * 4
        rows += [(0.5, True)] * 5 + [(0.5, False)] * 5
        return rows

    def test_monotonic_true_on_well_behaved_rows(self):
        self.assertTrue(pr.monotonic_calibration(self._good_rows()))

    def test_monotonic_false_when_inverted(self):
        rows = [(0.95, False)] * 10 + [(0.5, True)] * 10
        self.assertFalse(pr.monotonic_calibration(rows))

    def test_high_confidence_error_rate(self):
        rows = self._good_rows()
        rate = pr.high_confidence_error_rate(rows)
        self.assertAlmostEqual(rate, 1 / 21)

    def test_high_confidence_error_rate_none_when_no_high_conf_rows(self):
        rows = [(0.5, True), (0.6, False)]
        self.assertIsNone(pr.high_confidence_error_rate(rows))

    def test_calibration_violations_clean(self):
        rows = self._good_rows()
        out = pr.calibration_violations(rows, overall_rows=rows)
        self.assertEqual(out, [])

    def test_calibration_violations_flags_bad_ece(self):
        rows = [(0.95, False)] * 10 + [(0.5, True)] * 10
        out = pr.calibration_violations(rows)
        self.assertTrue(any("ECE" in v for v in out) or any("not monotonic" in v for v in out))

    def test_calibration_violations_flags_unflagged_below_threshold(self):
        out = pr.calibration_violations(self._good_rows(), below_threshold_flagged=False)
        self.assertTrue(any("did not trigger review" in v for v in out))


# ----------------------------------------------------------------- Section 3
class SeverityTests(unittest.TestCase):
    def test_s0(self):
        self.assertEqual(pr.assign_severity_s(fabrication_or_hidden_uncertainty=True), "S0")

    def test_s1(self):
        self.assertEqual(pr.assign_severity_s(wrong_classification_confident=True), "S1")

    def test_s2(self):
        self.assertEqual(
            pr.assign_severity_s(wrong_but_flagged_or_minor_unsupported=True), "S2")

    def test_default_s3(self):
        self.assertEqual(pr.assign_severity_s(), "S3")

    def test_s0_wins_over_others(self):
        self.assertEqual(
            pr.assign_severity_s(fabrication_or_hidden_uncertainty=True,
                                  wrong_classification_confident=True), "S0")

    def test_zero_failure_upper_bound(self):
        self.assertAlmostEqual(pr.zero_failure_upper_bound(300), 0.01)
        self.assertIsNone(pr.zero_failure_upper_bound(0))


def _clean_counts(**overrides):
    base = dict(total_records=1000, s0_count=0, s1_count=0, s2_count=0,
                schema_invalid_count=0, invariant_violation_count=0,
                complexity_overstatement_rate=0.02,
                unsupported_experience_in_no_evidence_set=0,
                regression_worst_drop_points=0.5, regression_new_s0_or_s1=0,
                determinism_within_tolerance=True)
    base.update(overrides)
    return pr.ReleaseCounts(**base)


class ReleaseGateTests(unittest.TestCase):
    def test_clean_counts_no_violations(self):
        self.assertEqual(pr.release_gate_violations(_clean_counts()), [])

    def test_any_s0_is_no_go(self):
        out = pr.release_gate_violations(_clean_counts(s0_count=1))
        self.assertTrue(any("S0" in v for v in out))

    def test_s1_rate_over_one_percent(self):
        out = pr.release_gate_violations(_clean_counts(s1_count=20))
        self.assertTrue(any("S1 rate" in v for v in out))

    def test_s2_conditional(self):
        out = pr.release_gate_violations(_clean_counts(s2_count=100))
        self.assertTrue(any("CONDITIONAL" in v for v in out))

    def test_complexity_overstatement_conditional_then_nogo(self):
        cond = pr.release_gate_violations(_clean_counts(complexity_overstatement_rate=0.06))
        self.assertTrue(any("CONDITIONAL" in v for v in cond))
        nogo = pr.release_gate_violations(_clean_counts(complexity_overstatement_rate=0.09))
        self.assertTrue(any("exceeds 8%" in v for v in nogo))

    def test_unsupported_experience_blocks(self):
        out = pr.release_gate_violations(
            _clean_counts(unsupported_experience_in_no_evidence_set=1))
        self.assertTrue(any("unsupported experience" in v for v in out))

    def test_regression_drop_blocks(self):
        out = pr.release_gate_violations(_clean_counts(regression_worst_drop_points=3.0))
        self.assertTrue(any("regression drop" in v for v in out))

    def test_regression_new_s0_s1_blocks(self):
        out = pr.release_gate_violations(_clean_counts(regression_new_s0_or_s1=2))
        self.assertTrue(any("new S0/S1" in v for v in out))

    def test_determinism_failure_blocks(self):
        out = pr.release_gate_violations(_clean_counts(determinism_within_tolerance=False))
        self.assertTrue(any("Determinism" in v for v in out))


# ----------------------------------------------------------------- Section 4
class SuiteCompositionTests(unittest.TestCase):
    def test_meets_minimums(self):
        counts = {"normal": 200, "hard": 100, "ambiguous": 100,
                  "adversarial": 100, "context_aware": 100}
        self.assertEqual(pr.suite_composition_violations(counts), [])

    def test_below_minimum_flagged(self):
        counts = {"normal": 50, "hard": 100, "ambiguous": 100,
                  "adversarial": 100, "context_aware": 100}
        out = pr.suite_composition_violations(counts)
        self.assertTrue(any("normal" in v for v in out))

    def test_missing_category_treated_as_zero(self):
        out = pr.suite_composition_violations({})
        self.assertEqual(len(out), len(pr.SUITE_MINIMUMS))

    def test_regression_suite_composition(self):
        self.assertEqual(
            pr.regression_suite_violations(
                case_count=10, includes_all_prior_failures=True,
                includes_stratified_prior_passes=True),
            [])
        out = pr.regression_suite_violations(
            case_count=0, includes_all_prior_failures=False,
            includes_stratified_prior_passes=False)
        self.assertEqual(len(out), 3)


# ----------------------------------------------------------------- Section 5
class ReliabilityTests(unittest.TestCase):
    def test_repeat_consistency_pass(self):
        self.assertEqual(pr.repeat_consistency_violations(0.97), [])

    def test_repeat_consistency_fail(self):
        out = pr.repeat_consistency_violations(0.80, new_unsupported_claims=2)
        self.assertEqual(len(out), 2)

    def test_stability_generic(self):
        self.assertEqual(pr.stability_violations("paraphrase", 0.95), [])
        out = pr.stability_violations("paraphrase", 0.5, s0_introduced=True)
        self.assertEqual(len(out), 2)

    def test_irrelevant_noise(self):
        self.assertEqual(
            pr.irrelevant_noise_violations(classification_changed=False,
                                            new_technology_or_dependency=False), [])
        out = pr.irrelevant_noise_violations(classification_changed=True,
                                              new_technology_or_dependency=True)
        self.assertEqual(len(out), 2)

    def test_reproducibility_deterministic_must_be_bitwise(self):
        self.assertEqual(
            pr.reproducibility_violations(deterministic_decoding=True, bitwise_identical=True),
            [])
        out = pr.reproducibility_violations(deterministic_decoding=True, bitwise_identical=False)
        self.assertTrue(out)

    def test_reproducibility_non_deterministic_needs_98_agreement(self):
        self.assertEqual(
            pr.reproducibility_violations(deterministic_decoding=False,
                                           field_level_agreement=0.99,
                                           schema_validity_identical=True),
            [])
        out = pr.reproducibility_violations(deterministic_decoding=False,
                                             field_level_agreement=0.9,
                                             schema_validity_identical=False)
        self.assertEqual(len(out), 2)

    def test_snapshot_integrity(self):
        self.assertEqual(
            pr.snapshot_integrity_violations(issue_edited_after_snapshot=True,
                                              output_reflects_edit=False), [])
        self.assertTrue(
            pr.snapshot_integrity_violations(issue_edited_after_snapshot=True,
                                              output_reflects_edit=True))

    def test_load_independent_quality(self):
        self.assertEqual(
            pr.load_independent_quality_violations(concurrent_metric=0.9, serial_metric=0.9), [])
        self.assertTrue(
            pr.load_independent_quality_violations(concurrent_metric=0.7, serial_metric=0.9))


# ----------------------------------------------------------------- Section 6
class GroundingCapTests(unittest.TestCase):
    def test_inferred_within_cap_ok(self):
        rec = valid_task_id_record()
        rec["provenance"]["experience_level"]["confidence"] = 0.7
        self.assertEqual(pr.evidence_confidence_cap_violations(rec), [])

    def test_inferred_over_cap_violates(self):
        rec = valid_task_id_record()
        rec["provenance"]["experience_level"]["confidence"] = 0.9
        out = pr.evidence_confidence_cap_violations(rec)
        self.assertTrue(any("experience_level" in v for v in out))

    def test_explicit_over_point9_without_unambiguous_flag_violates(self):
        rec = valid_task_id_record()
        rec["provenance"]["title"]["confidence"] = 0.95
        out = pr.evidence_confidence_cap_violations(rec)
        self.assertTrue(any("title" in v for v in out))

    def test_explicit_over_point9_with_unambiguous_flag_ok(self):
        rec = valid_task_id_record()
        rec["provenance"]["title"]["confidence"] = 0.95
        out = pr.evidence_confidence_cap_violations(rec, unambiguous_explicit_fields=["title"])
        self.assertFalse(any("title" in v for v in out))

    def test_repository_fact_grounding(self):
        rec = valid_task_id_record()
        rec["provenance"]["technologies"]["evidence"] = "uses React for the frontend"
        ok = pr.repository_fact_grounding_violations(
            rec, source_segments=["This bug uses React for the frontend."],
            repo_fact_fields=["technologies"])
        self.assertEqual(ok, [])
        bad = pr.repository_fact_grounding_violations(
            rec, source_segments=["totally unrelated text"],
            repo_fact_fields=["technologies"])
        self.assertTrue(bad)


# ----------------------------------------------------------------- Section 7
class HallucinationReleaseTests(unittest.TestCase):
    def test_all_zero_rates_clean(self):
        rates = {k: 0.0 for k in pr.HALLUCINATION_RELEASE_CEILINGS}
        self.assertEqual(pr.hallucination_release_violations(rates), [])

    def test_missing_category_flagged(self):
        rates = {k: 0.0 for k in pr.HALLUCINATION_RELEASE_CEILINGS if k != "files_and_paths"}
        out = pr.hallucination_release_violations(rates)
        self.assertTrue(any("files_and_paths" in v and "no measurement" in v for v in out))

    def test_over_ceiling_flagged(self):
        rates = {k: 0.0 for k in pr.HALLUCINATION_RELEASE_CEILINGS}
        rates["technologies"] = 0.10
        out = pr.hallucination_release_violations(rates)
        self.assertTrue(any("technologies" in v for v in out))


# ----------------------------------------------------------------- Section 8
class ProductionReviewTriggerTests(unittest.TestCase):
    def _clean_ctx(self, **overrides):
        base = dict(role="Frontend", task_type="Bug", complexity="Low",
                    overall_confidence=0.9, uncertain_fields=frozenset())
        base.update(overrides)
        return pr.ProductionReviewContext(**base)

    def test_no_triggers_on_clean_context(self):
        self.assertEqual(pr.production_review_triggers(self._clean_ctx()), [])

    def test_unknown_task_type_triggers_p1(self):
        fired = pr.production_review_triggers(self._clean_ctx(task_type="Unknown"))
        self.assertTrue(any(f.startswith("P1") for f in fired))

    def test_low_confidence_triggers_p2(self):
        fired = pr.production_review_triggers(self._clean_ctx(overall_confidence=0.5))
        self.assertTrue(any(f.startswith("P2") for f in fired))

    def test_conflicting_evidence_triggers_p3(self):
        fired = pr.production_review_triggers(self._clean_ctx(conflicting_evidence=True))
        self.assertTrue(any(f.startswith("P3") for f in fired))

    def test_missing_body_triggers_p4(self):
        fired = pr.production_review_triggers(
            self._clean_ctx(issue_body_missing_or_empty=True))
        self.assertTrue(any(f.startswith("P4") for f in fired))

    def test_injection_triggers_p5(self):
        fired = pr.production_review_triggers(self._clean_ctx(injection_detected=True))
        self.assertTrue(any(f.startswith("P5") for f in fired))

    def test_context_fetch_failed_triggers_p6(self):
        fired = pr.production_review_triggers(
            self._clean_ctx(context_fetch_failed_or_inconsistent=True))
        self.assertTrue(any(f.startswith("P6") for f in fired))

    def test_inferred_below_threshold_triggers_p7(self):
        fired = pr.production_review_triggers(
            self._clean_ctx(inferred_below_threshold_fields=frozenset({"complexity"})))
        self.assertTrue(any(f.startswith("P7") for f in fired))

    def test_uncertainty_visibility(self):
        self.assertEqual(pr.uncertainty_visibility_violations({}), [])
        self.assertTrue(pr.uncertainty_visibility_violations({}, summary_overclaims=True))


# ------------------------------------------------------------- Section 8.3
class LadderTierTests(unittest.TestCase):
    def test_t0_full_confident_result(self):
        rec = valid_task_id_record()
        rec["review"]["review_required"] = False
        self.assertEqual(pr.classify_ladder_tier(rec), "T0")

    def test_t1_review_required_no_unknown(self):
        rec = valid_task_id_record()
        rec["review"]["review_required"] = True
        self.assertEqual(pr.classify_ladder_tier(rec), "T1")

    def test_t2_unknown_classification_field(self):
        rec = valid_task_id_record()
        rec["task"]["role"] = "Unknown"
        rec["provenance"]["role"] = {"source": "UNKNOWN", "evidence": None, "confidence": None}
        rec = derived.finalize(rec)
        rec["task_identity"]["task_id"] = str(uuid.uuid4())
        self.assertEqual(pr.classify_ladder_tier(rec), "T2")

    def test_t3_all_unknown_no_criteria_low_confidence(self):
        rec = valid_task_id_record()
        for f in list(rec["provenance"]):
            rec["provenance"][f] = {"source": "UNKNOWN", "evidence": None, "confidence": None}
        for f in ("role", "experience_level", "complexity", "task_type"):
            rec["task"][f] = "Unknown"
        rec["task"]["acceptance_criteria"] = []
        rec = derived.finalize(rec)
        rec["task_identity"]["task_id"] = str(uuid.uuid4())
        self.assertEqual(pr.classify_ladder_tier(rec), "T3")

    def test_t4_rejected_result(self):
        rejected = arch.RejectedResult(reason_codes=["missing required input fields"])
        self.assertEqual(pr.classify_ladder_tier(rejected), "T4")

    def test_ladder_behavior_t4_requires_rejected(self):
        rec = valid_task_id_record()
        self.assertTrue(pr.ladder_behavior_violations(rec, "T4"))

    def test_ladder_behavior_t1_requires_review(self):
        rec = valid_task_id_record()
        rec["review"]["review_required"] = False
        self.assertTrue(pr.ladder_behavior_violations(rec, "T1"))

    def test_ladder_behavior_t3_requires_empty_criteria(self):
        rec = valid_task_id_record()
        rec["review"]["review_required"] = True
        out = pr.ladder_behavior_violations(rec, "T3")
        self.assertTrue(any("acceptance_criteria" in v for v in out))

    def test_failure_ladder_acceptance_clean(self):
        pairs = [("T3", "T3")] * 45 + [("T2", "T2")] * 45 + [("T4", "T4")] * 10
        result = pr.failure_ladder_acceptance(pairs)
        self.assertEqual(result["accuracy"], 1.0)
        self.assertEqual(result["violations"], [])

    def test_failure_ladder_acceptance_overconfident_counts_as_failure(self):
        pairs = [("T3", "T0")] * 10 + [("T3", "T3")] * 90
        result = pr.failure_ladder_acceptance(pairs)
        self.assertTrue(any("more confident" in v for v in result["violations"]))

    def test_failure_ladder_acceptance_fabrication_and_silence(self):
        pairs = [("T3", "T3")] * 100
        result = pr.failure_ladder_acceptance(
            pairs, fabricated_full_record_on_t3_t4=1, silent_failures=2)
        self.assertEqual(len(result["violations"]), 2)


# ----------------------------------------------------------------- Section 9
class DecisionRuleTests(unittest.TestCase):
    def _clean_checklist(self):
        return {i: "PASS" for i in pr.CHECKLIST_IDS}

    def test_go(self):
        decision = pr.decision_rule(
            checklist_results=self._clean_checklist(), s0_count=0, s1_rate=0.0,
            regression_within_tolerance=True, reproducibility_confirmed=True)
        self.assertEqual(decision, "GO")

    def test_nogo_on_blocking_fail(self):
        results = self._clean_checklist()
        results[1] = "FAIL"
        decision = pr.decision_rule(
            checklist_results=results, s0_count=0, s1_rate=0.0,
            regression_within_tolerance=True, reproducibility_confirmed=True)
        self.assertEqual(decision, "NO-GO")

    def test_nogo_on_s0(self):
        decision = pr.decision_rule(
            checklist_results=self._clean_checklist(), s0_count=1, s1_rate=0.0,
            regression_within_tolerance=True, reproducibility_confirmed=True)
        self.assertEqual(decision, "NO-GO")

    def test_conditional_go_with_mitigated_major_shortfall(self):
        results = self._clean_checklist()
        results[11] = "FAIL"
        decision = pr.decision_rule(
            checklist_results=results, s0_count=0, s1_rate=0.0,
            regression_within_tolerance=True, reproducibility_confirmed=True,
            major_mitigations=[pr.MajorMitigation(11, 2.0, "forced human review", "2026-11-01")])
        self.assertEqual(decision, "CONDITIONAL GO")

    def test_nogo_when_major_shortfall_unmitigated(self):
        results = self._clean_checklist()
        results[11] = "FAIL"
        decision = pr.decision_rule(
            checklist_results=results, s0_count=0, s1_rate=0.0,
            regression_within_tolerance=True, reproducibility_confirmed=True)
        self.assertEqual(decision, "NO-GO")

    def test_nogo_when_more_than_two_major_shortfalls(self):
        results = self._clean_checklist()
        results[11] = results[12] = results[13] = "FAIL"
        mitigations = [pr.MajorMitigation(i, 1.0, "x", "2026-11-01") for i in (11, 12, 13)]
        decision = pr.decision_rule(
            checklist_results=results, s0_count=0, s1_rate=0.0,
            regression_within_tolerance=True, reproducibility_confirmed=True,
            major_mitigations=mitigations)
        self.assertEqual(decision, "NO-GO")

    def test_nogo_when_mitigation_exceeds_3_points(self):
        results = self._clean_checklist()
        results[11] = "FAIL"
        decision = pr.decision_rule(
            checklist_results=results, s0_count=0, s1_rate=0.0,
            regression_within_tolerance=True, reproducibility_confirmed=True,
            major_mitigations=[pr.MajorMitigation(11, 5.0, "x", "2026-11-01")])
        self.assertEqual(decision, "NO-GO")

    def test_out_of_scope_default_tier(self):
        self.assertEqual(pr.out_of_scope_default_tier(), "T1_or_lower")


# --------------------------------------------------------------- Section 9.4
class SchemaFindingsTests(unittest.TestCase):
    def test_all_resolved_clean(self):
        status = {i: "resolved" for i in pr.SCHEMA_FINDING_IDS}
        self.assertEqual(pr.schema_findings_violations(status), [])

    def test_accepted_also_clean(self):
        status = {i: "accepted" for i in pr.SCHEMA_FINDING_IDS}
        self.assertEqual(pr.schema_findings_violations(status), [])

    def test_missing_finding_flagged(self):
        status = {i: "resolved" for i in pr.SCHEMA_FINDING_IDS if i != 2}
        out = pr.schema_findings_violations(status)
        self.assertTrue(any("finding 2" in v for v in out))


# --------------------------------------------------------------- Section 10
class DecisionRecordTests(unittest.TestCase):
    def test_pending_template_is_clean(self):
        record = pr.pending_decision_record("P19-20260101-1")
        self.assertEqual(pr.decision_record_completeness_violations(record), [])

    def test_pending_with_results_is_invented_outcome(self):
        record = pr.pending_decision_record("P19-20260101-1")
        record.results = {"schema_validity": "100%"}
        out = pr.decision_record_completeness_violations(record)
        self.assertTrue(any("invented outcome" in v for v in out))

    def _full_go_record(self):
        return pr.DecisionRecord(
            record_id="P19-20260101-1", decision="GO", decision_date="2026-11-01",
            decided_by="Jane R.", decided_by_independent=True,
            model_version="itu1-v1@1.2.0+abcdef012345",
            prompt_version="p19-3", schema_version="2.1.0",
            decoding_settings="temperature=0, greedy",
            confidence_weights={"required": 2, "optional": 1},
            baseline_phase18_ref="itu1-v1@1.1.0+ffffff012345",
            suite_sizes={"normal": 200}, suite_versions="release-suite-v3",
            zero_failure_bounds={"s0": 0.01},
            results={"schema_validity": "100%"},
            checklist_results={i: "PASS" for i in pr.CHECKLIST_IDS},
            open_defects=[], schema_finding_status={i: "resolved" for i in pr.SCHEMA_FINDING_IDS},
            restrictions=[], scope_of_approval="English, normal-length bug/feature issues",
            rationale="All B items pass; thresholds met on lower bounds",
            sign_off={"model_owner": "A", "independent_reviewer": "B"},
        )

    def test_complete_go_record_clean(self):
        self.assertEqual(pr.decision_record_completeness_violations(self._full_go_record()), [])

    def test_missing_field_flagged(self):
        record = self._full_go_record()
        record.rationale = None
        out = pr.decision_record_completeness_violations(record)
        self.assertTrue(any("rationale" in v for v in out))

    def test_not_independent_reviewer_flagged(self):
        record = self._full_go_record()
        record.decided_by_independent = False
        out = pr.decision_record_completeness_violations(record)
        self.assertTrue(any("independent" in v for v in out))

    def test_open_s1_defect_flagged(self):
        record = self._full_go_record()
        record.open_defects = [{"id": "D1", "severity": "S1"}]
        out = pr.decision_record_completeness_violations(record)
        self.assertTrue(any("D1" in v for v in out))

    def test_conditional_go_requires_restriction(self):
        record = self._full_go_record()
        record.decision = "CONDITIONAL GO"
        out = pr.decision_record_completeness_violations(record)
        self.assertTrue(any("restriction" in v for v in out))

    def test_go_with_restrictions_flagged(self):
        record = self._full_go_record()
        record.restrictions = [{"restriction": "x"}]
        out = pr.decision_record_completeness_violations(record)
        self.assertTrue(any("only meaningful for CONDITIONAL GO" in v for v in out))

    def test_unresolved_schema_finding_flagged(self):
        record = self._full_go_record()
        del record.schema_finding_status[2]
        out = pr.decision_record_completeness_violations(record)
        self.assertTrue(any("finding 2" in v for v in out))

    def test_incomplete_checklist_flagged(self):
        record = self._full_go_record()
        del record.checklist_results[1]
        out = pr.decision_record_completeness_violations(record)
        self.assertTrue(any("16 items" in v for v in out))

    def test_default_revalidation_triggers_present(self):
        record = pr.pending_decision_record("x")
        self.assertEqual(len(record.revalidation_triggers), 3)


if __name__ == "__main__":
    unittest.main()
