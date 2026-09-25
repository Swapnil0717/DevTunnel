import copy
import unittest

from derived import (
    REVIEW_REASONS, compute_overall_confidence, explicit_low_confidence,
    finalize, validate_all, validate_derived,
)
from test_schema import base_record, prov, unknown_record


class ConfidenceTests(unittest.TestCase):
    def test_weighted_mean_hand_computed(self):
        # role (required, weight 2) 0.9 ; technologies (optional, weight 1) 0.6
        p = {"role": prov(confidence=0.9), "technologies": prov(confidence=0.6)}
        self.assertEqual(compute_overall_confidence(p), round((0.9 * 2 + 0.6) / 3, 2))

    def test_unknown_fields_are_excluded(self):
        p = {"role": prov(confidence=0.8),
             "complexity": {"source": "UNKNOWN", "evidence": None, "confidence": None}}
        self.assertEqual(compute_overall_confidence(p), 0.8)

    def test_no_known_fields_gives_zero(self):
        p = {"role": {"source": "UNKNOWN", "evidence": None, "confidence": None}}
        self.assertEqual(compute_overall_confidence(p), 0.0)


class FinalizeTests(unittest.TestCase):
    def test_finalized_normal_record_is_fully_valid(self):
        r = finalize(base_record())
        self.assertEqual(validate_all(r), [])
        self.assertFalse(r["review"]["review_required"])
        self.assertEqual(r["review"]["review_reasons"], [])

    def test_finalize_is_idempotent(self):
        once = finalize(base_record())
        self.assertEqual(finalize(once), once)

    def test_finalize_does_not_mutate_input(self):
        r = base_record()
        snap = copy.deepcopy(r)
        finalize(r)
        self.assertEqual(r, snap)

    def test_rollups_match_provenance(self):
        r = finalize(base_record())
        explicit = {e["field"] for e in r["uncertainty"]["explicit_information"]}
        inferred = {e["field"] for e in r["uncertainty"]["inferred_information"]}
        self.assertIn("role", explicit)
        self.assertEqual(inferred, {"experience_level", "complexity"})

    def test_unknown_record_finalizes_to_valid_review_record(self):
        r = finalize(unknown_record())
        self.assertEqual(validate_all(r), [])
        self.assertTrue(r["review"]["review_required"])
        self.assertIn(REVIEW_REASONS[1], r["review"]["review_reasons"])
        self.assertIn(REVIEW_REASONS[2], r["review"]["review_reasons"])


class ReviewTriggerTests(unittest.TestCase):
    def reasons(self, r):
        return finalize(r)["review"]["review_reasons"]

    def test_R3_low_overall_confidence(self):
        r = base_record()
        for e in r["provenance"].values():
            e["confidence"] = 0.4
        self.assertIn(REVIEW_REASONS[3], self.reasons(r))

    def test_R4_security_always_reviewed(self):
        r = base_record()
        r["task"]["task_type"] = "Security"
        self.assertIn(REVIEW_REASONS[4], self.reasons(r))

    def test_R5_high_complexity_unknown_experience(self):
        r = base_record()
        r["task"]["complexity"] = "High"
        r["task"]["experience_level"] = "Unknown"
        r["provenance"]["experience_level"] = {"source": "UNKNOWN", "evidence": None, "confidence": None}
        reasons = self.reasons(r)
        self.assertIn(REVIEW_REASONS[5], reasons)
        self.assertIn(REVIEW_REASONS[1], reasons)

    def test_R6_uncertain_task_type(self):
        r = base_record()
        r["provenance"]["task_type"]["confidence"] = 0.4
        self.assertIn(REVIEW_REASONS[6], self.reasons(r))

    def test_R6_ignores_uncertain_non_key_field(self):
        r = base_record()
        r["provenance"]["technologies"]["confidence"] = 0.4
        self.assertNotIn(REVIEW_REASONS[6], self.reasons(r))


class DerivedRuleTests(unittest.TestCase):
    def assertRule(self, record, rule):
        errors = validate_derived(record)
        self.assertTrue(any(e.startswith(rule) for e in errors), f"expected {rule}, got {errors}")

    def test_T11_hand_edited_overall_confidence(self):
        r = finalize(base_record())
        r["confidence"]["overall_confidence"] = 0.99
        self.assertRule(r, "rule 10")

    def test_rule10_within_tolerance_is_ok(self):
        r = finalize(base_record())
        r["confidence"]["overall_confidence"] += 0.005
        self.assertEqual(validate_derived(r), [])

    def test_T12_review_forced_false_with_trigger(self):
        r = finalize(base_record())
        r["task"]["task_type"] = "Security"
        self.assertRule(r, "rule 11")

    def test_T13_reasons_present_while_not_required(self):
        r = finalize(base_record())
        r["review"]["review_reasons"] = [REVIEW_REASONS[4]]
        self.assertRule(r, "rule 11")

    def test_rule11_reasons_must_match_fired_rules(self):
        r = finalize(unknown_record())
        r["review"]["review_reasons"] = [REVIEW_REASONS[1]]  # R2 also fired
        self.assertRule(r, "rule 11")

    def test_rule6_explicit_rollup_references_non_explicit_field(self):
        r = finalize(base_record())
        r["uncertainty"]["explicit_information"].append(
            {"field": "complexity", "evidence": r["provenance"]["complexity"]["evidence"]})
        self.assertRule(r, "rule 6")

    def test_rule6_rollup_missing_a_field(self):
        r = finalize(base_record())
        r["uncertainty"]["inferred_information"].pop()
        self.assertRule(r, "rule 6")

    def test_rule6_below_threshold_field_not_listed_as_uncertain(self):
        r = finalize(base_record())
        r["provenance"]["technologies"]["confidence"] = 0.3
        self.assertRule(r, "rule 6")

    def test_rule6_uncertain_entry_pointing_at_unknown_field(self):
        r = finalize(unknown_record())
        r["uncertainty"]["uncertain_information"].append(
            {"field": "role", "evidence": "x"})
        self.assertRule(r, "rule 6")

    def test_model_judged_uncertainty_above_threshold_is_allowed(self):
        r = base_record()
        r["uncertainty"]["uncertain_information"] = [
            {"field": "complexity", "evidence": "x", "note": "ambiguous scope"}]
        r = finalize(r)
        self.assertEqual(validate_all(r), [])
        self.assertIn(REVIEW_REASONS[6], r["review"]["review_reasons"])  # complexity is a key field

    def test_validate_all_skips_derived_rules_on_broken_structure(self):
        r = base_record()
        r["task"]["role"] = "Wizard"
        errors = validate_all(r)
        self.assertTrue(any(e.startswith("structure:") for e in errors))
        self.assertFalse(any(e.startswith(("rule 6", "rule 10", "rule 11")) for e in errors))


class CalibrationSmellTests(unittest.TestCase):
    def test_flags_low_confidence_explicit_only(self):
        r = base_record()
        r["provenance"]["role"]["confidence"] = 0.5                  # EXPLICIT, low
        r["provenance"]["complexity"]["confidence"] = 0.5            # INFERRED, fine
        self.assertEqual(explicit_low_confidence(r), ["role"])


if __name__ == "__main__":
    unittest.main()
