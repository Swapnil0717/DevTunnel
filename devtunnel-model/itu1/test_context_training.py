import unittest

import architecture
import schema
from architecture import FieldProposal, Segment
from context_training import (
    ACTIVATABLE_TIERS, CRITERIA, EVAL_FIELDS, PROPOSED_SCHEMA_CHANGE, SEGMENT_TIER, AdvanceVerdict, Candidate,
    ConflictClaim, TierEvalEvent, TierRecord, a4_violations, advance_verdict, allocate_budget,
    backward_consistency_gate, batch_ceiling_violations, calibration_preservation_gate,
    conflict_handling_violations, convention_profile_violations, data_sufficiency_gate, decision_record,
    degrade_to_ceiling, empty_retrieval_gate, leakage_gate, level_scope, multi_ceiling_views,
    omission_violations, padding_violations, rank_segments, resolve_conflict, retrieval_precision_recall,
    retrieval_violations, schema_enactment_violations, score_against_reference, segment_tier_violations,
    starting_checkpoint, summarize_outcomes, tier_appropriate_reference, two_pass_violations, uplift_gate,
    validate_checkpoint_identity, validate_tier_attempt, validate_tier_evaluation_log,
    validate_tier_training_config,
)


def seg(sid, typ, text="x"):
    return Segment(sid, typ, text, tier=SEGMENT_TIER[typ])


class TestTierMap(unittest.TestCase):
    def test_covers_every_architecture_segment_type(self):
        self.assertEqual(set(SEGMENT_TIER), architecture.SEGMENT_TYPES)

    def test_matches_architecture_tier1_set(self):
        self.assertEqual({t for t, n in SEGMENT_TIER.items() if n == 1}, architecture.TIER1_SEGMENT_TYPES)

    def test_levels_map_onto_tiers_cumulatively(self):
        self.assertEqual(level_scope(1)[0], 1)
        self.assertNotIn("COMMENT", level_scope(1)[1])
        self.assertEqual(level_scope(2), (1, architecture.TIER1_SEGMENT_TYPES))
        self.assertEqual(level_scope(3)[0], 2)
        self.assertIn("REPO_META", level_scope(3)[1])
        self.assertNotIn("README", level_scope(3)[1])
        self.assertEqual(level_scope(6)[0], 5)
        self.assertLessEqual({"DOC", "DEP_GRAPH", "CODE", "README"}, level_scope(6)[1])
        tier, types = level_scope(8)
        self.assertEqual((tier, types), (7, frozenset(SEGMENT_TIER)))   # Level 8 = everything, not a new mode

    def test_bad_level(self):
        with self.assertRaises(ValueError):
            level_scope(9)

    def test_segment_tier_violations(self):
        self.assertEqual(segment_tier_violations([seg("a", "CODE")]), [])
        self.assertTrue(segment_tier_violations([Segment("b", "CODE", "x", tier=1)]))


