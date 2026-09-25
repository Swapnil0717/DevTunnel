import unittest

import dataset
from architecture import FieldProposal, InferenceInput, RejectedResult, Segment, segment_issue
from pretrain import StageRecord
from task_training import (
    LOSS_TERMS, PHASE11_NAMED_ADVERSARIAL_MODES, STAGE_1, STAGE_2, STAGE_ORDER, EvalEvent,
    adversarial_gate, adversarial_registry_gaps, apply_metadata_dropout, batch_composition_check,
    calibration_gate, checkpoints_to_retain, classification_gate, classify_failure, clipped_source_target,
    consistency_violations, evidence_identity_rate, fields_with_withheld_evidence, generation_gate,
    grounding_gate, length_decorrelation_gate, length_label_correlation, next_expected_stage,
    pre_downgrade_violation_rate, recalibration_target, regression_tripwire, release_verdict,
    schema_validity_gate, schema_validity_report, select_training_records, unsupported_entities,
    validate_checkpoint_identity, validate_evaluation_log, validate_quality_weights,
    validate_stage2_lineage, validate_stage_advance, validate_stage_config,
)


def identity(stage=STAGE_1, **over):
    heads = ["C", "D", "E", "F"] if stage == STAGE_1 else ["C", "D", "E", "F", "G"]
    rec = {
        "checkpoint_id": "ck-s1" if stage == STAGE_1 else "ck-s2",
        "created_at": "2026-09-24T00:00:00Z", "stage": stage,
        "source_checkpoint": {"checkpoint_id": "p10-d", "stage": "stageD_task_shaped_narrowing"},
        "tokenizer_version": "tok-1",
        "head_configuration": {"heads": heads, "architecture_version": "p8-1"},
        "training_data_manifest_hash": "abc123",
        "loss_weight_config": {t: 1.0 for t in LOSS_TERMS},
    }
    if stage == STAGE_2:
        rec["parent_checkpoint_id"] = "ck-s1"
    rec.update(over)
    return rec


class TestStages(unittest.TestCase):
    def test_order_and_next(self):
        self.assertEqual(STAGE_ORDER, ("stage_1_joint", "stage_2_calibrated"))
        self.assertEqual(next_expected_stage([]), STAGE_1)
        self.assertEqual(next_expected_stage([StageRecord(STAGE_1, True, "a")]), STAGE_2)
        self.assertIsNone(next_expected_stage([StageRecord(STAGE_1, True, "a"), StageRecord(STAGE_2, True, "b")]))

    def test_stage2_cannot_compensate_for_failed_stage1(self):
        v = validate_stage_advance([StageRecord(STAGE_1, False, "a")], STAGE_2, True)
        self.assertTrue(v)

    def test_stage2_not_rerun_unless_recalibrating(self):
        hist = [StageRecord(STAGE_1, True, "a"), StageRecord(STAGE_2, True, "b")]
        self.assertTrue(validate_stage_advance(hist, STAGE_2, True))
        self.assertEqual(validate_stage_advance(hist, STAGE_2, True, recalibrating=True), [])

    def test_recalibration_needs_passed_stage1_and_never_reruns_stage1(self):
        self.assertTrue(validate_stage_advance([StageRecord(STAGE_1, False)], STAGE_2, True, recalibrating=True))
        hist = [StageRecord(STAGE_1, True, "a")]
        self.assertTrue(validate_stage_advance(hist, STAGE_1, True, recalibrating=True))


