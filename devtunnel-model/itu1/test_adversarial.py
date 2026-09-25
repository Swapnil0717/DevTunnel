import unittest

import adversarial as av
import architecture as arch
import dataset as ds
from test_schema import base_record
import derived


def seg(sid, type_="ISSUE_BODY", text="body text", tier=1):
    return arch.Segment(segment_id=sid, type=type_, text=text, tier=tier)


def make_case(**overrides):
    defaults = dict(
        example_id="ex-1", dataset_id="adversarial", inclusion_type="failure_mode_probe",
        failure_mode_targeted="keyword_misdirection", taxonomy_group="A",
        construction_method="synthetic_construction", bait_element="database",
    )
    defaults.update(overrides)
    return av.AdversarialTestCase(**defaults)


class TaxonomyTests(unittest.TestCase):
    def test_six_groups(self):
        self.assertEqual(set(av.TAXONOMY_GROUPS), set("ABCDEF"))

    def test_taxonomy_group_for_failure_mode(self):
        self.assertEqual(av.taxonomy_group_for_failure_mode("role_collapse"), "C")

    def test_unknown_failure_mode_returns_none(self):
        self.assertIsNone(av.taxonomy_group_for_failure_mode("not_a_mode"))

    def test_every_failure_mode_belongs_to_exactly_one_group(self):
        seen = {}
        for group, spec in av.TAXONOMY_GROUPS.items():
            for mode in spec["failure_modes"]:
                self.assertNotIn(mode, seen, f"{mode} claimed by two groups")
                seen[mode] = group
        self.assertEqual(set(seen), set(av.FAILURE_MODES))


class FailureModeRegistryTests(unittest.TestCase):
    def test_matches_phase7_d13_gate(self):
        # dataset.py already gates on this set (Phase 7 D13); Phase 15 must
        # not silently diverge from what it closes.
        self.assertEqual(set(av.FAILURE_MODES), ds.FAILURE_MODES)

    def test_every_mode_has_a_definition(self):
        for mode, spec in av.FAILURE_MODES.items():
            self.assertTrue(spec["definition"])

    def test_check_failure_mode_pass_unknown_mode_raises(self):
        with self.assertRaises(ValueError):
            av.check_failure_mode_pass("not_a_mode", make_case(), base_record())

    def test_label_authority_override_is_human_judgment_only(self):
        case = make_case(failure_mode_targeted="label_authority_override", taxonomy_group="A")
        result = av.check_failure_mode_pass("label_authority_override", case, base_record())
        self.assertIsNone(result)


class KeywordMisdirectionPassCheckTests(unittest.TestCase):
    def test_passes_when_no_field_cites_bait(self):
        rec = base_record()
        case = make_case(bait_element="database")
        self.assertTrue(av.check_failure_mode_pass("keyword_misdirection", case, rec))

    def test_fails_when_a_field_cites_the_bait_term(self):
        rec = base_record()
        rec["provenance"]["role"]["evidence"] = "mentions database heavily"
        case = make_case(bait_element="database")
        self.assertFalse(av.check_failure_mode_pass("keyword_misdirection", case, rec))


class UnflaggedAmbiguityPassCheckTests(unittest.TestCase):
    def test_passes_on_genuine_unknown_with_missing_info(self):
        rec = base_record()
        rec["task"]["task_type"] = "Unknown"
        rec["provenance"]["task_type"] = {"source": "UNKNOWN", "evidence": None, "confidence": None}
        rec["uncertainty"]["missing_information"] = ["task_type is indeterminate"]
        case = make_case(failure_mode_targeted="unflagged_ambiguity", taxonomy_group="B",
                          target_field="task_type")
        self.assertTrue(av.check_failure_mode_pass("unflagged_ambiguity", case, rec))

    def test_fails_when_field_resolved_instead_of_flagged(self):
        rec = base_record()  # task_type is "Bug", not Unknown
        case = make_case(failure_mode_targeted="unflagged_ambiguity", taxonomy_group="B",
                          target_field="task_type")
        self.assertFalse(av.check_failure_mode_pass("unflagged_ambiguity", case, rec))


class ForcedResolutionPassCheckTests(unittest.TestCase):
    def test_passes_when_review_required_names_the_field(self):
        rec = base_record()
        rec["review"] = {"review_required": True, "review_reasons": ["complexity contradicted"]}
        case = make_case(failure_mode_targeted="forced_resolution_of_contradiction",
                          taxonomy_group="B", target_field="complexity")
        self.assertTrue(av.check_failure_mode_pass("forced_resolution_of_contradiction", case, rec))

    def test_fails_when_silently_resolved(self):
        rec = base_record()
        rec["review"] = {"review_required": False, "review_reasons": []}
        case = make_case(failure_mode_targeted="forced_resolution_of_contradiction",
                          taxonomy_group="B", target_field="complexity")
        self.assertFalse(av.check_failure_mode_pass("forced_resolution_of_contradiction", case, rec))