class TestActivation(unittest.TestCase):
    def rec(self, tier, promoted=True, ck=None, infra=True, consumed=True):
        return TierRecord(tier, promoted, ck or f"ck{tier}", infra, consumed)

    def test_tier2_first_attempt_ok_and_tier3_before_2_is_not(self):
        self.assertEqual(validate_tier_attempt([], 2), [])
        self.assertTrue(any("in order" in m for m in validate_tier_attempt([], 3)))

    def test_tier1_and_out_of_range(self):
        self.assertTrue(validate_tier_attempt([], 1))
        self.assertTrue(validate_tier_attempt([], 8))

    def test_tier6_blocked_until_addendum(self):
        hist = [self.rec(2), self.rec(3), self.rec(4), self.rec(5)]
        self.assertIn("blocked", validate_tier_attempt(hist, 6)[0])
        self.assertEqual(validate_tier_attempt(hist, 6, phase4_precedent_addendum=True), [])

    def test_tier7_needs_all_of_2_to_6_promoted_so_blocked_transitively(self):
        hist = [self.rec(t) for t in (2, 3, 4, 5)]
        self.assertTrue(any("tier 6" in m for m in validate_tier_attempt(hist, 7)))
        hist6 = hist + [self.rec(6)]
        self.assertEqual(validate_tier_attempt(hist6, 7, phase4_precedent_addendum=True), [])

    def test_tier7_blocked_when_a_lower_tier_failed(self):
        hist = [self.rec(2), self.rec(3, promoted=False), self.rec(4), self.rec(5), self.rec(6)]
        self.assertTrue(any("tier 3" in m for m in validate_tier_attempt(hist, 7, phase4_precedent_addendum=True)))

    def test_failed_tier_does_not_block_downstream_with_infra(self):
        hist = [self.rec(2), self.rec(3, promoted=False, infra=True)]
        self.assertEqual(validate_tier_attempt(hist, 4), [])

    def test_downstream_needs_retriever_infra_not_accuracy(self):
        hist = [self.rec(2), self.rec(3, promoted=False, infra=False)]
        v = validate_tier_attempt(hist, 4)
        self.assertEqual(len(v), 1)
        self.assertIn("retriever infrastructure", v[0])

    def test_spent_test_pass_means_no_second_attempt(self):
        hist = [self.rec(2, promoted=False, consumed=True)]
        self.assertTrue(any("spent" in m for m in validate_tier_attempt(hist, 2)))

    def test_undecided_earlier_tier_blocks(self):
        hist = [TierRecord(2, False, None, True, False)]     # attempted but not decided
        self.assertTrue(validate_tier_attempt(hist, 3))

    def test_already_promoted(self):
        self.assertTrue(any("already promoted" in m for m in validate_tier_attempt([self.rec(2)], 2)))

    def test_starting_checkpoint_is_highest_promoted_not_last_attempted(self):
        hist = [self.rec(2), self.rec(3, promoted=False), self.rec(4, ck="ck4")]
        self.assertEqual(starting_checkpoint(hist, "v1"), "ck4")
        self.assertEqual(starting_checkpoint([self.rec(2), self.rec(3, promoted=False)], "v1"), "ck2")
        self.assertEqual(starting_checkpoint([], "v1"), "v1")
        self.assertEqual(starting_checkpoint([self.rec(2, promoted=False)], "v1"), "v1")

    def test_decision_records(self):
        ok = advance_verdict(2, {c: [] for c in CRITERIA})
        bad = advance_verdict(3, {**{c: [] for c in CRITERIA}, "leakage": ["x"]})
        self.assertEqual(decision_record(2, ok, checkpoint_id="c2")["status"], "promoted")
        d = decision_record(3, bad)
        self.assertEqual((d["status"], d["checkpoint_id"]), ("not_promoted", None))
        self.assertIn("leakage", d["failed_criteria"])
        self.assertEqual(decision_record(6)["status"], "blocked")
        self.assertEqual(decision_record(4)["status"], "not_attempted")
        with self.assertRaises(ValueError):
            decision_record(2, ok)


class TestIdentityAndConfig(unittest.TestCase):
    def ident(self, **o):
        r = {"checkpoint_id": "c2", "created_at": "t", "tier": 2, "parent_checkpoint_id": "v1",
             "root_checkpoint_id": "v1", "tokenizer_version": "tok", "head_configuration": {"heads": ["C"]},
             "training_data_manifest_hash": "h", "loss_weight_config": {"L": 1},
             "retriever_config": {"name": "light", "version": "1"}, "training_modes": ["oracle_context", "retrieval_in_loop"],
             "calibrator_refit_for_tier": True, "context_ceiling": 2}
        r.update(o)
        return r

    def check(self, r, **kw):
        return validate_checkpoint_identity(r, itu1_v1_checkpoint_id="v1", expected_parent="v1", **kw)

    def test_valid(self):
        self.assertEqual(self.check(self.ident()), [])

    def test_missing_and_wrong_lineage(self):
        r = self.ident(root_checkpoint_id="other", parent_checkpoint_id="ck9")
        del r["retriever_config"]
        self.assertEqual(len(self.check(r)), 3)

    def test_tier6_blocked_and_calibrator_required(self):
        self.assertTrue(any("blocked" in m for m in self.check(self.ident(tier=6, context_ceiling=6))))
        self.assertEqual(self.check(self.ident(tier=6, context_ceiling=6), phase4_precedent_addendum=True), [])
        self.assertTrue(self.check(self.ident(calibrator_refit_for_tier=False)))
        self.assertTrue(self.check(self.ident(context_ceiling=3)))

    def cfg(self, **o):
        c = {"training_modes": {"oracle_context", "retrieval_in_loop"}, "start_checkpoint_id": "v1",
             "reinit_heads": False, "encoder_lr": 1e-5, "head_lr": 1e-4,
             "retrieval_bundle_snapshot_hash": "abc", "live_fetch": False, "ceilings_rendered": {1, 2},
             "calibrator_refit": True, "calibration_encoder_frozen": True, "calibration_fit_dataset": "validation"}
        c.update(o)
        return c

    def test_config_valid(self):
        self.assertEqual(validate_tier_training_config(2, self.cfg(), expected_start="v1"), [])

    def test_oracle_only_rejected(self):
        v = validate_tier_training_config(2, self.cfg(training_modes={"oracle_context"}), expected_start="v1")
        self.assertTrue(any("retrieval_in_loop" in m for m in v))

    def test_retrieval_mode_needs_snapshot_and_no_live_fetch(self):
        v = validate_tier_training_config(2, self.cfg(retrieval_bundle_snapshot_hash="", live_fetch=True), expected_start="v1")
        self.assertEqual(len(v), 2)

    def test_start_lr_reinit_ceilings_calibration(self):
        for over in ({"start_checkpoint_id": "failed"}, {"reinit_heads": True}, {"encoder_lr": 1e-3},
                     {"ceilings_rendered": {2}}, {"calibrator_refit": False}, {"calibration_encoder_frozen": False},
                     {"calibration_fit_dataset": "test"}):
            self.assertEqual(len(validate_tier_training_config(2, self.cfg(**over), expected_start="v1")), 1, over)

    def test_bad_tier(self):
        self.assertTrue(validate_tier_training_config(1, self.cfg(), expected_start="v1"))