class TestIdentity(unittest.TestCase):
    def test_valid_records(self):
        self.assertEqual(validate_checkpoint_identity(identity(STAGE_1)), [])
        self.assertEqual(validate_checkpoint_identity(identity(STAGE_2)), [])

    def test_missing_fields(self):
        r = identity()
        del r["loss_weight_config"]
        r["training_data_manifest_hash"] = ""
        self.assertEqual(len(validate_checkpoint_identity(r)), 2)

    def test_source_must_be_phase10_promoted_stage(self):
        r = identity(source_checkpoint={"checkpoint_id": "x", "stage": "stageA_concept_coverage"})
        self.assertTrue(any("Phase 10" in m for m in validate_checkpoint_identity(r)))

    def test_stage_c_source_allowed(self):
        r = identity(source_checkpoint={"checkpoint_id": "x", "stage": "stageC_repository_integration"})
        self.assertEqual(validate_checkpoint_identity(r), [])

    def test_tokenizer_drift(self):
        r = identity(tokenizer_version="tok-2")
        self.assertTrue(validate_checkpoint_identity(r, expected_tokenizer_version="tok-1"))
        self.assertEqual(validate_checkpoint_identity(identity(), expected_tokenizer_version="tok-1"), [])

    def test_stage1_rejects_calibrator_and_missing_heads(self):
        r = identity(head_configuration={"heads": ["C", "D", "G"], "architecture_version": "p8-1"})
        msgs = " ".join(validate_checkpoint_identity(r))
        self.assertIn("missing ['E', 'F']", msgs)
        self.assertIn("calibrator", msgs)

    def test_stage2_needs_g_and_parent(self):
        r = identity(STAGE_2, head_configuration={"heads": ["C", "D", "E", "F"], "architecture_version": "p8-1"})
        del r["parent_checkpoint_id"]
        msgs = " ".join(validate_checkpoint_identity(r))
        self.assertIn("missing ['G']", msgs)
        self.assertIn("parent_checkpoint_id", msgs)

    def test_stage1_with_parent_rejected(self):
        self.assertTrue(validate_checkpoint_identity(identity(STAGE_1, parent_checkpoint_id="x")))

    def test_unknown_stage_and_head(self):
        self.assertTrue(validate_checkpoint_identity(identity(stage="stage_9")))
        r = identity(head_configuration={"heads": ["C", "D", "E", "F", "Z"], "architecture_version": "1"})
        self.assertTrue(validate_checkpoint_identity(r))


class TestLineage(unittest.TestCase):
    def test_clean_lineage(self):
        self.assertEqual(validate_stage2_lineage(identity(STAGE_2), [identity(STAGE_1)]), [])

    def test_unknown_parent(self):
        self.assertTrue(validate_stage2_lineage(identity(STAGE_2, parent_checkpoint_id="nope"), [identity(STAGE_1)]))

    def test_id_collision_is_in_place_update(self):
        v = validate_stage2_lineage(identity(STAGE_2, checkpoint_id="ck-s1"), [identity(STAGE_1)])
        self.assertIn("collides", v[0])

    def test_state_must_match_parent(self):
        v = validate_stage2_lineage(identity(STAGE_2, training_data_manifest_hash="other"), [identity(STAGE_1)])
        self.assertEqual(len(v), 1)
        self.assertIn("training_data_manifest_hash", v[0])

    def test_parent_must_be_stage1(self):
        s2_as_parent = identity(STAGE_2, checkpoint_id="ck-s1")
        v = validate_stage2_lineage(identity(STAGE_2, checkpoint_id="ck-s2b", parent_checkpoint_id="ck-s1"), [s2_as_parent])
        self.assertTrue(any("not stage_1_joint" in m for m in v))


class TestRetentionRollback(unittest.TestCase):
    def test_parent_of_retained_stage2_is_kept(self):
        hist = [StageRecord(STAGE_1, True, "s1a", 0.5), StageRecord(STAGE_1, True, "s1b", 0.9),
                StageRecord(STAGE_2, True, "s2a", 0.7)]
        keep = checkpoints_to_retain(hist, parent_of={"s2a": "s1a"})
        self.assertEqual(keep, {"s1a", "s1b", "s2a"})  # s1a is best-not-latest? latest=s1b, best=s1b; s1a kept via parent
        self.assertNotIn("s1a", checkpoints_to_retain(hist))

    def test_recalibration_target(self):
        self.assertEqual(recalibration_target(identity(STAGE_2)), "ck-s1")
        self.assertIsNone(recalibration_target(identity(STAGE_1)))


