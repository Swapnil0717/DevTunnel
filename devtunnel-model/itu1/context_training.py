"""
ITU-1 -- Step 12: Context-aware training (Phase 12)

Phase 12 activates Context Tier >= 2, tier by tier, against Phase 8 SS11.2's five-part advance
rule. As in Phases 9-11 there is no encoder, retriever or trainer in this package (the spec leaves
every threshold and weight empirical, Decision #13), so this module implements the parts of the phase
that are rules a run and its evaluation must satisfy:

    Tier map & activation (SS0.1, 1.2, 1.3, 3.5, Decisions #3/#5/#11)
        SEGMENT_TIER, level_scope, validate_tier_attempt, starting_checkpoint,
        validate_checkpoint_identity, validate_tier_training_config, decision_record
    Retrieval & ranking (SS3, 4)
        retrieval_violations, a4_violations, two_pass_violations, convention_profile_violations,
        rank_segments, allocate_budget, padding_violations, retrieval_precision_recall
    Conflict resolution (SS5)
        resolve_conflict, conflict_handling_violations
    Grounding (SS6)
        degrade_to_ceiling, multi_ceiling_views, omission_violations, empty_retrieval_gate,
        schema_enactment_violations, batch_ceiling_violations
    Evaluation (SS7)
        tier_appropriate_reference, score_against_reference, summarize_outcomes,
        uplift_gate, calibration_preservation_gate, leakage_gate, backward_consistency_gate,
        data_sufficiency_gate, advance_verdict, validate_tier_evaluation_log

Thresholds (uplift margins, data minimums, tolerances, top-k, hop caps) are required arguments with
no defaults. The README lists the places where the spec was ambiguous and this module had to choose.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

import dataset
import task_training
from architecture import FieldProposal, InferenceTrace, Segment, SOURCE_RANK, clip_to_source_ceiling, resolve_pointers
from schema import PROVENANCE_SOURCE
from task_training import _is_unknown_value

# ================================================================== SS2 / 0.1: tiers and levels

SEGMENT_TIER: dict[str, int] = {
    "ISSUE_TITLE": 1, "ISSUE_BODY": 1, "LABEL": 1, "MILESTONE": 1, "COMMENT": 1,
    "REPO_META": 2, "README": 2, "FILE_TREE": 2,
    "CODE": 3, "CONFIG": 3,
    "DOC": 4, "DEP_GRAPH": 5,
    "PR": 6, "COMMIT": 6,
    "PROJECT_CONVENTION": 7,
}

# SS0.1: master-prompt Level -> (Context Tier, segment types *added* at that level).
_LEVEL_ADDS = {
    1: (1, {"ISSUE_TITLE", "ISSUE_BODY", "LABEL", "MILESTONE"}),
    2: (1, {"COMMENT"}),
    3: (2, {"REPO_META"}),
    4: (2, {"README", "FILE_TREE"}),
    5: (3, {"CODE", "CONFIG"}),
    6: (5, {"DOC", "DEP_GRAPH"}),         # Levels 6 = Tiers 4-5; the ceiling in force is 5
    7: (6, {"PR", "COMMIT"}),
    8: (7, {"PROJECT_CONVENTION"}),
}


def segment_tier_violations(segments: Iterable[Segment]) -> list[str]:
    """A segment's declared ``tier`` must be its type's tier (a mislabelled CODE segment at tier 1
    would slip past A2)."""
    return [f"{s.segment_id}: {s.type} declared tier {s.tier}, but is a tier-{SEGMENT_TIER[s.type]} type"
            for s in segments if s.tier != SEGMENT_TIER[s.type]]


def level_scope(level: int) -> tuple[int, frozenset]:
    """SS0.1: the Context Tier ceiling for a master-prompt Level, and its *cumulative* segment types
    (Level 8 is Tier 7 with every lower tier's segments still present, not a separate mode)."""
    if level not in _LEVEL_ADDS:
        raise ValueError(f"level must be 1-8, got {level!r}")
    types: set[str] = set()
    for lv in range(1, level + 1):
        types |= _LEVEL_ADDS[lv][1]
    return _LEVEL_ADDS[level][0], frozenset(types)


ACTIVATABLE_TIERS = (2, 3, 4, 5, 6, 7)
BLOCKED_TIERS = {6: "Phase 4 SS3 Stage-6 quarantine: needs a precedent-PR/commit addendum (Decision #5)"}
RETRIEVER_DEPENDENCIES = {4: (2, 3), 5: (2, 3)}   # SS1.2: infrastructure existing, not the accuracy gate


@dataclass
class TierRecord:
    tier: int
    promoted: bool
    checkpoint_id: str | None = None
    retriever_infrastructure_ready: bool = False
    test_consumed: bool = False


def validate_tier_attempt(history: list[TierRecord], tier: int, *,
                          phase4_precedent_addendum: bool = False) -> list[str]:
    """Whether ``tier`` may be attempted now (SS1.2, 1.3, 3.5, Decisions #3/#5). Empty = allowed."""
    if tier not in ACTIVATABLE_TIERS:
        return [f"tier {tier!r} is not activatable in Phase 12 (Tier 1 is Phase 11's; valid: {ACTIVATABLE_TIERS})"]
    if tier in BLOCKED_TIERS and not phase4_precedent_addendum:
        return [f"tier {tier} is blocked: {BLOCKED_TIERS[tier]}"]
    v: list[str] = []
    by_tier = {r.tier: r for r in history}
    own = by_tier.get(tier)
    if own is not None and own.promoted:
        v.append(f"tier {tier} is already promoted")
    if own is not None and own.test_consumed and not own.promoted:
        v.append(f"tier {tier}'s Test pass was spent without clearing the gate; not promoted for this cycle (SS7.9)")
    # Tiers are decided in order: every earlier tier must have been promoted or had its gate decided.
    for e in range(2, tier):
        if e in BLOCKED_TIERS and not phase4_precedent_addendum and tier != 7:
            continue
        r = by_tier.get(e)
        if tier == 7:
            if r is None or not r.promoted:
                v.append(f"tier 7 is contingent on tiers 2-6 all clearing their gates; tier {e} has not")
        elif r is None or not (r.promoted or r.test_consumed):
            v.append(f"tier {e} has not been decided; tiers are trained and evaluated in order")
    for dep in RETRIEVER_DEPENDENCIES.get(tier, ()):
        r = by_tier.get(dep)
        if r is None or not r.retriever_infrastructure_ready:
            v.append(f"tier {tier} structurally depends on tier {dep}'s retriever infrastructure, which is not ready")
    return v


def starting_checkpoint(history: list[TierRecord], itu1_v1_checkpoint_id: str) -> str:
    """SS1.2: each tier starts from the highest-tier checkpoint already *promoted*, never from a failed
    tier's checkpoint; ITU-1 v1 if nothing has been promoted yet."""
    promoted = [r for r in history if r.promoted and r.checkpoint_id]
    return max(promoted, key=lambda r: r.tier).checkpoint_id if promoted else itu1_v1_checkpoint_id


REQUIRED_IDENTITY_FIELDS = (
    "checkpoint_id", "created_at", "tier", "parent_checkpoint_id", "root_checkpoint_id", "tokenizer_version",
    "head_configuration", "training_data_manifest_hash", "loss_weight_config", "retriever_config", "training_modes",
)


def validate_checkpoint_identity(record: dict, *, itu1_v1_checkpoint_id: str, expected_parent: str,
                                 phase4_precedent_addendum: bool = False) -> list[str]:
    """Phase 11 SS7's identity discipline extended per tier: rooted in ITU-1 v1, parented on the highest
    already-promoted checkpoint (``starting_checkpoint``), calibrator re-fit for this tier."""
    v = [f"missing or empty required field: {f}" for f in REQUIRED_IDENTITY_FIELDS
         if f not in record or record[f] in (None, "", {}, [])]
    tier = record.get("tier")
    if "tier" in record and tier not in ACTIVATABLE_TIERS:
        v.append(f"tier {tier!r} not in {ACTIVATABLE_TIERS}")
    elif tier in BLOCKED_TIERS and not phase4_precedent_addendum:
        v.append(f"tier {tier} is blocked: {BLOCKED_TIERS[tier]}")
    if record.get("root_checkpoint_id") not in (None, "", itu1_v1_checkpoint_id):
        v.append(f"root_checkpoint_id must be ITU-1 v1 ({itu1_v1_checkpoint_id!r})")
    if record.get("parent_checkpoint_id") not in (None, "", expected_parent):
        v.append(f"parent_checkpoint_id must be the highest promoted checkpoint ({expected_parent!r})")
    rc = record.get("retriever_config")
    if "retriever_config" in record and not (isinstance(rc, dict) and rc.get("name") and rc.get("version")):
        v.append("retriever_config must name the retriever and its version")
    if record.get("calibrator_refit_for_tier") is not True:
        v.append("calibrator_refit_for_tier must be True: G is re-fit at every tier (SS1.5)")
    if record.get("context_ceiling") not in (None, tier):
        v.append(f"context_ceiling {record.get('context_ceiling')!r} must equal tier {tier!r}")
    return v


def validate_tier_training_config(tier: int, cfg: dict, *, expected_start: str) -> list[str]:
    """SS1.4/1.5/6.2 as checkable run rules. Keys: ``training_modes`` (set), ``start_checkpoint_id``,
    ``reinit_heads`` (bool), ``encoder_lr``/``head_lr``, ``retrieval_bundle_snapshot_hash``,
    ``live_fetch`` (bool), ``ceilings_rendered`` (set of tiers), ``calibrator_refit`` (bool),
    ``calibration_encoder_frozen`` (bool), ``calibration_fit_dataset`` (str)."""
    v: list[str] = []
    if tier not in ACTIVATABLE_TIERS:
        return [f"tier {tier!r} not activatable"]
    modes = set(cfg.get("training_modes") or ())
    for m in ("oracle_context", "retrieval_in_loop"):
        if m not in modes:
            v.append(f"training mode {m!r} is required at every tier >= 2 (SS1.4)")
    if cfg.get("start_checkpoint_id") != expected_start:
        v.append(f"start_checkpoint_id must be the highest promoted checkpoint {expected_start!r}")
    if cfg.get("reinit_heads") is not False:
        v.append("heads are continued, not re-initialised or re-run through Phase 11 Stage 1 (SS1.5)")
    elr, hlr = cfg.get("encoder_lr"), cfg.get("head_lr")
    if not (isinstance(elr, (int, float)) and isinstance(hlr, (int, float)) and 0 < elr < hlr):
        v.append("encoder_lr must be positive and strictly lower than head_lr")
    if "retrieval_in_loop" in modes:
        if not cfg.get("retrieval_bundle_snapshot_hash"):
            v.append("retrieval-in-the-loop batches must be built from a fixed Phase 4 bundle snapshot (hash required)")
        if cfg.get("live_fetch"):
            v.append("no live repository fetching during training (reproducibility, A4 auditability)")
    ceilings = set(cfg.get("ceilings_rendered") or ())
    if not {tier, tier - 1} <= ceilings:
        v.append(f"the same record must be rendered at multiple ceilings including {tier} and {tier - 1} (SS6.2)")
    if cfg.get("calibrator_refit") is not True or cfg.get("calibration_encoder_frozen") is not True:
        v.append("G must be re-fit for this tier as a separate frozen-encoder stage (SS1.5)")
    if cfg.get("calibration_fit_dataset") != "validation":
        v.append("calibration is fit on Validation only")
    return v


def decision_record(tier: int, verdict: "AdvanceVerdict | None" = None, *, checkpoint_id: str | None = None,
                    phase4_precedent_addendum: bool = False) -> dict:
    """Decision #11's deliverable: a checkpoint for a tier that cleared, a *decision record* (no
    checkpoint) for a tier that did not or cannot be attempted."""
    if tier in BLOCKED_TIERS and not phase4_precedent_addendum:
        return {"tier": tier, "status": "blocked", "checkpoint_id": None, "reason": BLOCKED_TIERS[tier]}
    if verdict is None:
        return {"tier": tier, "status": "not_attempted", "checkpoint_id": None}
    if verdict.promote:
        if not checkpoint_id:
            raise ValueError("a promoted tier needs its checkpoint_id")
        return {"tier": tier, "status": "promoted", "checkpoint_id": checkpoint_id}
    return {"tier": tier, "status": "not_promoted", "checkpoint_id": None, "failed_criteria": verdict.failed}


# ================================================================== SS3: retrieval

def a4_violations(segments: Iterable[Segment], *, resolving_ids: set[str],
                  phase4_precedent_addendum: bool = False) -> list[str]:
    """SS3.4/3.5/6.5: A4 applies to every segment set, oracle or retrieved, at every tier. A segment
    that resolves the issue never enters the set; and while Tier 6 is blocked, no PR/COMMIT segment
    may enter it at all (the Phase 4 quarantine)."""
    v = []
    for s in segments:
        if s.segment_id in resolving_ids:
            v.append(f"{s.segment_id}: resolves the issue under evaluation and must never be in the segment set")
        elif s.type in ("PR", "COMMIT") and not phase4_precedent_addendum:
            v.append(f"{s.segment_id}: {s.type} content is quarantined until the Phase 4 addendum (Decision #5)")
    return v


def retrieval_violations(tier: int, retrieved: list[dict], *, top_k: int, max_hops: int | None = None) -> list[str]:
    """SS3.2's 'must not' column, on retriever output. Each candidate is a dict with ``segment_id``,
    ``origin_id`` and, as relevant, ``is_whole_file``, ``hops``, ``closes_or_references_issue``."""
    v: list[str] = []
    if len(retrieved) > top_k:
        v.append(f"retriever returned {len(retrieved)} candidates, above top_k={top_k} (no unfiltered dumps)")
    for c in retrieved:
        sid = c.get("segment_id", "<no id>")
        if not c.get("origin_id"):
            v.append(f"{sid}: missing origin_id")
        if tier == 3 and c.get("is_whole_file"):
            v.append(f"{sid}: whole file returned; tier 3 returns excerpts")
        if tier in (4, 5):
            if max_hops is None:
                v.append("tier 4-5 retrieval needs a bounded max_hops")
            elif c.get("hops", 0) > max_hops:
                v.append(f"{sid}: dependency traversal {c['hops']} hops exceeds max_hops={max_hops}")
        if tier == 6 and c.get("closes_or_references_issue"):
            v.append(f"{sid}: closes/references the issue under evaluation; hard-excluded at tier 6")
    return v


def convention_profile_violations(profile_hash_by_issue: dict[str, str]) -> list[str]:
    """SS3.2 tier 7: the convention profile is fixed per project, not varied per issue."""
    if len(set(profile_hash_by_issue.values())) > 1:
        return ["convention profile varies across issues of one project (that is per-project retraining, "
                "not conditioning; Phase 8 SS11.4)"]
    return []


_TWO_PASS = ("pass0_extract", "retrieve", "a2_a4_gate", "encode_full")


def two_pass_violations(calls: list[str]) -> list[str]:
    """SS3.1: Pass 0 (Tier-1-only entity extraction) -> retrieve -> A2/A4 gate -> full encoder, once.
    ``calls`` is the ordered component-call log of one inference."""
    v = []
    for name in _TWO_PASS:
        if name not in calls:
            v.append(f"{name} never ran")
    if v:
        return v
    if calls.count("encode_full") != 1:
        v.append(f"full encoder ran {calls.count('encode_full')} times; exactly once")
    if calls.count("retrieve") != 1:
        v.append(f"retrieval ran {calls.count('retrieve')} times; exactly once")
    order = [calls.index(n) for n in _TWO_PASS]
    if order != sorted(order):
        v.append(f"components ran out of order: expected {list(_TWO_PASS)}, got {calls}")
    return v


def retrieval_precision_recall(retrieved_ids: set[str], oracle_ids: set[str]) -> dict:
    """SS7.8: retriever quality against the record's gold ``available_context``, reported apart from
    field accuracy. Undefined ratios are None; both sets empty is a *correct* empty retrieval."""
    hit = len(retrieved_ids & oracle_ids)
    return {
        "precision": hit / len(retrieved_ids) if retrieved_ids else None,
        "recall": hit / len(oracle_ids) if oracle_ids else None,
        "correct_empty": not retrieved_ids and not oracle_ids,
    }


# ================================================================== SS4: ranking

@dataclass
class Candidate:
    segment_id: str
    type: str
    entity_overlap: float
    directness: float = 0.0
    authority: float = 0.0
    recency: float = 0.0
    resolves_issue: bool = False

    @property
    def tier(self) -> int:
        return SEGMENT_TIER[self.type]


@dataclass
class RankRecord:
    """What SS4 says must be logged in InferenceTrace: why a segment was kept or dropped."""
    segment_id: str
    rank: int
    signals: tuple


def rank_segments(candidates: list[Candidate], *, ceiling: int, type_prior: dict[str, float]) -> list[RankRecord]:
    """SS4's signal order, applied lexicographically: entity overlap, directness, segment-type prior,
    authority, recency (higher is better on each). Source *count* is never a signal (Decision #6).
    Ties fall to segment_id so the result is deterministic. Only segments that already passed A2/A4
    are rankable: recency may break ties but never overrides those gates, so a candidate above the
    ceiling or flagged as resolving the issue is a caller error, not something to rank down."""
    for c in candidates:
        if c.type not in SEGMENT_TIER:
            raise ValueError(f"{c.segment_id}: unknown segment type {c.type!r}")
        if c.tier > ceiling:
            raise ValueError(f"{c.segment_id}: tier {c.tier} is above the ceiling {ceiling}; A2 runs before ranking")
        if c.resolves_issue:
            raise ValueError(f"{c.segment_id}: resolves the issue; A4 runs before ranking")
        if c.type not in type_prior:
            raise ValueError(f"no type prior for {c.type!r}")

    def sig(c: Candidate) -> tuple:
        return (c.entity_overlap, c.directness, type_prior[c.type], c.authority, c.recency)

    ordered = sorted(candidates, key=lambda c: (tuple(-x for x in sig(c)), c.segment_id))
    return [RankRecord(c.segment_id, i + 1, sig(c)) for i, c in enumerate(ordered)]


def allocate_budget(candidates: list[Candidate], ranking: list[RankRecord], budgets_by_type: dict[str, int]
                    ) -> tuple[list[str], list[tuple[str, str]]]:
    """SS4 / Phase 8 SS7.3: per-type budgets, rank order within a type decides who is kept, so a large
    low-relevance retrieval cannot crowd out issue text. Never pads: a type with fewer candidates than
    budget simply uses less. Returns (kept ids in rank order, [(dropped id, reason)])."""
    rank_of = {r.segment_id: r.rank for r in ranking}
    by_type: dict[str, list[Candidate]] = {}
    for c in candidates:
        by_type.setdefault(c.type, []).append(c)
    kept, dropped = [], []
    for t, cs in by_type.items():
        if t not in budgets_by_type:
            raise ValueError(f"no budget for segment type {t!r}; a silent default would hide a crowd-out")
        cs = sorted(cs, key=lambda c: rank_of[c.segment_id])
        kept += [c.segment_id for c in cs[:budgets_by_type[t]]]
        dropped += [(c.segment_id, f"below the {t} budget cutoff (rank {rank_of[c.segment_id]})")
                    for c in cs[budgets_by_type[t]:]]
    kept.sort(key=lambda sid: rank_of[sid])
    return kept, dropped


def padding_violations(kept: list[Candidate], *, min_entity_overlap: float) -> list[str]:
    """SS3.3: an empty result is legitimate; the Context Manager must not pad a tier >= 2 allowance
    with filler. Filler here = a retained tier >= 2 segment below the caller's overlap floor."""
    return [f"{c.segment_id}: entity overlap {c.entity_overlap} is below {min_entity_overlap}; filler retained"
            for c in kept if c.tier >= 2 and c.entity_overlap < min_entity_overlap]


# ================================================================== SS5: conflict resolution

ISSUE_TEXT_TYPES = frozenset({"ISSUE_TITLE", "ISSUE_BODY", "COMMENT"})
CHECKABLE_TYPES = frozenset({"CODE", "CONFIG", "DEP_GRAPH"})   # directly-checkable sources (SS5.2)


@dataclass
class ConflictClaim:
    segment_id: str
    type: str
    authority: float = 0.0
    canonical: bool = False
    recency: float = 0.0


@dataclass
class Resolution:
    status: str                       # resolved | unresolved
    winner_id: str | None
    recorded_ids: list[str]           # losing claims: recorded, never discarded (SS5.2/5.4)
    conflict_type: str
    source_cap: str | None = None     # INFERRED when unresolved
    confidence_capped: bool = False
    log_to: str | None = None
    ineligible_ids: list[str] = field(default_factory=list)


def _best(cs: list[ConflictClaim], keys) -> tuple[list[ConflictClaim], bool]:
    """Filters ``cs`` by successive keys; returns (survivors, tied) where tied means every key tied."""
    for k in keys:
        top = max(k(c) for c in cs)
        cs = [c for c in cs if k(c) == top]
        if len(cs) == 1:
            return cs, False
    return cs, len(cs) > 1


def resolve_conflict(conflict_type: str, claims: list[ConflictClaim]) -> Resolution:
    """SS5. Classify first (the caller gives the class), then apply precedence -- never 'higher tier
    wins' as a blanket rule and never majority vote (a tied count is irrelevant here by construction).

      intent:     only issue/comment text may take part; authority, then recency (Phase 6 SS4.3).
      verifiable: directly-checkable sources (CODE/CONFIG/DEP_GRAPH) outrank descriptive ones; within
                  the surviving group, authority, then canonicality, then recency.
    A remaining tie is unresolvable: INFERRED at best, confidence capped, both sides recorded, logged
    to uncertain_information (SS5.4)."""
    if conflict_type not in ("intent", "verifiable"):
        raise ValueError("conflict_type must be 'intent' or 'verifiable'")
    if len(claims) < 2:
        raise ValueError("a conflict needs at least two claims")
    pool, ineligible = list(claims), []
    if conflict_type == "intent":
        pool = [c for c in claims if c.type in ISSUE_TEXT_TYPES]
        ineligible = [c.segment_id for c in claims if c.type not in ISSUE_TEXT_TYPES]
        keys = (lambda c: c.authority, lambda c: c.recency)
    else:
        checkable = [c for c in claims if c.type in CHECKABLE_TYPES]
        if checkable and len(checkable) < len(claims):
            pool = checkable
        keys = (lambda c: c.authority, lambda c: c.canonical, lambda c: c.recency)
    if not pool:
        return Resolution("unresolved", None, [c.segment_id for c in claims], conflict_type,
                          "INFERRED", True, "uncertain_information", ineligible)
    survivors, tied = _best(pool, keys) if len(pool) > 1 else (pool, False)
    if tied:
        return Resolution("unresolved", None, [c.segment_id for c in claims], conflict_type,
                          "INFERRED", True, "uncertain_information", ineligible)
    w = survivors[0]
    return Resolution("resolved", w.segment_id, [c.segment_id for c in claims if c is not w], conflict_type,
                      ineligible_ids=ineligible)


def conflict_handling_violations(res: Resolution, proposal: FieldProposal, *, logged_uncertain: bool) -> list[str]:
    """Checks a field's proposal against the resolution it should have followed."""
    v: list[str] = []
    if res.status == "resolved":
        if res.winner_id not in proposal.pointers:
            v.append(f"{proposal.field}: evidence must point at the winning segment {res.winner_id!r}")
        if set(proposal.pointers) & set(res.ineligible_ids):
            v.append(f"{proposal.field}: cites a segment ineligible for an intent conflict")
    else:
        if proposal.source in ("EXPLICIT", "SUPPORTED_BY_CONTEXT"):
            v.append(f"{proposal.field}: unresolved conflict caps the source at INFERRED, got {proposal.source}")
        if not logged_uncertain:
            v.append(f"{proposal.field}: unresolved conflict must be logged to uncertain_information")
    return v


# ================================================================== SS6: grounding

def degrade_to_ceiling(proposal: FieldProposal, segments_by_id: dict[str, Segment], ceiling: int) -> FieldProposal:
    """SS6.2: render a higher-tier proposal at a lower ceiling. Pointers to now-out-of-scope segments
    are dropped; if none survive the field falls back to Unknown. The lower-tier target never inherits
    the higher tier's confidence (it must be re-derived: ``confidence`` is reset to None) and its
    source is re-clipped to what the surviving evidence can support."""
    kept = [p for p in proposal.pointers if p in segments_by_id and segments_by_id[p].tier <= ceiling]
    if not kept:
        empty = [] if isinstance(proposal.value, list) else "Unknown"
        return FieldProposal(proposal.field, empty, "UNKNOWN", [], None, None, proposal.note)
    text = proposal.evidence_text if len(kept) == len(proposal.pointers) else None   # rendered for the higher tier
    out = FieldProposal(proposal.field, proposal.value, proposal.source, kept, text, None, proposal.note)
    return clip_to_source_ceiling(out, resolve_pointers(kept, segments_by_id), InferenceTrace())


def multi_ceiling_views(segments: list[Segment], ceilings: Iterable[int]) -> dict[int, list[Segment]]:
    """SS6.2 training batches: the same record rendered at several ceilings (A2 at each)."""
    return {c: [s for s in segments if s.tier <= c] for c in sorted(set(ceilings))}


def batch_ceiling_violations(batch: list[dict]) -> list[str]:
    """SS7.6: a training example carrying a segment above its own ``context_tier`` is exactly the
    tier-N-to-tier-(N-1) leak a misconfigured two-mode run would cause. Each item:
    ``{"example_id", "context_tier", "segments": [Segment]}``."""
    return [f"{b['example_id']}: segment {s.segment_id} (tier {s.tier}) above example context_tier {b['context_tier']}"
            for b in batch for s in b["segments"] if s.tier > b["context_tier"]]


def omission_violations(retrieval_empty: bool, *, asserts_absence: bool, logged_uncertain: bool) -> list[str]:
    """SS6.3: an empty retrieval is not evidence of absence; the answer is Unknown / reduced
    confidence, logged to uncertain/missing_information, never an asserted negative."""
    if not retrieval_empty:
        return []
    v = []
    if asserts_absence:
        v.append("empty retrieval was read as absence (asserted a negative claim)")
    if not logged_uncertain:
        v.append("empty retrieval must be logged to uncertain_information/missing_information")
    return v


def empty_retrieval_gate(retrieval_batches: list[dict], *, min_empty_share: float) -> list[str]:
    """SS3.3/6.3: retrieval-in-the-loop training needs real empty-result cases. Each item has
    ``retrieved_count``. Share must be > 0 and at least the caller's floor."""
    if not retrieval_batches:
        return ["no retrieval-in-the-loop examples"]
    share = sum(1 for b in retrieval_batches if b.get("retrieved_count", 0) == 0) / len(retrieval_batches)
    if share <= 0 or share < min_empty_share:
        return [f"empty-retrieval share {share:.3f} is below the required floor "
                f"(> 0 and >= {min_empty_share}); omission handling cannot be learned"]
    return []


PROPOSED_SCHEMA_CHANGE = {
    "field": "provenance.*.source", "proposed_value": "VERIFIED", "kind": "MINOR",
    "status": "PROPOSED_NOT_ENACTED", "owner": "Phase 2",
    "scope": "fields whose evidence resolves to a CODE/CONFIG segment H can re-check directly",
}


def schema_enactment_violations() -> list[str]:
    """Decision #10: the new grounding strength is proposed, not enacted. Fails if the Phase 2 source
    vocabulary or Phase 8's ceiling ranks have been widened from inside this phase's world."""
    v = []
    extra = set(PROVENANCE_SOURCE) - {"EXPLICIT", "SUPPORTED_BY_CONTEXT", "INFERRED", "UNKNOWN"}
    if extra:
        v.append(f"schema.PROVENANCE_SOURCE contains {sorted(extra)}; Phase 2 owns that change, not Phase 12")
    if set(SOURCE_RANK) != {"EXPLICIT", "SUPPORTED_BY_CONTEXT", "INFERRED", "UNKNOWN"}:
        v.append("architecture.SOURCE_RANK was widened; enact new grounding strengths via Phase 2 first")
    return v


# ================================================================== SS7: evaluation

@dataclass
class TierReference:
    value: Any
    kind: str      # ground_truth | unknown_at_tier | unaligned


def tier_appropriate_reference(gt_value: Any, evidence_tiers: list[int] | None, ceiling: int) -> TierReference:
    """SS7.2 / Decision #9: derive the reference mechanically from ground truth's own evidence tiers.
    ``evidence_tiers`` are the tiers of the segments GT's evidence aligns to (Phase 8 SS5.1). If at
    least one lies within ``ceiling`` the tier legitimately supports GT's answer; otherwise the honest
    behaviour is Unknown. Unaligned evidence cannot be placed on a tier, so it is excluded, not guessed."""
    unknown = [] if isinstance(gt_value, list) else "Unknown"
    if _is_unknown_value(gt_value):
        return TierReference(unknown, "ground_truth")
    if not evidence_tiers:
        return TierReference(None, "unaligned")
    if any(t <= ceiling for t in evidence_tiers):
        return TierReference(gt_value, "ground_truth")
    return TierReference(unknown, "unknown_at_tier")


def score_against_reference(pred_value: Any, ref: TierReference) -> str:
    """correct | incorrect | missed | correct_abstention | overclaim | excluded. A confident
    non-Unknown answer where the tier supports none is an *overclaim* even if it equals GT's value."""
    if ref.kind == "unaligned":
        return "excluded"
    pred_unknown, ref_unknown = _is_unknown_value(pred_value), _is_unknown_value(ref.value)
    if ref_unknown:
        return "correct_abstention" if pred_unknown else "overclaim"
    if pred_unknown:
        return "missed"
    same = set(pred_value) == set(ref.value) if isinstance(ref.value, list) and isinstance(pred_value, list) \
        else pred_value == ref.value
    return "correct" if same else "incorrect"


def summarize_outcomes(rows: list[tuple[str, str, int, str]]) -> dict[tuple[str, str, int], dict]:
    """SS7.3: per (field, source_type, tier). Accuracy counts correct answers *and* correct
    abstentions; ``excluded`` rows are not scored."""
    out: dict[tuple, dict] = {}
    for f, src, tier, outcome in rows:
        cell = out.setdefault((f, src, tier), {"counts": {}, "n_scored": 0})
        cell["counts"][outcome] = cell["counts"].get(outcome, 0) + 1
        if outcome != "excluded":
            cell["n_scored"] += 1
    for cell in out.values():
        n, c = cell["n_scored"], cell["counts"]
        cell["accuracy"] = (c.get("correct", 0) + c.get("correct_abstention", 0)) / n if n else None
        cell["overclaim_rate"] = c.get("overclaim", 0) / n if n else None
    return out


EVAL_FIELDS = ("role", "experience_level", "complexity", "task_type", "technologies", "components",
               "systems", "technical_areas", "dependencies", "task_generation_grounding")


def uplift_gate(prev: dict[str, float], cur: dict[str, float], *, min_aggregate_gain: float,
                max_field_degradation: float) -> list[str]:
    """Criterion 2 / SS7.4: aggregate gain over tier N-1 (checkpoint held fixed) must be measurable
    (> 0 and >= the caller's margin) and must not come from some fields improving while others
    degrade by more than ``max_field_degradation``. Scores are tier-appropriate-reference accuracy."""
    v = []
    for f in EVAL_FIELDS:
        if f not in prev or f not in cur:
            v.append(f"uplift: no measurement for {f} at both tiers")
    if v:
        return v
    gain = sum(cur[f] - prev[f] for f in EVAL_FIELDS) / len(EVAL_FIELDS)
    if gain <= 0 or gain < min_aggregate_gain:
        v.append(f"uplift: aggregate gain {gain:.4f} is not measurable (needs > 0 and >= {min_aggregate_gain})")
    for f in EVAL_FIELDS:
        if prev[f] - cur[f] > max_field_degradation:
            v.append(f"uplift: {f} degraded by {prev[f] - cur[f]:.4f} (> {max_field_degradation}) while others may improve")
    return v


def _gap(c: dict) -> float:
    return c["high_confidence_accuracy"] - c["low_confidence_accuracy"]


def calibration_preservation_gate(prev_cells: dict[tuple, dict], cur_cells: dict[tuple, dict], *,
                                  prev_tier: int, tolerance: float) -> list[str]:
    """Criterion 3 / SS7.5: measured at tier-(N-1) inputs, the tier-N checkpoint's per-(field, source
    type, tier) confidence separation (high- minus low-confidence accuracy, Phase 11's measure) must
    not be worse than the tier-(N-1) checkpoint's own, beyond ``tolerance``."""
    v = []
    if not prev_cells:
        return ["calibration: no cells supplied"]
    if set(prev_cells) != set(cur_cells):
        v.append("calibration: the two checkpoints were not measured on the same (field, source, tier) cells")
    for key in sorted(set(prev_cells) & set(cur_cells), key=str):
        if not (isinstance(key, tuple) and len(key) == 3 and key[2] == prev_tier):
            v.append(f"calibration: cell key {key!r} must be (field, source_type, {prev_tier})")
            continue
        if _gap(cur_cells[key]) < _gap(prev_cells[key]) - tolerance:
            v.append(f"calibration: {key} separation fell from {_gap(prev_cells[key]):.3f} to {_gap(cur_cells[key]):.3f}")
    return v


def leakage_gate(findings: dict[str, list[str]]) -> list[str]:
    """Criterion 4 / SS7.6: Phase 7's L1-L7 re-run *after training*, L6 especially. Every test must
    be present and clean."""
    v = [f"leakage: {t} was not re-run" for t in dataset.LEAKAGE_TESTS if t not in findings]
    v += [f"leakage: {t}: {f}" for t in dataset.LEAKAGE_TESTS for f in findings.get(t, [])]
    return v


def backward_consistency_gate(v1_scores: dict[str, float], tier_n_at_tier1: dict[str, float], *,
                              max_regression: float) -> list[str]:
    """Criterion 5 / SS7.7: with the ceiling lowered to Tier 1, tier N must not regress against
    ITU-1 v1 on the original Phase 11 Test pass, field by field."""
    v = []
    for f, base in v1_scores.items():
        if f not in tier_n_at_tier1:
            v.append(f"backward consistency: no tier-1-ceiling measurement for {f}")
        elif base - tier_n_at_tier1[f] > max_regression:
            v.append(f"backward consistency: {f} regressed from {base} to {tier_n_at_tier1[f]} (> {max_regression})")
    return v or ([] if v1_scores else ["backward consistency: no v1 scores supplied"])


def data_sufficiency_gate(counts_by_dataset: dict[str, int], *, min_records: dict[str, int]) -> list[str]:
    """Criterion 1: training data exists at this ``context_tier`` in Phase 7's datasets. ``min_records``
    (dataset id -> minimum) is the caller's; the tier-sibling Test set must be among them (SS7.1)."""
    v = []
    for ds_id, need in min_records.items():
        have = counts_by_dataset.get(ds_id, 0)
        if have < need or have <= 0:
            v.append(f"data: {ds_id} has {have} records at this tier (needs >= {max(need, 1)})")
    return v or ([] if min_records else ["data: no minimums supplied"])


CRITERIA = ("data", "uplift", "calibration", "leakage", "backward_consistency")


@dataclass
class AdvanceVerdict:
    tier: int
    promote: bool
    failed: dict[str, list[str]] = field(default_factory=dict)


def advance_verdict(tier: int, results: dict[str, list[str]]) -> AdvanceVerdict:
    """Phase 8 SS11.2's five-part rule, all-or-nothing per tier. A criterion missing from ``results``
    was not evaluated, which fails it: tiers are never promoted on an incomplete gate."""
    failed = {}
    for c in CRITERIA:
        if c not in results:
            failed[c] = ["not evaluated"]
        elif results[c]:
            failed[c] = list(results[c])
    unknown = set(results) - set(CRITERIA)
    if unknown:
        failed["unknown_criteria"] = sorted(unknown)
    return AdvanceVerdict(tier, not failed, failed)


@dataclass
class TierEvalEvent:
    tier: int
    dataset_id: str
    checkpoint_id: str
    checkpoint_calibrated: bool     # G re-fit for this tier's checkpoint
    purpose: str


def validate_tier_evaluation_log(events: list[TierEvalEvent]) -> list[str]:
    """SS7.9: Phase 11's one-shot discipline, applied *per tier*: each tier's Test is consumed once, on
    that tier's calibrated checkpoint, for evaluation only, with that tier's Regression run after it
    on the same checkpoint. A second tier's Test does not count against the first."""
    v: list[str] = []
    for tier in sorted({e.tier for e in events}):
        mapped = [task_training.EvalEvent(e.dataset_id, e.checkpoint_id,
                                          task_training.STAGE_2 if e.checkpoint_calibrated else task_training.STAGE_1,
                                          e.purpose) for e in events if e.tier == tier]
        v += [f"tier {tier}: {m}" for m in task_training.validate_evaluation_log(mapped)]
    return v