class TestRetrieval(unittest.TestCase):
    def test_a4_resolving_never_in_set(self):
        segs = [seg("s1", "CODE"), seg("s2", "DOC")]
        self.assertEqual(a4_violations(segs, resolving_ids=set()), [])
        self.assertEqual(len(a4_violations(segs, resolving_ids={"s2"})), 1)

    def test_a4_quarantines_pr_commit_until_addendum(self):
        segs = [seg("p", "PR"), seg("c", "COMMIT")]
        self.assertEqual(len(a4_violations(segs, resolving_ids=set())), 2)
        self.assertEqual(a4_violations(segs, resolving_ids=set(), phase4_precedent_addendum=True), [])
        self.assertEqual(len(a4_violations(segs, resolving_ids={"p"}, phase4_precedent_addendum=True)), 1)

    def c(self, i, **o):
        return {"segment_id": f"s{i}", "origin_id": f"o{i}", **o}

    def test_top_k_and_origin(self):
        self.assertEqual(retrieval_violations(2, [self.c(1)], top_k=3), [])
        self.assertTrue(retrieval_violations(2, [self.c(i) for i in range(5)], top_k=3))
        self.assertTrue(retrieval_violations(2, [{"segment_id": "s"}], top_k=3))

    def test_tier3_excerpts_only(self):
        self.assertTrue(retrieval_violations(3, [self.c(1, is_whole_file=True)], top_k=3))
        self.assertEqual(retrieval_violations(3, [self.c(1, is_whole_file=False)], top_k=3), [])

    def test_tier45_bounded_hops(self):
        self.assertTrue(retrieval_violations(5, [self.c(1, hops=4)], top_k=3, max_hops=2))
        self.assertEqual(retrieval_violations(5, [self.c(1, hops=2)], top_k=3, max_hops=2), [])
        self.assertTrue(retrieval_violations(4, [self.c(1)], top_k=3))          # no cap given

    def test_tier6_hard_exclusion(self):
        self.assertTrue(retrieval_violations(6, [self.c(1, closes_or_references_issue=True)], top_k=3))
        self.assertEqual(retrieval_violations(5, [self.c(1, closes_or_references_issue=True)], top_k=3, max_hops=1), [])

    def test_convention_profile_fixed_per_project(self):
        self.assertEqual(convention_profile_violations({"i1": "h", "i2": "h"}), [])
        self.assertTrue(convention_profile_violations({"i1": "h", "i2": "g"}))

    def test_two_pass(self):
        ok = ["pass0_extract", "retrieve", "a2_a4_gate", "encode_full", "heads"]
        self.assertEqual(two_pass_violations(ok), [])
        self.assertTrue(two_pass_violations(["pass0_extract", "encode_full", "retrieve", "a2_a4_gate"]))
        self.assertTrue(two_pass_violations(ok + ["encode_full"]))
        self.assertTrue(two_pass_violations(["retrieve"]))

    def test_precision_recall(self):
        r = retrieval_precision_recall({"a", "b"}, {"a", "c", "d", "e"})
        self.assertEqual((r["precision"], r["recall"]), (0.5, 0.25))
        self.assertTrue(retrieval_precision_recall(set(), set())["correct_empty"])
        e = retrieval_precision_recall(set(), {"a"})
        self.assertEqual((e["precision"], e["recall"], e["correct_empty"]), (None, 0.0, False))