class TestStageConfig(unittest.TestCase):
    def s1(self, **o):
        c = {"trainable_components": {"C", "D", "E", "F"}, "encoder_frozen": False, "encoder_lr": 1e-5,
             "head_lr": 1e-4, "loss_terms": {t: 1.0 for t in LOSS_TERMS}}
        c.update(o)
        return c

    def s2(self, **o):
        c = {"trainable_components": {"G"}, "encoder_frozen": True,
             "calibrator_granularity": "field_x_source_type", "calibration_fit_dataset": "validation"}
        c.update(o)
        return c

    def test_valid(self):
        self.assertEqual(validate_stage_config(STAGE_1, self.s1()), [])
        self.assertEqual(validate_stage_config(STAGE_2, self.s2()), [])

    def test_sequential_head_training_rejected(self):
        self.assertTrue(validate_stage_config(STAGE_1, self.s1(trainable_components={"C"})))

    def test_g_not_trained_in_stage1(self):
        self.assertTrue(validate_stage_config(STAGE_1, self.s1(trainable_components={"C", "D", "E", "F", "G"})))

    def test_encoder_lr_must_be_lower(self):
        self.assertTrue(validate_stage_config(STAGE_1, self.s1(encoder_lr=1e-3)))
        self.assertTrue(validate_stage_config(STAGE_1, self.s1(encoder_lr=1e-4)))  # equal is not lower
        self.assertTrue(validate_stage_config(STAGE_1, self.s1(encoder_lr=None)))

    def test_missing_zero_and_unknown_loss_terms(self):
        terms = {t: 1.0 for t in LOSS_TERMS}
        del terms["L_copy"]
        terms["L_abstain"] = 0
        terms["L_bogus"] = 1
        msgs = " ".join(validate_stage_config(STAGE_1, self.s1(loss_terms=terms)))
        self.assertIn("L_copy missing", msgs)
        self.assertIn("L_abstain has non-positive", msgs)
        self.assertIn("L_bogus", msgs)

    def test_stage2_requirements(self):
        self.assertTrue(validate_stage_config(STAGE_2, self.s2(encoder_frozen=False)))
        self.assertTrue(validate_stage_config(STAGE_2, self.s2(trainable_components={"G", "C"})))
        self.assertTrue(validate_stage_config(STAGE_2, self.s2(calibrator_granularity="pooled")))
        self.assertTrue(validate_stage_config(STAGE_2, self.s2(calibration_fit_dataset="test")))

    def test_unknown_stage(self):
        self.assertTrue(validate_stage_config("nope", {}))


def rec(eid="e1", ds="training", tier=1, method="HUMAN", quality="GOLD", **gt):
    return {
        "example_id": eid,
        "dataset_assignment": {"dataset_id": ds},
        "input": {"context_tier": tier, "issue": {"title": "t" * 10, "body": "b" * 10}},
        "label_provenance": {"labeling_method": method},
        "quality_status": {"tier": quality},
        "ground_truth": {"task": gt.get("task", {}), "provenance": gt.get("provenance", {})},
    }


class TestTrainingData(unittest.TestCase):
    def test_only_training_tier1_eligible(self):
        recs = [rec("a"), rec("b", ds="adversarial"), rec("c", ds="validation"), rec("d", tier=2),
                rec("e", quality="REJECTED")]
        ok, bad = select_training_records(recs)
        self.assertEqual([r["example_id"] for r in ok], ["a"])
        self.assertEqual({b[0] for b in bad}, {"b", "c", "d", "e"})

    def test_missing_fields_are_excluded_not_crashing(self):
        ok, bad = select_training_records([{"example_id": "x"}])
        self.assertEqual(ok, [])
        self.assertEqual(bad[0][0], "x")

    def test_batch_synthetic_minority(self):
        syn = lambda: rec(method="SYNTHETIC", quality="SILVER")
        self.assertEqual(batch_composition_check([syn(), rec(), rec()]), [])
        self.assertTrue(batch_composition_check([syn(), rec()]))          # exactly half is not a minority
        self.assertTrue(batch_composition_check([syn(), syn()]))          # synthetic can't fill a batch alone
        self.assertEqual(batch_composition_check([syn(), rec()], max_synthetic_share=0.6), [])
        self.assertTrue(batch_composition_check([]))

    def test_quality_weights(self):
        self.assertEqual(validate_quality_weights({"GOLD": 1.0, "SILVER": 0.5}), [])
        self.assertEqual(validate_quality_weights({"GOLD": 1.0, "SILVER": 1.0, "REJECTED": 0}), [])
        self.assertTrue(validate_quality_weights({"GOLD": 0.5, "SILVER": 1.0}))
        self.assertTrue(validate_quality_weights({"GOLD": 1.0}))
        self.assertTrue(validate_quality_weights({"GOLD": 1, "SILVER": 1, "REJECTED": 0.1}))


