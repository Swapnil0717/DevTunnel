import unittest

from pretrain import CorpusSource, StageRecord
from domain_training import (
    NEW_CONCEPT_CATEGORIES,
    STAGE_ORDER,
    classify_failure,
    concept_coverage_gate,
    domain_contamination_reaudit,
    domain_corpus_inclusion_check,
    domain_filter_corpus,
    next_expected_stage,
    relation_probe_gate,
    select_deliverable_checkpoint,
    validate_checkpoint_identity,
    validate_stage_advance,
)


class TestDomainCorpusInclusion(unittest.TestCase):
    def setUp(self):
        self.repo_split = {"org/train-repo": "training", "org/test-repo": "test"}
        self.licenses = {"mit"}

    def test_pr_process_text_from_training_repo_included(self):
        d = domain_corpus_inclusion_check(
            CorpusSource("s1", "pr_process", "mit", "org/train-repo"), self.repo_split, self.licenses
        )
        self.assertTrue(d.included)

    def test_pr_resolving_text_from_training_repo_excluded(self):
        d = domain_corpus_inclusion_check(
            CorpusSource("s2", "pr_resolving", "mit", "org/train-repo"), self.repo_split, self.licenses
        )
        self.assertFalse(d.included)
        self.assertIn("pr_resolving", d.reason)

    def test_issue_text_still_excluded_same_as_phase9(self):
        d = domain_corpus_inclusion_check(
            CorpusSource("s3", "issue_text", "mit", "org/train-repo"), self.repo_split, self.licenses
        )
        self.assertFalse(d.included)
        self.assertIn("issue text is excluded", d.reason)  # exact Phase 9 wording preserved

    def test_non_training_repo_still_excluded_outright(self):
        d = domain_corpus_inclusion_check(
            CorpusSource("s4", "pr_process", "mit", "org/test-repo"), self.repo_split, self.licenses
        )
        self.assertFalse(d.included)

    def test_git_docs_general_text_included(self):
        d = domain_corpus_inclusion_check(
            CorpusSource("s5", "git_docs", "mit", None), self.repo_split, self.licenses
        )
        self.assertTrue(d.included)

    def test_domain_filter_corpus_splits_correctly(self):
        sources = [
            CorpusSource("a", "pr_process", "mit", "org/train-repo"),
            CorpusSource("b", "pr_resolving", "mit", "org/train-repo"),
            CorpusSource("c", "issue_text", "mit", "org/train-repo"),
        ]
        included, excluded = domain_filter_corpus(sources, self.repo_split, self.licenses)
        self.assertEqual([d.source_id for d in included], ["a"])
        self.assertEqual({d.source_id for d in excluded}, {"b", "c"})

    def test_phase9_corpus_check_unaffected_by_phase10_widening(self):
        # Regression guard: pretrain.corpus_inclusion_check's own default must still allow
        # pr_resolving content (Phase 9 never heard of that content type).
        import pretrain
        d = pretrain.corpus_inclusion_check(
            CorpusSource("z", "pr_resolving", "mit", "org/train-repo"), self.repo_split, self.licenses
        )
        self.assertTrue(d.included)


class TestDomainContaminationReaudit(unittest.TestCase):
    def test_resolving_pr_from_training_repo_flagged(self):
        repo_split = {"org/r1": "training"}
        sources = [CorpusSource("a", "pr_resolving", "mit", "org/r1")]
        findings = domain_contamination_reaudit(sources, repo_split)
        self.assertEqual(len(findings), 1)

    def test_process_pr_from_training_repo_not_flagged(self):
        repo_split = {"org/r1": "training"}
        sources = [CorpusSource("a", "pr_process", "mit", "org/r1")]
        self.assertEqual(domain_contamination_reaudit(sources, repo_split), [])

    def test_drifted_repo_flagged(self):
        repo_split = {"org/r1": "hard_case"}
        sources = [CorpusSource("a", "pr_process", "mit", "org/r1")]
        findings = domain_contamination_reaudit(sources, repo_split)
        self.assertEqual(len(findings), 1)


