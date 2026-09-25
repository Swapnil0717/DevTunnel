import unittest

import error_analysis as ea


def valid_failure_record(**overrides) -> dict:
    rec = {
        "failure_id": "f-1",
        "created_at": "2025-01-01T00:00:00Z",
        "source": {
            "task_id": "t-1", "benchmark": "Test", "checkpoint": "ckpt-1",
            "detected_by": "automated_metric",
        },
        "input": "some issue text",
        "ground_truth": {
            "field": "role", "value": "Backend",
            "adjudication_confidence": "adjudicated_agreement",
        },
        "model_output": {"schema_version": "2.0.0"},
        "expected_output": {"field": "role", "acceptable_values": ["Backend"]},
        "error_type": "Model misunderstanding",
        "severity": "High",
        "root_cause": {
            "family": "Training problem", "statement": "under-represented pattern",
            "diagnosed_by": "automated_diagnostic", "confidence": 0.8,
        },
        "corrective_action": {
            "action_type": "retraining_target", "owning_phase": "Phase 11",
            "status": "open",
        },
        "training_data_disposition": {"promote": False, "target_dataset": "none"},
    }
    rec.update(overrides)
    return rec


class TestTaxonomy(unittest.TestCase):
    def test_thirteen_error_types(self):
        self.assertEqual(len(ea.ERROR_TYPES), 13)

    def test_six_families(self):
        self.assertEqual(len(ea.FAMILIES), 6)

    def test_every_error_type_has_default_family(self):
        for et in ea.ERROR_TYPES:
            self.assertIn(ea.DEFAULT_FAMILY_FOR_ERROR_TYPE[et], ea.FAMILIES)

    def test_hallucination_defaults_inference_not_training(self):
        # Table row says "Inference problem (or Training, if systematic)" --
        # the *default* (single-instance) mapping must be Inference.
        self.assertEqual(ea.DEFAULT_FAMILY_FOR_ERROR_TYPE["Hallucination"], "Inference problem")

    def test_relationship_crosstab(self):
        pairs = [("keyword_shortcut", "Reasoning failure"),
                 ("keyword_shortcut", "Insufficient examples"),
                 ("keyword_shortcut", "Reasoning failure")]
        out = ea.relationship_to_failure_mode_targeted(pairs)
        self.assertEqual(out["keyword_shortcut"]["Reasoning failure"], 2)
        self.assertEqual(out["keyword_shortcut"]["Insufficient examples"], 1)


class TestFailureRecordSchema(unittest.TestCase):
    def test_valid_record_passes(self):
        self.assertEqual(ea.validate_failure_record(valid_failure_record()), [])

    def test_missing_top_field(self):
        rec = valid_failure_record()
        del rec["severity"]
        errs = ea.validate_failure_record(rec)
        self.assertTrue(any("severity" in e for e in errs))

    def test_bad_error_type(self):
        rec = valid_failure_record(error_type="Not A Real Type")
        errs = ea.validate_failure_record(rec)
        self.assertTrue(any("error_type invalid" in e for e in errs))

    def test_bad_secondary_error_type(self):
        rec = valid_failure_record(secondary_error_types=["Nonsense"])
        errs = ea.validate_failure_record(rec)
        self.assertTrue(any("secondary_error_types" in e for e in errs))

    def test_bad_severity(self):
        rec = valid_failure_record(severity="Catastrophic")
        errs = ea.validate_failure_record(rec)
        self.assertTrue(any("severity invalid" in e for e in errs))

    def test_bad_root_cause_family(self):
        rec = valid_failure_record()
        rec["root_cause"] = dict(rec["root_cause"])
        rec["root_cause"]["family"] = "Vibes problem"
        errs = ea.validate_failure_record(rec)
        self.assertTrue(any("root_cause.family" in e for e in errs))

    def test_root_cause_confidence_out_of_range(self):
        rec = valid_failure_record()
        rec["root_cause"] = dict(rec["root_cause"])
        rec["root_cause"]["confidence"] = 1.5
        errs = ea.validate_failure_record(rec)
        self.assertTrue(any("confidence" in e for e in errs))

    def test_bad_action_type(self):
        rec = valid_failure_record()
        rec["corrective_action"] = dict(rec["corrective_action"])
        rec["corrective_action"]["action_type"] = "shrug"
        errs = ea.validate_failure_record(rec)
        self.assertTrue(any("action_type invalid" in e for e in errs))

    def test_bad_status(self):
        rec = valid_failure_record()
        rec["corrective_action"] = dict(rec["corrective_action"])
        rec["corrective_action"]["status"] = "vibes"
        errs = ea.validate_failure_record(rec)
        self.assertTrue(any("status invalid" in e for e in errs))

    def test_bad_target_dataset(self):
        rec = valid_failure_record()
        rec["training_data_disposition"] = dict(rec["training_data_disposition"])
        rec["training_data_disposition"]["target_dataset"] = "Mystery"
        errs = ea.validate_failure_record(rec)
        self.assertTrue(any("target_dataset" in e for e in errs))

    def test_missing_source_subfield(self):
        rec = valid_failure_record()
        rec["source"] = {"task_id": "t-1", "benchmark": "Test", "checkpoint": "c"}
        errs = ea.validate_failure_record(rec)
        self.assertTrue(any("detected_by" in e for e in errs))

    def test_bad_adjudication_confidence(self):
        rec = valid_failure_record()
        rec["ground_truth"] = dict(rec["ground_truth"])
        rec["ground_truth"]["adjudication_confidence"] = "vibes"
        errs = ea.validate_failure_record(rec)
        self.assertTrue(any("adjudication_confidence" in e for e in errs))

    def test_non_dict_rejected(self):
        errs = ea.validate_failure_record("not a dict")
        self.assertTrue(errs)