class TestRanking(unittest.TestCase):
    PRIOR = {"CODE": 3, "CONFIG": 3, "DOC": 2, "README": 1, "FILE_TREE": 0, "REPO_META": 0, "ISSUE_BODY": 5}

    def test_signal_order_is_lexicographic(self):
        a = Candidate("a", "DOC", entity_overlap=2, directness=0, authority=9, recency=9)
        b = Candidate("b", "DOC", entity_overlap=3, directness=0, authority=0, recency=0)
        self.assertEqual([r.segment_id for r in rank_segments([a, b], ceiling=5, type_prior=self.PRIOR)], ["b", "a"])

    def test_each_later_signal_breaks_ties(self):
        base = dict(entity_overlap=1, directness=1)
        code = Candidate("code", "CODE", **base)
        doc = Candidate("doc", "DOC", **base)
        self.assertEqual(rank_segments([doc, code], ceiling=4, type_prior=self.PRIOR)[0].segment_id, "code")
        old = Candidate("old", "DOC", authority=1, recency=1, **base)
        auth = Candidate("auth", "DOC", authority=2, recency=0, **base)
        self.assertEqual(rank_segments([old, auth], ceiling=4, type_prior=self.PRIOR)[0].segment_id, "auth")
        new = Candidate("new", "DOC", authority=1, recency=5, **base)
        self.assertEqual(rank_segments([old, new], ceiling=4, type_prior=self.PRIOR)[0].segment_id, "new")

    def test_deterministic_tiebreak_and_logged_signals(self):
        cs = [Candidate("b", "DOC", 1), Candidate("a", "DOC", 1)]
        r = rank_segments(cs, ceiling=4, type_prior=self.PRIOR)
        self.assertEqual([x.segment_id for x in r], ["a", "b"])
        self.assertEqual(r[0].signals, (1, 0.0, 2, 0.0, 0.0))
        self.assertEqual([x.rank for x in r], [1, 2])

    def test_recency_never_overrides_the_gates(self):
        with self.assertRaises(ValueError):
            rank_segments([Candidate("c", "CODE", 1, recency=99)], ceiling=2, type_prior=self.PRIOR)
        with self.assertRaises(ValueError):
            rank_segments([Candidate("c", "DOC", 1, resolves_issue=True)], ceiling=4, type_prior=self.PRIOR)
        with self.assertRaises(ValueError):
            rank_segments([Candidate("c", "DOC", 1)], ceiling=4, type_prior={})

    def test_more_copies_do_not_outrank_authority(self):
        weak = [Candidate(f"w{i}", "DOC", 1, authority=0) for i in range(5)]
        strong = Candidate("s", "DOC", 1, authority=1)
        self.assertEqual(rank_segments(weak + [strong], ceiling=4, type_prior=self.PRIOR)[0].segment_id, "s")

    def test_budget_per_type_no_crowd_out_no_padding(self):
        issue = Candidate("body", "ISSUE_BODY", 1)
        deps = [Candidate(f"d{i}", "DOC", 1, authority=i) for i in range(6)]
        cs = [issue] + deps
        ranking = rank_segments(cs, ceiling=4, type_prior=self.PRIOR)
        kept, dropped = allocate_budget(cs, ranking, {"ISSUE_BODY": 1, "DOC": 2})
        self.assertIn("body", kept)
        self.assertEqual(len([k for k in kept if k.startswith("d")]), 2)
        self.assertEqual({d[0] for d in dropped}, {"d0", "d1", "d2", "d3"})
        kept2, dropped2 = allocate_budget(deps[:1], rank_segments(deps[:1], ceiling=4, type_prior=self.PRIOR), {"DOC": 5})
        self.assertEqual((kept2, dropped2), (["d0"], []))

    def test_budget_missing_type_raises(self):
        cs = [Candidate("d", "DOC", 1)]
        with self.assertRaises(ValueError):
            allocate_budget(cs, rank_segments(cs, ceiling=4, type_prior=self.PRIOR), {})

    def test_padding(self):
        kept = [Candidate("a", "DOC", 2), Candidate("b", "DOC", 0), Candidate("t", "ISSUE_BODY", 0)]
        v = padding_violations(kept, min_entity_overlap=1)
        self.assertEqual(len(v), 1)
        self.assertIn("b", v[0])