class RoleCollapsePassCheckTests(unittest.TestCase):
    def test_passes_on_fullstack(self):
        rec = base_record()
        rec["task"]["role"] = "Fullstack"
        case = make_case(failure_mode_targeted="role_collapse", taxonomy_group="C")
        self.assertTrue(av.check_failure_mode_pass("role_collapse", case, rec))

    def test_fails_when_collapsed_to_one_side(self):
        rec = base_record()  # role stays "Frontend"
        case = make_case(failure_mode_targeted="role_collapse", taxonomy_group="C")
        self.assertFalse(av.check_failure_mode_pass("role_collapse", case, rec))


class TechnologyAnchoringPassCheckTests(unittest.TestCase):
    def test_passes_when_incidental_tech_not_promoted(self):
        rec = base_record()  # components: ["DiscountCodeInput.tsx"]
        case = make_case(failure_mode_targeted="technology_anchoring", taxonomy_group="C",
                          metadata={"incidental_tech": ["some-stack-trace-only-lib"]})
        self.assertTrue(av.check_failure_mode_pass("technology_anchoring", case, rec))

    def test_fails_when_incidental_tech_promoted_to_components(self):
        rec = base_record()
        rec["task"]["components"].append("incidental-lib")
        case = make_case(failure_mode_targeted="technology_anchoring", taxonomy_group="C",
                          metadata={"incidental_tech": ["incidental-lib"]})
        self.assertFalse(av.check_failure_mode_pass("technology_anchoring", case, rec))


class StructuralNonRobustnessPassCheckTests(unittest.TestCase):
    def test_passes_on_valid_record(self):
        rec = derived.finalize(base_record())
        case = make_case(failure_mode_targeted="structural_non_robustness", taxonomy_group="F")
        self.assertTrue(av.check_failure_mode_pass("structural_non_robustness", case, rec))

    def test_fails_on_malformed_record(self):
        rec = derived.finalize(base_record())
        del rec["task"]["title"]
        case = make_case(failure_mode_targeted="structural_non_robustness", taxonomy_group="F")
        self.assertFalse(av.check_failure_mode_pass("structural_non_robustness", case, rec))


class UnderabstentionPassCheckTests(unittest.TestCase):
    def test_passes_when_enough_fields_unknown(self):
        rec = base_record()
        rec["task"]["role"] = "Unknown"
        case = make_case(failure_mode_targeted="underabstention", taxonomy_group="F",
                          metadata={"min_unknown_fields": 1})
        self.assertTrue(av.check_failure_mode_pass("underabstention", case, rec))

    def test_fails_when_everything_confidently_answered(self):
        rec = base_record()
        case = make_case(failure_mode_targeted="underabstention", taxonomy_group="F",
                          metadata={"min_unknown_fields": 3})
        self.assertFalse(av.check_failure_mode_pass("underabstention", case, rec))


class RelevanceDriftPassCheckTests(unittest.TestCase):
    def test_passes_when_tangent_excluded(self):
        rec = base_record()
        case = make_case(failure_mode_targeted="relevance_drift", taxonomy_group="F",
                          metadata={"tangent_text": "unrelated story about vacation plans"})
        self.assertTrue(av.check_failure_mode_pass("relevance_drift", case, rec))

    def test_fails_when_tangent_leaks_into_prose(self):
        rec = base_record()
        rec["task"]["description"] += " unrelated story about vacation plans"
        case = make_case(failure_mode_targeted="relevance_drift", taxonomy_group="F",
                          metadata={"tangent_text": "unrelated story about vacation plans"})
        self.assertFalse(av.check_failure_mode_pass("relevance_drift", case, rec))


class CaseShapeValidationTests(unittest.TestCase):
    def test_valid_case_no_errors(self):
        self.assertEqual(av.validate_case_shape(make_case()), [])

    def test_bad_dataset_id(self):
        errs = av.validate_case_shape(make_case(dataset_id="bogus"))
        self.assertTrue(errs)

    def test_failure_mode_mismatched_with_group(self):
        errs = av.validate_case_shape(make_case(failure_mode_targeted="role_collapse",
                                                  taxonomy_group="A"))
        self.assertTrue(any("not a failure mode of group" in e for e in errs))

    def test_unknown_construction_method(self):
        errs = av.validate_case_shape(make_case(construction_method="hand_waved"))
        self.assertTrue(errs)

    def test_unknown_secondary_failure_mode(self):
        errs = av.validate_case_shape(make_case(secondary_failure_modes=("nope",)))
        self.assertTrue(errs)