class TestConceptCoverageGate(unittest.TestCase):
    def test_full_coverage_no_violations(self):
        self.assertEqual(concept_coverage_gate(set(NEW_CONCEPT_CATEGORIES)), [])

    def test_missing_categories_reported(self):
        covered = set(NEW_CONCEPT_CATEGORIES) - {"git", "devops"}
        v = concept_coverage_gate(covered)
        self.assertEqual(len(v), 2)
        self.assertTrue(any("git" in x for x in v))
        self.assertTrue(any("devops" in x for x in v))

    def test_empty_coverage_reports_all(self):
        v = concept_coverage_gate(set())
        self.assertEqual(len(v), len(NEW_CONCEPT_CATEGORIES))

    def test_extra_categories_do_not_hurt(self):
        covered = set(NEW_CONCEPT_CATEGORIES) | {"some_bonus_category"}
        self.assertEqual(concept_coverage_gate(covered), [])


class TestRelationProbeGate(unittest.TestCase):
    def test_clean_pass_no_violations(self):
        v = relation_probe_gate(in_distribution_score=0.8, held_out_phrasing_score=0.75,
                                 phase9_baseline_score=0.5)
        self.assertEqual(v, [])

    def test_no_improvement_over_baseline_flagged(self):
        v = relation_probe_gate(in_distribution_score=0.5, held_out_phrasing_score=0.48,
                                 phase9_baseline_score=0.5)
        self.assertTrue(any("does not exceed" in x for x in v))

    def test_phrasing_overfit_flagged(self):
        v = relation_probe_gate(in_distribution_score=0.9, held_out_phrasing_score=0.5,
                                 phase9_baseline_score=0.5)
        self.assertTrue(any("overfitting" in x for x in v))

    def test_both_failures_reported_together(self):
        v = relation_probe_gate(in_distribution_score=0.5, held_out_phrasing_score=0.1,
                                 phase9_baseline_score=0.5)
        self.assertEqual(len(v), 2)

    def test_custom_thresholds_respected(self):
        # A small phrasing gap that would normally pass now fails under a stricter cap.
        v = relation_probe_gate(in_distribution_score=0.8, held_out_phrasing_score=0.7,
                                 phase9_baseline_score=0.5, max_phrasing_gap=0.05)
        self.assertTrue(any("overfitting" in x for x in v))


class TestStageGatingWrappers(unittest.TestCase):
    def test_next_expected_stage_starts_at_A(self):
        self.assertEqual(next_expected_stage([]), "stageA_concept_coverage")

    def test_next_expected_stage_progresses(self):
        hist = [StageRecord("stageA_concept_coverage", True, "cA")]
        self.assertEqual(next_expected_stage(hist), "stageB_relational_specialization")

    def test_advance_skipping_to_D_blocked(self):
        v = validate_stage_advance([], "stageD_task_shaped_narrowing", True)
        self.assertTrue(len(v) >= 3)  # missing A, B, C

    def test_advance_in_order_ok(self):
        hist = [
            StageRecord("stageA_concept_coverage", True, "cA"),
            StageRecord("stageB_relational_specialization", True, "cB"),
            StageRecord("stageC_repository_integration", True, "cC"),
        ]
        self.assertEqual(validate_stage_advance(hist, "stageD_task_shaped_narrowing", True), [])

    def test_checkpoint_identity_accepts_phase10_stage_names(self):
        record = {
            "checkpoint_id": "ckpt-10-1", "created_at": "2026-01-01T00:00:00Z",
            "base_model_source": {"name": "x", "version": "1", "license": "mit"},
            "tokenizer_version": "tok-0.3", "stage": "stageB_relational_specialization",
            "corpus_manifest_hash": "abc", "objective_config": {"concept_relation": True},
        }
        self.assertEqual(validate_checkpoint_identity(record), [])

    def test_checkpoint_identity_rejects_phase9_stage_name(self):
        record = {
            "checkpoint_id": "ckpt-10-2", "created_at": "2026-01-01T00:00:00Z",
            "base_model_source": {"name": "x", "version": "1", "license": "mit"},
            "tokenizer_version": "tok-0.3", "stage": "stage1_broad_cpt",  # Phase 9 name, wrong here
            "corpus_manifest_hash": "abc", "objective_config": {},
        }
        v = validate_checkpoint_identity(record)
        self.assertTrue(any("not one of" in x for x in v))


