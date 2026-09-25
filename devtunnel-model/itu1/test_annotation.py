import copy
import unittest

from annotation import (
    agreement_level,
    annotation_tier,
    array_agreement,
    closed_enum_agreement,
    cohens_kappa,
    collapse_check,
    confidence_source_mismatch,
    detect_disagreements,
    disagreement_severity,
    empty_uncertainty_check,
    fabrication_check,
    jaccard_similarity,
    passes_calibration,
    provenance_source_agreement,
    ready_for_ground_truth,
    resolve_disagreement,
    run_qa_checks,
    strip_annotation_meta,
    unknown_rate_outlier,
    unknown_usage_rate,
    valid_adjudicator,
    validate_annotation,
)
from derived import finalize
from test_schema import base_record


def annotated(**meta_over) -> dict:
    """A finalized base record plus a valid, dual-annotated-and-agreed
    annotation_meta block (Section 2)."""
    rec = finalize(base_record())
    rec["annotation_meta"] = {
        "annotator_id": "a1",
        "annotation_round": 1,
        "second_annotator_id": "a2",
        "agreement_status": "agreed",
        "adjudicator_id": None,
        "time_spent_seconds": 180,
        "annotator_notes": None,
        "disagreement_log": [],
    }
    rec["annotation_meta"].update(meta_over)
    return rec


# ---------------------------------------------------------- validate_annotation
class ValidateAnnotationTests(unittest.TestCase):
    def test_valid_agreed_record(self):
        self.assertEqual(validate_annotation(annotated()), [])

    def test_missing_annotation_meta(self):
        rec = finalize(base_record())
        self.assertIn("structure: missing 'annotation_meta'", validate_annotation(rec))

    def test_base_record_errors_are_prefixed_and_caught(self):
        rec = annotated()
        del rec["task"]["role"]
        errors = validate_annotation(rec)
        self.assertTrue(any(e.startswith("base:") for e in errors))

    def test_single_annotated_cannot_carry_second_annotator(self):
        rec = annotated(agreement_status="single_annotated", second_annotator_id="a2")
        errors = validate_annotation(rec)
        self.assertTrue(any("single_annotated" in e for e in errors))

    def test_single_annotated_valid(self):
        rec = annotated(agreement_status="single_annotated", second_annotator_id=None)
        self.assertEqual(validate_annotation(rec), [])

    def test_agreed_requires_second_annotator(self):
        rec = annotated(second_annotator_id=None)
        errors = validate_annotation(rec)
        self.assertTrue(any("requires a second_annotator_id" in e for e in errors))

    def test_second_annotator_must_differ_from_annotator(self):
        rec = annotated(second_annotator_id="a1")
        errors = validate_annotation(rec)
        self.assertTrue(any("must differ from annotator_id" in e for e in errors))

    def test_disagreed_requires_nonempty_log(self):
        rec = annotated(agreement_status="disagreed")
        errors = validate_annotation(rec)
        self.assertTrue(any("disagreed status requires" in e for e in errors))

    def test_adjudicated_requires_adjudicator_and_resolved_log(self):
        rec = annotated(
            agreement_status="adjudicated",
            disagreement_log=[{
                "field": "task.role", "annotator_1_value": "Frontend",
                "annotator_2_value": "Backend", "resolution": None, "resolved_by": None,
            }],
        )
        errors = validate_annotation(rec)
        self.assertTrue(any("adjudicated status requires an adjudicator_id" in e for e in errors))
        self.assertTrue(any("unresolved" in e for e in errors))

    def test_adjudicated_valid_when_resolved(self):
        rec = annotated(
            agreement_status="adjudicated",
            adjudicator_id="lead1",
            disagreement_log=[{
                "field": "task.role", "annotator_1_value": "Frontend",
                "annotator_2_value": "Backend", "resolution": "text says Backend -> 'Backend'",
                "resolved_by": "lead1",
            }],
        )
        self.assertEqual(validate_annotation(rec), [])

    def test_adjudicator_cannot_be_original_annotator(self):
        rec = annotated(
            agreement_status="adjudicated",
            adjudicator_id="a1",
            disagreement_log=[{
                "field": "task.role", "annotator_1_value": "Frontend",
                "annotator_2_value": "Backend", "resolution": "x", "resolved_by": "a1",
            }],
        )
        errors = validate_annotation(rec)
        self.assertTrue(any("must not equal annotator_id" in e for e in errors))

    def test_malformed_log_entry(self):
        rec = annotated(disagreement_log=[{"field": "task.role"}])
        errors = validate_annotation(rec)
        self.assertTrue(any("missing annotator_1_value" in e for e in errors))

    def test_time_spent_must_be_nonnegative_int(self):
        rec = annotated(time_spent_seconds=-5)
        errors = validate_annotation(rec)
        self.assertTrue(any("time_spent_seconds" in e for e in errors))

    def test_annotation_round_must_be_positive_int(self):
        rec = annotated(annotation_round=0)
        errors = validate_annotation(rec)
        self.assertTrue(any("annotation_round" in e for e in errors))