class ConstructionRuleTests(unittest.TestCase):
    def test_bait_zero_signal_clean(self):
        self.assertEqual(av.bait_zero_signal_violations("database", ["it crashes on submit"]), [])

    def test_bait_zero_signal_violated(self):
        errs = av.bait_zero_signal_violations("database",
                                               ["the database schema needs a migration"])
        self.assertTrue(errs)

    def test_group_b_submodes_not_merged(self):
        errs = av.group_b_submode_violations(has_both_statements=True, is_single_ambiguous=True)
        self.assertTrue(errs)

    def test_group_b_submodes_ok_when_distinct(self):
        self.assertEqual(av.group_b_submode_violations(True, False), [])

    def test_bait_only_signal_must_route_to_group_b(self):
        errs = av.bait_only_signal_violations(bait_is_only_content=True, taxonomy_group="A")
        self.assertTrue(errs)

    def test_bait_only_signal_ok_when_already_group_b(self):
        self.assertEqual(av.bait_only_signal_violations(True, "B"), [])

    def test_compounding_share_within_target(self):
        self.assertEqual(av.compounding_share_violations(100, 10), [])

    def test_compounding_share_exceeds_target(self):
        errs = av.compounding_share_violations(100, 20)
        self.assertTrue(errs)

    def test_compounding_zero_total(self):
        self.assertEqual(av.compounding_share_violations(0, 0), [])


class ExpectedBehaviorTests(unittest.TestCase):
    def test_eight_dimensions(self):
        self.assertEqual(len(av.EXPECTED_BEHAVIOR_DIMENSIONS), 8)

    def test_each_bound_to_at_least_one_group(self):
        for dim in av.EXPECTED_BEHAVIOR_DIMENSIONS:
            self.assertTrue(dim["bound_to"])


class HardConfusablePairTests(unittest.TestCase):
    def test_eight_pairs(self):
        self.assertEqual(len(av.HARD_CONFUSABLE_PAIRS), 8)

    def test_pair_matrix_min_instances_enforced(self):
        errs = av.pair_matrix_violations("beginner_intermediate", 5)
        self.assertTrue(errs)

    def test_pair_matrix_ok_above_minimum(self):
        self.assertEqual(av.pair_matrix_violations("beginner_intermediate", 20), [])

    def test_unknown_pair_name(self):
        self.assertTrue(av.pair_matrix_violations("nonexistent_pair", 30))

    def test_systematic_collapse_detected(self):
        self.assertTrue(av.pair_systematic_collapse("low_medium", accuracy=0.5,
                                                      majority_class_baseline=0.6))

    def test_no_collapse_above_baseline(self):
        self.assertFalse(av.pair_systematic_collapse("low_medium", accuracy=0.8,
                                                       majority_class_baseline=0.6))


class DatasetRecordConversionTests(unittest.TestCase):
    def test_to_dataset_record_preserves_phase7_shape(self):
        case = make_case()
        ex = {"example_id": "ex-1", "input": {}, "ground_truth": base_record(),
              "label_provenance": {"labeling_method": "SYNTHETIC"}, "quality_status": {}}
        rec = av.to_dataset_record(case, ex, "1.0.0")
        self.assertEqual(rec["dataset_assignment"]["dataset_id"], "adversarial")
        self.assertEqual(rec["dataset_assignment"]["inclusion_reason"]["failure_mode_targeted"],
                          "keyword_misdirection")
        self.assertIn("adversarial_metadata", rec)
        self.assertEqual(rec["adversarial_metadata"]["taxonomy_group"], "A")

    def test_missing_taxonomy_axis_detected(self):
        import evaluation as ev
        run = ev.EvaluationRun(checkpoint_id="c1", benchmark="hallucination",
                                l0={"structural_validity": 1.0}, by_axis={"role": {}})
        self.assertTrue(av.evaluation_run_missing_taxonomy_axis(run))

    def test_taxonomy_axis_present(self):
        import evaluation as ev
        run = ev.EvaluationRun(checkpoint_id="c1", benchmark="hallucination",
                                l0={"structural_validity": 1.0},
                                by_axis={"failure_mode_targeted": {}})
        self.assertFalse(av.evaluation_run_missing_taxonomy_axis(run))


