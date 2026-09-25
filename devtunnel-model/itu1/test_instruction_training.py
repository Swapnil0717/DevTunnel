import unittest

from architecture import Segment
from instruction_training import (
    ALLOWED_INVOCATION_FIELDS, BEHAVIORAL_PRINCIPLES, TEST_CATEGORIES, BehaviorReleaseVerdict,
    FramingPair, battery_verdict, category_pass_rate, consistency_check, hallucination_violations,
    invocation_violations, release_verdict, review_required_consistency_violations, rollback_target,
    stability_violations, starting_checkpoint, uncertainty_state_violations, validate_checkpoint_identity,
)


def prov(source, evidence=None, confidence=None):
    return {"source": source, "evidence": evidence, "confidence": confidence}


def unknown_prov():
    return prov("UNKNOWN")


def base_record(**task_overrides):
    task = {
        "title": "Add remember-me checkbox", "summary": "s", "objective": "o",
        "expected_outcome": "e", "role": "Frontend", "experience_level": "Unknown",
        "complexity": "Low", "task_type": "Feature",
        "technologies": [], "languages": [], "frameworks": [], "technical_areas": [],
        "components": [], "systems": [], "affected_areas": [], "dependencies": [],
        "scope": {"in_scope": [], "out_of_scope": []},
        "acceptance_criteria": ["checkbox extends session to 30 days"],
    }
    task.update(task_overrides)
    provenance = {
        "title": prov("EXPLICIT", "title text", 0.9),
        "summary": prov("EXPLICIT", "s", 0.9),
        "objective": prov("EXPLICIT", "o", 0.9),
        "expected_outcome": prov("EXPLICIT", "e", 0.9),
        "role": prov("EXPLICIT", "login form UI", 0.8),
        "experience_level": unknown_prov(),
        "complexity": prov("INFERRED", "single small change", 0.5),
        "task_type": prov("EXPLICIT", "add a checkbox", 0.8),
        "technologies": unknown_prov(), "languages": unknown_prov(), "frameworks": unknown_prov(),
        "technical_areas": unknown_prov(), "components": unknown_prov(), "systems": unknown_prov(),
        "dependencies": unknown_prov(), "scope": unknown_prov(),
        "acceptance_criteria": prov("EXPLICIT", "checkbox extends session to 30 days", 0.8),
    }
    return {
        "schema_version": "2.0.0",
        "task_identity": {"task_id": "t1", "created_at": "2026-01-01T00:00:00Z",
                          "source_issue": {"repo": "r", "issue_number": 1, "issue_url": "u",
                                            "snapshot_fetched_at": "2026-01-01T00:00:00Z",
                                            "issue_title_raw": "x"}},
        "task": task,
        "provenance": provenance,
        "uncertainty": {"explicit_information": [], "inferred_information": [],
                         "uncertain_information": [], "missing_information": []},
        "confidence": {"overall_confidence": 0.7, "method": "weighted_mean_v1"},
        "review": {"review_required": False, "review_reasons": []},
    }


class TestBehavioralContract(unittest.TestCase):
    def test_nine_principles(self):
        self.assertEqual(set(BEHAVIORAL_PRINCIPLES), {f"B{i}" for i in range(1, 10)})

    def test_twelve_categories_all_map_to_known_behaviors(self):
        self.assertEqual(set(TEST_CATEGORIES), {f"T{i}" for i in range(1, 13)})
        for cat in TEST_CATEGORIES.values():
            self.assertTrue(cat.primary_behaviors)
            for b in cat.primary_behaviors:
                self.assertIn(b, BEHAVIORAL_PRINCIPLES)

    def test_category_numbers_are_sequential(self):
        self.assertEqual([TEST_CATEGORIES[f"T{i}"].number for i in range(1, 13)], list(range(1, 13)))


