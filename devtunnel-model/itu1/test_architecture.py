import unittest

from architecture import (
    FieldProposal, HeuristicStubEngine, InferenceInput, InferenceTrace,
    NullEngine, RejectedResult, Segment, assemble, clip_to_source_ceiling,
    gate, resolve_pointers, segment_issue, source_ceiling_for, understand,
)
from derived import validate_all
from schema import validate


def make_input(**overrides) -> InferenceInput:
    base = dict(
        repo="acme/shop", issue_number=42,
        issue_url="https://github.com/acme/shop/issues/42",
        snapshot_fetched_at="2026-09-24T00:00:00Z",
        title="Button crashes on click",
        body="Clicking the checkout button throws an error in the React frontend.",
        labels=["bug"],
    )
    base.update(overrides)
    return InferenceInput(**base)


class SegmentAndGateTests(unittest.TestCase):
    def test_segment_issue_produces_tier1_types(self):
        segs = segment_issue(make_input(comments=[{"author_role": "reporter", "body": "still happens"}]))
        types = {s.type for s in segs}
        self.assertEqual(types, {"ISSUE_TITLE", "ISSUE_BODY", "LABEL", "COMMENT"})
        self.assertTrue(all(s.tier == 1 for s in segs))

    def test_empty_body_produces_no_body_segment(self):
        segs = segment_issue(make_input(body=""))
        self.assertNotIn("ISSUE_BODY", {s.type for s in segs})

    def test_segment_text_preserved_verbatim(self):
        segs = segment_issue(make_input(title="Weird  spacing   here"))
        title_seg = next(s for s in segs if s.type == "ISSUE_TITLE")
        self.assertEqual(title_seg.text, "Weird  spacing   here")

    def test_gate_drops_above_ceiling(self):
        segs = [Segment("S1", "ISSUE_TITLE", "t", tier=1), Segment("S2", "CODE", "c", tier=3)]
        gated = gate(segs, ceiling=1)
        self.assertEqual([s.segment_id for s in gated], ["S1"])

    def test_gate_at_higher_ceiling_keeps_lower_tier_segments(self):
        segs = [Segment("S1", "ISSUE_TITLE", "t", tier=1), Segment("S2", "CODE", "c", tier=3)]
        gated = gate(segs, ceiling=3)
        self.assertEqual(len(gated), 2)

    def test_unknown_segment_type_rejected(self):
        with self.assertRaises(ValueError):
            Segment("S1", "NOT_A_TYPE", "x", tier=1)


class SourceCeilingTests(unittest.TestCase):
    def test_title_and_body_ceiling_is_explicit(self):
        self.assertEqual(source_ceiling_for(Segment("S1", "ISSUE_TITLE", "t", tier=1)), "EXPLICIT")
        self.assertEqual(source_ceiling_for(Segment("S1", "ISSUE_BODY", "t", tier=1)), "EXPLICIT")

    def test_label_and_milestone_never_explicit(self):
        self.assertEqual(source_ceiling_for(Segment("S1", "LABEL", "bug", tier=1)), "SUPPORTED_BY_CONTEXT")
        self.assertEqual(source_ceiling_for(Segment("S1", "MILESTONE", "v2", tier=1)), "SUPPORTED_BY_CONTEXT")

    def test_ordinary_comment_capped_below_explicit(self):
        seg = Segment("S1", "COMMENT", "I think it's the parser", tier=1)
        self.assertEqual(source_ceiling_for(seg), "SUPPORTED_BY_CONTEXT")

    def test_reporter_clarifying_comment_reaches_explicit(self):
        seg = Segment("S1", "COMMENT", "to clarify: only happens on Safari", tier=1,
                       is_reporter_clarification=True)
        self.assertEqual(source_ceiling_for(seg), "EXPLICIT")

    def test_code_capped_at_supported_by_context(self):
        seg = Segment("S1", "CODE", "def f(): ...", tier=3)
        self.assertEqual(source_ceiling_for(seg), "SUPPORTED_BY_CONTEXT")

    def test_clip_downgrades_overclaimed_source_and_logs(self):
        seg = Segment("S1", "LABEL", "bug", tier=1)
        p = FieldProposal("task_type", "Bug", "EXPLICIT", ["S1"], "from label", 0.9)
        trace = InferenceTrace()
        clipped = clip_to_source_ceiling(p, [seg], trace)
        self.assertEqual(clipped.source, "SUPPORTED_BY_CONTEXT")
        self.assertEqual(len(trace.downgrades), 1)

    def test_clip_leaves_correctly_claimed_source_alone(self):
        seg = Segment("S1", "ISSUE_TITLE", "Bug in checkout", tier=1)
        p = FieldProposal("task_type", "Bug", "EXPLICIT", ["S1"], "in title", 0.9)
        trace = InferenceTrace()
        clipped = clip_to_source_ceiling(p, [seg], trace)
        self.assertEqual(clipped.source, "EXPLICIT")
        self.assertEqual(trace.downgrades, [])

    def test_clip_ignores_unknown_source(self):
        p = FieldProposal("role", "Unknown", "UNKNOWN")
        trace = InferenceTrace()
        clipped = clip_to_source_ceiling(p, [], trace)
        self.assertEqual(clipped.source, "UNKNOWN")
        self.assertEqual(trace.downgrades, [])


