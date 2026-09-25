"""
ITU-1 -- Step 11: Task-specific training (Phase 11)

Phase 11 is the first phase that *attaches* Phase 8's heads (C-G) and trains them on Phase 7
labels -- and it is still, in this package, not a trainer. There is no encoder, no head, no loss
implementation and no compute here; the spec deliberately leaves loss weights, promotion floors
and abstention operating points empirical (Section 9, Decision #10). What this module implements
is the part of Phase 11 that is a checkable contract, independent of any framework or number:

    Identity & lifecycle (Sections 1.4, 7)
        validate_checkpoint_identity / validate_stage2_lineage   Section 7 identity + "Stage 2 is fit
                                                                 against one specific Stage-1 state"
        next_expected_stage / validate_stage_advance             two-stage gate (reuses pretrain.py)
        checkpoints_to_retain / recalibration_target             separate retention, rollback to parent
        validate_stage_config                                    Section 1.3/1.4: joint C-F, lower encoder
                                                                 LR, frozen encoder + G-only Stage 2
    Training data contract (Sections 3.2, 4.2, 4.3, 5)
        select_training_records                                  Training dataset only, Tier 1 only
        batch_composition_check                                  synthetic share is a minority of a batch
        validate_quality_weights                                 GOLD >= SILVER, REJECTED never weighted
        apply_metadata_dropout / fields_with_withheld_evidence   Section 4.3
        length_label_correlation / length_decorrelation_gate     Section 4.3 nuisance-variable audit
    Hallucination / grounding contract (Sections 3.1, 3.3, 5, 6.3)
        consistency_violations                                   L_consistency as a predicate
        clipped_source_target / pre_downgrade_violation_rate     L_source target + Section 6.3 metric
        unsupported_entities                                     L_unsupported / H2's analogue
        evidence_identity_rate                                   Rule 7 / Section 8 decouple audit
    Evaluation gates (Section 6) and one-shot Test (6.7, 6.8)
        classification_gate, grounding_gate, generation_gate, schema_validity_report/gate,
        adversarial_gate, calibration_gate, validate_evaluation_log, regression_tripwire,
        release_verdict
    Failure dispatch (Section 8)
        classify_failure                                          PHASE11_FAILURE_MODES

Every threshold is a caller-supplied argument with no default (Phase 11 says none may be asserted
in advance); the one exception is the strict-minority rule for synthetic batch share, which the
spec states outright ("a minority of any batch").
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Any, Iterable

import domain_training
import pretrain
from architecture import (
    FieldProposal, InferenceTrace, RejectedResult, Segment, SOURCE_RANK,
    clip_to_source_ceiling, resolve_pointers, source_ceiling_for,
)
from derived import validate_all
from pretrain import FailureResponse, StageRecord  # re-exported for callers

# ================================================================== Section 1.4 / 7: stages

STAGE_ORDER = ("stage_1_joint", "stage_2_calibrated")
STAGE_1, STAGE_2 = STAGE_ORDER

HEADS = frozenset({"C", "D", "E", "F", "G"})
JOINT_HEADS = frozenset({"C", "D", "E", "F"})          # trained together in Stage 1 (Section 1.3)
VALID_SOURCE_STAGES = tuple(domain_training.STAGE_ORDER[-2:])  # Phase 10 Stage C, or Stage D if promoted

# Section 5's eleven terms. Weights are empirical (Decision #10) but every term must be *present*.
LOSS_TERMS = (
    "L_value", "L_pointer", "L_source", "L_consistency", "L_decouple", "L_dependency",
    "L_claim", "L_realize", "L_copy", "L_unsupported", "L_abstain",
)

CLASSIFICATION_FIELDS = ("role", "experience_level", "complexity", "task_type")


def next_expected_stage(history: list[StageRecord]) -> str | None:
    return pretrain.next_expected_stage(history, stage_order=STAGE_ORDER)


def validate_stage_advance(history: list[StageRecord], proposed_stage: str, gate_passed: bool, *,
                           recalibrating: bool = False) -> list[str]:
    """Section 1.4/7 gating, via pretrain's staircase. ``recalibrating=True`` is the one legitimate
    re-run of an already-gated stage: Section 7's rollback re-fits Stage 2 against its Stage-1
    parent after a failed release check, so Stage 2 may be attempted again -- but only once Stage 1
    itself has passed, and never for Stage 1 (that is a full re-run, a new lineage)."""
    if recalibrating and proposed_stage == STAGE_2:
        if not any(r.stage == STAGE_1 and r.gate_passed for r in history):
            return [f"cannot recalibrate: {STAGE_1} has not passed its gate"]
        return []
    return pretrain.validate_stage_advance(history, proposed_stage, gate_passed, stage_order=STAGE_ORDER)


# ================================================================== Section 7: identity record

REQUIRED_IDENTITY_FIELDS = (
    "checkpoint_id", "created_at", "stage", "source_checkpoint", "tokenizer_version",
    "head_configuration", "training_data_manifest_hash", "loss_weight_config",
)


def validate_checkpoint_identity(record: dict, *, expected_tokenizer_version: str | None = None) -> list[str]:
    """Section 7's identity record: Phase 9 §5 / Phase 10 §8 extended with head configuration,
    training-data manifest hash, loss-weight configuration and training stage. Checks traceability
    only -- never whether the checkpoint is any good.

    ``expected_tokenizer_version`` is the Phase 9 tokenizer; Section 7 says it is unchanged."""
    v: list[str] = []
    for f in REQUIRED_IDENTITY_FIELDS:
        if f not in record or record[f] in (None, "", {}, []):
            v.append(f"missing or empty required field: {f}")
    stage = record.get("stage")
    if "stage" in record and stage not in STAGE_ORDER:
        v.append(f"stage {stage!r} is not one of {STAGE_ORDER}")

    src = record.get("source_checkpoint")
    if isinstance(src, dict):
        if not src.get("checkpoint_id"):
            v.append("source_checkpoint missing 'checkpoint_id'")
        if src.get("stage") not in VALID_SOURCE_STAGES:
            v.append(f"source_checkpoint.stage {src.get('stage')!r} must be a promoted Phase 10 checkpoint "
                     f"(one of {VALID_SOURCE_STAGES})")
    elif "source_checkpoint" in record:
        v.append("source_checkpoint must be an object with checkpoint_id and stage")

    if expected_tokenizer_version and record.get("tokenizer_version") not in (None, "", expected_tokenizer_version):
        v.append(f"tokenizer_version {record.get('tokenizer_version')!r} differs from the Phase 9 tokenizer "
                 f"{expected_tokenizer_version!r} (Section 7: unchanged since Phase 9)")

    hc = record.get("head_configuration")
    if isinstance(hc, dict):
        heads = set(hc.get("heads") or ())
        if not heads <= HEADS:
            v.append(f"head_configuration.heads has unknown heads: {sorted(heads - HEADS)}")
        if not hc.get("architecture_version"):
            v.append("head_configuration missing 'architecture_version'")
        if stage == STAGE_1:
            if not JOINT_HEADS <= heads:
                v.append(f"{STAGE_1} must have heads {sorted(JOINT_HEADS)} attached together "
                         f"(missing {sorted(JOINT_HEADS - heads)})")
            if "G" in heads:
                v.append(f"{STAGE_1} must not carry a calibrator: G is fit only in {STAGE_2}")
        if stage == STAGE_2 and not HEADS <= heads:
            v.append(f"{STAGE_2} must have heads {sorted(HEADS)} (missing {sorted(HEADS - heads)})")
    elif "head_configuration" in record:
        v.append("head_configuration must be an object with heads and architecture_version")

    if stage == STAGE_2 and not record.get("parent_checkpoint_id"):
        v.append(f"{STAGE_2} must name its Stage-1 'parent_checkpoint_id' (calibration is fit against one state)")
    if stage == STAGE_1 and record.get("parent_checkpoint_id"):
        v.append(f"{STAGE_1} has no Phase 11 parent; parent_checkpoint_id belongs to {STAGE_2}")

    if "loss_weight_config" in record and not isinstance(record["loss_weight_config"], dict):
        v.append("loss_weight_config must be an object of loss_term -> weight")
    return v


_LINEAGE_MATCH = ("source_checkpoint", "tokenizer_version", "training_data_manifest_hash", "loss_weight_config")


def validate_stage2_lineage(stage2: dict, stage1_identities: list[dict]) -> list[str]:
    """Section 7: a Stage-2 checkpoint is never interchangeable with its Stage-1 parent, and
    re-running Stage 2 against a different Stage-1 checkpoint needs a new identity record, not an
    in-place update. Stage 2 trains only G on a frozen encoder, so everything that describes the
    Stage-1 state must match its named parent exactly."""
    v: list[str] = []
    by_id = {r.get("checkpoint_id"): r for r in stage1_identities}
    if stage2.get("checkpoint_id") in by_id:
        return [f"checkpoint_id {stage2.get('checkpoint_id')!r} collides with a Stage-1 checkpoint "
                "(Stage 2 gets its own identity record)"]
    parent = by_id.get(stage2.get("parent_checkpoint_id"))
    if parent is None:
        return [f"parent_checkpoint_id {stage2.get('parent_checkpoint_id')!r} is not a known Stage-1 checkpoint"]
    if parent.get("stage") != STAGE_1:
        v.append(f"parent {parent.get('checkpoint_id')!r} is {parent.get('stage')!r}, not {STAGE_1}")
    for f in _LINEAGE_MATCH:
        if stage2.get(f) != parent.get(f):
            v.append(f"{f} differs from its Stage-1 parent; Stage 2 changes only the calibrator, so a "
                     "difference means a different lineage")
    return v


def checkpoints_to_retain(history: list[StageRecord], parent_of: dict[str, str] | None = None) -> set[str]:
    """Section 7: Stage-1 and Stage-2 checkpoints are retained separately. pretrain's retention rule
    (latest + best-validation per stage) already does that; on top of it, any retained Stage-2
    checkpoint keeps its Stage-1 parent, because rollback (Section 7) re-calibrates *from* it."""
    keep = pretrain.checkpoints_to_retain(history)
    for cid in list(keep):
        if parent_of and cid in parent_of:
            keep.add(parent_of[cid])
    return keep


def recalibration_target(stage2_identity: dict) -> str | None:
    """Section 7 rollback: a Stage-2 checkpoint that fails release criteria goes back to its
    Stage-1 parent for re-calibration (cheap) before a full Stage-1 re-run (expensive)."""
    return stage2_identity.get("parent_checkpoint_id") or None


# ================================================================== Sections 1.3 / 1.4 / 5: run config

def validate_stage_config(stage: str, cfg: dict) -> list[str]:
    """The structural requirements Section 1.3/1.4/5/Decision #2 place on a training run, checked
    on a caller's config dict. Recognised keys: ``trainable_components`` (set of head letters),
    ``encoder_frozen`` (bool), ``encoder_lr``/``head_lr`` (float), ``loss_terms`` (term -> weight),
    ``calibrator_granularity`` (str), ``calibration_fit_dataset`` (str)."""
    v: list[str] = []
    trainable = set(cfg.get("trainable_components") or ())
    if stage == STAGE_1:
        if trainable != JOINT_HEADS:
            v.append(f"{STAGE_1} trains {sorted(JOINT_HEADS)} jointly, got {sorted(trainable)} "
                     "(no per-head sequential training, and G is not trained here)")
        if cfg.get("encoder_frozen") is not False:
            v.append(f"{STAGE_1} encoder must be unfrozen (at a lower learning rate than the heads)")
        elr, hlr = cfg.get("encoder_lr"), cfg.get("head_lr")
        if not (isinstance(elr, (int, float)) and isinstance(hlr, (int, float)) and 0 < elr < hlr):
            v.append("encoder_lr must be positive and strictly lower than head_lr "
                     "(protects Phase 9/10's representation gains)")
        terms = cfg.get("loss_terms") or {}
        for t in LOSS_TERMS:
            if t not in terms:
                v.append(f"loss term {t} missing (Section 5)")
            elif not (isinstance(terms[t], (int, float)) and terms[t] > 0):
                v.append(f"loss term {t} has non-positive weight {terms[t]!r} "
                         "(a zero weight silently disables an objective the spec requires)")
        for t in terms:
            if t not in LOSS_TERMS:
                v.append(f"unknown loss term {t!r}")
    elif stage == STAGE_2:
        if trainable != {"G"}:
            v.append(f"{STAGE_2} trains only G, got {sorted(trainable)}")
        if cfg.get("encoder_frozen") is not True:
            v.append(f"{STAGE_2} encoder must be frozen")
        if cfg.get("calibrator_granularity") != "field_x_source_type":
            v.append("calibrator_granularity must be 'field_x_source_type' (Phase 8 §8.6; a pooled fit "
                     "hides the EXPLICIT-vs-INFERRED distinction)")
        if cfg.get("calibration_fit_dataset") != "validation":
            v.append("calibration must be fit on the Validation dataset only (Phase 8 §5.3, Phase 7 §6.3)")
    else:
        v.append(f"unknown stage {stage!r}")
    return v


# ================================================================== Sections 3.2 / 4.2 / 5: training data

def training_record_violations(rec: dict) -> list[str]:
    """Why a Phase 7 ``DatasetRecord`` may not be consumed by Stage 1/2 training, if it may not."""
    v: list[str] = []
    ds_id = ((rec.get("dataset_assignment") or {}).get("dataset_id"))
    if ds_id != "training":
        v.append(f"dataset_id is {ds_id!r}; only the Training dataset supervises the model "
                 "(Adversarial in particular is evaluation-only, Decision #4)")
    tier = (rec.get("input") or {}).get("context_tier")
    if tier != 1:
        v.append(f"context_tier is {tier!r}; Phase 11 trains at Tier 1 only (Decision #3)")
    if (rec.get("quality_status") or {}).get("tier") == "REJECTED":
        v.append("quality tier is REJECTED")
    return v


def select_training_records(records: Iterable[dict]) -> tuple[list[dict], list[tuple[str, list[str]]]]:
    """Returns (eligible, [(example_id, reasons)]) -- excluded records are reported, not dropped silently."""
    eligible, excluded = [], []
    for r in records:
        why = training_record_violations(r)
        if why:
            excluded.append((str(r.get("example_id", "<no example_id>")), why))
        else:
            eligible.append(r)
    return eligible, excluded


def _is_synthetic(rec: dict) -> bool:
    return (rec.get("label_provenance") or {}).get("labeling_method") == "SYNTHETIC"


def batch_composition_check(batch: list[dict], *, max_synthetic_share: float = 0.5) -> list[str]:
    """Section 5: the bounded synthetic (contrast-pair) share is 'capped as a minority of any batch,
    never filling a floor alone'. Strictly less than ``max_synthetic_share`` (default one half)."""
    if not batch:
        return ["empty batch"]
    share = sum(_is_synthetic(r) for r in batch) / len(batch)
    if share >= max_synthetic_share:
        return [f"synthetic share {share:.2f} is not a minority of the batch (must be < {max_synthetic_share})"]
    return []


