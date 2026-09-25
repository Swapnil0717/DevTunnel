"""
ITU-1 -- Step 9: Base model / continued pretraining (Phase 9)

Phase 9 is explicitly *not* a trained-model phase: Section 0 adopts an existing base model and
continued-pretrains it; Section 10 decision #9 keeps every threshold empirical, not asserted in
advance. There is no neural net to write. What this module implements is what Phase 9 itself
frames as load-bearing infrastructure and hard gates, independent of which base model or how much
compute is eventually chosen (Sections 2, 4.3, 4.4, 5, 6, 9):

    roundtrip_offset_check(tokens, text)     -> list[str]           (Section 2, hard requirement)
    fragmentation_rate(term, tokens)         -> float               (Section 7.2/Stage 0 gate)
    corpus_inclusion_check(source, repo_split, allowed_licenses)
                                              -> CorpusDecision      (Section 4.3, 4.4)
    filter_corpus(sources, repo_split, allowed_licenses)
                                              -> (included, excluded)
    validate_checkpoint_identity(record)     -> list[str]           (Section 5)
    next_expected_stage(history)             -> str | None          (Section 6, staged/gated)
    validate_stage_advance(history, stage, gate_passed)
                                              -> list[str]           (Section 6, "never compensate")
    checkpoints_to_retain(checkpoints)       -> set[str]            (Section 5 retention policy)
    rollback_target(history)                 -> str | None          (Section 5 rollback rule)
    classify_failure(mode, *, traced_to_start=False)
                                              -> FailureResponse     (Section 9)

Everything else in Phase 9 (which base model, corpus size targets, probe thresholds, compute
figures) is an open item the spec itself defers (Section 11 "Open items") -- this module does not
invent numbers for those, it only implements the parts of the phase that are checkable without
them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# ================================================================== Section 6: stages

STAGE_ORDER = (
    "stage0_tokenizer_validation",
    "stage1_broad_cpt",
    "stage2_domain_narrowing",
    "stage3_segment_alignment_warmup",
)

# ================================================================== Section 9: failure modes

# mode -> (hard_blocker, response)
FAILURE_MODES: dict[str, tuple[bool, str]] = {
    "loss_divergence": (False, "roll back to last gated checkpoint; do not resume without diagnosing corpus/objective"),
    "catastrophic_forgetting": (False, "halt stage; rebalance corpus mix or reduce adaptation aggressiveness before resuming"),
    "representation_collapse": (False, "halt stage; treated as a modeling failure unless corpus coverage for the collapsed concept is also thin"),
    "tokenizer_offset_failure": (True, "hard blocker: no pretraining compute past Stage 0 until resolved"),
    "segment_embedding_degeneracy": (False, "extend Stage 3 synthetic segmented data or revisit embedding-table init; does not block Stages 1-2"),
    "corpus_contamination": (True, "hard blocker: remove affected shard, re-run the touched stage from the last clean checkpoint"),
    "license_violation": (False, "remove source from manifest; any checkpoint trained on it is not promoted, regardless of validation performance"),
    "checkpoint_corruption": (False, "discard; regenerate from the preceding valid checkpoint"),
}


@dataclass
class FailureResponse:
    mode: str
    hard_blocker: bool
    response: str
    rollback_to_stage_zero: bool = False


def classify_failure(mode: str, *, traced_to_start: bool = False,
                      table: dict[str, tuple[bool, str]] | None = None) -> FailureResponse:
    """Section 9 dispatch table. ``traced_to_start`` implements Section 5's rollback exception:
    a failure traced to a corpus/tokenizer defect present from the start rolls back to stage zero,
    not merely to the last gated checkpoint.

    ``table`` defaults to this module's Phase 9 FAILURE_MODES; a later phase with its own failure
    table (e.g. Phase 10 Section 7) passes it here rather than reimplementing this dispatch."""
    table = table if table is not None else FAILURE_MODES
    if mode not in table:
        raise ValueError(f"unknown failure mode: {mode!r}")
    hard_blocker, response = table[mode]
    return FailureResponse(mode=mode, hard_blocker=hard_blocker, response=response,
                            rollback_to_stage_zero=bool(traced_to_start))


# ================================================================== Section 2: tokenization

def roundtrip_offset_check(tokens: list[dict], text: str) -> list[str]:
    """Section 2's validation gate: tokenize then reconstruct against the untouched source text.

    ``tokens`` is a list of ``{"text": str, "start": int | None, "end": int | None}``.
    A token with ``start``/``end`` of ``None`` is a special/added token that maps to no source
    span (e.g. BOS/EOS) and is required to carry empty ``text``, since a non-empty special token
    with no offset would silently drop coverage.

    Returns every violation found (empty list = passes the gate). Any violation here is, per
    Section 9, a hard blocker -- callers should not spend pretraining compute past Stage 0 until
    this list is empty.
    """
    violations: list[str] = []
    n = len(text)
    spanned = [t for t in tokens if t.get("start") is not None or t.get("end") is not None]

    prev_end = 0
    for i, tok in enumerate(tokens):
        start, end, tok_text = tok.get("start"), tok.get("end"), tok.get("text", "")
        if start is None and end is None:
            if tok_text:
                violations.append(f"token {i}: special token (no offset) carries non-empty text {tok_text!r}")
            continue
        if start is None or end is None:
            violations.append(f"token {i}: has only one of start/end ({start}, {end})")
            continue
        if not (0 <= start <= end <= n):
            violations.append(f"token {i}: offset ({start}, {end}) out of bounds for text of length {n}")
            continue
        if start < prev_end:
            violations.append(f"token {i}: offset ({start}, {end}) overlaps previous token (prev end {prev_end})")
        actual = text[start:end]
        if actual != tok_text:
            # This is the destructive-normalization catch: lowercasing, whitespace collapsing,
            # quote/encoding normalization would all show up here as a text/offset mismatch.
            violations.append(f"token {i}: text {tok_text!r} does not match source span {actual!r} at ({start}, {end})")
        prev_end = max(prev_end, end)

    # Full-coverage reconstruction: every character must be accounted for by some span, or by a
    # gap that is itself empty (i.e. no gap at all). A non-empty, uncovered gap is lost text --
    # exactly the failure mode Section 2 calls "silently breaks the grounding guarantee".
    covered = [(t["start"], t["end"]) for t in spanned if t.get("start") is not None and t.get("end") is not None]
    covered.sort()
    cursor = 0
    for start, end in covered:
        if start > cursor:
            gap = text[cursor:start]
            if gap.strip("") != "" and gap != "":
                violations.append(f"reconstruction gap {cursor}:{start} not covered by any token: {gap!r}")
        cursor = max(cursor, end)
    if cursor < n:
        gap = text[cursor:n]
        if gap != "":
            violations.append(f"reconstruction gap {cursor}:{n} not covered by any token: {gap!r}")

    return violations


def fragmentation_rate(term: str, term_tokens: list[str]) -> float:
    """Number of subword tokens a single domain term was split into, per character of the term.
    A stand-in metric for Section 7.2/Stage 0's "domain-term fragmentation rate within an
    acceptable band" -- the band itself is an open item (Section 11), so this returns the raw
    rate and lets the caller apply whatever threshold they've since calibrated."""
    if not term:
        raise ValueError("term must be non-empty")
    return len(term_tokens) / len(term)