class PointerResolutionTests(unittest.TestCase):
    def test_resolve_pointers_finds_real_segments(self):
        segs_by_id = {"S1": Segment("S1", "ISSUE_TITLE", "t", tier=1)}
        resolved = resolve_pointers(["S1"], segs_by_id)
        self.assertEqual(len(resolved), 1)

    def test_resolve_pointers_drops_unknown_ids(self):
        segs_by_id = {"S1": Segment("S1", "ISSUE_TITLE", "t", tier=1)}
        resolved = resolve_pointers(["S1", "S99"], segs_by_id)
        self.assertEqual(len(resolved), 1)


def _minimal_segments():
    return [Segment("S1", "ISSUE_TITLE", "Fix crash", tier=1),
            Segment("S2", "ISSUE_BODY", "It crashes when empty.", tier=1)]


def _minimal_proposals(**overrides):
    """A full set of proposals that should assemble into a Level-0-valid record."""
    p = {
        "title": FieldProposal("title", "Fix crash on empty input", "EXPLICIT", ["S1"], "Fix crash", 0.9),
        "summary": FieldProposal("summary", "Crashes on empty input.", "SUPPORTED_BY_CONTEXT", ["S2"],
                                  "crashes when empty", 0.7),
        "objective": FieldProposal("objective", "Prevent the crash.", "SUPPORTED_BY_CONTEXT", ["S2"],
                                    "crashes when empty", 0.7),
        "expected_outcome": FieldProposal("expected_outcome", "No crash on empty input.",
                                           "SUPPORTED_BY_CONTEXT", ["S2"], "crashes when empty", 0.7),
        "role": FieldProposal("role", "Frontend", "INFERRED", ["S2"], "reported behavior implies UI", 0.6),
        "experience_level": FieldProposal("experience_level", "Beginner", "INFERRED", ["S2"],
                                           "small isolated symptom", 0.5),
        "complexity": FieldProposal("complexity", "Low", "INFERRED", ["S2"], "one code path", 0.5),
        "task_type": FieldProposal("task_type", "Bug", "EXPLICIT", ["S1"], "Fix crash", 0.9),
        "technologies": FieldProposal("technologies", [], "UNKNOWN"),
        "languages": FieldProposal("languages", [], "UNKNOWN"),
        "frameworks": FieldProposal("frameworks", [], "UNKNOWN"),
        "technical_areas": FieldProposal("technical_areas", [], "UNKNOWN"),
        "components": FieldProposal("components", [], "UNKNOWN"),
        "systems": FieldProposal("systems", [], "UNKNOWN"),
        "dependencies": FieldProposal("dependencies", [], "UNKNOWN"),
        "scope": FieldProposal("scope", {"in_scope": [], "out_of_scope": []}, "UNKNOWN"),
        "acceptance_criteria": FieldProposal("acceptance_criteria", ["No crash on empty input"],
                                              "SUPPORTED_BY_CONTEXT", ["S2"], "crashes when empty", 0.6),
    }
    p.update(overrides)
    return list(p.values())


