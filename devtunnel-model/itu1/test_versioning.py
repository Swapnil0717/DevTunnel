import unittest

import versioning as v


class TestRefFormat(unittest.TestCase):
    def test_valid_ref(self):
        self.assertTrue(v.valid_ref("itu-1@0.2.0+3f9a1c7e2b40"))
        self.assertTrue(v.valid_ref("task-schema@2.0.0+9d8e7f6a5b4c"))

    def test_label_only_invalid(self):
        self.assertFalse(v.valid_ref("itu-1@0.2.0"))

    def test_hash_only_invalid(self):
        self.assertFalse(v.valid_ref("itu-1+3f9a1c7e2b40"))

    def test_short_hash_invalid(self):
        self.assertFalse(v.valid_ref("itu-1@0.2.0+abc"))

    def test_unrecorded_requires_flag(self):
        self.assertFalse(v.valid_ref("UNRECORDED(pre_registry)"))
        self.assertTrue(v.valid_ref("UNRECORDED(pre_registry)", allow_unrecorded=True))

    def test_bad_unrecorded_syntax(self):
        self.assertFalse(v.valid_ref("UNRECORDED", allow_unrecorded=True))

    def test_parse_ref(self):
        self.assertEqual(v.parse_ref("itu-1@0.2.0+3f9a1c7e2b40"), ("itu-1", "0.2.0", "3f9a1c7e2b40"))
        self.assertIsNone(v.parse_ref("itu-1@0.2.0"))

    def test_model_ref_no_colon(self):
        self.assertTrue(v.valid_model_ref("itu-1@0.2.0+3f9a1c7e2b40"))
        self.assertFalse(v.valid_model_ref("dataset:training@0.2.0+3f9a1c7e2b40"))


class TestVersionBump(unittest.TestCase):
    def test_major_trigger(self):
        self.assertEqual(v.required_bump("Architecture changes", weights_changed=True), "MAJOR")

    def test_minor_trigger(self):
        self.assertEqual(v.required_bump("More training data", weights_changed=True), "MINOR")

    def test_patch_needs_equivalence_run(self):
        with self.assertRaises(ValueError):
            v.required_bump("metadata_only", weights_changed=False, equivalence_run_passed=False)
        self.assertEqual(
            v.required_bump("metadata_only", weights_changed=False, equivalence_run_passed=True),
            "PATCH",
        )

    def test_weights_changed_forces_at_least_minor(self):
        self.assertEqual(v.required_bump("metadata_only", weights_changed=True), "MINOR")

    def test_highest_wins_across_multiple_triggers(self):
        self.assertEqual(
            v.required_bump(["More training data", "Architecture changes"], weights_changed=True),
            "MAJOR",
        )

    def test_unknown_change_type(self):
        with self.assertRaises(ValueError):
            v.required_bump("made it faster", weights_changed=True)

    def test_empty_change_types(self):
        with self.assertRaises(ValueError):
            v.required_bump([], weights_changed=True)

    def test_bump_version(self):
        self.assertEqual(v.bump_version("0.2.0", "MINOR"), "0.3.0")
        self.assertEqual(v.bump_version("0.2.5", "PATCH"), "0.2.6")
        self.assertEqual(v.bump_version("0.2.0", "MAJOR"), "1.0.0")

    def test_semver_gt(self):
        self.assertTrue(v.semver_gt("1.0.0", "0.9.9"))
        self.assertFalse(v.semver_gt("0.9.9", "1.0.0"))


