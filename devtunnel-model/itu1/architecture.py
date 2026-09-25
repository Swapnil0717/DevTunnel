"""
ITU-1 -- Step 6: architecture (Phase 8 Model Architecture)

Phase 8 is explicitly scoped as *conceptual* architecture: components,
responsibilities, interfaces, data flow -- "no framework choice, parameter
counts, hyperparameters, ... and no implementation of deep repository
reasoning" (model.md Phase 8, Scope boundary). There is therefore no neural
network anywhere in this file, and there cannot be one yet: no trained
weights exist, because Phase 9 (base model) and the training phases after it
haven't happened.

What IS buildable and testable from Phase 8 is exactly what the document
itself assigns to *deterministic* code (component H, Section 10), plus the
*interfaces* the learned components (A3/C/D/E/F/G) must satisfy (Sections
2, 4.1-4.3, 6) -- because those interfaces are the contract later training
code, and this project's tests, get checked against.

What is here
    Segment                  A1's typed, addressable input unit (2.A)
    SOURCE_CEILING logic     2.A's per-segment-type provenance cap, as code
    segment_issue()          A1: issue snapshot -> Segment[]  (Tier 1 only)
    gate()                   A2: enforce context_tier_ceiling
    FieldProposal            the contract a head (C/D/E/F/G) must emit (4.3)
    InferenceTrace           internal audit record (4.2) -- NOT part of the
                              emitted TaskUnderstandingRecord, and not to be
                              confused with either provenance layer
    RejectedResult           the defined non-record failure (6, 10.5)
    resolve_pointers()       H2.1 -- pointer -> segment, offsets in range
    clip_to_source_ceiling() H2.2 -- claimed source <= ceiling of its pointers
    assemble()                H1-H5 -- build a record from proposals, run the
                              degradation lattice (10.5), finalize derived
                              fields (derived.finalize)
    understand()              Section 6's top-level inference interface,
                              wired to a pluggable `engine`
    NullEngine, HeuristicStubEngine
                              test-only placeholders for C/D/E/F/G -- see the
                              warning on HeuristicStubEngine below

What is explicitly NOT here (Section 0 scope boundary; Section 11.5's
non-goals): any learned encoder/head, retrieval beyond Tier 1, training
procedures, parameter counts, serving/deployment.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from derived import finalize, validate_all
from schema import ROLE, COMPLEXITY, EXPERIENCE_LEVEL, TASK_TYPE_REGISTRY, validate

# --------------------------------------------------------------------------
# Section 2.A -- segment types and the source ceiling table
# --------------------------------------------------------------------------

SEGMENT_TYPES = {
    "ISSUE_TITLE", "ISSUE_BODY", "COMMENT", "LABEL", "MILESTONE",
    "REPO_META", "README", "FILE_TREE", "DOC", "CONFIG", "DEP_GRAPH",
    "CODE", "PR", "COMMIT", "PROJECT_CONVENTION",
}

# Only these segment types can be produced by A1 at Tier 1 (the active
# path). Everything else is [DEFINED, NOT ACTIVE] -- it appears in
# SEGMENT_TYPES and the ceiling table because A2/H2 must still be able to
# reason about it once a retriever exists, but segment_issue() never emits it.
TIER1_SEGMENT_TYPES = {"ISSUE_TITLE", "ISSUE_BODY", "COMMENT", "LABEL", "MILESTONE"}

SOURCE_RANK = {"UNKNOWN": 0, "INFERRED": 1, "SUPPORTED_BY_CONTEXT": 2, "EXPLICIT": 3}

# model.md Phase 8 Section 2.A "Source ceiling table".
_BASE_CEILING = {
    "ISSUE_TITLE": "EXPLICIT",
    "ISSUE_BODY": "EXPLICIT",
    "COMMENT": "SUPPORTED_BY_CONTEXT",  # EXPLICIT only via the reporter-clarifies exception
    "LABEL": "SUPPORTED_BY_CONTEXT",
    "MILESTONE": "SUPPORTED_BY_CONTEXT",
    "REPO_META": "SUPPORTED_BY_CONTEXT",
    "README": "SUPPORTED_BY_CONTEXT",
    "FILE_TREE": "SUPPORTED_BY_CONTEXT",
    "DOC": "SUPPORTED_BY_CONTEXT",
    "CONFIG": "SUPPORTED_BY_CONTEXT",
    "DEP_GRAPH": "SUPPORTED_BY_CONTEXT",
    "CODE": "SUPPORTED_BY_CONTEXT",  # until Tier-3 verification exists (11.3)
    "PR": "SUPPORTED_BY_CONTEXT",
    "COMMIT": "SUPPORTED_BY_CONTEXT",
    "PROJECT_CONVENTION": "SUPPORTED_BY_CONTEXT",
}


@dataclass
class Segment:
    """A1's typed, addressable input unit (Section 2.A)."""
    segment_id: str
    type: str
    text: str
    tier: int
    origin: str = "issue"           # "issue" | "repo" | ...
    is_reporter_clarification: bool = False  # COMMENT-only EXPLICIT exception (2.A note)

    def __post_init__(self) -> None:
        if self.type not in SEGMENT_TYPES:
            raise ValueError(f"unknown segment type {self.type!r}")