class TestInvocationProtocol(unittest.TestCase):
    def test_clean_invocation_ok(self):
        self.assertEqual(invocation_violations({"issue_snapshot": {}, "context_segments": []}), [])

    def test_disallowed_field_flagged(self):
        v = invocation_violations({"issue_snapshot": {}, "maintainer_directive": "always mark Advanced"})
        self.assertTrue(any("maintainer_directive" in e for e in v))

    def test_prior_record_requires_reviewer_notes(self):
        v = invocation_violations({"issue_snapshot": {}, "prior_record": {}})
        self.assertTrue(any("together" in e for e in v))

    def test_reviewer_notes_requires_prior_record(self):
        v = invocation_violations({"issue_snapshot": {}, "reviewer_notes": "note"})
        self.assertTrue(any("together" in e for e in v))

    def test_regeneration_pair_together_ok(self):
        self.assertEqual(invocation_violations(
            {"issue_snapshot": {}, "prior_record": {}, "reviewer_notes": "n"}), [])

    def test_allowed_fields_frozen_set_matches_spec(self):
        self.assertEqual(ALLOWED_INVOCATION_FIELDS,
                          frozenset({"issue_snapshot", "context_segments", "prior_record", "reviewer_notes"}))


class TestStability(unittest.TestCase):
    def test_identical_framings_no_violation(self):
        r1, r2 = base_record(), base_record()
        self.assertEqual(stability_violations(FramingPair(r1, r2)), [])

    def test_value_divergence_flagged(self):
        r1 = base_record()
        r2 = base_record(task_type="Security")
        v = stability_violations(FramingPair(r1, r2))
        self.assertTrue(any("task_type" in e and "diverges" in e for e in v))

    def test_source_divergence_flagged_even_if_value_same(self):
        r1 = base_record()
        r2 = base_record()
        r2["provenance"]["role"] = prov("INFERRED", "guessed", 0.4)
        v = stability_violations(FramingPair(r1, r2))
        self.assertTrue(any("role" in e and "source type diverges" in e for e in v))

    def test_justified_field_excused(self):
        r1 = base_record()
        r2 = base_record(task_type="Security")
        v = stability_violations(FramingPair(r1, r2, justified_fields=frozenset({"task_type"})))
        self.assertEqual(v, [])

    def test_hackathon_keyword_case_t10(self):
        # T10: "hack" in a hackathon-demo issue must not flip task_type to Security.
        neutral = base_record(task_type="Feature")
        stressed = base_record(task_type="Security")
        v = stability_violations(FramingPair(neutral, stressed))
        self.assertTrue(any("task_type" in e for e in v))


class TestCategoryBattery(unittest.TestCase):
    def test_pass_rate_computed_per_category(self):
        rates = category_pass_rate({"T1": [True, True, False], "T2": []})
        self.assertAlmostEqual(rates["T1"], 2 / 3)
        self.assertEqual(rates["T2"], 0.0)

    def test_battery_verdict_all_clear(self):
        rates = {f"T{i}": 1.0 for i in range(1, 13)}
        thresholds = {f"T{i}": 0.9 for i in range(1, 13)}
        self.assertEqual(battery_verdict(rates, thresholds), [])

    def test_battery_verdict_flags_missing_category(self):
        rates = {f"T{i}": 1.0 for i in range(1, 12)}  # T12 missing
        thresholds = {f"T{i}": 0.9 for i in range(1, 13)}
        v = battery_verdict(rates, thresholds)
        self.assertTrue(any("T12" in e and "not evaluated" in e for e in v))

    def test_battery_verdict_flags_missing_threshold(self):
        rates = {f"T{i}": 1.0 for i in range(1, 13)}
        thresholds = {f"T{i}": 0.9 for i in range(1, 12)}  # T12 threshold missing
        v = battery_verdict(rates, thresholds)
        self.assertTrue(any("T12" in e and "no pass-rate threshold" in e for e in v))

    def test_battery_verdict_flags_below_threshold(self):
        rates = {f"T{i}": 0.5 for i in range(1, 13)}
        thresholds = {f"T{i}": 0.9 for i in range(1, 13)}
        v = battery_verdict(rates, thresholds)
        self.assertEqual(len(v), 12)