# ================================================================== Section 4.3/4.4: corpus

NON_TRAINING_LABEL = "not_in_split_manifest"


@dataclass
class CorpusSource:
    source_id: str
    content_type: str                 # e.g. "code", "docs", "commit_message", "issue_text"
    license: str | None = None
    repo: str | None = None           # None for sources with no repo (e.g. general docs corpus)


@dataclass
class CorpusDecision:
    source_id: str
    included: bool
    reason: str


DEFAULT_EXCLUDED_TRAINING_REPO_CONTENT_TYPES: frozenset = frozenset({"issue_text"})


def corpus_inclusion_check(source: CorpusSource, repo_split: dict[str, str],
                            allowed_licenses: set[str], *,
                            excluded_training_repo_content_types: frozenset = DEFAULT_EXCLUDED_TRAINING_REPO_CONTENT_TYPES,
                            ) -> CorpusDecision:
    """Section 4.3 (repo-level contamination boundary, checked against Phase 7's split manifest --
    not re-derived) and Section 4.4 (license tag required at ingestion, exclude-by-default).

    ``repo_split`` is Phase 7's ``BuildResult.repo_split`` (``dataset.py``): repo -> dataset id
    among ``training | validation | test | hard_case | adversarial | regression``.

    ``excluded_training_repo_content_types`` is which content types are excluded even from a
    Training-split repo (Phase 9 draws this line at ``"issue_text"`` alone; Phase 10 Section 2.4
    widens it to also exclude issue-resolving PR text -- pass the wider set from there rather
    than duplicating this function).
    """
    # 4.4 first: an untagged or disallowed license is excluded regardless of repo status.
    if not source.license:
        return CorpusDecision(source.source_id, False, "no license tag at ingestion (exclude-by-default)")
    if source.license not in allowed_licenses:
        return CorpusDecision(source.source_id, False, f"license {source.license!r} not in allowed set")

    if source.repo is not None and source.repo in repo_split:
        split = repo_split[source.repo]
        if split != "training":
            return CorpusDecision(
                source.source_id, False,
                f"repo {source.repo!r} is assigned to Phase 7 {split!r}; excluded from pretraining corpus",
            )
        if source.content_type in excluded_training_repo_content_types:
            if source.content_type == "issue_text":
                reason = (f"repo {source.repo!r} is a Training repo, but issue text is excluded from the CPT "
                          "corpus (non-issue content from the same repo is permitted)")
            else:
                reason = (f"repo {source.repo!r} is a Training repo, but {source.content_type!r} content is "
                          "excluded from the CPT corpus for this content type")
            return CorpusDecision(source.source_id, False, reason)

    return CorpusDecision(source.source_id, True, "included")


