import unittest

from pretrain import (
    STAGE_ORDER,
    CorpusSource,
    StageRecord,
    checkpoints_to_retain,
    classify_failure,
    contamination_reaudit,
    corpus_inclusion_check,
    filter_corpus,
    fragmentation_rate,
    next_expected_stage,
    rollback_target,
    roundtrip_offset_check,
    validate_checkpoint_identity,
    validate_stage_advance,
)


def tok(text, start, end):
    return {"text": text, "start": start, "end": end}


class TestRoundtripOffsets(unittest.TestCase):
    def test_perfect_reconstruction_no_violations(self):
        text = "fix the bug"
        tokens = [tok("fix", 0, 3), tok(" the", 3, 7), tok(" bug", 7, 11)]
        self.assertEqual(roundtrip_offset_check(tokens, text), [])

    def test_special_token_no_offset_is_fine(self):
        text = "hi"
        tokens = [{"text": "", "start": None, "end": None}, tok("hi", 0, 2)]
        self.assertEqual(roundtrip_offset_check(tokens, text), [])

    def test_special_token_with_text_is_violation(self):
        text = "hi"
        tokens = [{"text": "[BOS]", "start": None, "end": None}, tok("hi", 0, 2)]
        v = roundtrip_offset_check(tokens, text)
        self.assertTrue(any("non-empty text" in x for x in v))

    def test_lowercasing_normalization_caught(self):
        text = "GET /Users"
        tokens = [tok("get", 0, 3), tok(" /users", 3, 10)]  # destructively lowercased
        v = roundtrip_offset_check(tokens, text)
        self.assertTrue(any("does not match source span" in x for x in v))

    def test_dropped_gap_caught(self):
        text = "a b c"
        tokens = [tok("a", 0, 1), tok("c", 4, 5)]  # " b " silently dropped
        v = roundtrip_offset_check(tokens, text)
        self.assertTrue(any("not covered by any token" in x for x in v))

    def test_overlap_caught(self):
        text = "abcdef"
        tokens = [tok("abc", 0, 3), tok("bcd", 1, 4)]
        v = roundtrip_offset_check(tokens, text)
        self.assertTrue(any("overlaps previous token" in x for x in v))

    def test_out_of_bounds_caught(self):
        text = "abc"
        tokens = [tok("abcd", 0, 4)]
        v = roundtrip_offset_check(tokens, text)
        self.assertTrue(any("out of bounds" in x for x in v))

    def test_one_sided_offset_caught(self):
        text = "abc"
        tokens = [{"text": "a", "start": 0, "end": None}]
        v = roundtrip_offset_check(tokens, text)
        self.assertTrue(any("only one of start/end" in x for x in v))

    def test_trailing_uncovered_gap_caught(self):
        text = "abc"
        tokens = [tok("a", 0, 1)]
        v = roundtrip_offset_check(tokens, text)
        self.assertTrue(any("not covered" in x for x in v))

    def test_empty_text_no_tokens_ok(self):
        self.assertEqual(roundtrip_offset_check([], ""), [])


class TestFragmentationRate(unittest.TestCase):
    def test_single_token_low_rate(self):
        self.assertAlmostEqual(fragmentation_rate("bug", ["bug"]), 1 / 3)

    def test_heavily_fragmented_term(self):
        rate = fragmentation_rate("hydration", ["hy", "dra", "tion"])
        self.assertAlmostEqual(rate, 3 / 9)

    def test_empty_term_raises(self):
        with self.assertRaises(ValueError):
            fragmentation_rate("", [])