class TestConflicts(unittest.TestCase):
    def test_intent_ignores_non_text_sources(self):
        res = resolve_conflict("intent", [ConflictClaim("body", "ISSUE_BODY", authority=1),
                                          ConflictClaim("readme", "README", authority=9),
                                          ConflictClaim("code", "CODE", authority=9)])
        self.assertEqual((res.status, res.winner_id), ("resolved", "body"))
        self.assertEqual(sorted(res.ineligible_ids), ["code", "readme"])

    def test_intent_later_authoritative_comment_wins(self):
        res = resolve_conflict("intent", [ConflictClaim("body", "ISSUE_BODY", 1, recency=1),
                                          ConflictClaim("c", "COMMENT", 2, recency=2)])
        self.assertEqual(res.winner_id, "c")
        self.assertEqual(res.recorded_ids, ["body"])

    def test_intent_with_only_non_text_claims_is_unresolved(self):
        res = resolve_conflict("intent", [ConflictClaim("a", "README"), ConflictClaim("b", "CODE")])
        self.assertEqual(res.status, "unresolved")

    def test_verifiable_checkable_beats_descriptive_regardless_of_authority(self):
        res = resolve_conflict("verifiable", [ConflictClaim("issue", "ISSUE_BODY", authority=9),
                                              ConflictClaim("readme", "README", authority=9),
                                              ConflictClaim("code", "CODE", authority=1)])
        self.assertEqual(res.winner_id, "code")
        self.assertEqual(sorted(res.recorded_ids), ["issue", "readme"])

    def test_verifiable_never_majority_vote(self):
        claims = [ConflictClaim(f"d{i}", "DOC", authority=0) for i in range(3)] + [ConflictClaim("auth", "DOC", authority=1)]
        self.assertEqual(resolve_conflict("verifiable", claims).winner_id, "auth")

    def test_same_tier_authority_then_canonicality_then_recency(self):
        r1 = resolve_conflict("verifiable", [ConflictClaim("a", "CONFIG", 1, canonical=False, recency=9),
                                             ConflictClaim("b", "CONFIG", 1, canonical=True, recency=0)])
        self.assertEqual(r1.winner_id, "b")
        r2 = resolve_conflict("verifiable", [ConflictClaim("a", "DOC", 1, True, 1), ConflictClaim("b", "DOC", 1, True, 2)])
        self.assertEqual(r2.winner_id, "b")

    def test_genuine_tie_is_unresolved_and_capped(self):
        res = resolve_conflict("verifiable", [ConflictClaim("a", "DOC", 1, True, 1), ConflictClaim("b", "DOC", 1, True, 1)])
        self.assertEqual((res.status, res.winner_id, res.source_cap, res.confidence_capped, res.log_to),
                         ("unresolved", None, "INFERRED", True, "uncertain_information"))
        self.assertEqual(sorted(res.recorded_ids), ["a", "b"])

    def test_bad_input(self):
        with self.assertRaises(ValueError):
            resolve_conflict("nope", [ConflictClaim("a", "DOC"), ConflictClaim("b", "DOC")])
        with self.assertRaises(ValueError):
            resolve_conflict("intent", [ConflictClaim("a", "DOC")])

    def test_handling_resolved(self):
        res = resolve_conflict("intent", [ConflictClaim("body", "ISSUE_BODY", 2), ConflictClaim("readme", "README", 9)])
        good = FieldProposal("objective", "x", "EXPLICIT", ["body"])
        self.assertEqual(conflict_handling_violations(res, good, logged_uncertain=False), [])
        bad = FieldProposal("objective", "x", "SUPPORTED_BY_CONTEXT", ["readme"])
        self.assertEqual(len(conflict_handling_violations(res, bad, logged_uncertain=False)), 2)

    def test_handling_unresolved(self):
        res = resolve_conflict("verifiable", [ConflictClaim("a", "DOC", 1, True, 1), ConflictClaim("b", "DOC", 1, True, 1)])
        self.assertEqual(len(conflict_handling_violations(res, FieldProposal("f", "x", "EXPLICIT", ["a"]), logged_uncertain=False)), 2)
        self.assertEqual(conflict_handling_violations(res, FieldProposal("f", "x", "INFERRED", ["a", "b"]), logged_uncertain=True), [])