def _valid_record(evidence=True):
    rec = {
        "model_ref": "itu-1@0.3.0+aaaaaaaaaaaa",
        "registered_at": "2026-01-01T00:00:00Z",
        "registered_by": "run-42",
        "lineage": {
            "parent": "itu-1@0.2.0+bbbbbbbbbbbb",
            "change_type": "More training data",
            "blast_radius": "narrow",
            "candidate_id": "cand-1",
            "checkpoint_chain": ["stage1@0.1.0+cccccccccccc"],
            "root_base_model": {
                "name": "base-x", "version": "1.0", "license": "apache-2.0",
                "declared_data_cutoff": "2025-01-01",
            },
        },
        "components": {k: f"{k}@1.0.0+dddddddddddd" for k in v.COMPONENT_KEYS},
        "output_schema_ref": "task-schema@2.0.0+eeeeeeeeeeee",
        "annotation_refs": ["guidelines@1.0.0+ffffffffffff"],
        "data": {
            "training_datasets": [{"stage": "stage1", "dataset_ref": "training@0.3.0+111111111111", "role": "train"}],
            "corpus_manifests": ["corpus@1.0.0+222222222222"],
            "exclusion_ledger_state": "exclusion-ledger@1.0.0+333333333333",
            "benchmark_preflight": "run-bc-1",
        },
        "training": {"trainconfig_ref": "trainconfig@0.3.0+444444444444", "training_run_ids": ["run-1"]},
        "integrity": {"record_sha256": "a" * 64},
    }
    if evidence:
        rec["evaluation_results"] = {"benchmark_edition": "itu-bench@1.0.0+555555555555", "runs": {}}
        rec["known_limitations"] = []
        rec["known_regressions"] = {"regression_check_ref": "check-1", "items": []}
        rec["supported_context"] = {
            "max_active_tier": 1, "active_tiers": [1], "not_active_tiers": [], "blocked_tiers": [],
            "per_tier_evidence": {1: "run-tier1"}, "ceiling_behavior": "clamp_and_record",
        }
    return rec


class TestModelVersionRecord(unittest.TestCase):
    def test_valid_record_no_errors(self):
        self.assertEqual(v.validate_model_version_record(_valid_record()), [])

    def test_missing_core_field(self):
        rec = _valid_record()
        del rec["model_ref"]
        errs = v.validate_model_version_record(rec)
        self.assertTrue(any("model_ref" in e for e in errs))

    def test_bad_model_ref(self):
        rec = _valid_record()
        rec["model_ref"] = "itu-1@latest"
        errs = v.validate_model_version_record(rec)
        self.assertTrue(any("model_ref" in e for e in errs))

    def test_pre_seal_view_rejects_evidence_fields(self):
        rec = _valid_record(evidence=False)
        rec["evaluation_results"] = {}
        errs = v.validate_model_version_record(rec, evidence_sealed=False)
        self.assertTrue(any("evidence_sealed" in e for e in errs))

    def test_pre_seal_view_clean(self):
        rec = _valid_record(evidence=False)
        self.assertEqual(v.validate_model_version_record(rec, evidence_sealed=False), [])

    def test_initial_version_null_parent_ok(self):
        rec = _valid_record()
        rec["lineage"]["parent"] = None
        rec["lineage"]["change_type"] = "initial"
        self.assertEqual(v.validate_model_version_record(rec), [])

    def test_null_parent_non_initial_flagged(self):
        rec = _valid_record()
        rec["lineage"]["parent"] = None
        errs = v.validate_model_version_record(rec)
        self.assertTrue(any("parent is null" in e for e in errs))

    def test_unrecorded_blast_radius_requires_legacy(self):
        rec = _valid_record()
        rec["lineage"]["blast_radius"] = "UNRECORDED(pre_registry)"
        errs = v.validate_model_version_record(rec)
        self.assertTrue(any("UNRECORDED" in e for e in errs))
        rec["legacy_names"] = ["ITU-1 v1"]
        self.assertEqual(v.validate_model_version_record(rec), [])

    def test_missing_component(self):
        rec = _valid_record()
        del rec["components"]["tokenizer"]
        errs = v.validate_model_version_record(rec)
        self.assertTrue(any("components.tokenizer" in e for e in errs))

    def test_empty_annotation_refs(self):
        rec = _valid_record()
        rec["annotation_refs"] = []
        errs = v.validate_model_version_record(rec)
        self.assertTrue(any("annotation_refs must be non-empty" in e for e in errs))

    def test_bad_integrity_hash(self):
        rec = _valid_record()
        rec["integrity"]["record_sha256"] = "not-a-hash"
        errs = v.validate_model_version_record(rec)
        self.assertTrue(any("record_sha256" in e for e in errs))

    def test_bad_change_type(self):
        rec = _valid_record()
        rec["lineage"]["change_type"] = "did some stuff"
        errs = v.validate_model_version_record(rec)
        self.assertTrue(any("change_type" in e for e in errs))