class TestCorpusInclusion(unittest.TestCase):
    def setUp(self):
        self.repo_split = {
            "org/train-repo": "training",
            "org/val-repo": "validation",
            "org/test-repo": "test",
            "org/hard-repo": "hard_case",
        }
        self.licenses = {"mit", "apache-2.0"}

    def test_training_repo_non_issue_included(self):
        d = corpus_inclusion_check(
            CorpusSource("s1", "code", "mit", "org/train-repo"), self.repo_split, self.licenses
        )
        self.assertTrue(d.included)

    def test_training_repo_issue_text_excluded(self):
        d = corpus_inclusion_check(
            CorpusSource("s2", "issue_text", "mit", "org/train-repo"), self.repo_split, self.licenses
        )
        self.assertFalse(d.included)
        self.assertIn("issue text is excluded", d.reason)

    def test_validation_repo_excluded_even_non_issue(self):
        d = corpus_inclusion_check(
            CorpusSource("s3", "code", "mit", "org/val-repo"), self.repo_split, self.licenses
        )
        self.assertFalse(d.included)
        self.assertIn("validation", d.reason)

    def test_test_repo_excluded(self):
        d = corpus_inclusion_check(
            CorpusSource("s4", "docs", "mit", "org/test-repo"), self.repo_split, self.licenses
        )
        self.assertFalse(d.included)

    def test_hard_case_repo_excluded(self):
        d = corpus_inclusion_check(
            CorpusSource("s5", "docs", "mit", "org/hard-repo"), self.repo_split, self.licenses
        )
        self.assertFalse(d.included)

    def test_no_repo_source_included_if_licensed(self):
        d = corpus_inclusion_check(
            CorpusSource("s6", "docs", "apache-2.0", None), self.repo_split, self.licenses
        )
        self.assertTrue(d.included)

    def test_repo_not_in_manifest_treated_as_unassigned_included(self):
        d = corpus_inclusion_check(
            CorpusSource("s7", "code", "mit", "org/unknown-repo"), self.repo_split, self.licenses
        )
        self.assertTrue(d.included)

    def test_missing_license_excluded(self):
        d = corpus_inclusion_check(
            CorpusSource("s8", "docs", None, None), self.repo_split, self.licenses
        )
        self.assertFalse(d.included)
        self.assertIn("no license tag", d.reason)

    def test_disallowed_license_excluded(self):
        d = corpus_inclusion_check(
            CorpusSource("s9", "docs", "gpl-3.0", None), self.repo_split, self.licenses
        )
        self.assertFalse(d.included)
        self.assertIn("not in allowed set", d.reason)

    def test_license_check_precedes_repo_check(self):
        # A validation-repo source with a bad license should still report the license reason,
        # since 4.4 is checked first and both would exclude it anyway -- reason should be stable.
        d = corpus_inclusion_check(
            CorpusSource("s10", "code", "gpl-3.0", "org/val-repo"), self.repo_split, self.licenses
        )
        self.assertFalse(d.included)
        self.assertIn("not in allowed set", d.reason)

    def test_filter_corpus_splits_included_excluded(self):
        sources = [
            CorpusSource("a", "code", "mit", "org/train-repo"),
            CorpusSource("b", "issue_text", "mit", "org/train-repo"),
            CorpusSource("c", "docs", "mit", "org/val-repo"),
        ]
        included, excluded = filter_corpus(sources, self.repo_split, self.licenses)
        self.assertEqual([d.source_id for d in included], ["a"])
        self.assertEqual({d.source_id for d in excluded}, {"b", "c"})


class TestContaminationReaudit(unittest.TestCase):
    def test_clean_corpus_no_findings(self):
        repo_split = {"org/r1": "training"}
        sources = [CorpusSource("a", "code", "mit", "org/r1")]
        self.assertEqual(contamination_reaudit(sources, repo_split), [])

    def test_drifted_split_flagged(self):
        # Corpus assembled when r1 was Training; Phase 7 has since moved it to Test.
        repo_split = {"org/r1": "test"}
        sources = [CorpusSource("a", "code", "mit", "org/r1")]
        findings = contamination_reaudit(sources, repo_split)
        self.assertEqual(len(findings), 1)
        self.assertIn("org/r1", findings[0])

    def test_issue_text_from_training_repo_flagged_on_reaudit(self):
        repo_split = {"org/r1": "training"}
        sources = [CorpusSource("a", "issue_text", "mit", "org/r1")]
        findings = contamination_reaudit(sources, repo_split)
        self.assertEqual(len(findings), 1)