class TestGrounding(unittest.TestCase):
    def setUp(self):
        self.segs = {s.segment_id: s for s in (seg("t", "ISSUE_BODY"), seg("l", "LABEL"), seg("c", "CODE"), seg("d", "DOC"))}

    def test_out_of_scope_only_falls_to_unknown(self):
        p = FieldProposal("components", ["auth"], "SUPPORTED_BY_CONTEXT", ["c"], "code says so", 0.9)
        low = degrade_to_ceiling(p, self.segs, 1)
        self.assertEqual((low.value, low.source, low.pointers, low.confidence), ([], "UNKNOWN", [], None))
        scalar = degrade_to_ceiling(FieldProposal("role", "Backend", "SUPPORTED_BY_CONTEXT", ["c"], "e", 0.9), self.segs, 1)
        self.assertEqual((scalar.value, scalar.source), ("Unknown", "UNKNOWN"))

    def test_partial_survival_keeps_value_drops_confidence_and_stale_text(self):
        p = FieldProposal("role", "Backend", "EXPLICIT", ["t", "c"], "rendered at tier 3", 0.9)
        low = degrade_to_ceiling(p, self.segs, 1)
        self.assertEqual((low.pointers, low.confidence, low.evidence_text, low.source), (["t"], None, None, "EXPLICIT"))

    def test_source_reclipped_to_surviving_evidence(self):
        p = FieldProposal("role", "Frontend", "EXPLICIT", ["l", "c"], "e", 0.9)
        self.assertEqual(degrade_to_ceiling(p, self.segs, 1).source, "SUPPORTED_BY_CONTEXT")

    def test_no_degradation_within_ceiling(self):
        p = FieldProposal("role", "Backend", "SUPPORTED_BY_CONTEXT", ["c"], "e", 0.9)
        same = degrade_to_ceiling(p, self.segs, 3)
        self.assertEqual((same.pointers, same.source), (["c"], "SUPPORTED_BY_CONTEXT"))
        self.assertIsNone(same.confidence)

    def test_dangling_pointer_dropped(self):
        p = FieldProposal("role", "Backend", "EXPLICIT", ["ghost"], "e", 0.9)
        self.assertEqual(degrade_to_ceiling(p, self.segs, 3).source, "UNKNOWN")

    def test_multi_ceiling_views(self):
        views = multi_ceiling_views(list(self.segs.values()), [3, 1, 3])
        self.assertEqual(sorted(views), [1, 3])
        self.assertEqual({s.segment_id for s in views[1]}, {"t", "l"})
        self.assertEqual({s.segment_id for s in views[3]}, {"t", "l", "c"})

    def test_batch_ceiling_leak(self):
        good = {"example_id": "e1", "context_tier": 3, "segments": [self.segs["c"]]}
        bad = {"example_id": "e2", "context_tier": 1, "segments": [self.segs["t"], self.segs["c"]]}
        v = batch_ceiling_violations([good, bad])
        self.assertEqual(len(v), 1)
        self.assertIn("e2", v[0])

    def test_omission(self):
        self.assertEqual(omission_violations(False, asserts_absence=True, logged_uncertain=False), [])
        self.assertEqual(omission_violations(True, asserts_absence=False, logged_uncertain=True), [])
        self.assertEqual(len(omission_violations(True, asserts_absence=True, logged_uncertain=False)), 2)

    def test_empty_retrieval_gate(self):
        mix = [{"retrieved_count": 0}, {"retrieved_count": 3}, {"retrieved_count": 2}, {"retrieved_count": 1}]
        self.assertEqual(empty_retrieval_gate(mix, min_empty_share=0.2), [])
        self.assertTrue(empty_retrieval_gate(mix, min_empty_share=0.5))
        self.assertTrue(empty_retrieval_gate(mix[1:], min_empty_share=0.0))    # zero empties never acceptable
        self.assertTrue(empty_retrieval_gate([], min_empty_share=0.1))

    def test_schema_change_is_proposed_not_enacted(self):
        self.assertEqual(PROPOSED_SCHEMA_CHANGE["status"], "PROPOSED_NOT_ENACTED")
        self.assertEqual(schema_enactment_violations(), [])
        self.assertNotIn("VERIFIED", schema.PROVENANCE_SOURCE)

    def test_enactment_detected(self):
        schema.PROVENANCE_SOURCE.add("VERIFIED")
        try:
            self.assertTrue(schema_enactment_violations())
        finally:
            schema.PROVENANCE_SOURCE.discard("VERIFIED")