class TestKnownLimitationsRegressionsContext(unittest.TestCase):
    def test_limitations_omit_run_derived_cell(self):
        errs = v.validate_known_limitations(
            [],
            evaluation_runs=[{"insufficient_data_cells": ["role x tier2"]}],
        )
        self.assertTrue(any("omits a run-derived limitation" in e for e in errs))

    def test_limitations_complete(self):
        limitations = [{
            "id": "L1", "category": "insufficient_data_cell", "statement": "role x tier2",
            "evidence_refs": ["run-1"],
        }]
        errs = v.validate_known_limitations(
            limitations, evaluation_runs=[{"insufficient_data_cells": ["role x tier2"]}]
        )
        self.assertEqual(errs, [])

    def test_regressions_empty_needs_ref(self):
        errs = v.validate_known_regressions({"items": []})
        self.assertTrue(any("regression_check_ref" in e for e in errs))

    def test_regressions_empty_with_ref_ok(self):
        errs = v.validate_known_regressions({"regression_check_ref": "check-1", "items": []})
        self.assertEqual(errs, [])

    def test_regressions_missing_entirely(self):
        self.assertEqual(v.validate_known_regressions({}), ["known_regressions is missing"])

    def test_supported_context_active_needs_evidence(self):
        sc = {
            "max_active_tier": 2, "active_tiers": [1, 2], "not_active_tiers": [], "blocked_tiers": [],
            "per_tier_evidence": {1: "run-1"}, "ceiling_behavior": "clamp_and_record",
        }
        errs = v.validate_supported_context(sc)
        self.assertTrue(any("tier 2 is active but has no per_tier_evidence" in e for e in errs))

    def test_supported_context_overlap_flagged(self):
        sc = {
            "max_active_tier": 1, "active_tiers": [1], "not_active_tiers": [1], "blocked_tiers": [],
            "per_tier_evidence": {1: "run-1"}, "ceiling_behavior": "clamp_and_record",
        }
        errs = v.validate_supported_context(sc)
        self.assertTrue(any("more than one" in e for e in errs))

    def test_supported_context_bad_ceiling_behavior(self):
        sc = {
            "max_active_tier": 1, "active_tiers": [1], "not_active_tiers": [], "blocked_tiers": [],
            "per_tier_evidence": {1: "run-1"}, "ceiling_behavior": "clamp_silently",
        }
        errs = v.validate_supported_context(sc)
        self.assertTrue(any("ceiling_behavior" in e for e in errs))


class TestStatusTransitions(unittest.TestCase):
    def test_legal_transition(self):
        self.assertEqual(
            v.validate_status_transition("registered", "evaluated", has_phase17_decision_ref=False), []
        )

    def test_illegal_skip(self):
        errs = v.validate_status_transition("registered", "released", has_phase17_decision_ref=True)
        self.assertTrue(any("illegal transition" in e for e in errs))

    def test_release_candidate_needs_decision_ref(self):
        errs = v.validate_status_transition("evaluated", "release_candidate", has_phase17_decision_ref=False)
        self.assertTrue(any("requires a Phase 17 decision" in e for e in errs))

    def test_withdrawn_from_any_state_no_ref_needed(self):
        for s in ("registered", "evaluated", "release_candidate", "released", "deprecated"):
            self.assertEqual(v.validate_status_transition(s, "withdrawn", has_phase17_decision_ref=False), [])

    def test_terminal_states_have_no_outgoing(self):
        for s in ("rejected", "rolled_back", "withdrawn"):
            self.assertEqual(v.STATUS_GRAPH[s], set())

    def test_rollback_needs_decision_ref(self):
        errs = v.validate_status_transition("released", "rolled_back", has_phase17_decision_ref=False)
        self.assertTrue(any("requires a Phase 17 decision" in e for e in errs))