def source_ceiling_for(segment: Segment) -> str:
    """The strongest provenance source this segment's text can support."""
    if segment.type == "COMMENT" and segment.is_reporter_clarification:
        return "EXPLICIT"
    return _BASE_CEILING[segment.type]


# --------------------------------------------------------------------------
# A1 / A2 -- segmenting and gating (Tier 1 active path, Section 3 step 1-2)
# --------------------------------------------------------------------------

@dataclass
class InferenceInput:
    """Section 4.1's input contract."""
    repo: str
    issue_number: int
    issue_url: str
    snapshot_fetched_at: str
    title: str
    body: str = ""
    labels: list[str] = field(default_factory=list)
    comments: list[dict] = field(default_factory=list)  # {author_role, body, created_at}
    context_tier_ceiling: int = 1
    context_handles: dict = field(default_factory=dict)


def segment_issue(inp: InferenceInput) -> list[Segment]:
    """A1. Issue snapshot -> typed segments. Tier 1 only: title, body,
    labels, comments. Text is preserved verbatim (A1 "must not" column) so
    every pointer this produces can still resolve to original wording."""
    segments: list[Segment] = []
    n = 0

    def next_id() -> str:
        nonlocal n
        n += 1
        return f"S{n}"

    segments.append(Segment(next_id(), "ISSUE_TITLE", inp.title, tier=1))
    if inp.body:
        segments.append(Segment(next_id(), "ISSUE_BODY", inp.body, tier=1))
    for label in inp.labels:
        segments.append(Segment(next_id(), "LABEL", label, tier=1))
    for c in inp.comments:
        is_reporter = bool(c.get("author_role") == "reporter" and c.get("clarifies"))
        segments.append(Segment(
            next_id(), "COMMENT", c.get("body", ""), tier=1,
            is_reporter_clarification=is_reporter,
        ))
    return segments


def gate(segments: list[Segment], ceiling: int) -> list[Segment]:
    """A2. Admit nothing above context_tier_ceiling (2.A "must not")."""
    return [s for s in segments if s.tier <= ceiling]


# --------------------------------------------------------------------------
# Section 4.3 -- the proposal contract every learned head must satisfy
# --------------------------------------------------------------------------

@dataclass
class FieldProposal:
    """What C/D/E/F/G are required to emit for one record field, before H
    touches it. `pointers` are segment_ids (the grounding); `evidence_text`
    is E's already-rendered string; `note` is G's ambiguity flag text."""
    field: str
    value: Any
    source: str  # EXPLICIT | SUPPORTED_BY_CONTEXT | INFERRED | UNKNOWN
    pointers: list[str] = field(default_factory=list)
    evidence_text: str | None = None
    confidence: float | None = None
    note: str | None = None


@dataclass
class InferenceTrace:
    """Section 4.2's internal, non-record audit trail."""
    downgrades: list[str] = field(default_factory=list)
    repairs: list[str] = field(default_factory=list)
    dropped_entities: list[str] = field(default_factory=list)
    degradation_level: int = 0
    calibration_notes: list[str] = field(default_factory=list)


@dataclass
class RejectedResult:
    """Section 6/10.5: a defined, machine-parseable non-record. Not a
    malformed record -- the system prefers this to schema violation."""
    reason_codes: list[str]
    detail: str = ""


# --------------------------------------------------------------------------
# H2 -- grounding verification
# --------------------------------------------------------------------------

def resolve_pointers(pointers: list[str], segments_by_id: dict[str, Segment]) -> list[Segment]:
    """H2.1. Returns only the pointers that resolve to a real segment;
    a pointer to a missing/absent segment_id is silently dropped by the
    caller (logged as a repair), never an excuse to fabricate text."""
    return [segments_by_id[p] for p in pointers if p in segments_by_id]