def tier1_segments():
    return segment_issue(InferenceInput(
        repo="o/r", issue_number=1, issue_url="u", snapshot_fetched_at="t", title="Crash on login",
        body="Login button throws in React", labels=["bug", "frontend"],
        comments=[{"author_role": "maintainer", "body": "Looks like an auth issue"}]))


class TestDropout(unittest.TestCase):
    def test_only_labels_and_milestones_withheld(self):
        segs = tier1_segments()
        kept, withheld = apply_metadata_dropout(segs, "e1", rate=1.0)
        self.assertEqual({s.type for s in segs if s.segment_id in withheld}, {"LABEL"})
        self.assertEqual({s.type for s in kept}, {"ISSUE_TITLE", "ISSUE_BODY", "COMMENT"})

    def test_rate_zero_keeps_everything(self):
        segs = tier1_segments()
        kept, withheld = apply_metadata_dropout(segs, "e1", rate=0.0)
        self.assertEqual(kept, segs)
        self.assertEqual(withheld, set())

    def test_deterministic_and_varies_by_example(self):
        segs = tier1_segments() * 1
        a = apply_metadata_dropout(segs, "e1", rate=0.5, seed=3)
        b = apply_metadata_dropout(segs, "e1", rate=0.5, seed=3)
        self.assertEqual(a[1], b[1])
        outcomes = {frozenset(apply_metadata_dropout(segs, f"e{i}", rate=0.5)[1]) for i in range(40)}
        self.assertGreater(len(outcomes), 1)

    def test_bad_rate(self):
        with self.assertRaises(ValueError):
            apply_metadata_dropout([], "e", rate=1.5)

    def test_fields_with_withheld_evidence(self):
        got = fields_with_withheld_evidence({"role": ["S3"], "task_type": ["S1", "S3"], "complexity": []}, {"S3"})
        self.assertEqual(got, ["role"])


class TestLengthDecorrelation(unittest.TestCase):
    def mk(self, n, exp):
        r = rec(task={"experience_level": exp, "complexity": "Low"})
        r["input"]["issue"] = {"title": "x", "body": "y" * n}
        return r

    def test_correlated_lengths_detected(self):
        recs = [self.mk(10, "Beginner"), self.mk(100, "Intermediate"), self.mk(1000, "Advanced")]
        c = length_label_correlation(recs, "experience_level")
        self.assertGreater(c, 0.8)

    def test_decorrelated_contrast_pairs(self):
        recs = [self.mk(10, "Advanced"), self.mk(1000, "Beginner"), self.mk(10, "Beginner"), self.mk(1000, "Advanced")]
        self.assertAlmostEqual(length_label_correlation(recs, "experience_level"), 0.0)

    def test_unknown_excluded_and_no_variance_is_none(self):
        recs = [self.mk(10, "Unknown"), self.mk(100, "Unknown")]
        self.assertIsNone(length_label_correlation(recs, "experience_level"))
        self.assertIsNone(length_label_correlation([self.mk(5, "Beginner"), self.mk(9, "Beginner")], "experience_level"))

    def test_bad_field(self):
        with self.assertRaises(ValueError):
            length_label_correlation([], "role")

    def test_custom_length_fn(self):
        recs = [self.mk(10, "Beginner"), self.mk(10, "Advanced")]
        self.assertIsNone(length_label_correlation(recs, "experience_level", length_of=lambda r: 5))

    def test_gate(self):
        self.assertEqual(length_decorrelation_gate({"experience_level": 0.05, "complexity": -0.1}, max_abs_correlation=0.2), [])
        self.assertEqual(len(length_decorrelation_gate({"experience_level": 0.5, "complexity": -0.1}, max_abs_correlation=0.2)), 1)
        self.assertEqual(len(length_decorrelation_gate({"experience_level": None, "complexity": 0.0}, max_abs_correlation=0.2)), 1)
        self.assertEqual(len(length_decorrelation_gate({"complexity": 0.0}, max_abs_correlation=0.2)), 1)