class TestDatasetLayerAdditions(unittest.TestCase):
    def test_frozen_benchmark_single_version_ok(self):
        self.assertEqual(v.annotation_version_histogram_valid({"1.0.0": 500}, is_frozen_benchmark=True), [])

    def test_frozen_benchmark_multi_version_flagged(self):
        errs = v.annotation_version_histogram_valid(
            {"1.0.0": 400, "1.1.0": 100}, is_frozen_benchmark=True
        )
        self.assertTrue(errs)

    def test_training_multi_version_ok(self):
        errs = v.annotation_version_histogram_valid(
            {"1.0.0": 400, "1.1.0": 100}, is_frozen_benchmark=False
        )
        self.assertEqual(errs, [])

    def test_empty_histogram(self):
        self.assertTrue(v.annotation_version_histogram_valid({}, is_frozen_benchmark=False))

    def test_regression_monotone(self):
        self.assertEqual(v.regression_is_monotone({"a", "b"}, {"a", "b", "c"}), [])

    def test_regression_shrink_flagged(self):
        errs = v.regression_is_monotone({"a", "b", "c"}, {"a", "b"})
        self.assertTrue(any("not monotone" in e for e in errs))


class TestSchemaRipple(unittest.TestCase):
    def test_major_new_edition(self):
        r = v.schema_ripple("MAJOR")
        self.assertEqual(r["benchmark_edition"], "new_edition")
        self.assertEqual(r["model"], "MAJOR")

    def test_patch_no_ripple(self):
        r = v.schema_ripple("PATCH")
        self.assertTrue(all(val == "none" for val in r.values()))

    def test_unknown_kind(self):
        with self.assertRaises(ValueError):
            v.schema_ripple("SIDEWAYS")


class TestGenerationStamp(unittest.TestCase):
    def test_valid_model_stamp(self):
        stamp = {
            "generator_type": "model", "stamped_at": "2026-01-01T00:00:00Z",
            "model_ref": "itu-1@0.3.0+aaaaaaaaaaaa", "assembly_ref": "assembly@1.0.0+bbbbbbbbbbbb",
            "inference_run_id": "run-1", "context_tier_requested": 2, "context_tier_effective": 1,
        }
        errs = v.validate_generation_stamp(
            stamp, registered_model_refs={"itu-1@0.3.0+aaaaaaaaaaaa"}, model_max_active_tier=1
        )
        self.assertEqual(errs, [])

    def test_unregistered_model_ref(self):
        stamp = {
            "generator_type": "model", "stamped_at": "2026-01-01T00:00:00Z",
            "model_ref": "itu-1@0.9.0+ffffffffffff", "assembly_ref": "assembly@1.0.0+bbbbbbbbbbbb",
            "inference_run_id": "run-1", "context_tier_requested": 1, "context_tier_effective": 1,
        }
        errs = v.validate_generation_stamp(stamp, registered_model_refs=set())
        self.assertTrue(any("does not resolve in the registry" in e for e in errs))

    def test_effective_exceeds_requested(self):
        stamp = {
            "generator_type": "model", "stamped_at": "2026-01-01T00:00:00Z",
            "model_ref": "itu-1@0.3.0+aaaaaaaaaaaa", "assembly_ref": "assembly@1.0.0+bbbbbbbbbbbb",
            "inference_run_id": "run-1", "context_tier_requested": 1, "context_tier_effective": 2,
        }
        errs = v.validate_generation_stamp(stamp, registered_model_refs={"itu-1@0.3.0+aaaaaaaaaaaa"})
        self.assertTrue(any("Rule 15" in e for e in errs))

    def test_effective_exceeds_model_ceiling(self):
        stamp = {
            "generator_type": "model", "stamped_at": "2026-01-01T00:00:00Z",
            "model_ref": "itu-1@0.3.0+aaaaaaaaaaaa", "assembly_ref": "assembly@1.0.0+bbbbbbbbbbbb",
            "inference_run_id": "run-1", "context_tier_requested": 3, "context_tier_effective": 3,
        }
        errs = v.validate_generation_stamp(
            stamp, registered_model_refs={"itu-1@0.3.0+aaaaaaaaaaaa"}, model_max_active_tier=1
        )
        self.assertTrue(any("supported_context.max_active_tier" in e for e in errs))

    def test_missing_fields_for_model_type(self):
        stamp = {"generator_type": "model", "stamped_at": "2026-01-01T00:00:00Z"}
        errs = v.validate_generation_stamp(stamp, registered_model_refs=set())
        self.assertTrue(any("model_ref required" in e for e in errs))

    def test_human_annotation_type(self):
        stamp = {"generator_type": "human_annotation", "stamped_at": "2026-01-01T00:00:00Z"}
        errs = v.validate_generation_stamp(stamp, registered_model_refs=set())
        self.assertTrue(any("annotation_ref" in e for e in errs))