class TestReferenceAndScoring(unittest.TestCase):
    def test_supported_tier_uses_ground_truth(self):
        ref = tier_appropriate_reference("Backend", [1, 3], ceiling=1)
        self.assertEqual((ref.value, ref.kind), ("Backend", "ground_truth"))

    def test_unsupported_tier_reference_is_unknown(self):
        ref = tier_appropriate_reference("Backend", [3], ceiling=1)
        self.assertEqual((ref.value, ref.kind), ("Unknown", "unknown_at_tier"))
        self.assertEqual(tier_appropriate_reference(["auth"], [3], 2).value, [])

    def test_unaligned_and_unknown_gt(self):
        self.assertEqual(tier_appropriate_reference("Backend", [], 3).kind, "unaligned")
        self.assertEqual(tier_appropriate_reference("Backend", None, 3).kind, "unaligned")
        self.assertEqual(tier_appropriate_reference("Unknown", [3], 1).value, "Unknown")

    def test_correct_caution_is_not_penalised_and_lucky_match_is_overclaim(self):
        ref = tier_appropriate_reference("Backend", [3], 1)
        self.assertEqual(score_against_reference("Unknown", ref), "correct_abstention")
        self.assertEqual(score_against_reference("Backend", ref), "overclaim")     # equals GT, still overclaim
        self.assertEqual(score_against_reference("Frontend", ref), "overclaim")

    def test_supported_scoring(self):
        ref = tier_appropriate_reference("Backend", [1], 1)
        self.assertEqual(score_against_reference("Backend", ref), "correct")
        self.assertEqual(score_against_reference("Frontend", ref), "incorrect")
        self.assertEqual(score_against_reference("Unknown", ref), "missed")

    def test_list_fields_compare_as_sets(self):
        ref = tier_appropriate_reference(["a", "b"], [1], 1)
        self.assertEqual(score_against_reference(["b", "a"], ref), "correct")
        self.assertEqual(score_against_reference(["a"], ref), "incorrect")
        self.assertEqual(score_against_reference([], ref), "missed")
        empty = tier_appropriate_reference(["a"], [3], 1)
        self.assertEqual(score_against_reference(["a"], empty), "overclaim")

    def test_unaligned_excluded(self):
        self.assertEqual(score_against_reference("x", tier_appropriate_reference("x", [], 1)), "excluded")

    def test_summary(self):
        rows = [("role", "EXPLICIT", 1, "correct"), ("role", "EXPLICIT", 1, "overclaim"),
                ("role", "EXPLICIT", 1, "correct_abstention"), ("role", "EXPLICIT", 1, "excluded"),
                ("role", "INFERRED", 1, "incorrect")]
        s = summarize_outcomes(rows)
        c = s[("role", "EXPLICIT", 1)]
        self.assertEqual(c["n_scored"], 3)
        self.assertAlmostEqual(c["accuracy"], 2 / 3)
        self.assertAlmostEqual(c["overclaim_rate"], 1 / 3)
        self.assertEqual(s[("role", "INFERRED", 1)]["accuracy"], 0.0)
        only_excluded = summarize_outcomes([("f", "s", 1, "excluded")])[("f", "s", 1)]
        self.assertIsNone(only_excluded["accuracy"])