class AT1KeywordIndependenceTests(unittest.TestCase):
    def test_unaffected_field_identical(self):
        original = base_record()
        masked = base_record()
        self.assertEqual(av.at1_keyword_independence(original, masked, ["role", "task_type"]), [])

    def test_unaffected_field_changed_is_violation(self):
        original = base_record()
        masked = base_record()
        masked["task"]["role"] = "Backend"
        errs = av.at1_keyword_independence(original, masked, ["role"])
        self.assertTrue(errs)


class AT2SchemaValidityTests(unittest.TestCase):
    def test_all_valid(self):
        recs = [derived.finalize(base_record()) for _ in range(3)]
        self.assertEqual(av.at2_schema_validity_under_malformation(recs), [])

    def test_one_invalid_flagged(self):
        good = derived.finalize(base_record())
        bad = derived.finalize(base_record())
        del bad["task"]["title"]
        errs = av.at2_schema_validity_under_malformation([good, bad])
        self.assertEqual(len(errs), 1)


class AT3DegradationOrderTests(unittest.TestCase):
    def test_repair_level_clean(self):
        trace = arch.InferenceTrace(degradation_level=1, repairs=["fixed something"])
        record = derived.finalize(base_record())
        self.assertEqual(av.at3_degradation_lattice_order(trace, record), [])

    def test_reject_without_any_attempt_flagged(self):
        trace = arch.InferenceTrace(degradation_level=0)
        result = arch.RejectedResult(["INVALID_INPUT_SNAPSHOT"], "no task identity")
        errs = av.at3_degradation_lattice_order(trace, result)
        self.assertTrue(any("without attempting" in e for e in errs))

    def test_abstain_level_reject_is_fine(self):
        trace = arch.InferenceTrace(degradation_level=4, repairs=["abstained"])
        result = arch.RejectedResult(["UNRECOVERABLE_AFTER_ABSTAIN"], "still broken")
        self.assertEqual(av.at3_degradation_lattice_order(trace, result), [])


class AT4GroundingCeilingTests(unittest.TestCase):
    def test_no_violation_when_within_ceiling(self):
        rec = base_record()
        rec["provenance"]["role"]["source"] = "SUPPORTED_BY_CONTEXT"
        segs = {"s1": seg("s1", type_="ISSUE_BODY")}
        self.assertEqual(av.at4_grounding_ceiling_on_bait(rec, "role", {"s1"}, segs), [])

    def test_violation_when_claim_exceeds_label_ceiling(self):
        rec = base_record()
        rec["provenance"]["role"]["source"] = "EXPLICIT"
        segs = {"s1": seg("s1", type_="LABEL")}
        errs = av.at4_grounding_ceiling_on_bait(rec, "role", {"s1"}, segs)
        self.assertTrue(errs)

    def test_no_matching_segments_no_violation(self):
        rec = base_record()
        self.assertEqual(av.at4_grounding_ceiling_on_bait(rec, "role", {"missing"}, {}), [])


class AT5AbstentionRateTests(unittest.TestCase):
    def test_high_abstention_passes_floor(self):
        rec = base_record()
        for f in ("role", "experience_level", "complexity", "task_type"):
            rec["task"][f] = "Unknown"
        result = av.at5_abstention_rate_on_short_stubs([rec], floor=0.2)
        self.assertTrue(result["pass"])

    def test_low_abstention_fails_floor(self):
        rec = base_record()
        result = av.at5_abstention_rate_on_short_stubs([rec], floor=0.9)
        self.assertFalse(result["pass"])

    def test_empty_records_none_rate(self):
        result = av.at5_abstention_rate_on_short_stubs([], floor=0.5)
        self.assertIsNone(result["mean_abstention_rate"])


class AT6RelevanceTests(unittest.TestCase):
    def test_no_tangent_leak(self):
        rec = base_record()
        self.assertEqual(av.at6_relevance_on_long_cases(rec, ["my vacation last summer"]), [])

    def test_tangent_leak_detected(self):
        rec = base_record()
        rec["task"]["description"] += " by the way, my vacation last summer was great"
        errs = av.at6_relevance_on_long_cases(rec, ["my vacation last summer"])
        self.assertTrue(errs)


class AT7ContradictionTests(unittest.TestCase):
    def test_properly_flagged(self):
        rec = base_record()
        rec["review"] = {"review_required": True, "review_reasons": ["complexity contradicted by two statements"]}
        self.assertEqual(av.at7_contradiction_non_resolution(rec, "complexity"), [])

    def test_silently_resolved_flagged(self):
        rec = base_record()
        rec["review"] = {"review_required": False, "review_reasons": []}
        errs = av.at7_contradiction_non_resolution(rec, "complexity")
        self.assertTrue(errs)

    def test_review_required_but_wrong_field_named(self):
        rec = base_record()
        rec["review"] = {"review_required": True, "review_reasons": ["role is ambiguous"]}
        errs = av.at7_contradiction_non_resolution(rec, "complexity")
        self.assertTrue(errs)