def clip_to_source_ceiling(proposal: FieldProposal, resolved: list[Segment],
                            trace: InferenceTrace) -> FieldProposal:
    """H2.2. A head that claims a source stronger than its pointed segments
    can support is downgraded, and the event is logged (2.A / Section E)."""
    if proposal.source in ("UNKNOWN",) or not resolved:
        return proposal
    ceiling_rank = max(SOURCE_RANK[source_ceiling_for(s)] for s in resolved)
    claimed_rank = SOURCE_RANK[proposal.source]
    if claimed_rank > ceiling_rank:
        clipped = [k for k, v in SOURCE_RANK.items() if v == ceiling_rank][0]
        trace.downgrades.append(
            f"{proposal.field}: source {proposal.source} exceeds ceiling of its "
            f"evidence; clipped to {clipped}"
        )
        proposal = FieldProposal(**{**proposal.__dict__, "source": clipped})
    return proposal


# --------------------------------------------------------------------------
# H1/H3/H4/H5 -- assembly, the rule engine, derivation, degradation lattice
# --------------------------------------------------------------------------

CLASSIFICATION_FIELDS = ("role", "experience_level", "complexity", "task_type")
LIST_FIELDS = ("technologies", "languages", "frameworks", "technical_areas",
                "components", "systems", "affected_areas")
PROSE_FIELDS = ("title", "summary", "objective", "description", "expected_outcome")

_UNKNOWN_BY_ENUM = {"role": "Unknown", "experience_level": "Unknown",
                     "complexity": "Unknown", "task_type": "Unknown"}


def _new_task_id() -> str:
    return str(uuid.uuid4())


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _task_identity(inp: InferenceInput) -> dict | None:
    required_strings = (inp.repo, inp.issue_url, inp.snapshot_fetched_at, inp.title)
    if not all(isinstance(s, str) and s.strip() for s in required_strings):
        return None
    if not isinstance(inp.issue_number, int) or isinstance(inp.issue_number, bool) or inp.issue_number <= 0:
        return None
    return {
        "task_id": _new_task_id(),
        "created_at": _now(),
        "source_issue": {
            "repo": inp.repo,
            "issue_number": inp.issue_number,
            "issue_url": inp.issue_url,
            "snapshot_fetched_at": inp.snapshot_fetched_at,
            "issue_title_raw": inp.title,
        },
    }


def _abstain_record(task_identity: dict) -> dict:
    """Level 4 (10.5): the canned, always-valid safe landing. All four
    classifications Unknown, empty acceptance_criteria (Phase 2 Example-3
    pattern), review_required forced true."""
    unknown_prov = {"source": "UNKNOWN", "evidence": None, "confidence": None}
    prose_prov = {"source": "SUPPORTED_BY_CONTEXT",
                  "evidence": "generated without a resolvable claim; abstained",
                  "confidence": 0.3}
    record = {
        "schema_version": "2.0.0",
        "task_identity": task_identity,
        "task": {
            "title": "Unable to determine task from this issue",
            "summary": "The model could not ground a classification or plan for this issue.",
            "objective": "Manual triage required.",
            "expected_outcome": "A human reviewer determines the task.",
            "role": "Unknown", "experience_level": "Unknown",
            "complexity": "Unknown", "task_type": "Unknown",
            "technologies": [], "languages": [], "frameworks": [],
            "technical_areas": [], "components": [], "systems": [],
            "affected_areas": [], "dependencies": [],
            "scope": {"in_scope": [], "out_of_scope": []},
            "acceptance_criteria": [],
        },
        "provenance": {
            "title": prose_prov, "summary": prose_prov, "objective": prose_prov,
            "expected_outcome": prose_prov,
            "role": unknown_prov, "experience_level": unknown_prov,
            "complexity": unknown_prov, "task_type": unknown_prov,
            "technologies": unknown_prov, "languages": unknown_prov,
            "frameworks": unknown_prov, "technical_areas": unknown_prov,
            "components": unknown_prov, "systems": unknown_prov,
            "dependencies": unknown_prov,
            "scope": unknown_prov, "acceptance_criteria": unknown_prov,
        },
        "uncertainty": {"explicit_information": [], "inferred_information": [],
                         "uncertain_information": [], "missing_information": [
                             "could not ground a task understanding for this issue"]},
        "confidence": {"overall_confidence": 0.0, "method": "weighted_mean_v1"},
        "review": {"review_required": True, "review_reasons": []},
    }
    return record