class TestLabelAmbiguitySignal(unittest.TestCase):
    def test_single_matching_value_no_signal(self):
        rec = valid_failure_record()
        self.assertFalse(ea.label_ambiguity_signal(rec))

    def test_ground_truth_not_in_acceptable_values(self):
        rec = valid_failure_record()
        rec["ground_truth"] = dict(rec["ground_truth"])
        rec["ground_truth"]["value"] = "Frontend"
        self.assertTrue(ea.label_ambiguity_signal(rec))

    def test_multiple_acceptable_values_is_signal(self):
        rec = valid_failure_record()
        rec["expected_output"] = dict(rec["expected_output"])
        rec["expected_output"]["acceptable_values"] = ["Backend", "Fullstack"]
        self.assertTrue(ea.label_ambiguity_signal(rec))


class TestDiagnosticSequence(unittest.TestCase):
    def test_step1_schema_wins_over_everything(self):
        d = ea.diagnose(
            schema_violations=["missing field"],
            input_integrity_violations=["truncated"],
            readjudication={"outcome": "overturned"},
        )
        self.assertEqual((d.error_type, d.family, d.step), ("Schema failure", "Architecture problem", 1))

    def test_step2_input_integrity(self):
        d = ea.diagnose(input_integrity_violations=["truncated"],
                         readjudication={"outcome": "overturned"})
        self.assertEqual((d.error_type, d.family, d.step), ("Data quality", "Data problem", 2))

    def test_step3_overturned(self):
        d = ea.diagnose(readjudication={"outcome": "overturned"})
        self.assertEqual((d.error_type, d.family, d.step),
                          ("Incorrect annotation", "Annotation problem", 3))

    def test_step3_split(self):
        d = ea.diagnose(readjudication={"outcome": "split"})
        self.assertEqual((d.error_type, d.family, d.step),
                          ("Label ambiguity", "Annotation problem", 3))

    def test_step3_confirmed_falls_through(self):
        d = ea.diagnose(readjudication={"outcome": "confirmed"},
                         evidence_check={"cites_absent_content": True})
        self.assertEqual(d.error_type, "Hallucination")

    def test_step4_hallucination(self):
        d = ea.diagnose(evidence_check={"cites_absent_content": True})
        self.assertEqual((d.error_type, d.family), ("Hallucination", "Inference problem"))

    def test_step4_context_failure(self):
        d = ea.diagnose(evidence_check={"cites_subset_rest_present": True})
        self.assertEqual((d.error_type, d.family), ("Context failure", "Context problem"))

    def test_step4_retrieval_failure(self):
        d = ea.diagnose(evidence_check={"never_in_assembled_context": True})
        self.assertEqual((d.error_type, d.family), ("Retrieval failure", "Context problem"))

    def test_step4_context_conflict_before_reasoning(self):
        # Both flags set: conflict check must win per fixed order.
        d = ea.diagnose(evidence_check={
            "unresolved_source_conflict": True,
            "accurate_but_conclusion_broken": True,
        })
        self.assertEqual(d.error_type, "Context conflict")

    def test_step4_reasoning_failure(self):
        d = ea.diagnose(evidence_check={"accurate_but_conclusion_broken": True})
        self.assertEqual((d.error_type, d.family), ("Reasoning failure", "Inference problem"))

    def test_step5_insufficient_examples(self):
        d = ea.diagnose(distributional={"below_representation_floor": True,
                                         "is_knowledge_gap": False})
        self.assertEqual((d.error_type, d.family, d.step),
                          ("Insufficient examples", "Data problem", 5))

    def test_step5_technical_knowledge_gap(self):
        d = ea.diagnose(distributional={"below_representation_floor": True,
                                         "is_knowledge_gap": True})
        self.assertEqual(d.error_type, "Technical knowledge gap")

    def test_step5_model_misunderstanding(self):
        d = ea.diagnose(distributional={"below_representation_floor": False,
                                         "confidence_miscalibrated": False})
        self.assertEqual(d.error_type, "Model misunderstanding")

    def test_step5_confidence_failure(self):
        d = ea.diagnose(distributional={"below_representation_floor": False,
                                         "confidence_miscalibrated": True})
        self.assertEqual(d.error_type, "Confidence failure")

    def test_step6_human_confirmation(self):
        d = ea.diagnose()
        self.assertTrue(d.requires_human)
        self.assertIsNone(d.error_type)
        self.assertEqual(d.step, 6)