def validate_quality_weights(weights: dict[str, float]) -> list[str]:
    """Section 5's quality-tier weighting: 'GOLD >= SILVER' (Phase 8 §5.2). Values are the caller's;
    this only checks the ordering the spec states and that REJECTED never carries weight."""
    v: list[str] = []
    for t in ("GOLD", "SILVER"):
        if t not in weights:
            v.append(f"no weight for tier {t}")
    if not v and weights["GOLD"] < weights["SILVER"]:
        v.append(f"GOLD weight ({weights['GOLD']}) is below SILVER ({weights['SILVER']}); spec requires GOLD >= SILVER")
    if weights.get("REJECTED", 0) != 0:
        v.append("REJECTED records must carry zero weight (they are not training data)")
    if any(w < 0 for w in weights.values()):
        v.append("weights must be non-negative")
    return v


# ================================================================== Section 4.3: dropout + length

WITHHOLDABLE_SEGMENT_TYPES = frozenset({"LABEL", "MILESTONE"})


def apply_metadata_dropout(segments: list[Segment], example_id: str, *, rate: float,
                            seed: int = 0) -> tuple[list[Segment], set[str]]:
    """Section 4.3: labels/milestones randomly withheld per example so C cannot learn to copy
    triage labels instead of reading the issue. Deterministic per (seed, example_id) so a run is
    reproducible. Only LABEL and MILESTONE are ever withheld -- never the title/body/comments.
    Returns (kept_segments, withheld_segment_ids)."""
    if not 0.0 <= rate <= 1.0:
        raise ValueError("rate must be in [0, 1]")
    rng = random.Random(f"{seed}:{example_id}")
    kept, withheld = [], set()
    for s in segments:
        if s.type in WITHHOLDABLE_SEGMENT_TYPES and rng.random() < rate:
            withheld.add(s.segment_id)
        else:
            kept.append(s)
    return kept, withheld