class AT8CalibrationDeltaTests(unittest.TestCase):
    def test_no_violation_when_confidence_does_not_rise(self):
        self.assertEqual(av.at8_calibration_delta_on_pair(0.5, 0.8, True), [])

    def test_violation_when_confidence_rises_on_coincidence(self):
        errs = av.at8_calibration_delta_on_pair(0.9, 0.5, True)
        self.assertTrue(errs)

    def test_no_violation_when_not_coincidental(self):
        self.assertEqual(av.at8_calibration_delta_on_pair(0.9, 0.5, False), [])


class AT9ToneInvarianceTests(unittest.TestCase):
    def test_stable_task_type_across_tones(self):
        cells = {
            ("security", "urgent"): {"task_type": "Bug", "confidence": 0.8},
            ("security", "flat"): {"task_type": "Bug", "confidence": 0.75},
        }
        self.assertEqual(av.at9_tone_invariance(cells), [])

    def test_task_type_shifts_with_tone_flagged(self):
        cells = {
            ("security", "urgent"): {"task_type": "Bug", "confidence": 0.9},
            ("security", "flat"): {"task_type": "Improvement", "confidence": 0.4},
        }
        errs = av.at9_tone_invariance(cells)
        self.assertTrue(errs)


class HardGateTests(unittest.TestCase):
    def test_hard_gates_are_exactly_at1_at2_at7(self):
        self.assertEqual(av.HARD_GATE_TESTS, frozenset({"AT1", "AT2", "AT7"}))

    def test_no_violations_when_clean(self):
        self.assertEqual(av.hard_gate_violations({"AT1": [], "AT2": [], "AT7": []}), [])

    def test_violation_reported(self):
        errs = av.hard_gate_violations({"AT1": ["field X changed"], "AT2": [], "AT7": []})
        self.assertTrue(errs)


class HT5ConstructionGateTests(unittest.TestCase):
    def test_passes_construction_gate(self):
        case = make_case()
        self.assertEqual(av.ht5_construction_quality_violations(case, bait_zero_signal_ok=True), [])

    def test_fails_construction_gate(self):
        case = make_case()
        errs = av.ht5_construction_quality_violations(case, bait_zero_signal_ok=False)
        self.assertTrue(errs)


class FailureThresholdVerdictTests(unittest.TestCase):
    def test_clear_when_all_hard_gates_pass(self):
        verdict = av.failure_threshold_verdict(
            hard_results={"AT1": [], "AT2": [], "AT7": []}, at3_violations=[],
            empirical_results={}, pair_collapses=[])
        self.assertEqual(verdict["verdict"], "clear")

    def test_hard_gate_failure_blocks(self):
        verdict = av.failure_threshold_verdict(
            hard_results={"AT1": ["violation"], "AT2": [], "AT7": []}, at3_violations=[],
            empirical_results={}, pair_collapses=[])
        self.assertEqual(verdict["verdict"], "blocked")

    def test_at3_violation_blocks(self):
        verdict = av.failure_threshold_verdict(
            hard_results={"AT1": [], "AT2": [], "AT7": []}, at3_violations=["went backwards"],
            empirical_results={}, pair_collapses=[])
        self.assertEqual(verdict["verdict"], "blocked")

    def test_pair_collapse_blocks(self):
        verdict = av.failure_threshold_verdict(
            hard_results={"AT1": [], "AT2": [], "AT7": []}, at3_violations=[],
            empirical_results={}, pair_collapses=["low_medium collapsed"])
        self.assertEqual(verdict["verdict"], "blocked")

    def test_insufficient_data_cell_not_defaulted(self):
        verdict = av.failure_threshold_verdict(
            hard_results={"AT1": [], "AT2": [], "AT7": []}, at3_violations=[],
            empirical_results={"AT5": {"actual": None, "min": 0.5}}, pair_collapses=[])
        self.assertEqual(verdict["cells"]["AT5"], "[INSUFFICIENT DATA]")
        self.assertEqual(verdict["verdict"], "clear")

    def test_empirical_cell_below_threshold_blocks(self):
        verdict = av.failure_threshold_verdict(
            hard_results={"AT1": [], "AT2": [], "AT7": []}, at3_violations=[],
            empirical_results={"AT5": {"actual": 0.2, "min": 0.5}}, pair_collapses=[])
        self.assertEqual(verdict["verdict"], "blocked")


if __name__ == "__main__":
    unittest.main()