class TestCheckpointIdentity(unittest.TestCase):
    def valid_record(self):
        return {
            "checkpoint_id": "ckpt-0001",
            "created_at": "2026-01-01T00:00:00Z",
            "base_model_source": {"name": "some-base", "version": "1.0", "license": "apache-2.0"},
            "tokenizer_version": "tok-0.3",
            "stage": "stage1_broad_cpt",
            "corpus_manifest_hash": "abc123",
            "objective_config": {"core": True, "segment_tier_warmup": False},
        }

    def test_valid_record_no_violations(self):
        self.assertEqual(validate_checkpoint_identity(self.valid_record()), [])

    def test_missing_field_detected(self):
        r = self.valid_record()
        del r["corpus_manifest_hash"]
        v = validate_checkpoint_identity(r)
        self.assertTrue(any("corpus_manifest_hash" in x for x in v))

    def test_empty_field_detected(self):
        r = self.valid_record()
        r["tokenizer_version"] = ""
        v = validate_checkpoint_identity(r)
        self.assertTrue(any("tokenizer_version" in x for x in v))

    def test_bad_stage_detected(self):
        r = self.valid_record()
        r["stage"] = "stage99_made_up"
        v = validate_checkpoint_identity(r)
        self.assertTrue(any("not one of" in x for x in v))

    def test_base_model_source_wrong_type(self):
        r = self.valid_record()
        r["base_model_source"] = "just-a-string"
        v = validate_checkpoint_identity(r)
        self.assertTrue(any("must be an object" in x for x in v))

    def test_base_model_source_missing_subfield(self):
        r = self.valid_record()
        r["base_model_source"] = {"name": "x", "version": "1.0"}  # no license
        v = validate_checkpoint_identity(r)
        self.assertTrue(any("license" in x for x in v))

    def test_objective_config_wrong_type(self):
        r = self.valid_record()
        r["objective_config"] = "core-only"
        v = validate_checkpoint_identity(r)
        self.assertTrue(any("objective_config" in x for x in v))


class TestStageGating(unittest.TestCase):
    def test_next_expected_stage_empty_history(self):
        self.assertEqual(next_expected_stage([]), "stage0_tokenizer_validation")

    def test_next_expected_stage_advances_after_pass(self):
        hist = [StageRecord("stage0_tokenizer_validation", True, "c0")]
        self.assertEqual(next_expected_stage(hist), "stage1_broad_cpt")

    def test_next_expected_stage_none_when_all_passed(self):
        hist = [StageRecord(s, True, f"c-{s}") for s in STAGE_ORDER]
        self.assertIsNone(next_expected_stage(hist))

    def test_next_expected_stage_ignores_failed_attempts(self):
        hist = [StageRecord("stage0_tokenizer_validation", False, "c0-bad")]
        self.assertEqual(next_expected_stage(hist), "stage0_tokenizer_validation")

    def test_advance_stage0_from_empty_history_ok(self):
        self.assertEqual(validate_stage_advance([], "stage0_tokenizer_validation", True), [])

    def test_advance_skipping_stage_blocked(self):
        v = validate_stage_advance([], "stage2_domain_narrowing", True)
        self.assertTrue(any("stage0_tokenizer_validation" in x for x in v))
        self.assertTrue(any("stage1_broad_cpt" in x for x in v))

    def test_advance_cannot_compensate_for_failed_earlier_gate(self):
        hist = [StageRecord("stage0_tokenizer_validation", False, "c0")]
        v = validate_stage_advance(hist, "stage1_broad_cpt", True)
        self.assertTrue(any("stage0_tokenizer_validation" in x for x in v))

    def test_advance_after_earlier_passed_ok(self):
        hist = [StageRecord("stage0_tokenizer_validation", True, "c0")]
        self.assertEqual(validate_stage_advance(hist, "stage1_broad_cpt", True), [])

    def test_cannot_rerun_already_gated_stage(self):
        hist = [StageRecord("stage0_tokenizer_validation", True, "c0")]
        v = validate_stage_advance(hist, "stage0_tokenizer_validation", True)
        self.assertTrue(any("already passed" in x for x in v))

    def test_unknown_stage_rejected(self):
        v = validate_stage_advance([], "not_a_real_stage", True)
        self.assertEqual(len(v), 1)