class TestConfusablePairGuardrails(unittest.TestCase):
    def test_four_pairs_documented(self):
        self.assertEqual(len(ea.CONFUSABLE_PAIRS), 4)
        for row in ea.CONFUSABLE_PAIRS:
            self.assertIn("pair", row)
            self.assertIn("discriminator", row)

    def test_insufficient_examples_vs_architecture(self):
        self.assertEqual(ea.insufficient_examples_or_architecture(True), "Architecture problem")
        self.assertEqual(ea.insufficient_examples_or_architecture(False), "Data problem")

    def test_hallucination_vs_knowledge_gap(self):
        self.assertEqual(ea.hallucination_or_knowledge_gap(True), "Technical knowledge gap")
        self.assertEqual(ea.hallucination_or_knowledge_gap(False), "Hallucination")

    def test_confidence_vs_label_ambiguity(self):
        self.assertEqual(ea.confidence_or_label_ambiguity(["A", "B"]), "Label ambiguity")
        self.assertEqual(ea.confidence_or_label_ambiguity(["A"]), "Confidence failure")


class TestSystematicReclassification(unittest.TestCase):
    def _rec(self, fid, family, pattern):
        r = valid_failure_record(failure_id=fid)
        r["root_cause"] = dict(r["root_cause"])
        r["root_cause"]["family"] = family
        r["_pattern"] = pattern
        return r

    def test_single_instance_not_reclassified(self):
        recs = [self._rec("a", "Inference problem", "p1")]
        out = ea.systematic_reclassification(recs, pattern_key=lambda r: r["_pattern"])
        self.assertEqual(out, {})

    def test_cluster_reclassified_to_training(self):
        recs = [
            self._rec("a", "Inference problem", "p1"),
            self._rec("b", "Inference problem", "p1"),
        ]
        out = ea.systematic_reclassification(recs, pattern_key=lambda r: r["_pattern"])
        self.assertEqual(out, {"a": "Training problem", "b": "Training problem"})

    def test_cluster_reclassified_to_architecture_when_flagged(self):
        recs = [
            self._rec("a", "Inference problem", "p1"),
            self._rec("b", "Inference problem", "p1"),
        ]
        out = ea.systematic_reclassification(recs, pattern_key=lambda r: r["_pattern"],
                                              architecture_signal=True)
        self.assertEqual(set(out.values()), {"Architecture problem"})

    def test_non_inference_family_untouched(self):
        recs = [
            self._rec("a", "Data problem", "p1"),
            self._rec("b", "Data problem", "p1"),
        ]
        out = ea.systematic_reclassification(recs, pattern_key=lambda r: r["_pattern"])
        self.assertEqual(out, {})

    def test_different_patterns_not_clustered(self):
        recs = [
            self._rec("a", "Inference problem", "p1"),
            self._rec("b", "Inference problem", "p2"),
        ]
        out = ea.systematic_reclassification(recs, pattern_key=lambda r: r["_pattern"])
        self.assertEqual(out, {})

    def test_apply_reclassification_does_not_mutate_input(self):
        recs = [
            self._rec("a", "Inference problem", "p1"),
            self._rec("b", "Inference problem", "p1"),
        ]
        reassignment = ea.systematic_reclassification(recs, pattern_key=lambda r: r["_pattern"])
        updated = ea.apply_systematic_reclassification(recs, reassignment)
        self.assertEqual(recs[0]["root_cause"]["family"], "Inference problem")
        self.assertEqual(updated[0]["root_cause"]["family"], "Training problem")