def fields_with_withheld_evidence(pointers_by_field: dict[str, list[str]], withheld: set[str]) -> list[str]:
    """Fields whose *every* evidence pointer was withheld by dropout. The model can no longer see that
    evidence, so the caller should skip L_pointer for them (Phase 8 §5.1's value-only fallback)
    rather than train it to point at text it was not shown."""
    return sorted(f for f, ptrs in pointers_by_field.items() if ptrs and set(ptrs) <= withheld)


_ORDINAL = {
    "experience_level": {"Beginner": 1, "Intermediate": 2, "Advanced": 3},
    "complexity": {"Low": 1, "Medium": 2, "High": 3},
}


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 2:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0 or syy == 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / math.sqrt(sxx * syy)


def length_label_correlation(records: list[dict], field_name: str, length_of=None) -> float | None:
    """Pearson correlation between issue length and the ordinal ``experience_level`` / ``complexity``
    label, over records with a known (non-Unknown) label. Section 4.3 treats length as a nuisance
    variable for exactly those two heads; the Phase 3 capability-4 contrast pairs are what keep this
    near zero in Training. Returns None if there is no variance to correlate. ``length_of``
    defaults to characters of title + body."""
    if field_name not in _ORDINAL:
        raise ValueError(f"field_name must be one of {sorted(_ORDINAL)}")
    if length_of is None:
        def length_of(r):
            i = r["input"]["issue"]
            return len(i.get("title", "")) + len(i.get("body", ""))
    xs, ys = [], []
    for r in records:
        label = r["ground_truth"]["task"].get(field_name)
        if label in _ORDINAL[field_name]:
            xs.append(float(length_of(r)))
            ys.append(float(_ORDINAL[field_name][label]))
    return _pearson(xs, ys)