class TestStageDDeliverableException(unittest.TestCase):
    def test_all_stages_pass_deliverable_is_D(self):
        hist = [StageRecord(s, True, f"c-{s}") for s in STAGE_ORDER]
        d = select_deliverable_checkpoint(hist)
        self.assertEqual(d.stage, "stageD_task_shaped_narrowing")
        self.assertFalse(d.stage_d_deferred)

    def test_stage_d_fails_falls_back_to_stage_c(self):
        hist = [
            StageRecord("stageA_concept_coverage", True, "cA"),
            StageRecord("stageB_relational_specialization", True, "cB"),
            StageRecord("stageC_repository_integration", True, "cC"),
            StageRecord("stageD_task_shaped_narrowing", False, "cD-bad"),
        ]
        d = select_deliverable_checkpoint(hist)
        self.assertEqual(d.checkpoint_id, "cC")
        self.assertEqual(d.stage, "stageC_repository_integration")
        self.assertTrue(d.stage_d_deferred)

    def test_stage_d_never_attempted_not_marked_deferred(self):
        hist = [
            StageRecord("stageA_concept_coverage", True, "cA"),
            StageRecord("stageB_relational_specialization", True, "cB"),
            StageRecord("stageC_repository_integration", True, "cC"),
        ]
        d = select_deliverable_checkpoint(hist)
        self.assertEqual(d.checkpoint_id, "cC")
        self.assertFalse(d.stage_d_deferred)

    def test_nothing_passed_yields_none(self):
        hist = [StageRecord("stageA_concept_coverage", False, "cA-bad")]
        d = select_deliverable_checkpoint(hist)
        self.assertIsNone(d.checkpoint_id)
        self.assertIsNone(d.stage)

    def test_empty_history_yields_none(self):
        d = select_deliverable_checkpoint([])
        self.assertIsNone(d.checkpoint_id)
        self.assertFalse(d.stage_d_deferred)


class TestFailureClassification(unittest.TestCase):
    def test_corpus_split_drift_is_hard_blocker(self):
        self.assertTrue(classify_failure("corpus_split_drift").hard_blocker)

    def test_license_violation_new_category_is_hard_blocker(self):
        self.assertTrue(classify_failure("license_violation_new_category").hard_blocker)

    def test_tokenizer_offset_drift_is_hard_blocker(self):
        self.assertTrue(classify_failure("tokenizer_offset_drift_new_corpus").hard_blocker)

    def test_stage_d_regression_not_hard_blocker(self):
        self.assertFalse(classify_failure("stage_d_regression").hard_blocker)

    def test_relation_phrasing_overfit_not_hard_blocker(self):
        self.assertFalse(classify_failure("relation_phrasing_overfit").hard_blocker)

    def test_all_seven_modes_covered(self):
        for mode in (
            "relation_phrasing_overfit", "repo_convention_skew", "stage_d_regression",
            "corpus_split_drift", "license_violation_new_category",
            "tokenizer_offset_drift_new_corpus", "domain_fluency_without_grounding",
        ):
            r = classify_failure(mode)
            self.assertEqual(r.mode, mode)

    def test_unknown_mode_raises(self):
        with self.assertRaises(ValueError):
            classify_failure("not_a_real_mode")

    def test_phase9_failure_modes_still_work_after_generalization(self):
        import pretrain
        r = pretrain.classify_failure("tokenizer_offset_failure")
        self.assertTrue(r.hard_blocker)


if __name__ == "__main__":
    unittest.main()