def _build_raw_record(task_identity: dict, proposals: list[FieldProposal],
                       segments_by_id: dict[str, Segment],
                       trace: InferenceTrace) -> dict:
    """H1/H2: turn proposals into a task-schema-shaped dict. Applies pointer
    resolution and source-ceiling clipping per field; does not run the rule
    engine yet (that's schema.validate, called by the caller)."""
    task: dict = {}
    provenance: dict = {}

    for p in proposals:
        resolved = resolve_pointers(p.pointers, segments_by_id)
        dropped = [ptr for ptr in p.pointers if ptr not in segments_by_id]
        for d in dropped:
            trace.repairs.append(f"{p.field}: dropped unresolved pointer {d}")

        if p.source != "UNKNOWN" and not resolved:
            # H2.6 unsupported-entity check: no valid grounding -> can't
            # stand as claimed. Downgrade this field to UNKNOWN.
            trace.downgrades.append(
                f"{p.field}: no resolvable pointer for a {p.source} claim; downgraded to UNKNOWN"
            )
            value = _UNKNOWN_BY_ENUM.get(p.field, [] if p.field in LIST_FIELDS else "Unknown"
                                          if p.field in CLASSIFICATION_FIELDS else None)
            if p.field in LIST_FIELDS or p.field == "dependencies":
                task[p.field] = []
            elif p.field in CLASSIFICATION_FIELDS:
                task[p.field] = "Unknown"
            elif p.field == "scope":
                task[p.field] = {"in_scope": [], "out_of_scope": []}
            elif p.field == "acceptance_criteria":
                task[p.field] = []
            # prose fields with no grounding are simply left unset here;
            # the record-level rule check below will force Level 4 if that
            # leaves a required string field missing.
            provenance[p.field] = {"source": "UNKNOWN", "evidence": None, "confidence": None}
            continue

        p2 = clip_to_source_ceiling(p, resolved, trace)
        task[p.field] = p.value
        provenance[p.field] = {
            "source": p2.source,
            "evidence": p2.evidence_text,
            "confidence": p2.confidence,
        }

    return {
        "schema_version": "2.0.0",
        "task_identity": task_identity,
        "task": task,
        "provenance": provenance,
        "uncertainty": {"explicit_information": [], "inferred_information": [],
                         "uncertain_information": [], "missing_information": []},
        "confidence": {"overall_confidence": 0.0, "method": "weighted_mean_v1"},
        "review": {"review_required": False, "review_reasons": []},
    }


def _level1_repair(record: dict, errors: list[str], trace: InferenceTrace) -> dict:
    """Level 1 (10.5): local, evidence-preserving fixes for a fixed set of
    known-repairable rule violations. Anything else is left for Level 2/4."""
    task = record["task"]

    if any(e.startswith("rule 8:") for e in errors):
        overlap = set(task.get("components", [])) & set(task.get("systems", []))
        if overlap:
            task["systems"] = [s for s in task.get("systems", []) if s not in overlap]
            trace.repairs.append(f"rule 8: dropped {sorted(overlap)} from systems (kept in components)")

    if any(e.startswith("rule 9:") for e in errors):
        known = set(task.get("components", [])) | set(task.get("systems", []))
        from schema import ISSUE_REF_PATTERN
        kept = []
        for d in task.get("dependencies", []):
            ref = d.get("ref") if isinstance(d, dict) else None
            if isinstance(ref, str) and ref not in known and not ISSUE_REF_PATTERN.match(ref):
                trace.repairs.append(f"rule 9: dropped unresolved dependency ref {ref!r}")
                continue
            kept.append(d)
        task["dependencies"] = kept

    if any(e.startswith("rule 7:") for e in errors):
        # experience_level and complexity evidence collapsed onto each
        # other -- downgrade the lower-confidence of the two (Section 8.3).
        prov = record["provenance"]
        exp_c = (prov.get("experience_level") or {}).get("confidence") or 0
        cpx_c = (prov.get("complexity") or {}).get("confidence") or 0
        loser = "experience_level" if exp_c <= cpx_c else "complexity"
        task[loser] = "Unknown"
        prov[loser] = {"source": "UNKNOWN", "evidence": None, "confidence": None}
        trace.downgrades.append(f"rule 7: {loser} downgraded to UNKNOWN (collapsed with its pair)")

    if any("schema_version" in e for e in errors):
        record["schema_version"] = "2.0.0"
        trace.repairs.append("schema_version: stamped current version")

    return record