def length_decorrelation_gate(correlations: dict[str, float | None], *, max_abs_correlation: float) -> list[str]:
    """Section 4.3 / 8.1: fail if either head's label tracks issue length more than the caller's
    threshold (empirical -- no default). ``None`` (no variance) is reported, not silently passed."""
    v = []
    for f in _ORDINAL:
        if f not in correlations:
            v.append(f"no length correlation supplied for {f}")
        elif correlations[f] is None:
            v.append(f"{f}: correlation undefined (no variance in labels or lengths); cannot certify decorrelation")
        elif abs(correlations[f]) > max_abs_correlation:
            v.append(f"{f}: |corr(length, label)| = {abs(correlations[f]):.3f} exceeds {max_abs_correlation}")
    return v


# ================================================================== Sections 3 / 5: grounding contract

def _is_unknown_value(value: Any) -> bool:
    return value is None or value == "Unknown" or value == [] or value == ""


def consistency_violations(proposal: FieldProposal) -> list[str]:
    """L_consistency (Section 5) as a predicate: value = Unknown <=> source = UNKNOWN <=> no pointer,
    and any non-UNKNOWN source needs a pointer (Phase 8 §8.2 / H3 Rules 2-3, enforced at training
    time rather than first met at assembly)."""
    v: list[str] = []
    unk_value, unk_source = _is_unknown_value(proposal.value), proposal.source == "UNKNOWN"
    has_pointer = bool(proposal.pointers)
    if unk_value != unk_source:
        v.append(f"{proposal.field}: value {'is' if unk_value else 'is not'} Unknown but source is {proposal.source}")
    if unk_source and has_pointer:
        v.append(f"{proposal.field}: source is UNKNOWN but pointers are present")
    if not unk_source and not has_pointer:
        v.append(f"{proposal.field}: source is {proposal.source} but no pointer supports it")
    return v