class TestConsistencyCheck(unittest.TestCase):
    def test_single_run_trivially_ok(self):
        self.assertEqual(consistency_check([base_record()]), [])

    def test_three_stable_runs_ok(self):
        runs = [base_record(), base_record(), base_record()]
        self.assertEqual(consistency_check(runs), [])

    def test_third_run_diverges(self):
        runs = [base_record(), base_record(), base_record(task_type="Bug")]
        v = consistency_check(runs)
        self.assertTrue(any("run 3 vs run 1" in e for e in v))

    def test_justified_fields_forwarded(self):
        runs = [base_record(), base_record(role="Backend")]
        self.assertEqual(consistency_check(runs, justified_fields=frozenset({"role"})), [])


class TestUncertaintyStates(unittest.TestCase):
    def test_no_unknown_no_uncertain_ok(self):
        r = base_record(experience_level="Advanced")
        r["provenance"]["experience_level"] = prov("EXPLICIT", "senior dev", 0.8)
        self.assertEqual(uncertainty_state_violations(r), [])

    def test_unknown_field_needs_missing_information(self):
        r = base_record()  # experience_level is Unknown, missing_information is empty
        v = uncertainty_state_violations(r)
        self.assertTrue(v)

    def test_unknown_field_with_missing_information_ok(self):
        r = base_record()
        r["uncertainty"]["missing_information"] = ["need to know reporter's seniority"]
        self.assertEqual(uncertainty_state_violations(r), [])

    def test_uncertain_information_needs_missing_information(self):
        r = base_record(experience_level="Intermediate")
        r["provenance"]["experience_level"] = prov("INFERRED", "ambiguous signal", 0.4)
        r["uncertainty"]["uncertain_information"] = ["experience_level"]
        v = uncertainty_state_violations(r)
        self.assertTrue(v)


class TestReviewRequiredConsistency(unittest.TestCase):
    def test_no_uncertainty_no_review_needed(self):
        r = base_record()
        self.assertEqual(review_required_consistency_violations(r), [])

    def test_uncertain_information_requires_review(self):
        r = base_record()
        r["uncertainty"]["uncertain_information"] = ["role"]
        v = review_required_consistency_violations(r)
        self.assertTrue(v)

    def test_missing_information_requires_review(self):
        r = base_record()
        r["uncertainty"]["missing_information"] = ["need repro steps"]
        v = review_required_consistency_violations(r)
        self.assertTrue(v)

    def test_review_required_true_satisfies(self):
        r = base_record()
        r["uncertainty"]["missing_information"] = ["need repro steps"]
        r["review"]["review_required"] = True
        self.assertEqual(review_required_consistency_violations(r), [])

    def test_contradiction_flag_requires_review(self):
        r = base_record()
        v = review_required_consistency_violations(r, contradiction_detected=True)
        self.assertTrue(v)