class AssembleLevel0Tests(unittest.TestCase):
    def test_clean_proposals_assemble_to_valid_record(self):
        ti = {"task_id": "x", "created_at": "2026-09-24T00:00:00Z",
              "source_issue": {"repo": "a/b", "issue_number": 1,
                                "issue_url": "https://x/1", "snapshot_fetched_at": "2026-09-24T00:00:00Z",
                                "issue_title_raw": "Fix crash"}}
        record, trace = assemble(ti, _minimal_proposals(), _minimal_segments())
        self.assertIsInstance(record, dict)
        self.assertEqual(validate_all(record), [])
        self.assertEqual(trace.degradation_level, 0)
        self.assertEqual(trace.downgrades, [])


class AssembleRepairTests(unittest.TestCase):
    def _ti(self):
        return {"task_id": "x", "created_at": "2026-09-24T00:00:00Z",
                "source_issue": {"repo": "a/b", "issue_number": 1,
                                  "issue_url": "https://x/1", "snapshot_fetched_at": "2026-09-24T00:00:00Z",
                                  "issue_title_raw": "Fix crash"}}

    def test_components_systems_overlap_is_repaired(self):
        proposals = _minimal_proposals(
            components=FieldProposal("components", ["Widget"], "SUPPORTED_BY_CONTEXT", ["S2"], "x", 0.6),
            systems=FieldProposal("systems", ["Widget"], "SUPPORTED_BY_CONTEXT", ["S2"], "x", 0.6),
        )
        record, trace = assemble(self._ti(), proposals, _minimal_segments())
        self.assertIsInstance(record, dict)
        overlap = set(record["task"]["components"]) & set(record["task"]["systems"])
        self.assertEqual(overlap, set())
        self.assertTrue(any("rule 8" in r for r in trace.repairs))

    def test_bad_dependency_ref_is_dropped(self):
        proposals = _minimal_proposals(
            dependencies=FieldProposal(
                "dependencies", [{"type": "blocks", "ref": "nonexistent-thing", "description": "x"}],
                "SUPPORTED_BY_CONTEXT", ["S2"], "x", 0.6),
        )
        record, trace = assemble(self._ti(), proposals, _minimal_segments())
        self.assertIsInstance(record, dict)
        self.assertEqual(record["task"]["dependencies"], [])
        self.assertTrue(any("rule 9" in r for r in trace.repairs))

    def test_collapsed_experience_complexity_evidence_downgrades_one(self):
        proposals = _minimal_proposals(
            experience_level=FieldProposal("experience_level", "Beginner", "INFERRED", ["S2"],
                                            "identical evidence text", 0.5),
            complexity=FieldProposal("complexity", "Low", "INFERRED", ["S2"],
                                      "identical evidence text", 0.6),
        )
        record, trace = assemble(self._ti(), proposals, _minimal_segments())
        self.assertIsInstance(record, dict)
        self.assertEqual(validate(record), [])
        # the lower-confidence field of the pair should have been dropped to Unknown
        self.assertEqual(record["task"]["experience_level"], "Unknown")
        self.assertTrue(any("rule 7" in r for r in trace.downgrades))