class TestBenchmarkEdition(unittest.TestCase):
    def test_edition_bump_major(self):
        self.assertEqual(v.edition_bump_type(["task_schema_major"]), "MAJOR")

    def test_edition_bump_minor(self):
        self.assertEqual(v.edition_bump_type(["context_tier_activated"]), "MINOR")

    def test_edition_bump_mixed_wins_major(self):
        self.assertEqual(
            v.edition_bump_type(["context_tier_activated", "task_schema_major"]), "MAJOR"
        )

    def test_unknown_trigger(self):
        with self.assertRaises(ValueError):
            v.edition_bump_type(["because I felt like it"])

    def test_no_triggers(self):
        with self.assertRaises(ValueError):
            v.edition_bump_type([])

    def test_validate_benchmark_edition_missing_fields(self):
        errs = v.validate_benchmark_edition({})
        self.assertGreaterEqual(len(errs), len(v.BENCHMARK_EDITION_REQUIRED))


class TestExposureLedger(unittest.TestCase):
    def test_open_then_not_gate_eligible(self):
        led = v.ExposureLedger()
        led.open_item("item-1", reason="failure_record", at="2026-01-01T00:00:00Z")
        self.assertFalse(led.is_gate_eligible("item-1"))
        self.assertFalse(led.eligible_for_training("item-1"))

    def test_sealed_default_gate_eligible(self):
        led = v.ExposureLedger()
        self.assertTrue(led.is_gate_eligible("item-9"))

    def test_score_after_open_raises(self):
        led = v.ExposureLedger()
        led.open_item("item-1", reason="x", at="t")
        with self.assertRaises(ValueError):
            led.score("item-1", at="t2")

    def test_open_idempotent(self):
        led = v.ExposureLedger()
        led.open_item("item-1", reason="x", at="t1")
        led.open_item("item-1", reason="y", at="t2")
        self.assertEqual(len(led.events), 1)

    def test_burn_fraction(self):
        led = v.ExposureLedger()
        led.open_item("a", reason="x", at="t")
        self.assertAlmostEqual(led.burn_fraction(["a", "b", "c", "d"]), 0.25)

    def test_burn_fraction_empty(self):
        led = v.ExposureLedger()
        self.assertEqual(led.burn_fraction([]), 0.0)

    def test_gate_run_allowed_uses_single_ok(self):
        runs = [{"candidate_id": "c1", "partition": "test_gate", "voided": False}]
        self.assertEqual(v.gate_run_allowed_uses("c1", "test_gate", runs), [])

    def test_gate_run_allowed_uses_double_flagged(self):
        runs = [
            {"candidate_id": "c1", "partition": "test_gate", "voided": False},
            {"candidate_id": "c1", "partition": "test_gate", "voided": False},
        ]
        errs = v.gate_run_allowed_uses("c1", "test_gate", runs)
        self.assertTrue(errs)

    def test_gate_run_voided_does_not_count(self):
        runs = [
            {"candidate_id": "c1", "partition": "test_gate", "voided": True},
            {"candidate_id": "c1", "partition": "test_gate", "voided": False},
        ]
        self.assertEqual(v.gate_run_allowed_uses("c1", "test_gate", runs), [])

    def test_partition_tier(self):
        self.assertEqual(v.partition_tier("test_gate"), "gate")
        self.assertEqual(v.partition_tier("vault"), "sealed")
        self.assertEqual(v.partition_tier("validation_dev"), "open")
        self.assertIsNone(v.partition_tier("nonsense"))