class StripAnnotationMetaTests(unittest.TestCase):
    def test_strips_meta_leaves_rest_untouched(self):
        rec = annotated()
        stripped = strip_annotation_meta(rec)
        self.assertNotIn("annotation_meta", stripped)
        self.assertEqual(stripped["task"], rec["task"])

    def test_does_not_mutate_input(self):
        rec = annotated()
        before = copy.deepcopy(rec)
        strip_annotation_meta(rec)
        self.assertEqual(rec, before)


# --------------------------------------------------------------- agreement
class KappaAndJaccardTests(unittest.TestCase):
    def test_perfect_agreement(self):
        self.assertEqual(cohens_kappa(["A", "B", "A"], ["A", "B", "A"]), 1.0)

    def test_chance_level_disagreement_near_zero(self):
        # Balanced 2x2 confusion matrix with equal off-diagonal mass -> kappa 0.
        a = ["A", "A", "B", "B"]
        b = ["A", "B", "A", "B"]
        self.assertAlmostEqual(cohens_kappa(a, b), 0.0)

    def test_single_label_used_is_perfect_agreement(self):
        self.assertEqual(cohens_kappa(["A", "A", "A"], ["A", "A", "A"]), 1.0)

    def test_mismatched_lengths_raise(self):
        with self.assertRaises(ValueError):
            cohens_kappa(["A"], ["A", "B"])

    def test_jaccard_identical_sets(self):
        self.assertEqual(jaccard_similarity(["React", "Node"], ["Node", "React"]), 1.0)

    def test_jaccard_disjoint_sets(self):
        self.assertEqual(jaccard_similarity(["React"], ["Vue"]), 0.0)

    def test_jaccard_both_empty_is_agreement(self):
        self.assertEqual(jaccard_similarity([], []), 1.0)

    def test_agreement_level_bands(self):
        self.assertEqual(agreement_level(0.9), "solved")
        self.assertEqual(agreement_level(0.75), "substantial")
        self.assertEqual(agreement_level(0.4), "unstable")


class BatchAgreementTests(unittest.TestCase):
    def setUp(self):
        self.a = finalize(base_record())
        self.b_agree = finalize(base_record())
        self.b_disagree = finalize(base_record())
        self.b_disagree["task"]["role"] = "Backend"
        self.b_disagree["provenance"]["role"]["source"] = "INFERRED"

    def test_closed_enum_agreement_perfect(self):
        pairs = [(self.a, self.b_agree)] * 5
        self.assertEqual(closed_enum_agreement(pairs, "role"), 1.0)

    def test_closed_enum_agreement_detects_split(self):
        pairs = [(self.a, self.b_agree), (self.a, self.b_disagree)]
        kappa = closed_enum_agreement(pairs, "role")
        self.assertLess(kappa, 1.0)

    def test_provenance_source_agreement(self):
        pairs = [(self.a, self.b_disagree)]
        kappa = provenance_source_agreement(pairs, "role")
        self.assertEqual(kappa, 0.0)  # only one pair, one disagreement -> kappa 0, not 1

    def test_array_agreement_mean_jaccard(self):
        b = finalize(base_record())
        b["task"]["technologies"] = ["Vue"]
        pairs = [(self.a, self.a), (self.a, b)]
        # pair 1: identical -> 1.0 ; pair 2: React vs Vue -> 0.0 ; mean 0.5
        self.assertAlmostEqual(array_agreement(pairs, "technologies"), 0.5)