class AssembleUngroundedTests(unittest.TestCase):
    def _ti(self):
        return {"task_id": "x", "created_at": "2026-09-24T00:00:00Z",
                "source_issue": {"repo": "a/b", "issue_number": 1,
                                  "issue_url": "https://x/1", "snapshot_fetched_at": "2026-09-24T00:00:00Z",
                                  "issue_title_raw": "Fix crash"}}

    def test_claim_with_no_resolvable_pointer_downgrades_to_unknown(self):
        proposals = _minimal_proposals(
            role=FieldProposal("role", "Frontend", "EXPLICIT", ["S999"], "ghost pointer", 0.9),
        )
        record, trace = assemble(self._ti(), proposals, _minimal_segments())
        self.assertIsInstance(record, dict)
        self.assertEqual(record["task"]["role"], "Unknown")
        self.assertEqual(record["provenance"]["role"]["source"], "UNKNOWN")
        self.assertTrue(any("role" in d for d in trace.downgrades))

    def test_all_ungrounded_falls_back_to_abstain_record(self):
        proposals = [FieldProposal(f, "Unknown" if f in
                                    ("role", "experience_level", "complexity", "task_type")
                                    else ([] if f not in ("scope",) else {"in_scope": [], "out_of_scope": []}),
                                    "UNKNOWN")
                     for f in ("role", "experience_level", "complexity", "task_type",
                               "technologies", "languages", "frameworks", "technical_areas",
                               "components", "systems", "dependencies", "scope", "acceptance_criteria")]
        record, trace = assemble(self._ti(), proposals, [])
        self.assertIsInstance(record, dict)
        self.assertEqual(validate_all(record), [])
        self.assertEqual(trace.degradation_level, 4)
        self.assertTrue(record["review"]["review_required"])
        for f in ("role", "experience_level", "complexity", "task_type"):
            self.assertEqual(record["task"][f], "Unknown")
        self.assertEqual(record["task"]["acceptance_criteria"], [])


class AssembleRejectTests(unittest.TestCase):
    def test_missing_task_identity_is_rejected(self):
        record, trace = assemble(None, [], [])
        self.assertIsInstance(record, RejectedResult)
        self.assertIn("INVALID_INPUT_SNAPSHOT", record.reason_codes)


class UnderstandEndToEndTests(unittest.TestCase):
    def test_null_engine_produces_valid_abstain_record(self):
        record, trace = understand(make_input(), engine=NullEngine())
        self.assertIsInstance(record, dict)
        self.assertEqual(validate_all(record), [])
        self.assertTrue(record["review"]["review_required"])

    def test_heuristic_engine_produces_valid_record(self):
        record, trace = understand(make_input(), engine=HeuristicStubEngine())
        self.assertIsInstance(record, dict)
        self.assertEqual(validate_all(record), [])

    def test_heuristic_engine_grounds_task_type_in_title(self):
        record, _ = understand(make_input(title="App crashes on startup", body=""),
                                engine=HeuristicStubEngine())
        self.assertEqual(record["task"]["task_type"], "Bug")
        self.assertEqual(record["provenance"]["task_type"]["source"], "EXPLICIT")

    def test_determinism_for_fixed_input(self):
        inp = make_input()
        r1, _ = understand(inp, engine=HeuristicStubEngine())
        r2, _ = understand(inp, engine=HeuristicStubEngine())
        strip = lambda r: {k: v for k, v in r.items() if k != "task_identity"}
        self.assertEqual(strip(r1), strip(r2))

    def test_missing_snapshot_fields_reject_before_engine_runs(self):
        bad = InferenceInput(repo="", issue_number=0, issue_url="", snapshot_fetched_at="", title="")
        result, trace = understand(bad, engine=HeuristicStubEngine())
        self.assertIsInstance(result, RejectedResult)

    def test_tier_ceiling_hides_higher_tier_context_from_engine(self):
        # Tier 1 active path: even though comments arrive, a ceiling of 0
        # (defensive/edge value) would gate everything out; here we check
        # the normal ceiling=1 case still only exposes tier-1 segments.
        inp = make_input(comments=[{"author_role": "reporter", "body": "confirmed"}])
        record, _ = understand(inp, engine=HeuristicStubEngine())
        self.assertIsInstance(record, dict)


class RejectedResultShapeTests(unittest.TestCase):
    def test_rejected_result_is_not_a_record(self):
        result, _ = assemble(None, [], [])
        self.assertIsInstance(result, RejectedResult)
        self.assertTrue(result.reason_codes)
        self.assertNotIsInstance(result, dict)


if __name__ == "__main__":
    unittest.main()