class TestEvalsuiteBump(unittest.TestCase):
    def test_metric_def_change_major(self):
        self.assertEqual(v.evalsuite_bump_type(metric_definition_changed=True), "MAJOR")

    def test_additive_metric_minor(self):
        self.assertEqual(v.evalsuite_bump_type(new_metric_or_axis_additive=True), "MINOR")

    def test_numbers_unchanged_patch(self):
        self.assertEqual(v.evalsuite_bump_type(numbers_unchanged_fix=True), "PATCH")

    def test_no_change_declared(self):
        with self.assertRaises(ValueError):
            v.evalsuite_bump_type()


class TestContaminationBCTests(unittest.TestCase):
    def test_bc1_clean(self):
        self.assertEqual(v.bc1_ledger_preflight({"a", "b"}, {"c", "d"}), [])

    def test_bc1_overlap(self):
        errs = v.bc1_ledger_preflight({"a", "b"}, {"b", "c"})
        self.assertTrue(any("BC1 fail" in e for e in errs))

    def test_bc2_clean(self):
        self.assertEqual(v.bc2_content_scan({"fp1"}, {"fp2"}), [])

    def test_bc2_overlap(self):
        errs = v.bc2_content_scan({"fp1", "fp2"}, {"fp2"})
        self.assertTrue(any("BC2 fail" in e for e in errs))

    def test_bc4_passes_with_margin(self):
        errs = v.bc4_temporal_margin(
            "2026-06-01T00:00:00", "2026-06-02T00:00:00", "2025-01-01T00:00:00", margin_days=30
        )
        self.assertEqual(errs, [])

    def test_bc4_fails_within_margin(self):
        errs = v.bc4_temporal_margin(
            "2025-01-05T00:00:00", "2025-01-05T00:00:00", "2025-01-01T00:00:00", margin_days=30
        )
        self.assertTrue(any("BC4 fail" in e for e in errs))

    def test_bc8_sealed_in_open_config(self):
        led = v.ExposureLedger()
        runs = [{"partition": "vault", "used_in_open_config": True}]
        errs = v.bc8_exposure_audit(led, runs)
        self.assertTrue(any("Open-run configuration" in e for e in errs))

    def test_bc8_opened_mismatch(self):
        led = v.ExposureLedger()
        runs = [{"partition": "test_gate", "opened_items": ["x"]}]
        errs = v.bc8_exposure_audit(led, runs)
        self.assertTrue(any("ledger disagrees" in e for e in errs))

    def test_bc8_gated_missing_exposure_event(self):
        led = v.ExposureLedger()
        runs = [{"partition": "test_gate", "gated": True, "has_exposure_event": False}]
        errs = v.bc8_exposure_audit(led, runs)
        self.assertTrue(any("no exposure event" in e for e in errs))

    def test_bc9_clean(self):
        self.assertEqual(v.bc9_derivative_audit({"t1"}, {"b1"}, []), [])

    def test_bc9_training_traces_to_benchmark(self):
        errs = v.bc9_derivative_audit({"t1", "b1"}, {"b1"}, [])
        self.assertTrue(any("BC9 fail" in e for e in errs))

    def test_bc9_eval_informed_revision_leaks(self):
        revisions = [{"id": "rev-1", "eval_informed": True, "informed_training_labels": True}]
        errs = v.bc9_derivative_audit(set(), set(), revisions)
        self.assertTrue(any("BC9 fail" in e for e in errs))

    def test_p8_disposition_blocks_training(self):
        errs = v.disposition_for_benchmark_sourced_failure("Training", "test_gate")
        self.assertTrue(any("P8 violation" in e for e in errs))

    def test_p8_disposition_allows_regression(self):
        self.assertEqual(v.disposition_for_benchmark_sourced_failure("Regression", "test_gate"), [])

    def test_p8_disposition_non_benchmark_source_unrestricted(self):
        self.assertEqual(v.disposition_for_benchmark_sourced_failure("Training", "annotation_qa"), [])