def clipped_source_target(source: str, pointed: list[Segment]) -> str:
    """L_source (Section 5): the *training target* is clipped by the same source-ceiling table used
    at inference, so the loss never rewards an over-claimed source type. No pointed segments -> the
    target can be no stronger than UNKNOWN for a pointer-less claim."""
    if source not in SOURCE_RANK:
        raise ValueError(f"unknown source {source!r}")
    if source == "UNKNOWN":
        return source
    if not pointed:
        return "UNKNOWN"
    ceiling = max(SOURCE_RANK[source_ceiling_for(s)] for s in pointed)
    if SOURCE_RANK[source] <= ceiling:
        return source
    return next(k for k, r in SOURCE_RANK.items() if r == ceiling)


def pre_downgrade_violation_rate(proposals: list[FieldProposal], segments_by_id: dict[str, Segment]) -> float:
    """Section 6.3: fraction of proposals whose claimed source exceeds their evidence's ceiling
    *before* H2 downgrades them. High => an L_source training problem, not an assembly nuisance."""
    if not proposals:
        raise ValueError("no proposals")
    trace, bad = InferenceTrace(), 0
    for p in proposals:
        before = len(trace.downgrades)
        clip_to_source_ceiling(p, resolve_pointers(p.pointers, segments_by_id), trace)
        bad += len(trace.downgrades) > before
    return bad / len(proposals)