class TestSeverityModel(unittest.TestCase):
    def test_excluded_correct_abstention(self):
        self.assertTrue(ea.excluded_from_failure_corpus(True, True))
        self.assertFalse(ea.excluded_from_failure_corpus(True, False))
        self.assertFalse(ea.excluded_from_failure_corpus(False, True))

    def test_hard_failure_criterion_is_critical(self):
        self.assertEqual(
            ea.assign_severity(hard_failure_criterion="fabricated_grounding"), "Critical")

    def test_systematic_hard_gated_is_critical(self):
        self.assertEqual(ea.assign_severity(systematic_hard_gated_metric=True), "Critical")

    def test_high_impact_field_wrong_is_high(self):
        self.assertEqual(ea.assign_severity(high_impact_field_wrong=True), "High")

    def test_context_conflict_no_fabrication_is_high(self):
        self.assertEqual(
            ea.assign_severity(context_conflict_resolved_silently_no_fabrication=True), "High")

    def test_weak_evidence_is_medium(self):
        self.assertEqual(ea.assign_severity(weak_not_fabricated_evidence=True), "Medium")

    def test_cosmetic_is_low(self):
        self.assertEqual(ea.assign_severity(cosmetic_or_stylistic=True), "Low")

    def test_nothing_qualifies_defaults_low(self):
        self.assertEqual(ea.assign_severity(), "Low")

    def test_critical_wins_over_lower_flags(self):
        self.assertEqual(
            ea.assign_severity(hard_failure_criterion="malformed_output",
                                cosmetic_or_stylistic=True),
            "Critical",
        )


class TestCorrectionWorkflow(unittest.TestCase):
    def test_all_families_routable(self):
        for fam in ea.FAMILIES:
            entry = ea.route_correction(fam)
            self.assertIn("owning_phase", entry)
            self.assertIn("corrective_action", entry)

    def test_unknown_family_raises(self):
        with self.assertRaises(ValueError):
            ea.route_correction("Vibes problem")

    def test_grader_mismatch_disposition_fires(self):
        d = ea.grader_ground_truth_mismatch_disposition(
            model_returned_unknown=True, ground_truth_resolves_value=True,
            input_supports_value=False,
        )
        self.assertIsNotNone(d)
        self.assertEqual(d["action_type"], "no_action_expected_behavior")
        self.assertEqual(d["family"], "Annotation problem")

    def test_grader_mismatch_disposition_absent_when_input_supports_value(self):
        d = ea.grader_ground_truth_mismatch_disposition(
            model_returned_unknown=True, ground_truth_resolves_value=True,
            input_supports_value=True,
        )
        self.assertIsNone(d)

    def test_grader_mismatch_disposition_absent_when_model_did_not_abstain(self):
        d = ea.grader_ground_truth_mismatch_disposition(
            model_returned_unknown=False, ground_truth_resolves_value=True,
            input_supports_value=False,
        )
        self.assertIsNone(d)

    def test_training_data_disposition_not_confirmed(self):
        out = ea.training_data_disposition("Training problem", corrected_and_confirmed=False)
        self.assertEqual(out, {"promote": False, "target_dataset": "none"})

    def test_training_data_disposition_wrong_family(self):
        out = ea.training_data_disposition("Architecture problem", corrected_and_confirmed=True)
        self.assertEqual(out, {"promote": False, "target_dataset": "none"})

    def test_training_data_disposition_new_pattern_goes_to_training(self):
        out = ea.training_data_disposition("Data problem", corrected_and_confirmed=True)
        self.assertEqual(out, {"promote": True, "target_dataset": "Training"})

    def test_training_data_disposition_previously_passing_goes_to_regression(self):
        out = ea.training_data_disposition(
            "Training problem", corrected_and_confirmed=True, previously_passing_pattern=True)
        self.assertEqual(out, {"promote": True, "target_dataset": "Regression"})