class UnknownRateTests(unittest.TestCase):
    def test_rate_computation(self):
        known = finalize(base_record())
        unk = finalize(base_record())
        unk["task"]["role"] = "Unknown"
        self.assertAlmostEqual(unknown_usage_rate([known, unk], "role"), 0.5)

    def test_no_records_is_zero(self):
        self.assertEqual(unknown_usage_rate([], "role"), 0.0)

    def test_outlier_detection(self):
        population = [0.1, 0.12, 0.09, 0.11, 0.1]
        self.assertTrue(unknown_rate_outlier(0.9, population))
        self.assertFalse(unknown_rate_outlier(0.1, population))

    def test_too_small_population_never_outlier(self):
        self.assertFalse(unknown_rate_outlier(0.9, [0.1]))


# ------------------------------------------------------------ disagreement
class DisagreementDetectionTests(unittest.TestCase):
    def test_no_disagreement_on_identical_records(self):
        a = finalize(base_record())
        b = finalize(base_record())
        self.assertEqual(detect_disagreements(a, b), [])

    def test_detects_role_difference(self):
        a = finalize(base_record())
        b = finalize(base_record())
        b["task"]["role"] = "Backend"
        entries = detect_disagreements(a, b)
        fields = {e["field"] for e in entries}
        self.assertIn("task.role", fields)
        entry = next(e for e in entries if e["field"] == "task.role")
        self.assertEqual(entry["annotator_1_value"], "Frontend")
        self.assertEqual(entry["annotator_2_value"], "Backend")
        self.assertIsNone(entry["resolution"])

    def test_detects_review_required_difference(self):
        a = finalize(base_record())
        b_raw = base_record()
        b_raw["task"]["complexity"] = "High"
        b_raw["task"]["experience_level"] = "Unknown"
        b_raw["provenance"]["experience_level"] = {"source": "UNKNOWN", "evidence": None, "confidence": None}
        b = finalize(b_raw)
        entries = detect_disagreements(a, b)
        fields = {e["field"] for e in entries}
        self.assertIn("review.review_required", fields)


class SeverityTests(unittest.TestCase):
    def test_role_difference_is_major(self):
        self.assertEqual(disagreement_severity("task.role", "Frontend", "Backend"), "major")

    def test_unknown_vs_concrete_is_major(self):
        self.assertEqual(disagreement_severity("task.complexity", "Unknown", "Low"), "major")

    def test_task_type_security_is_major(self):
        self.assertEqual(disagreement_severity("task.task_type", "Security", "Bug"), "major")

    def test_task_type_non_security_is_minor(self):
        self.assertEqual(disagreement_severity("task.task_type", "Bug", "Improvement"), "minor")

    def test_adjacent_experience_levels_are_minor(self):
        self.assertEqual(
            disagreement_severity("task.experience_level", "Intermediate", "Advanced"), "minor"
        )

    def test_nonadjacent_experience_levels_are_major(self):
        self.assertEqual(
            disagreement_severity("task.experience_level", "Beginner", "Advanced"), "major"
        )

    def test_provenance_source_difference_is_minor(self):
        self.assertEqual(
            disagreement_severity("provenance.role.source", "EXPLICIT", "INFERRED"), "minor"
        )

    def test_identical_values_raise(self):
        with self.assertRaises(ValueError):
            disagreement_severity("task.role", "Frontend", "Frontend")