def unsupported_entities(predicted: dict[str, list[str]], segments_by_id: dict[str, Segment], *,
                         require_textual_mention: bool = False) -> list[str]:
    """L_unsupported / Section 3.3: predicted technologies/components/systems/dependencies with no
    resolving evidence pointer (H2's unsupported-entity check, applied while training).
    ``predicted`` maps item -> pointers. With ``require_textual_mention`` the item's text must also
    occur (case-insensitive) in a pointed segment -- the H2.3 EXPLICIT-support standard."""
    bad = []
    for item, ptrs in predicted.items():
        resolved = resolve_pointers(ptrs, segments_by_id)
        if not resolved:
            bad.append(item)
        elif require_textual_mention and not any(item.lower() in s.text.lower() for s in resolved):
            bad.append(item)
    return sorted(bad)


def evidence_identity_rate(records: list[dict]) -> float | None:
    """Section 8 / Rule 7: fraction of records whose experience_level and complexity carry identical
    evidence text. Reads ``ground_truth``-shaped ``provenance`` on each record (a dict with
    ``provenance``, as a model's assembled output has). None if no record has both."""
    both = same = 0
    for r in records:
        prov = r.get("provenance") or r.get("ground_truth", {}).get("provenance") or {}
        e = (prov.get("experience_level") or {}).get("evidence")
        c = (prov.get("complexity") or {}).get("evidence")
        if e is not None and c is not None:
            both += 1
            same += e == c
    return same / both if both else None


# ================================================================== Section 6: evaluation gates

def floor_gate(name: str, metrics: dict[str, float], floors: dict[str, float]) -> list[str]:
    """Every floor needs a measured metric at or above it (higher is better)."""
    v = []
    for k, floor in floors.items():
        if k not in metrics:
            v.append(f"{name}: no measurement for {k}")
        elif metrics[k] < floor:
            v.append(f"{name}: {k} = {metrics[k]} is below floor {floor}")
    return v


def ceiling_gate(name: str, metrics: dict[str, float], ceilings: dict[str, float]) -> list[str]:
    """Every ceiling needs a measured metric at or below it (lower is better)."""
    v = []
    for k, ceiling in ceilings.items():
        if k not in metrics:
            v.append(f"{name}: no measurement for {k}")
        elif metrics[k] > ceiling:
            v.append(f"{name}: {k} = {metrics[k]} exceeds ceiling {ceiling}")
    return v


def classification_gate(agreement: dict[str, float], floors: dict[str, float]) -> list[str]:
    """Section 6.1 / Phase 1 §8.1: per-field agreement, never pooled -- a floor is required for each
    of the four fields, so a strong field cannot stand in for a missing one."""
    missing = [f for f in CLASSIFICATION_FIELDS if f not in floors]
    v = [f"classification: no floor set for {f}" for f in missing]
    return v + floor_gate("classification", agreement, {f: floors[f] for f in CLASSIFICATION_FIELDS if f in floors})


def grounding_gate(metrics: dict[str, float], *, min_pointer_resolution_rate: float,
                   min_explicit_textual_support_rate: float, max_pre_downgrade_violation_rate: float) -> list[str]:
    """Section 6.3: H2.1 pointer resolution, H2.3 EXPLICIT textual support, and H2.2's *pre*-downgrade
    ceiling-violation rate, as first-class training metrics."""
    return (floor_gate("grounding", metrics, {
                "pointer_resolution_rate": min_pointer_resolution_rate,
                "explicit_textual_support_rate": min_explicit_textual_support_rate})
            + ceiling_gate("grounding", metrics, {"pre_downgrade_violation_rate": max_pre_downgrade_violation_rate}))


def generation_gate(metrics: dict[str, float], *, min_claim_support_rate: float,
                    min_acceptance_criteria_adequacy: float) -> list[str]:
    """Section 6.2: claim-support rate and Rule 5 (acceptance-criteria) satisfaction rate. The
    human-reviewed spot sample is a QA-process decision (open item), not gated here."""
    return floor_gate("generation", metrics, {
        "claim_support_rate": min_claim_support_rate,
        "acceptance_criteria_adequacy": min_acceptance_criteria_adequacy})


def schema_validity_report(outputs: list[Any]) -> dict:
    """Section 6.5 / Phase 1 §8.6. ``outputs`` are what ``architecture.understand`` returns: a record
    or a ``RejectedResult``. Counts rejections, and re-validates every emitted record so a record that
    slipped out invalid is caught here rather than trusted."""
    rejected = sum(isinstance(o, RejectedResult) for o in outputs)
    invalid = [i for i, o in enumerate(outputs) if not isinstance(o, RejectedResult) and validate_all(o)]
    return {"total": len(outputs), "rejected": rejected, "emitted_invalid": invalid,
            "rejected_rate": (rejected / len(outputs)) if outputs else None}