class TestDashboard(unittest.TestCase):
    def setUp(self):
        self.records = [
            valid_failure_record(failure_id="a", error_type="Hallucination", severity="Critical",
                                  root_cause={"family": "Inference problem", "statement": "x",
                                              "diagnosed_by": "automated_diagnostic", "confidence": 0.9},
                                  corrective_action={"action_type": "retraining_target",
                                                      "owning_phase": "Phase 11", "status": "open"},
                                  training_data_disposition={"promote": False, "target_dataset": "none"}),
            valid_failure_record(failure_id="b", error_type="Hallucination", severity="High",
                                  root_cause={"family": "Training problem", "statement": "y",
                                              "diagnosed_by": "human_reviewer", "confidence": 0.95},
                                  corrective_action={"action_type": "retraining_target",
                                                      "owning_phase": "Phase 11", "status": "resolved"},
                                  training_data_disposition={"promote": True, "target_dataset": "Training"}),
        ]

    def test_error_type_x_severity(self):
        out = ea.error_type_x_severity(self.records)
        self.assertEqual(out["Hallucination"], {"Critical": 1, "High": 1})

    def test_error_type_x_family(self):
        out = ea.error_type_x_family(self.records)
        self.assertEqual(out["Hallucination"], {"Inference problem": 1, "Training problem": 1})

    def test_family_x_owning_phase(self):
        out = ea.family_x_owning_phase(self.records)
        self.assertEqual(out["Inference problem"]["Phase 11"], 1)

    def test_action_status_by_phase(self):
        out = ea.corrective_action_status_by_phase(self.records)
        self.assertEqual(out["Phase 11"], {"open": 1, "resolved": 1})

    def test_training_data_disposition_summary(self):
        out = ea.training_data_disposition_summary(self.records)
        self.assertEqual(out[False], {"none": 1})
        self.assertEqual(out[True], {"Training": 1})

    def test_labeled_root_cause_counts_kept_separate(self):
        out = ea.labeled_root_cause_counts(self.records)
        self.assertEqual(out, {"automated_diagnostic": 1, "human_reviewer": 1})

    def test_error_type_x_axis_generic(self):
        out = ea.error_type_x_axis(self.records, lambda r: "python")
        self.assertEqual(out["Hallucination"], {"python": 2})

    def test_build_report_rejects_malformed_record(self):
        bad = valid_failure_record()
        del bad["severity"]
        with self.assertRaises(ValueError):
            ea.build_report(self.records + [bad])

    def test_build_report_produces_all_cuts(self):
        report = ea.build_report(self.records)
        self.assertEqual(report.error_type_severity["Hallucination"], {"Critical": 1, "High": 1})
        self.assertEqual(ea.malformed_error_report_violations(report), [])

    def test_no_aggregate_score_field_on_report(self):
        report = ea.build_report(self.records)
        self.assertFalse(hasattr(report, "error_rate"))
        self.assertFalse(hasattr(report, "health_score"))

    def test_malformed_report_violations_flags_injected_aggregate(self):
        report = ea.build_report(self.records)
        report.error_rate = 0.42  # simulate a caller adding a banned field
        self.assertIn("report must not carry an aggregate 'error_rate' field",
                      ea.malformed_error_report_violations(report))


class TestFeedbackLoop(unittest.TestCase):
    def test_mark_resolved_requires_verification(self):
        action = {"status": "open"}
        out = ea.mark_resolved(action, reverified_pass=False)
        self.assertEqual(out["status"], "open")

    def test_mark_resolved_on_reverified_pass(self):
        action = {"status": "in_progress"}
        out = ea.mark_resolved(action, reverified_pass=True)
        self.assertEqual(out["status"], "resolved")

    def test_mark_resolved_on_reannotation_confirmed(self):
        action = {"status": "in_progress"}
        out = ea.mark_resolved(action, reannotation_confirmed=True)
        self.assertEqual(out["status"], "resolved")

    def test_self_reported_resolved_without_verification_is_reverted(self):
        action = {"status": "resolved"}
        out = ea.mark_resolved(action, reverified_pass=False, reannotation_confirmed=False)
        self.assertEqual(out["status"], "in_progress")

    def test_mark_resolved_does_not_mutate_input(self):
        action = {"status": "open"}
        ea.mark_resolved(action, reverified_pass=True)
        self.assertEqual(action["status"], "open")

    def test_regression_protection_note_mentions_phase7(self):
        self.assertIn("Phase 7", ea.regression_protection_reused())


if __name__ == "__main__":
    unittest.main()