class AdjudicatorTests(unittest.TestCase):
    def test_valid_adjudicator(self):
        self.assertTrue(valid_adjudicator("lead1", ["a1", "a2"]))

    def test_adjudicator_cannot_be_an_original_annotator(self):
        self.assertFalse(valid_adjudicator("a1", ["a1", "a2"]))

    def test_empty_adjudicator_id_invalid(self):
        self.assertFalse(valid_adjudicator("", ["a1", "a2"]))

    def test_resolve_disagreement_fills_fields_and_keeps_original_values(self):
        entry = {
            "field": "task.role", "annotator_1_value": "Frontend",
            "annotator_2_value": "Backend", "resolution": None, "resolved_by": None,
        }
        resolved = resolve_disagreement(entry, "Backend", "lead1", "comment names the API")
        self.assertEqual(resolved["resolved_by"], "lead1")
        self.assertIn("Backend", resolved["resolution"])
        self.assertEqual(resolved["annotator_1_value"], "Frontend")
        self.assertEqual(resolved["annotator_2_value"], "Backend")
        # original entry is untouched (append-only discipline)
        self.assertIsNone(entry["resolution"])


# ---------------------------------------------------------- ground truth gate
class ReadyForGroundTruthTests(unittest.TestCase):
    def test_agreed_valid_record_is_ready(self):
        ok, reasons = ready_for_ground_truth(annotated())
        self.assertTrue(ok)
        self.assertEqual(reasons, [])

    def test_disagreed_status_blocks_promotion(self):
        rec = annotated(
            agreement_status="disagreed",
            disagreement_log=[{
                "field": "task.role", "annotator_1_value": "Frontend",
                "annotator_2_value": "Backend", "resolution": None, "resolved_by": None,
            }],
        )
        ok, reasons = ready_for_ground_truth(rec)
        self.assertFalse(ok)
        self.assertTrue(any("condition 1" in r for r in reasons))

    def test_schema_errors_block_promotion(self):
        rec = annotated()
        del rec["task"]["role"]
        ok, reasons = ready_for_ground_truth(rec)
        self.assertFalse(ok)
        self.assertTrue(any("condition 2" in r for r in reasons))

    def test_unresolved_review_trigger_field_blocks_promotion(self):
        rec = annotated(
            agreement_status="adjudicated",
            adjudicator_id="lead1",
            disagreement_log=[{
                "field": "task.role", "annotator_1_value": "Frontend",
                "annotator_2_value": "Backend", "resolution": None, "resolved_by": None,
            }],
        )
        # bypass validate_annotation (which would itself reject this) and go
        # straight at the promotion gate to check condition 3 in isolation
        ok, reasons = ready_for_ground_truth(rec)
        self.assertFalse(ok)
        self.assertTrue(any("condition 3" in r for r in reasons))

    def test_resolved_disagreement_on_review_trigger_field_is_fine(self):
        rec = annotated(
            agreement_status="adjudicated",
            adjudicator_id="lead1",
            disagreement_log=[{
                "field": "task.role", "annotator_1_value": "Frontend",
                "annotator_2_value": "Backend", "resolution": "resolved -> Frontend",
                "resolved_by": "lead1",
            }],
        )
        ok, reasons = ready_for_ground_truth(rec)
        self.assertTrue(ok)


# --------------------------------------------------------------------- QA
class CalibrationGateTests(unittest.TestCase):
    def test_passes_with_high_kappa_and_no_fabrication(self):
        self.assertTrue(passes_calibration(0.8, 0))

    def test_fails_on_any_fabrication_even_with_perfect_kappa(self):
        self.assertFalse(passes_calibration(1.0, 1))

    def test_fails_below_kappa_floor(self):
        self.assertFalse(passes_calibration(0.5, 0))