class TestAdvanceRule(unittest.TestCase):
    def scores(self, v):
        return {f: v for f in EVAL_FIELDS}

    def test_uplift_ok(self):
        cur = {**self.scores(0.7), "role": 0.75}
        self.assertEqual(uplift_gate(self.scores(0.7), {f: 0.72 for f in EVAL_FIELDS}, min_aggregate_gain=0.01,
                                     max_field_degradation=0.02), [])
        self.assertEqual(len(uplift_gate(self.scores(0.7), cur, min_aggregate_gain=0.0, max_field_degradation=0.02)), 0)

    def test_no_gain_fails_even_with_zero_margin(self):
        self.assertTrue(uplift_gate(self.scores(0.7), self.scores(0.7), min_aggregate_gain=0.0, max_field_degradation=0.1))

    def test_gain_from_a_subset_while_others_degrade_fails(self):
        cur = self.scores(0.7)
        cur["role"], cur["task_type"], cur["complexity"], cur["technologies"] = 0.95, 0.95, 0.95, 0.95
        cur["dependencies"] = 0.5
        v = uplift_gate(self.scores(0.7), cur, min_aggregate_gain=0.01, max_field_degradation=0.05)
        self.assertEqual(len(v), 1)
        self.assertIn("dependencies", v[0])

    def test_missing_field(self):
        cur = self.scores(0.8)
        del cur["systems"]
        self.assertTrue(uplift_gate(self.scores(0.7), cur, min_aggregate_gain=0.0, max_field_degradation=0.1))

    def cell(self, hi, lo):
        return {"high_confidence_accuracy": hi, "low_confidence_accuracy": lo}

    def test_calibration_preservation(self):
        k = ("role", "EXPLICIT", 1)
        prev = {k: self.cell(0.9, 0.5)}
        self.assertEqual(calibration_preservation_gate(prev, {k: self.cell(0.9, 0.5)}, prev_tier=1, tolerance=0.0), [])
        self.assertEqual(calibration_preservation_gate(prev, {k: self.cell(0.95, 0.5)}, prev_tier=1, tolerance=0.0), [])
        self.assertTrue(calibration_preservation_gate(prev, {k: self.cell(0.8, 0.5)}, prev_tier=1, tolerance=0.0))
        self.assertEqual(calibration_preservation_gate(prev, {k: self.cell(0.8, 0.5)}, prev_tier=1, tolerance=0.2), [])

    def test_calibration_cells_must_match_and_be_tiered(self):
        k = ("role", "EXPLICIT", 1)
        self.assertTrue(calibration_preservation_gate({k: self.cell(.9, .5)}, {}, prev_tier=1, tolerance=0))
        self.assertTrue(calibration_preservation_gate({}, {}, prev_tier=1, tolerance=0))
        pooled = {("role", "EXPLICIT"): self.cell(.9, .5)}
        self.assertTrue(calibration_preservation_gate(pooled, pooled, prev_tier=1, tolerance=0))
        wrong = {("role", "EXPLICIT", 2): self.cell(.9, .5)}
        self.assertTrue(calibration_preservation_gate(wrong, wrong, prev_tier=1, tolerance=0))

    def test_leakage_gate(self):
        clean = {f"L{i}": [] for i in range(1, 8)}
        self.assertEqual(leakage_gate(clean), [])
        self.assertEqual(len(leakage_gate({**clean, "L6": ["e1: leak"]})), 1)
        partial = dict(clean)
        del partial["L6"]
        self.assertIn("L6", leakage_gate(partial)[0])

    def test_backward_consistency(self):
        v1 = {"role": 0.8, "task_type": 0.7}
        self.assertEqual(backward_consistency_gate(v1, {"role": 0.8, "task_type": 0.75}, max_regression=0.0), [])
        self.assertEqual(len(backward_consistency_gate(v1, {"role": 0.7, "task_type": 0.75}, max_regression=0.0)), 1)
        self.assertEqual(backward_consistency_gate(v1, {"role": 0.7, "task_type": 0.75}, max_regression=0.15), [])
        self.assertTrue(backward_consistency_gate(v1, {"role": 0.9}, max_regression=0.0))
        self.assertTrue(backward_consistency_gate({}, {}, max_regression=0.0))

    def test_data_sufficiency(self):
        need = {"training": 10, "test": 3}
        self.assertEqual(data_sufficiency_gate({"training": 12, "test": 3}, min_records=need), [])
        self.assertEqual(len(data_sufficiency_gate({"training": 12}, min_records=need)), 1)
        self.assertTrue(data_sufficiency_gate({}, min_records={"training": 0}))
        self.assertTrue(data_sufficiency_gate({"training": 5}, min_records={}))

    def test_verdict_all_five_or_nothing(self):
        ok = {c: [] for c in CRITERIA}
        self.assertTrue(advance_verdict(2, ok).promote)
        for c in CRITERIA:
            v = advance_verdict(2, {**ok, c: ["x"]})
            self.assertFalse(v.promote)
            self.assertEqual(list(v.failed), [c])

    def test_missing_criterion_fails_as_not_evaluated(self):
        partial = {c: [] for c in CRITERIA}
        del partial["leakage"]
        v = advance_verdict(2, partial)
        self.assertFalse(v.promote)
        self.assertEqual(v.failed["leakage"], ["not evaluated"])

    def test_unknown_criterion_flagged(self):
        v = advance_verdict(2, {**{c: [] for c in CRITERIA}, "vibes": []})
        self.assertFalse(v.promote)
        self.assertIsInstance(v, AdvanceVerdict)


class TestTierEvaluationLog(unittest.TestCase):
    def ev(self, tier, ds, purpose="evaluation", ck=None, cal=True):
        return TierEvalEvent(tier, ds, ck or f"ck{tier}", cal, purpose)

    def test_each_tier_gets_its_own_one_shot(self):
        log = [self.ev(2, "test"), self.ev(2, "regression"), self.ev(3, "test"), self.ev(3, "regression")]
        self.assertEqual(validate_tier_evaluation_log(log), [])

    def test_second_test_within_a_tier_fails(self):
        v = validate_tier_evaluation_log([self.ev(2, "test"), self.ev(2, "test")])
        self.assertTrue(any(m.startswith("tier 2:") and "exactly once" in m for m in v))

    def test_test_needs_tier_calibrated_checkpoint(self):
        self.assertTrue(validate_tier_evaluation_log([self.ev(3, "test", cal=False)]))

    def test_regression_after_test_same_checkpoint(self):
        self.assertTrue(validate_tier_evaluation_log([self.ev(2, "regression")]))
        self.assertTrue(validate_tier_evaluation_log([self.ev(2, "test"), self.ev(2, "regression", ck="other")]))

    def test_tuning_on_test_and_adversarial_training(self):
        self.assertTrue(validate_tier_evaluation_log([self.ev(2, "test", "threshold_tuning")]))
        self.assertTrue(validate_tier_evaluation_log([self.ev(2, "adversarial", "training", cal=False)]))
        self.assertTrue(validate_tier_evaluation_log([self.ev(2, "hard_case", "calibration")]))


if __name__ == "__main__":
    unittest.main()