def filter_corpus(sources: list[CorpusSource], repo_split: dict[str, str],
                   allowed_licenses: set[str], **kwargs) -> tuple[list[CorpusDecision], list[CorpusDecision]]:
    """Applies corpus_inclusion_check across a source list. Returns (included, excluded)."""
    included, excluded = [], []
    for s in sources:
        d = corpus_inclusion_check(s, repo_split, allowed_licenses, **kwargs)
        (included if d.included else excluded).append(d)
    return included, excluded


def contamination_reaudit(sources: list[CorpusSource], repo_split: dict[str, str], *,
                           excluded_training_repo_content_types: frozenset = DEFAULT_EXCLUDED_TRAINING_REPO_CONTENT_TYPES,
                           ) -> list[str]:
    """Section 7.4: re-diff an already-assembled corpus against the *current* Phase 7 split
    manifest, to catch drift between when the corpus was assembled and when splits were last
    finalized. Returns source_ids that are present but should not be, per Section 9's
    'corpus_contamination' hard blocker."""
    violations = []
    for s in sources:
        if s.repo is not None and s.repo in repo_split:
            split = repo_split[s.repo]
            if split != "training" or (split == "training" and s.content_type in excluded_training_repo_content_types):
                violations.append(
                    f"{s.source_id}: repo {s.repo!r} (split={split!r}, content_type={s.content_type!r}) "
                    "should have been excluded"
                )
    return violations


# ================================================================== Section 5: checkpoints

REQUIRED_CHECKPOINT_FIELDS = (
    "checkpoint_id", "created_at", "base_model_source", "tokenizer_version", "stage",
    "corpus_manifest_hash", "objective_config",
)


def validate_checkpoint_identity(record: dict, *, stage_order: tuple | None = None) -> list[str]:
    """Section 5's checkpoint identity record -- the model-artifact analogue of Phase 2's
    ``task_identity``. Checks presence and basic shape only; it does not judge whether the
    checkpoint is *good*, only whether it is traceable.

    ``stage_order`` lets a later phase (e.g. Phase 10's A-D stages) validate against its own
    stage names instead of Phase 9's Stage 0-3; defaults to this module's STAGE_ORDER."""
    violations = []
    for f in REQUIRED_CHECKPOINT_FIELDS:
        if f not in record or record[f] in (None, ""):
            violations.append(f"missing or empty required field: {f}")
    stage_order = stage_order or STAGE_ORDER
    if "stage" in record and record["stage"] not in stage_order:
        violations.append(f"stage {record.get('stage')!r} is not one of {stage_order}")
    bms = record.get("base_model_source")
    if isinstance(bms, dict):
        for k in ("name", "version", "license"):
            if not bms.get(k):
                violations.append(f"base_model_source missing {k!r}")
    elif "base_model_source" in record:
        violations.append("base_model_source must be an object with name/version/license")
    oc = record.get("objective_config")
    if oc is not None and not isinstance(oc, dict):
        violations.append("objective_config must be an object of objective_name -> bool/config")
    return violations