class FabricationCheckTests(unittest.TestCase):
    def test_grounded_evidence_not_flagged(self):
        rec = finalize(base_record())
        rec["provenance"]["role"] = {
            "source": "EXPLICIT",
            "evidence": "discount code input component throws on empty value",
            "confidence": 0.9,
        }
        issue_text = "Discount code input crashes on empty value in checkout."
        self.assertNotIn("role", fabrication_check(rec, issue_text))

    def test_ungrounded_evidence_flagged(self):
        rec = finalize(base_record())
        rec["provenance"]["role"] = {
            "source": "EXPLICIT", "evidence": "completely unrelated made up text", "confidence": 0.9,
        }
        issue_text = "Discount code input crashes on empty value in checkout."
        self.assertIn("role", fabrication_check(rec, issue_text))

    def test_inferred_and_unknown_not_checked(self):
        rec = finalize(base_record())
        # experience_level is INFERRED with evidence unrelated to the issue text
        issue_text = "Totally different wording with no overlap at all zzz."
        flagged = fabrication_check(rec, issue_text)
        self.assertNotIn("experience_level", flagged)


class OtherQaChecksTests(unittest.TestCase):
    def test_empty_uncertainty_flags_when_missing_info_absent(self):
        rec = finalize(base_record())
        rec["task"]["role"] = "Unknown"
        rec["task"]["task_type"] = "Unknown"
        rec["provenance"]["role"] = {"source": "UNKNOWN", "evidence": None, "confidence": None}
        rec["provenance"]["task_type"] = {"source": "UNKNOWN", "evidence": None, "confidence": None}
        rec["uncertainty"]["missing_information"] = []
        self.assertTrue(empty_uncertainty_check(rec))

    def test_empty_uncertainty_ok_when_missing_info_present(self):
        rec = finalize(base_record())
        rec["task"]["role"] = "Unknown"
        rec["task"]["task_type"] = "Unknown"
        rec["provenance"]["role"] = {"source": "UNKNOWN", "evidence": None, "confidence": None}
        rec["provenance"]["task_type"] = {"source": "UNKNOWN", "evidence": None, "confidence": None}
        rec["uncertainty"]["missing_information"] = ["no repro steps given"]
        self.assertFalse(empty_uncertainty_check(rec))

    def test_collapse_check_flags_near_identical_evidence(self):
        rec = finalize(base_record())
        rec["provenance"]["experience_level"]["evidence"] = "single component, one code path"
        rec["provenance"]["complexity"]["evidence"] = "single component, one code path!"
        self.assertTrue(collapse_check(rec))

    def test_collapse_check_ignores_genuinely_different_evidence(self):
        rec = finalize(base_record())
        self.assertFalse(collapse_check(rec))

    def test_confidence_source_mismatch_flags_low_explicit(self):
        rec = finalize(base_record())
        rec["provenance"]["title"]["confidence"] = 0.4
        self.assertIn("title", confidence_source_mismatch(rec))

    def test_confidence_source_mismatch_flags_high_inferred(self):
        rec = finalize(base_record())
        rec["provenance"]["experience_level"]["confidence"] = 0.95
        self.assertIn("experience_level", confidence_source_mismatch(rec))

    def test_confidence_source_mismatch_clean_record(self):
        rec = finalize(base_record())
        self.assertEqual(confidence_source_mismatch(rec), [])

    def test_run_qa_checks_bundles_all_four(self):
        rec = finalize(base_record())
        result = run_qa_checks(rec, "Discount code input crashes on empty value.")
        self.assertEqual(
            set(result),
            {"fabrication", "empty_uncertainty", "experience_complexity_collapse",
             "confidence_source_mismatch"},
        )


class TierRoutingTests(unittest.TestCase):
    def test_security_always_tier1(self):
        self.assertEqual(annotation_tier("Security", None, domain_kappa=0.95), "tier_1")

    def test_notes_mentioning_security_force_tier1(self):
        self.assertEqual(
            annotation_tier("Bug", "possible security concern here", domain_kappa=0.95), "tier_1"
        )

    def test_immature_domain_defaults_tier1(self):
        self.assertEqual(annotation_tier("Bug", None, domain_kappa=None), "tier_1")
        self.assertEqual(annotation_tier("Bug", None, domain_kappa=0.5), "tier_1")

    def test_mature_domain_routes_tier2(self):
        self.assertEqual(annotation_tier("Bug", None, domain_kappa=0.75), "tier_2")


if __name__ == "__main__":
    unittest.main()