class TestGroundingContract(unittest.TestCase):
    def setUp(self):
        self.segs = tier1_segments()
        self.by_id = {s.segment_id: s for s in self.segs}
        ids = [s.segment_id for s in self.segs]
        self.title, self.body, self.label, self.comment = ids[0], ids[1], ids[2], ids[-1]

    def test_consistent_proposals(self):
        self.assertEqual(consistency_violations(FieldProposal("role", "Frontend", "EXPLICIT", [self.body])), [])
        self.assertEqual(consistency_violations(FieldProposal("role", "Unknown", "UNKNOWN", [])), [])
        self.assertEqual(consistency_violations(FieldProposal("technologies", [], "UNKNOWN", [])), [])

    def test_value_source_disagreement(self):
        self.assertTrue(consistency_violations(FieldProposal("role", "Unknown", "INFERRED", [self.body])))
        self.assertTrue(consistency_violations(FieldProposal("role", "Frontend", "UNKNOWN", [])))

    def test_source_without_pointer_or_unknown_with_pointer(self):
        self.assertTrue(consistency_violations(FieldProposal("role", "Frontend", "EXPLICIT", [])))
        self.assertTrue(consistency_violations(FieldProposal("role", "Unknown", "UNKNOWN", [self.body])))

    def test_source_target_clipping(self):
        pointed_label = [self.by_id[self.label]]
        pointed_body = [self.by_id[self.body]]
        self.assertEqual(clipped_source_target("EXPLICIT", pointed_label), "SUPPORTED_BY_CONTEXT")
        self.assertEqual(clipped_source_target("EXPLICIT", pointed_body), "EXPLICIT")
        self.assertEqual(clipped_source_target("INFERRED", pointed_label), "INFERRED")
        self.assertEqual(clipped_source_target("UNKNOWN", pointed_body), "UNKNOWN")
        self.assertEqual(clipped_source_target("EXPLICIT", []), "UNKNOWN")
        with self.assertRaises(ValueError):
            clipped_source_target("MADE_UP", pointed_body)

    def test_comment_ceiling(self):
        self.assertEqual(clipped_source_target("EXPLICIT", [self.by_id[self.comment]]), "SUPPORTED_BY_CONTEXT")

    def test_pre_downgrade_rate(self):
        props = [FieldProposal("role", "Frontend", "EXPLICIT", [self.label]),       # over-claims
                 FieldProposal("task_type", "bug", "EXPLICIT", [self.body]),
                 FieldProposal("complexity", "Low", "INFERRED", [self.label]),
                 FieldProposal("experience_level", "Unknown", "UNKNOWN", [])]
        self.assertEqual(pre_downgrade_violation_rate(props, self.by_id), 0.25)
        with self.assertRaises(ValueError):
            pre_downgrade_violation_rate([], self.by_id)

    def test_unsupported_entities(self):
        pred = {"React": [self.body], "Kubernetes": [], "Redis": ["S99"], "Login": [self.body]}
        self.assertEqual(unsupported_entities(pred, self.by_id), ["Kubernetes", "Redis"])

    def test_unsupported_entities_textual_mention(self):
        pred = {"React": [self.body], "Postgres": [self.body]}
        self.assertEqual(unsupported_entities(pred, self.by_id), [])
        self.assertEqual(unsupported_entities(pred, self.by_id, require_textual_mention=True), ["Postgres"])

    def test_evidence_identity_rate(self):
        same = {"provenance": {"experience_level": {"evidence": "e"}, "complexity": {"evidence": "e"}}}
        diff = {"provenance": {"experience_level": {"evidence": "e"}, "complexity": {"evidence": "f"}}}
        unk = {"provenance": {"experience_level": {"evidence": None}, "complexity": {"evidence": None}}}
        self.assertEqual(evidence_identity_rate([same, diff, unk]), 0.5)
        self.assertIsNone(evidence_identity_rate([unk]))
        gt_shaped = rec(provenance=same["provenance"])
        self.assertEqual(evidence_identity_rate([gt_shaped]), 1.0)