class TestTaintPropagation(unittest.TestCase):
    def test_propagates_to_child(self):
        lineage = {"m2": {"parent": "m1", "checkpoint_chain": []}}
        result = v.propagate_taint({"m1"}, lineage)
        self.assertEqual(result, {"m1", "m2"})

    def test_propagates_through_checkpoint_chain(self):
        lineage = {"m2": {"parent": None, "checkpoint_chain": ["ckpt1"]}}
        result = v.propagate_taint({"ckpt1"}, lineage)
        self.assertIn("m2", result)

    def test_cleared_ref_does_not_propagate_further(self):
        lineage = {
            "m2": {"parent": "m1", "checkpoint_chain": []},
            "m3": {"parent": "m2", "checkpoint_chain": []},
        }
        result = v.propagate_taint({"m1"}, lineage, cleared={"m2"})
        self.assertIn("m2", result)  # still tainted itself (inherited)
        self.assertNotIn("m3", result)  # but does not propagate past the cleared node

    def test_no_taint_no_propagation(self):
        lineage = {"m2": {"parent": "m1", "checkpoint_chain": []}}
        self.assertEqual(v.propagate_taint(set(), lineage), set())


class TestReproducibility(unittest.TestCase):
    def test_manifest_complete(self):
        manifest = {f: "x" for f in v.REPRO_MANIFEST_REQUIRED}
        self.assertEqual(v.validate_repro_manifest(manifest), [])

    def test_manifest_missing_fields(self):
        errs = v.validate_repro_manifest({})
        self.assertEqual(len(errs), len(v.REPRO_MANIFEST_REQUIRED))

    def test_gate_run_requires_r0(self):
        self.assertEqual(v.gate_run_requires_r0("deterministic"), [])
        self.assertTrue(v.gate_run_requires_r0("declared_stochastic"))

    def test_can_support_decision(self):
        self.assertTrue(v.can_support_decision("gate", "acceptance_criterion"))
        self.assertFalse(v.can_support_decision("dev", "acceptance_criterion"))
        self.assertTrue(v.can_support_decision("sealed", "release_signoff"))
        self.assertFalse(v.can_support_decision("gate", "release_signoff"))
        self.assertTrue(v.can_support_decision("legacy", "history"))

    def test_preregistration_ordering_valid(self):
        self.assertEqual(
            v.preregistration_ordering_valid("2026-01-01T00:00:00", "2026-01-02T00:00:00"), []
        )

    def test_preregistration_ordering_invalid(self):
        errs = v.preregistration_ordering_valid("2026-01-02T00:00:00", "2026-01-01T00:00:00")
        self.assertTrue(errs)


