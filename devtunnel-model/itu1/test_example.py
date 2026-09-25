import copy
import unittest

from derived import finalize
from example import eligible_uses, model_input, validate_example
from test_schema import base_record


def make_example(**over) -> dict:
    gt = finalize(base_record())
    src = gt["task_identity"]["source_issue"]
    ex = {
        "example_id": "11111111-1111-1111-1111-111111111111",
        "input": {
            "issue": {
                "title": src["issue_title_raw"],
                "body": "Submitting an empty discount code throws.",
                "labels": ["bug"],
                "comments": [],
            },
            "context_tier": 1,
            "available_context": {},
        },
        "ground_truth": gt,
        "label_provenance": {
            "labeling_method": "ADJUDICATED_MULTI_ANNOTATOR",
            "annotator_ids": ["a1", "a2"],
            "inter_annotator_agreement": 0.9,
            "source_repo": src["repo"],
            "source_issue_url": src["issue_url"],
            "snapshot_fetched_at": src["snapshot_fetched_at"],
            "license": "MIT",
            "labeled_at": "2026-09-24T00:00:00Z",
            "labeling_tool_version": "guidelines-1.0",
        },
        "quality_status": {"tier": "GOLD", "quality_flags": [], "reviewed_by": None, "review_notes": None},
    }
    ex.update(over)
    return ex


class ExampleTests(unittest.TestCase):
    def assertErr(self, ex, prefix):
        errs = validate_example(ex)
        self.assertTrue(any(prefix in e for e in errs), f"expected {prefix!r} in {errs}")

    def test_valid_example(self):
        self.assertEqual(validate_example(make_example()), [])

    def test_missing_sections(self):
        for k in ("input", "ground_truth", "label_provenance", "quality_status", "example_id"):
            ex = make_example()
            del ex[k]
            self.assertErr(ex, f"missing '{k}'")

    # --- context tiers
    def test_tier1_cannot_carry_readme(self):
        ex = make_example()
        ex["input"]["available_context"] = {"readme": "# Shop"}
        self.assertErr(ex, "'readme' needs Tier 2")

    def test_tier2_cannot_carry_source(self):
        ex = make_example()
        ex["input"]["context_tier"] = 2
        ex["input"]["available_context"] = {"readme": "# Shop", "source_excerpts": ["x = 1"]}
        self.assertErr(ex, "'source_excerpts' needs Tier 3")

    def test_empty_context_values_are_not_provided(self):
        ex = make_example()
        ex["input"]["available_context"] = {"readme": None, "docs": [], "config": [""]}
        self.assertEqual(validate_example(ex), [])

    def test_tier3_allows_source(self):
        ex = make_example()
        ex["input"]["context_tier"] = 3
        ex["input"]["available_context"] = {"readme": "# Shop", "source_excerpts": ["x = 1"]}
        self.assertEqual(validate_example(ex), [])

    def test_tier7_has_no_context_field_yet(self):
        ex = make_example()
        ex["input"]["context_tier"] = 7
        ex["input"]["available_context"] = {"project_conventions": "use tabs"}
        self.assertErr(ex, "unknown context field")

    def test_bad_tier_value(self):
        ex = make_example()
        ex["input"]["context_tier"] = 8
        self.assertErr(ex, "context_tier")

    # --- leakage
    def test_closing_pr_is_rejected(self):
        for text in ("Fixes #42", "closes acme/shop#42", "resolved https://github.com/acme/shop/issues/42"):
            ex = make_example()
            ex["input"]["context_tier"] = 6
            ex["input"]["available_context"] = {"related_prs": [{"title": "PR", "body": text}]}
            self.assertErr(ex, "leakage")

    def test_pr_mentioning_other_issue_is_fine(self):
        ex = make_example()
        ex["input"]["context_tier"] = 6
        ex["input"]["available_context"] = {"related_prs": [{"title": "Fixes #420"}]}
        self.assertEqual(validate_example(ex), [])

    def test_commit_history_leak(self):
        ex = make_example()
        ex["input"]["context_tier"] = 6
        ex["input"]["available_context"] = {"commit_history": [{"message": "fix: closes #42"}]}
        self.assertErr(ex, "leakage")

    # --- label quality
    def test_adjudicated_needs_agreement(self):
        ex = make_example()
        ex["label_provenance"]["inter_annotator_agreement"] = None
        self.assertErr(ex, "inter_annotator_agreement")

    def test_human_labels_need_annotators(self):
        ex = make_example()
        ex["label_provenance"]["annotator_ids"] = []
        self.assertErr(ex, "annotator_ids")

    def test_synthetic_never_gold(self):
        ex = make_example()
        ex["label_provenance"]["labeling_method"] = "SYNTHETIC"
        ex["label_provenance"]["annotator_ids"] = None
        self.assertErr(ex, "SYNTHETIC")
        ex["quality_status"]["tier"] = "BRONZE"
        self.assertEqual(validate_example(ex), [])

    def test_single_expert_gold_needs_second_reviewer(self):
        ex = make_example()
        ex["label_provenance"].update(labeling_method="HUMAN_EXPERT", annotator_ids=["a1"],
                                      inter_annotator_agreement=None)
        self.assertErr(ex, "second reviewer")
        ex["quality_status"]["reviewed_by"] = "senior-1"
        self.assertEqual(validate_example(ex), [])

    def test_ground_truth_must_match_provenance(self):
        ex = make_example()
        ex["label_provenance"]["source_issue_url"] = "https://github.com/acme/shop/issues/43"
        self.assertErr(ex, "issue_url")

    def test_invalid_ground_truth_is_reported(self):
        ex = make_example()
        del ex["ground_truth"]["provenance"]["role"]
        self.assertErr(ex, "ground_truth: rule 1")

    def test_unidentified_language_must_be_rejected(self):
        ex = make_example()
        ex["quality_status"]["tier"] = "SILVER"
        ex["quality_status"]["quality_flags"] = ["unidentified_language"]
        self.assertErr(ex, "unidentified_language")
        ex["quality_status"]["tier"] = "REJECTED"
        self.assertEqual(validate_example(ex), [])

    def test_gold_cannot_carry_flags(self):
        ex = make_example()
        ex["quality_status"]["quality_flags"] = ["low_agreement"]
        self.assertErr(ex, "unresolved quality_flags")

    # --- helpers
    def test_model_input_has_no_labels_or_metadata(self):
        ex = make_example()
        ex["input"]["context_tier"] = 2
        ex["input"]["available_context"] = {"readme": "# Shop", "docs": []}
        mi = model_input(ex)
        self.assertEqual(set(mi), {"issue", "context_tier", "available_context"})
        self.assertEqual(mi["available_context"], {"readme": "# Shop"})
        self.assertNotIn("ground_truth", str(mi))

    def test_eligible_uses(self):
        ex = make_example()
        self.assertEqual(eligible_uses(ex), {"train", "eval"})
        ex["quality_status"]["tier"] = "SILVER"
        self.assertEqual(eligible_uses(ex), {"train"})
        ex["quality_status"]["tier"] = "REJECTED"
        self.assertEqual(eligible_uses(ex), set())

    def test_invalid_example_is_not_eligible(self):
        ex = make_example()
        ex["label_provenance"]["labeling_method"] = "GUESS"
        self.assertEqual(eligible_uses(ex), set())

    def test_validate_does_not_mutate(self):
        ex = make_example()
        snap = copy.deepcopy(ex)
        validate_example(ex)
        self.assertEqual(ex, snap)


if __name__ == "__main__":
    unittest.main()
