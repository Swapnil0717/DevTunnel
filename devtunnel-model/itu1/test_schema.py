import copy
import unittest

from schema import validate


def prov(source="EXPLICIT", evidence="stated in issue", confidence=0.9):
    return {"source": source, "evidence": evidence, "confidence": confidence}


def base_record() -> dict:
    """A well-formed record (spec Example 1 pattern: normal bug report)."""
    fields = [
        "title", "summary", "objective", "expected_outcome",
        "role", "task_type", "technologies", "languages", "frameworks",
        "technical_areas", "components", "systems", "dependencies",
        "scope", "acceptance_criteria",
    ]
    provenance = {f: prov(evidence=f"evidence for {f}") for f in fields}
    provenance["experience_level"] = prov("INFERRED", "small UI fix, no deep context needed", 0.6)
    provenance["complexity"] = prov("INFERRED", "single component, one code path", 0.7)
    return {
        "schema_version": "2.0.0",
        "task_identity": {
            "task_id": "00000000-0000-0000-0000-000000000001",
            "created_at": "2026-09-24T00:00:00Z",
            "source_issue": {
                "repo": "acme/shop", "issue_number": 42,
                "issue_url": "https://github.com/acme/shop/issues/42",
                "snapshot_fetched_at": "2026-09-24T00:00:00Z",
                "issue_title_raw": "Discount code input crashes on empty value",
            },
        },
        "task": {
            "title": "Fix crash on empty discount code",
            "summary": "Discount input throws when submitted empty.",
            "objective": "Prevent checkout crashes.",
            "description": "Submitting an empty discount code throws a TypeError.",
            "expected_outcome": "Empty submission shows a validation message.",
            "role": "Frontend",
            "experience_level": "Beginner",
            "complexity": "Low",
            "task_type": "Bug",
            "technologies": ["React"],
            "languages": ["TypeScript"],
            "frameworks": ["React"],
            "technical_areas": ["checkout"],
            "components": ["DiscountCodeInput.tsx"],
            "systems": ["checkout-frontend"],
            "affected_areas": ["checkout page"],
            "dependencies": [],
            "scope": {"in_scope": ["empty-value handling"], "out_of_scope": []},
            "acceptance_criteria": ["Empty code shows an inline error", "No exception thrown"],
        },
        "provenance": provenance,
        "uncertainty": {
            "explicit_information": [], "inferred_information": [],
            "uncertain_information": [], "missing_information": [],
        },
        "confidence": {"overall_confidence": 0.8, "method": "weighted_mean_v1"},
        "review": {"review_required": False, "review_reasons": []},
    }


def unknown_record() -> dict:
    """Spec Example 3 pattern: two-word issue, everything Unknown."""
    r = base_record()
    t = r["task"]
    t.update(role="Unknown", experience_level="Unknown", complexity="Unknown",
             task_type="Unknown", acceptance_criteria=[])
    for f in ("role", "experience_level", "complexity", "task_type", "acceptance_criteria"):
        r["provenance"][f] = {"source": "UNKNOWN", "evidence": None, "confidence": None}
    return r


class SchemaTests(unittest.TestCase):
    def assertRule(self, record, rule):
        errors = validate(record)
        self.assertTrue(any(e.startswith(rule) for e in errors), f"expected {rule}, got {errors}")

    def test_T1_well_formed_record_is_valid(self):
        self.assertEqual(validate(base_record()), [])

    def test_T2_missing_provenance_entry(self):
        r = base_record()
        del r["provenance"]["role"]
        self.assertRule(r, "rule 1")

    def test_T3_unknown_with_evidence(self):
        r = base_record()
        r["provenance"]["role"] = prov("UNKNOWN", "guessed frontend", 0.3)
        self.assertRule(r, "rule 2")

    def test_T4_explicit_with_null_evidence(self):
        r = base_record()
        r["provenance"]["task_type"] = prov("EXPLICIT", None, 0.9)
        self.assertRule(r, "rule 3")

    def test_rule3_confidence_out_of_range(self):
        r = base_record()
        r["provenance"]["role"]["confidence"] = 1.4
        self.assertRule(r, "rule 3")

    def test_T5_empty_criteria_on_classified_task(self):
        r = base_record()
        r["task"]["acceptance_criteria"] = []
        self.assertRule(r, "rule 5")

    def test_T6_empty_criteria_on_fully_unknown_task(self):
        self.assertEqual(validate(unknown_record()), [])

    def test_T7_identical_experience_and_complexity_evidence(self):
        r = base_record()
        r["provenance"]["experience_level"]["evidence"] = "issue is long"
        r["provenance"]["complexity"]["evidence"] = "issue is long"
        self.assertRule(r, "rule 7")

    def test_T8_component_and_system_overlap(self):
        r = base_record()
        r["task"]["components"] = ["auth-gateway"]
        r["task"]["systems"] = ["auth-gateway"]
        self.assertRule(r, "rule 8")

    def test_T9_unresolvable_dependency_ref(self):
        r = base_record()
        r["task"]["dependencies"] = [
            {"type": "requires", "ref": "some-random-string", "description": "x"}]
        self.assertRule(r, "rule 9")

    def test_T10_issue_reference_dependency_is_valid(self):
        r = base_record()
        r["task"]["dependencies"] = [
            {"type": "relates_to", "ref": "checkout-service#12", "description": "x"}]
        self.assertEqual(validate(r), [])

    def test_dependency_on_known_component_is_valid(self):
        r = base_record()
        r["task"]["dependencies"] = [
            {"type": "requires", "ref": "DiscountCodeInput.tsx", "description": "x"}]
        self.assertEqual(validate(r), [])

    def test_T14_v1_record_rejected(self):
        r = base_record()
        r["schema_version"] = "1.4.0"
        self.assertRule(r, "rule 12")

    def test_T15_unregistered_task_type(self):
        r = base_record()
        r["task"]["task_type"] = "Migration"
        errors = validate(r)
        self.assertTrue(any("registry" in e for e in errors), errors)

    def test_missing_section(self):
        r = base_record()
        del r["review"]
        self.assertTrue(any("missing top-level section 'review'" in e for e in validate(r)))

    def test_validator_does_not_mutate_input(self):
        r = base_record()
        snapshot = copy.deepcopy(r)
        validate(r)
        self.assertEqual(r, snapshot)


if __name__ == "__main__":
    unittest.main()