def _valid_release_record():
    return {
        "release_id": "rel-1", "release_kind": "upgrade", "released_at": "2026-01-01T00:00:00Z",
        "model_ref": "itu-1@0.3.0+aaaaaaaaaaaa", "candidate_id": "cand-1",
        "baseline_ref": "itu-1@0.2.0+bbbbbbbbbbbb",
        "identity": {f: "x" for f in v.RELEASE_IDENTITY_REQUIRED},
        "benchmark": {
            "edition_ref": "itu-bench@1.0.0+cccccccccccc",
            "gate_runs": {f: "run-x" for f in v.RELEASE_GATE_RUNS_REQUIRED},
            "sealed_run": "run-sealed",
            "exposure_snapshot": "snap-1",
        },
        "regression_table": {"ref": "r", "digest": "d"},
        "acceptance_checklist": [{"criterion": 1, "result": True, "evidence_refs": ["e"]}],
        "hard_ceilings": {"l0_validity_run": "r1", "hallucination_ceiling_runs": ["r2"], "regression_reappearance": "none"},
        "contamination": {"bc_results": {"BC1": "pass"}, "open_findings": [], "cell_status_summary": "s"},
        "reproducibility": {"replay_audit_ref": "audit-1", "achieved_levels": {"R0": True, "R1": None, "R2": True}},
        "known_limitations": {"ref": "kl", "digest": "d"},
        "known_regressions": {"ref": "kr", "digest": "d"},
        "supported_context": {"max_active_tier": 1, "active_tiers": [1], "blocked_tiers": []},
        "rollback": {
            "target_ref": "itu-1@0.2.0+bbbbbbbbbbbb", "weights_retrievable_verified_at": "2026-01-01T00:00:00Z",
            "redeploy_bound": "DEFERRED(phase17-operational-bound)", "triggering_event": None,
        },
        "signoff": {"reviewer_id": "r1", "independent_of": "training", "attested_at": "2026-01-01T00:00:00Z",
                    "attestation_digest": "d" * 64},
        "release_notes": "notes-ref",
        "integrity": {"record_sha256": "a" * 64},
    }


class TestReleaseRecord(unittest.TestCase):
    def test_complete_record_no_violations(self):
        self.assertEqual(v.release_record_completeness_violations(_valid_release_record()), [])

    def test_missing_top_level_field(self):
        rec = _valid_release_record()
        del rec["signoff"]
        errs = v.release_record_completeness_violations(rec)
        self.assertTrue(any("signoff" in e for e in errs))

    def test_deferred_redeploy_bound_is_fine(self):
        rec = _valid_release_record()
        self.assertEqual(v.release_record_completeness_violations(rec), [])

    def test_missing_identity_subfield(self):
        rec = _valid_release_record()
        del rec["identity"]["trainconfig_ref"]
        errs = v.release_record_completeness_violations(rec)
        self.assertTrue(any("identity.trainconfig_ref" in e for e in errs))

    def test_missing_gate_run(self):
        rec = _valid_release_record()
        del rec["benchmark"]["gate_runs"]["engineering_understanding"]
        errs = v.release_record_completeness_violations(rec)
        self.assertTrue(any("gate_runs.engineering_understanding" in e for e in errs))

    def test_open_findings_blocks(self):
        rec = _valid_release_record()
        rec["contamination"]["open_findings"] = ["finding-1"]
        errs = v.release_record_completeness_violations(rec)
        self.assertTrue(any("release blocked" in e for e in errs))

    def test_bc_fail_blocks(self):
        rec = _valid_release_record()
        rec["contamination"]["bc_results"]["BC6"] = "fail"
        errs = v.release_record_completeness_violations(rec)
        self.assertTrue(any("BC6" in e and "release blocked" in e for e in errs))

    def test_empty_known_regressions_flagged(self):
        rec = _valid_release_record()
        rec["known_regressions"] = {}
        errs = v.release_record_completeness_violations(rec)
        self.assertTrue(any("known_regressions is present but empty" in e for e in errs))

    def test_rollback_helper_creates_new_record_kind(self):
        prior = _valid_release_record()
        new_rec = v.rollback_release_record(
            prior, restored_model_ref="itu-1@0.2.0+bbbbbbbbbbbb",
            triggering_event_ref="trigger-1", released_at="2026-02-01T00:00:00Z", release_id="rel-2",
        )
        self.assertEqual(new_rec["release_kind"], "rollback")
        self.assertEqual(new_rec["model_ref"], "itu-1@0.2.0+bbbbbbbbbbbb")
        self.assertEqual(new_rec["supersedes"], "itu-1@0.3.0+aaaaaaaaaaaa")
        # prior record untouched (I5: never edit to un-release)
        self.assertEqual(prior["release_kind"], "upgrade")


if __name__ == "__main__":
    unittest.main()