class TestEvaluationGates(unittest.TestCase):
    def test_classification_needs_all_four_floors(self):
        floors = {"role": 0.8, "experience_level": 0.7, "complexity": 0.7, "task_type": 0.8}
        good = {"role": 0.9, "experience_level": 0.75, "complexity": 0.7, "task_type": 0.8}
        self.assertEqual(classification_gate(good, floors), [])
        self.assertEqual(len(classification_gate({**good, "role": 0.5}, floors)), 1)
        self.assertEqual(len(classification_gate(good, {"role": 0.8})), 3)          # missing floors flagged
        self.assertEqual(len(classification_gate({"role": 0.9}, floors)), 3)         # unmeasured fields flagged

    def test_grounding_gate(self):
        kw = dict(min_pointer_resolution_rate=0.95, min_explicit_textual_support_rate=0.9,
                  max_pre_downgrade_violation_rate=0.05)
        m = {"pointer_resolution_rate": 0.97, "explicit_textual_support_rate": 0.92, "pre_downgrade_violation_rate": 0.02}
        self.assertEqual(grounding_gate(m, **kw), [])
        self.assertEqual(len(grounding_gate({**m, "pre_downgrade_violation_rate": 0.2}, **kw)), 1)
        self.assertEqual(len(grounding_gate({"pointer_resolution_rate": 1.0}, **kw)), 2)

    def test_generation_gate(self):
        kw = dict(min_claim_support_rate=0.9, min_acceptance_criteria_adequacy=0.85)
        self.assertEqual(generation_gate({"claim_support_rate": 0.95, "acceptance_criteria_adequacy": 0.9}, **kw), [])
        self.assertEqual(len(generation_gate({"claim_support_rate": 0.5, "acceptance_criteria_adequacy": 0.9}, **kw)), 1)

    def test_schema_validity(self):
        import test_example
        good = test_example.make_example()["ground_truth"]
        report = schema_validity_report([good, good])
        self.assertEqual(schema_validity_gate(report), [])
        report = schema_validity_report([good, RejectedResult(["x"])])
        self.assertEqual(report["rejected"], 1)
        self.assertTrue(schema_validity_gate(report))

    def test_schema_validity_catches_invalid_emitted_record(self):
        report = schema_validity_report([{"schema_version": "2.0.0"}])
        self.assertEqual(report["emitted_invalid"], [0])
        self.assertTrue(schema_validity_gate(report))
        self.assertTrue(schema_validity_gate(schema_validity_report([])))

    def test_adversarial_per_mode_never_pooled(self):
        thr = {m: 0.1 for m in PHASE11_NAMED_ADVERSARIAL_MODES}
        rates = {"fabricated_grounding_bait": 0.0, "spurious_keyword_correlation": 0.0, "experience_complexity_collapse": 0.0}
        self.assertEqual(adversarial_gate(rates, thr), [])
        rates["spurious_keyword_correlation"] = 0.3
        v = adversarial_gate(rates, thr)
        self.assertEqual(len(v), 1)
        self.assertIn("spurious_keyword_correlation", v[0])

    def test_adversarial_unevaluated_or_unthresholded_mode(self):
        thr = {m: 0.1 for m in PHASE11_NAMED_ADVERSARIAL_MODES}
        self.assertEqual(len(adversarial_gate({"fabricated_grounding_bait": 0.0}, thr)), 2)
        rates = {m: 0.0 for m in PHASE11_NAMED_ADVERSARIAL_MODES}
        self.assertEqual(len(adversarial_gate({**rates, "new_mode": 0.0}, thr)), 1)

    def test_registry_gap_between_phase11_names_and_phase7_registry(self):
        # Phase 11 s6.4 names three modes; Phase 7's D13 registry (dataset.FAILURE_MODES) is
        # the Phase 15 list. This surfaces whichever names the registry cannot currently tag.
        self.assertEqual(adversarial_registry_gaps(["a", "b"], ["b"]), ["a"])
        gaps = adversarial_registry_gaps(PHASE11_NAMED_ADVERSARIAL_MODES, dataset.FAILURE_MODES)
        self.assertIsInstance(gaps, list)

    def test_calibration_per_cell(self):
        cells = {("role", "EXPLICIT"): {"high_confidence_accuracy": 0.95, "low_confidence_accuracy": 0.6},
                 ("role", "INFERRED"): {"high_confidence_accuracy": 0.7, "low_confidence_accuracy": 0.5}}
        self.assertEqual(calibration_gate(cells), [])

    def test_calibration_failures(self):
        cells = {("role", "EXPLICIT"): {"high_confidence_accuracy": 0.6, "low_confidence_accuracy": 0.6},   # tie fails
                 "pooled": {"high_confidence_accuracy": 0.9, "low_confidence_accuracy": 0.1},
                 ("complexity", "INFERRED"): {"high_confidence_accuracy": 0.9}}
        v = calibration_gate(cells)
        self.assertEqual(len(v), 3)
        self.assertTrue(calibration_gate({}))

    def test_regression_tripwire(self):
        self.assertEqual(regression_tripwire({"r1": True, "r2": True}), [])
        self.assertEqual(regression_tripwire({"r1": True, "r2": False, "r0": False}), ["r0", "r2"])