def assemble(task_identity: dict | None, proposals: list[FieldProposal],
             segments: list[Segment]) -> tuple[dict | RejectedResult, InferenceTrace]:
    """H1-H5. Builds a record from proposals and never lets a malformed
    record leave the system (Section 10, the degradation lattice)."""
    trace = InferenceTrace()

    if task_identity is None:
        return RejectedResult(["INVALID_INPUT_SNAPSHOT"],
                               "issue snapshot is missing required identity fields"), trace

    segments_by_id = {s.segment_id: s for s in segments}
    record = _build_raw_record(task_identity, proposals, segments_by_id, trace)

    errors = validate(record)
    if errors:
        record = _level1_repair(record, errors, trace)
        errors = validate(record)
        trace.degradation_level = 1 if trace.repairs or trace.downgrades else trace.degradation_level

    if errors:
        # Level 2: anything still broken becomes UNKNOWN if it's a
        # classification field; this project's stub does not implement a
        # real generator, so an unrecoverable prose/structure failure goes
        # straight to Level 4 rather than Level 3 regeneration.
        for f in CLASSIFICATION_FIELDS:
            if any(f"task.{f}" in e or f"provenance.{f}" in e for e in errors):
                record["task"][f] = "Unknown"
                record["provenance"][f] = {"source": "UNKNOWN", "evidence": None, "confidence": None}
                trace.downgrades.append(f"{f}: downgraded to UNKNOWN to satisfy structural validity")
        errors = validate(record)
        trace.degradation_level = 2

    if errors:
        record = _abstain_record(task_identity)
        trace.degradation_level = 4
        trace.repairs.append("Level 4: abstained -- all classifications Unknown, review forced")
        errors = validate(record)

    if errors:
        return RejectedResult(["UNRECOVERABLE_AFTER_ABSTAIN"], "; ".join(errors)), trace

    record = finalize(record)
    post_errors = validate_all(record)
    if post_errors:
        return RejectedResult(["POST_DERIVATION_INVALID"], "; ".join(post_errors)), trace

    return record, trace


# --------------------------------------------------------------------------
# Section 6 -- the top-level inference interface, and a pluggable engine
# --------------------------------------------------------------------------

class NullEngine:
    """The honest minimum: every field is Unknown / ungrounded. Useful as a
    baseline and for testing the H layer and the Level-4 abstain path in
    isolation, without any heuristics standing in for a real model."""

    def propose(self, segments: list[Segment]) -> list[FieldProposal]:
        return []