# ================================================================== Section 6: stage gating

@dataclass
class StageRecord:
    stage: str
    gate_passed: bool
    checkpoint_id: str | None = None
    validation_metric: float | None = None   # higher-is-better, caller's own scale


def next_expected_stage(history: list[StageRecord], *, stage_order: tuple | None = None) -> str | None:
    """What stage should run next, given a history of attempted stages in order. Returns None
    once all stages are gated through. Does not look at whether the *most recent attempt*
    passed -- callers use validate_stage_advance for that; this just says where the staircase is.

    ``stage_order`` defaults to this module's Phase 9 STAGE_ORDER; pass a different ordered tuple
    to reuse this same staircase logic for another phase's stage names (e.g. Phase 10's A-D)."""
    stage_order = stage_order or STAGE_ORDER
    passed = {r.stage for r in history if r.gate_passed}
    for stage in stage_order:
        if stage not in passed:
            return stage
    return None


def validate_stage_advance(history: list[StageRecord], proposed_stage: str, gate_passed: bool, *,
                            stage_order: tuple | None = None) -> list[str]:
    """Section 6: 'Each stage is a precondition, not a fallback: a later stage is not started to
    compensate for an earlier stage's gate failing.' Also enforces that stages run in order and
    are not skipped or repeated after already being gated through.

    Returns violations for attempting ``proposed_stage`` given ``history``; an empty list means
    the advance is legitimate (whether or not this particular attempt's own gate then passes).
    ``stage_order`` defaults to Phase 9's STAGE_ORDER; see ``next_expected_stage``."""
    stage_order = stage_order or STAGE_ORDER
    violations = []
    if proposed_stage not in stage_order:
        return [f"unknown stage: {proposed_stage!r}"]
    idx = stage_order.index(proposed_stage)
    passed = {r.stage for r in history if r.gate_passed}

    if proposed_stage in passed:
        violations.append(f"{proposed_stage} already passed its gate; stages are not re-run once gated through")
        return violations

    for earlier in stage_order[:idx]:
        if earlier not in passed:
            violations.append(
                f"cannot attempt {proposed_stage} before {earlier} has passed its gate "
                "(a later stage never compensates for an earlier one's shortfall)"
            )
    return violations


def checkpoints_to_retain(checkpoints: list[StageRecord]) -> set[str]:
    """Section 5 retention: keep the most recent checkpoint per stage plus the best-validation
    checkpoint per stage; earlier intermediates within a stage are disposable once the stage
    gate is passed. ``checkpoints`` should be given in chronological order."""
    retain: set[str] = set()
    by_stage: dict[str, list[StageRecord]] = {}
    for c in checkpoints:
        by_stage.setdefault(c.stage, []).append(c)
    for stage, records in by_stage.items():
        with_ids = [r for r in records if r.checkpoint_id]
        if not with_ids:
            continue
        retain.add(with_ids[-1].checkpoint_id)  # most recent
        scored = [r for r in with_ids if r.validation_metric is not None]
        if scored:
            best = max(scored, key=lambda r: r.validation_metric)
            retain.add(best.checkpoint_id)
    return retain


def rollback_target(history: list[StageRecord]) -> str | None:
    """Section 5 rollback rule: on a Section 9 failure, roll back to the last checkpoint that
    passed its gate (not stage zero) -- unless the failure is traced to a corpus/tokenizer defect
    present from the start, which ``classify_failure(..., traced_to_start=True)`` flags
    separately; this function only computes the *default* (non-start-traced) target."""
    last_id = None
    for r in history:
        if r.gate_passed and r.checkpoint_id:
            last_id = r.checkpoint_id
    return last_id