class TestEvaluationLog(unittest.TestCase):
    def ev(self, ds, purpose="evaluation", ck="ck-s2", stage=STAGE_2):
        return EvalEvent(ds, ck, stage, purpose)

    def test_clean_run(self):
        log = [self.ev("validation", ck="ck-s1", stage=STAGE_1), self.ev("validation", "calibration"),
               self.ev("hard_case"), self.ev("test"), self.ev("regression")]
        self.assertEqual(validate_evaluation_log(log), [])

    def test_test_twice_is_process_failure(self):
        v = validate_evaluation_log([self.ev("test"), self.ev("test")])
        self.assertTrue(any("exactly once" in m for m in v))

    def test_test_never_for_tuning_or_calibration(self):
        self.assertTrue(validate_evaluation_log([self.ev("test", "threshold_tuning")]))
        self.assertTrue(validate_evaluation_log([self.ev("test", "calibration")]))
        self.assertTrue(validate_evaluation_log([self.ev("test", "model_selection")]))

    def test_test_only_after_stage2(self):
        v = validate_evaluation_log([self.ev("test", ck="ck-s1", stage=STAGE_1)])
        self.assertTrue(any("consumed at the end" in m for m in v))

    def test_regression_after_test_on_same_checkpoint(self):
        self.assertTrue(any("before Test" in m for m in validate_evaluation_log([self.ev("regression")])))
        log = [self.ev("test"), self.ev("regression", ck="other")]
        self.assertTrue(any("would ship" in m for m in validate_evaluation_log(log)))

    def test_only_training_dataset_trains(self):
        self.assertTrue(validate_evaluation_log([self.ev("adversarial", "training", stage=STAGE_1)]))
        self.assertEqual(validate_evaluation_log([self.ev("training", "training", stage=STAGE_1)]), [])

    def test_calibration_on_non_validation(self):
        self.assertTrue(validate_evaluation_log([self.ev("hard_case", "calibration")]))


class TestReleaseAndFailures(unittest.TestCase):
    def clean(self, **over):
        kw = dict(stage2_history=[StageRecord(STAGE_1, True, "a"), StageRecord(STAGE_2, True, "b")],
                  schema_violations=[], adversarial_violations=[], calibration_violations=[],
                  evaluation_log_violations=[], regression_failures=[], confidence_actionable=True)
        kw.update(over)
        return release_verdict(**kw)

    def test_clean_is_release_candidate(self):
        v = self.clean()
        self.assertTrue(v.release_candidate)
        self.assertEqual(v.blockers, [])

    def test_each_input_blocks(self):
        for over in ({"schema_violations": ["x"]}, {"adversarial_violations": ["x"]},
                     {"calibration_violations": ["x"]}, {"evaluation_log_violations": ["x"]},
                     {"regression_failures": ["r1"]}, {"confidence_actionable": False},
                     {"stage2_history": [StageRecord(STAGE_1, True, "a")]},
                     {"stage2_history": [StageRecord(STAGE_2, False, "b")]}):
            v = self.clean(**over)
            self.assertFalse(v.release_candidate, over)
            self.assertEqual(len(v.blockers), 1, over)

    def test_regression_blocks_even_if_all_else_is_perfect(self):
        v = self.clean(regression_failures=["r7"])
        self.assertIn("r7", v.blockers[0])

    def test_failure_table(self):
        self.assertEqual(len(__import__("task_training").PHASE11_FAILURE_MODES), 7)
        for hard in ("adversarial_mode_over_threshold", "regression_tripwire", "schema_validity_below_100",
                     "test_consumed_more_than_once", "confidence_not_actionable"):
            self.assertTrue(classify_failure(hard).hard_blocker, hard)
        for soft in ("calibration_cell_failure", "evidence_identity_violation_post_training"):
            self.assertFalse(classify_failure(soft).hard_blocker, soft)

    def test_traced_to_start_and_unknown(self):
        self.assertTrue(classify_failure("regression_tripwire", traced_to_start=True).rollback_to_stage_zero)
        with self.assertRaises(ValueError):
            classify_failure("made_up")


if __name__ == "__main__":
    unittest.main()