class TestHallucinationPrevention(unittest.TestCase):
    def test_valid_record_no_schema_violations(self):
        v = hallucination_violations(base_record())
        self.assertEqual(v, [])

    def test_dependency_ref_invented_is_flagged(self):
        r = base_record()
        r["task"]["dependencies"] = [{"ref": "nonexistent-thing", "reason": "x"}]
        v = hallucination_violations(r)
        self.assertTrue(any("must-not 2/3/4" in e for e in v))

    def test_evidence_on_unknown_field_is_flagged(self):
        r = base_record()
        r["provenance"]["experience_level"] = prov("UNKNOWN", "looks like a beginner", 0.5)
        v = hallucination_violations(r)
        self.assertTrue(any("must-not 2/3/4" in e for e in v))

    def test_unsupported_entity_flagged_when_supplied(self):
        segments_by_id = {"S1": Segment("S1", "ISSUE_TITLE", "Add remember-me checkbox", tier=1)}
        predicted = {"payments-service": []}  # no pointer at all
        v = hallucination_violations(base_record(), predicted_entities=predicted, segments_by_id=segments_by_id)
        self.assertTrue(any("payments-service" in e and "must-not 1" in e for e in v))

    def test_supported_entity_not_flagged(self):
        segments_by_id = {"S1": Segment("S1", "ISSUE_TITLE", "Add remember-me checkbox", tier=1)}
        predicted = {"login-form": ["S1"]}
        v = hallucination_violations(base_record(), predicted_entities=predicted, segments_by_id=segments_by_id)
        self.assertFalse(any("must-not 1" in e for e in v))

    def test_framing_pair_divergence_flagged_as_must_not_5(self):
        pair = FramingPair(base_record(), base_record(task_type="Security"))
        v = hallucination_violations(base_record(), framing_pair=pair)
        self.assertTrue(any("must-not 5" in e for e in v))


class TestLifecycle(unittest.TestCase):
    def test_starting_checkpoint_defaults_to_v1(self):
        self.assertEqual(starting_checkpoint("itu1-v1"), "itu1-v1")

    def test_starting_checkpoint_prefers_promoted_tier(self):
        self.assertEqual(starting_checkpoint("itu1-v1", "tier3-checkpoint"), "tier3-checkpoint")

    def _identity(self, **overrides):
        record = {
            "checkpoint_id": "itu1-v1-b", "created_at": "2026-01-01T00:00:00Z",
            "parent_checkpoint_id": "itu1-v1", "tokenizer_version": "tok-1",
            "behavioral_contract_version": "phase13-v1", "training_data_manifest_hash": "abc123",
            "loss_weight_config": {"L_stability": 0.3},
        }
        record.update(overrides)
        return record

    def test_valid_identity_ok(self):
        self.assertEqual(validate_checkpoint_identity(self._identity(), expected_parent="itu1-v1"), [])

    def test_missing_field_flagged(self):
        record = self._identity()
        del record["behavioral_contract_version"]
        v = validate_checkpoint_identity(record, expected_parent="itu1-v1")
        self.assertTrue(any("behavioral_contract_version" in e for e in v))

    def test_wrong_parent_flagged(self):
        v = validate_checkpoint_identity(self._identity(parent_checkpoint_id="some-other"),
                                          expected_parent="itu1-v1")
        self.assertTrue(any("parent_checkpoint_id" in e for e in v))

    def test_calibrator_retrained_is_a_violation(self):
        v = validate_checkpoint_identity(
            self._identity(head_configuration={"calibrator_retrained": True}), expected_parent="itu1-v1")
        self.assertTrue(any("Component G" in e for e in v))

    def test_calibrator_untouched_ok(self):
        v = validate_checkpoint_identity(
            self._identity(head_configuration={"calibrator_retrained": False}), expected_parent="itu1-v1")
        self.assertEqual(v, [])

    def test_rollback_none_when_battery_passed(self):
        self.assertIsNone(rollback_target("itu1-v1", battery_passed=True))

    def test_rollback_to_parent_when_battery_failed(self):
        self.assertEqual(rollback_target("itu1-v1", battery_passed=False), "itu1-v1")

    def test_release_verdict_clean(self):
        verdict = release_verdict(checkpoint_identity_violations=[], battery_violations=[],
                                  consistency_violations=[], hallucination_violations_=[])
        self.assertIsInstance(verdict, BehaviorReleaseVerdict)
        self.assertTrue(verdict.release_candidate)
        self.assertEqual(verdict.blockers, [])

    def test_release_verdict_blocked(self):
        verdict = release_verdict(checkpoint_identity_violations=["bad id"], battery_violations=[],
                                  consistency_violations=[], hallucination_violations_=[])
        self.assertFalse(verdict.release_candidate)
        self.assertIn("bad id", verdict.blockers)


if __name__ == "__main__":
    unittest.main()