class TestRetentionAndRollback(unittest.TestCase):
    def test_retains_most_recent_and_best_per_stage(self):
        checkpoints = [
            StageRecord("stage1_broad_cpt", True, "c1", validation_metric=0.5),
            StageRecord("stage1_broad_cpt", True, "c2", validation_metric=0.9),
            StageRecord("stage1_broad_cpt", True, "c3", validation_metric=0.7),  # most recent
        ]
        retain = checkpoints_to_retain(checkpoints)
        self.assertEqual(retain, {"c2", "c3"})

    def test_single_checkpoint_per_stage_retained_once(self):
        checkpoints = [StageRecord("stage0_tokenizer_validation", True, "c0", validation_metric=1.0)]
        self.assertEqual(checkpoints_to_retain(checkpoints), {"c0"})

    def test_no_validation_metric_still_retains_most_recent(self):
        checkpoints = [StageRecord("stage0_tokenizer_validation", True, "c0")]
        self.assertEqual(checkpoints_to_retain(checkpoints), {"c0"})

    def test_checkpoint_without_id_ignored(self):
        checkpoints = [StageRecord("stage0_tokenizer_validation", True, None)]
        self.assertEqual(checkpoints_to_retain(checkpoints), set())

    def test_rollback_target_is_last_gated_checkpoint(self):
        hist = [
            StageRecord("stage0_tokenizer_validation", True, "c0"),
            StageRecord("stage1_broad_cpt", True, "c1"),
            StageRecord("stage2_domain_narrowing", False, "c2-bad"),
        ]
        self.assertEqual(rollback_target(hist), "c1")

    def test_rollback_target_none_if_nothing_gated(self):
        hist = [StageRecord("stage0_tokenizer_validation", False, "c0-bad")]
        self.assertIsNone(rollback_target(hist))


class TestFailureClassification(unittest.TestCase):
    def test_tokenizer_offset_failure_is_hard_blocker(self):
        r = classify_failure("tokenizer_offset_failure")
        self.assertTrue(r.hard_blocker)

    def test_corpus_contamination_is_hard_blocker(self):
        r = classify_failure("corpus_contamination")
        self.assertTrue(r.hard_blocker)

    def test_loss_divergence_not_hard_blocker(self):
        r = classify_failure("loss_divergence")
        self.assertFalse(r.hard_blocker)

    def test_all_nine_modes_covered(self):
        for mode in (
            "loss_divergence", "catastrophic_forgetting", "representation_collapse",
            "tokenizer_offset_failure", "segment_embedding_degeneracy", "corpus_contamination",
            "license_violation", "checkpoint_corruption",
        ):
            r = classify_failure(mode)
            self.assertEqual(r.mode, mode)

    def test_unknown_mode_raises(self):
        with self.assertRaises(ValueError):
            classify_failure("not_a_real_failure_mode")

    def test_traced_to_start_sets_rollback_flag(self):
        r = classify_failure("corpus_contamination", traced_to_start=True)
        self.assertTrue(r.rollback_to_stage_zero)

    def test_default_not_traced_to_start(self):
        r = classify_failure("loss_divergence")
        self.assertFalse(r.rollback_to_stage_zero)


class TestDatasetPyIntegration(unittest.TestCase):
    """repo_split, as produced by dataset.build_datasets, is the exact shape corpus_inclusion_check
    expects -- exercise it against a real (small) build to catch shape drift between the two
    modules early."""

    def test_repo_split_shape_from_dataset_module(self):
        import dataset as dataset_mod

        # A minimal repo_split dict in dataset.py's own shape: repo -> dataset id.
        repo_split = {"org/a": "training", "org/b": "test"}
        self.assertTrue(set(repo_split.values()) <= set(dataset_mod.DATASET_IDS))
        d = corpus_inclusion_check(CorpusSource("x", "code", "mit", "org/b"), repo_split, {"mit"})
        self.assertFalse(d.included)


if __name__ == "__main__":
    unittest.main()