class HeuristicStubEngine:
    """
    NOT A MODEL. This is a deterministic, keyword-matching placeholder for
    C/D/E/F/G that exists only so `understand()` and the H layer can be
    exercised end-to-end before Phase 9+ produces a trained model. It makes
    no attempt at the anti-keyword-shortcut commitments Section 8.4 requires
    of the real architecture (evidence-grounded heads trained against
    contrast pairs, length decorrelation, calibration by source type). Do
    not read its heuristics as a design proposal for the real C/D/E/F/G.
    """

    _TASK_TYPE_HINTS = [
        ("Bug", re.compile(r"\b(bugs?|crash\w*|errors?|exceptions?|broken|fails?|failing|failure)\b", re.I)),
        ("Performance", re.compile(r"\b(slow\w*|latency|performant?|timeouts?)\b", re.I)),
        ("Security", re.compile(r"\b(security|vulnerab\w*|exploit\w*|CVE)\b", re.I)),
        ("Feature", re.compile(r"\b(add\w*|feature\w*|support for|new)\b", re.I)),
        ("Documentation", re.compile(r"\b(docs?|documentation|readme)\b", re.I)),
    ]
    _ROLE_HINTS = [
        ("Frontend", re.compile(r"\b(UI|frontend|front-end|React|CSS|buttons?|pages?)\b", re.I)),
        ("Backend", re.compile(r"\b(backend|back-end|APIs?|database|server\w*|endpoints?)\b", re.I)),
    ]

    def propose(self, segments: list[Segment]) -> list[FieldProposal]:
        title_seg = next((s for s in segments if s.type == "ISSUE_TITLE"), None)
        body_seg = next((s for s in segments if s.type == "ISSUE_BODY"), None)
        text = " ".join(s.text for s in (title_seg, body_seg) if s)
        proposals: list[FieldProposal] = []

        task_type = "Unknown"
        for name, pattern in self._TASK_TYPE_HINTS:
            if title_seg and pattern.search(title_seg.text):
                task_type, src, ptrs, conf = name, "EXPLICIT", [title_seg.segment_id], 0.85
                break
            if body_seg and pattern.search(body_seg.text):
                task_type, src, ptrs, conf = name, "SUPPORTED_BY_CONTEXT", [body_seg.segment_id], 0.6
                break
        else:
            src, ptrs, conf = "UNKNOWN", [], None
        proposals.append(FieldProposal("task_type", task_type, src, ptrs,
                                        f"matched from: {text[:60]}" if ptrs else None, conf))

        role = "Unknown"
        for name, pattern in self._ROLE_HINTS:
            seg = title_seg if (title_seg and pattern.search(title_seg.text)) else \
                  (body_seg if (body_seg and pattern.search(body_seg.text)) else None)
            if seg:
                role = name
                proposals.append(FieldProposal(
                    "role", role, "SUPPORTED_BY_CONTEXT", [seg.segment_id],
                    f"matched from: {seg.text[:60]}", 0.55))
                break
        if role == "Unknown":
            proposals.append(FieldProposal("role", "Unknown", "UNKNOWN"))

        # experience_level / complexity: deliberately INFERRED with distinct
        # evidence text (Rule 7) -- length is NOT used as the signal.
        has_signal = bool(body_seg and len(body_seg.text) > 0)
        if has_signal:
            proposals.append(FieldProposal(
                "complexity", "Medium", "INFERRED", [body_seg.segment_id],
                "single reported symptom, scope not yet decomposed", 0.5))
            proposals.append(FieldProposal(
                "experience_level", "Intermediate", "INFERRED", [body_seg.segment_id],
                "requires reading existing behavior before changing it", 0.5))
        else:
            proposals.append(FieldProposal("complexity", "Unknown", "UNKNOWN"))
            proposals.append(FieldProposal("experience_level", "Unknown", "UNKNOWN"))

        for f in LIST_FIELDS:
            proposals.append(FieldProposal(f, [], "UNKNOWN"))
        proposals.append(FieldProposal("dependencies", [], "UNKNOWN"))
        proposals.append(FieldProposal("scope", {"in_scope": [], "out_of_scope": []}, "UNKNOWN"))

        title_val = title_seg.text if title_seg else "Untitled issue"
        proposals.append(FieldProposal("title", title_val, "EXPLICIT",
                                        [title_seg.segment_id] if title_seg else [],
                                        title_val, 0.9))
        summary_val = (body_seg.text[:140] if body_seg else title_val)
        proposals.append(FieldProposal(
            "summary", summary_val,
            "SUPPORTED_BY_CONTEXT" if body_seg else "EXPLICIT",
            [body_seg.segment_id] if body_seg else ([title_seg.segment_id] if title_seg else []),
            summary_val, 0.6))
        proposals.append(FieldProposal(
            "objective", "Resolve the reported issue.",
            "SUPPORTED_BY_CONTEXT" if body_seg else "EXPLICIT",
            [body_seg.segment_id] if body_seg else ([title_seg.segment_id] if title_seg else []),
            "derived from the reported behavior", 0.5))
        proposals.append(FieldProposal(
            "expected_outcome", "The reported behavior no longer occurs.",
            "SUPPORTED_BY_CONTEXT" if body_seg else "EXPLICIT",
            [body_seg.segment_id] if body_seg else ([title_seg.segment_id] if title_seg else []),
            "derived from the reported behavior", 0.5))

        if task_type != "Unknown" or role != "Unknown":
            anchor = body_seg or title_seg
            proposals.append(FieldProposal(
                "acceptance_criteria", ["The reported behavior no longer occurs"],
                "SUPPORTED_BY_CONTEXT", [anchor.segment_id] if anchor else [],
                "derived from the reported behavior", 0.5))
        else:
            proposals.append(FieldProposal("acceptance_criteria", [], "UNKNOWN"))

        return proposals


def understand(inp: InferenceInput, engine=None) -> tuple[dict | RejectedResult, InferenceTrace]:
    """Section 6's `understand(InferenceInput) -> (Record | RejectedResult,
    InferenceTrace)`. Tier 1 only (Section 3's active path): A3/A4 are not
    wired in because they are [DEFINED, NOT ACTIVE] below Tier 2."""
    engine = engine or NullEngine()
    task_identity = _task_identity(inp)
    segments = gate(segment_issue(inp), inp.context_tier_ceiling)
    proposals = engine.propose(segments)
    return assemble(task_identity, proposals, segments)