def schema_validity_gate(report: dict) -> list[str]:
    """Hard requirement, not a quality target (Section 6.5): any RejectedResult or any emitted
    record failing validation fails it. No threshold, by design."""
    v = []
    if not report["total"]:
        return ["no outputs evaluated"]
    if report["rejected"]:
        v.append(f"{report['rejected']} of {report['total']} outputs were RejectedResult (must be 0)")
    if report["emitted_invalid"]:
        v.append(f"emitted records at indices {report['emitted_invalid']} fail schema/derived validation")
    return v


PHASE11_NAMED_ADVERSARIAL_MODES = (
    "fabricated_grounding_bait", "spurious_keyword_correlation", "experience_complexity_collapse",
)


def adversarial_gate(failure_rates: dict[str, float], release_thresholds: dict[str, float], *,
                     required_modes: Iterable[str] = PHASE11_NAMED_ADVERSARIAL_MODES) -> list[str]:
    """Section 6.4 / 8: failure rate per ``failure_mode_targeted`` category, reported and gated
    separately -- never pooled -- so strength on one mode cannot mask weakness on another. Every
    required mode needs both a measured rate and a threshold."""
    v = []
    modes = set(required_modes) | set(failure_rates) | set(release_thresholds)
    for m in sorted(modes):
        if m not in failure_rates:
            v.append(f"adversarial: mode {m} was not evaluated")
        elif m not in release_thresholds:
            v.append(f"adversarial: mode {m} has no release threshold")
        elif failure_rates[m] > release_thresholds[m]:
            v.append(f"adversarial: mode {m} failure rate {failure_rates[m]} exceeds threshold {release_thresholds[m]}")
    return v


def adversarial_registry_gaps(modes: Iterable[str], registry: Iterable[str]) -> list[str]:
    """Mode names used for evaluation that are not in Phase 7's D13 registry (``dataset.FAILURE_MODES``),
    i.e. modes the Adversarial dataset cannot currently tag records with."""
    return sorted(set(modes) - set(registry))


def calibration_gate(cells: dict[tuple[str, str], dict[str, float]]) -> list[str]:
    """Section 6.6 / Phase 1 §8.2, per (field, source_type) cell: accuracy at high confidence must be
    strictly higher than at low confidence. Each cell is
    ``{"high_confidence_accuracy": x, "low_confidence_accuracy": y}``. A pooled (non-tuple) key is
    rejected -- pooling would hide the EXPLICIT-vs-INFERRED distinction."""
    v = []
    if not cells:
        return ["no calibration cells supplied"]
    for key, c in cells.items():
        if not (isinstance(key, tuple) and len(key) == 2):
            v.append(f"calibration cell key {key!r} must be a (field, source_type) pair, not a pooled number")
            continue
        try:
            hi, lo = c["high_confidence_accuracy"], c["low_confidence_accuracy"]
        except KeyError as e:
            v.append(f"calibration cell {key}: missing {e.args[0]}")
            continue
        if not hi > lo:
            v.append(f"calibration cell {key}: high-confidence accuracy ({hi}) is not above low-confidence ({lo})")
    return v


def regression_tripwire(correct_by_record: dict[str, bool]) -> list[str]:
    """Section 6.8: every Regression record is a previously-fixed failure; any wrong one is a release
    blocker regardless of aggregate improvement. Returns the failing record ids."""
    return sorted(rid for rid, ok in correct_by_record.items() if not ok)


# ================================================================== Sections 6.7 / 6.8: one-shot Test

@dataclass
class EvalEvent:
    dataset_id: str          # training | validation | test | hard_case | adversarial | regression
    checkpoint_id: str
    checkpoint_stage: str    # STAGE_1 | STAGE_2
    purpose: str             # evaluation | calibration | threshold_tuning | model_selection | training


def validate_evaluation_log(events: list[EvalEvent]) -> list[str]:
    """The dataset-use discipline Sections 6.7, 6.8 and Decisions #4/#8 impose, checked over a
    chronological log:
      - Test consumed at most once, for evaluation only, on a Stage-2 checkpoint;
      - Regression run only after Test, on the same checkpoint Test measured;
      - calibration fit on Validation only; nothing but Training is used for training.
    A violation of the Test rules is a *process* failure that invalidates the Test pass (Section 8)."""
    v: list[str] = []
    test_events = [(i, e) for i, e in enumerate(events) if e.dataset_id == "test"]
    if len(test_events) > 1:
        v.append(f"Test consumed {len(test_events)} times; exactly once is allowed (this invalidates the Test pass)")
    for i, e in enumerate(events):
        if e.purpose == "training" and e.dataset_id != "training":
            v.append(f"event {i}: {e.dataset_id} used for training; only the Training dataset may be")
        if e.purpose == "calibration" and e.dataset_id != "validation":
            v.append(f"event {i}: calibration fit on {e.dataset_id}; calibration uses Validation only")
        if e.dataset_id == "test":
            if e.purpose != "evaluation":
                v.append(f"event {i}: Test used for {e.purpose}; Test is never used for tuning, calibration or selection")
            if e.checkpoint_stage != STAGE_2:
                v.append(f"event {i}: Test run on {e.checkpoint_stage}; it is consumed at the end of {STAGE_2}")
    for i, e in enumerate(events):
        if e.dataset_id != "regression":
            continue
        earlier = [t for j, t in test_events if j < i]
        if not earlier:
            v.append(f"event {i}: Regression run before Test; it follows Test (Decision #8)")
        elif e.checkpoint_id != earlier[0].checkpoint_id:
            v.append(f"event {i}: Regression run on {e.checkpoint_id!r} but Test measured "
                     f"{earlier[0].checkpoint_id!r}; Regression must measure the checkpoint that would ship")
    return v


# ================================================================== Sections 7 / 8: release + failures

@dataclass
class ReleaseVerdict:
    release_candidate: bool
    blockers: list[str] = field(default_factory=list)


def release_verdict(*, stage2_history: list[StageRecord], schema_violations: list[str],
                    adversarial_violations: list[str], calibration_violations: list[str],
                    evaluation_log_violations: list[str], regression_failures: list[str],
                    confidence_actionable: bool) -> ReleaseVerdict:
    """Section 7's release-candidate promotion: the full Section 6 suite has run *and passed*. Every
    input is the output of a gate above; any non-empty one blocks. Regression is a blocker on its own
    even if every aggregate improved (Section 8), and so is confidence that downstream users cannot act
    on differently (Phase 1 §9's system-level failure)."""
    b: list[str] = []
    if not any(r.stage == STAGE_2 and r.gate_passed for r in stage2_history):
        b.append(f"no {STAGE_2} checkpoint has passed its gate")
    b += [f"schema validity: {x}" for x in schema_violations]
    b += [f"adversarial: {x}" for x in adversarial_violations]
    b += [f"calibration: {x}" for x in calibration_violations]
    b += [f"test discipline: {x}" for x in evaluation_log_violations]
    if regression_failures:
        b.append(f"regression trip-wire fired on {regression_failures}")
    if not confidence_actionable:
        b.append("confidence is not actionable: downstream users cannot act differently on high- vs low-confidence output")
    return ReleaseVerdict(release_candidate=not b, blockers=b)


PHASE11_FAILURE_MODES: dict[str, tuple[bool, str]] = {
    "adversarial_mode_over_threshold": (
        True, "hard blocker for release-candidate: return to Stage 1 with adjusted L_unsupported/L_copy weighting "
              "or a larger contrast-pair share -- not a Stage-2-only fix"),
    "regression_tripwire": (
        True, "hard blocker: diagnose the specific regression before any further Test/Regression cycle is spent"),
    "schema_validity_below_100": (
        True, "diagnose whether the RejectedResult pattern concentrates in one field (often L_consistency or "
              "L_pointer under-training for that field)"),
    "calibration_cell_failure": (
        False, "re-fit Stage 2 for that cell from the Stage-1 parent; if the miscalibration is systematic, return "
               "to Stage 1 -- a calibrator cannot fix a head that does not discriminate"),
    "evidence_identity_violation_post_training": (
        False, "increase L_decouple weight; audit whether Training's cross-tab contrast pairs are underrepresented"),
    "test_consumed_more_than_once": (
        True, "process failure: log it and treat that Test pass as invalid; do not simply re-draw a Test-equivalent"),
    "confidence_not_actionable": (
        True, "release blocker regardless of aggregate accuracy: the uncertainty machinery is decorative"),
}


def classify_failure(mode: str, *, traced_to_start: bool = False) -> FailureResponse:
    """Section 8 dispatch, using Phase 11's own failure table."""
    return pretrain.classify_failure(mode, traced_to_start=traced_to_start, table=PHASE11_FAILURE_MODES)
