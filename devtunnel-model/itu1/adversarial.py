"""
ITU-1 -- Phase 15: Adversarial & Edge-Case Testing

Builds the Adversarial Test Framework: the taxonomy of adversarial/edge-case
categories, the ``failure_mode_targeted`` vocabulary Phase 7 D13 left
deferred (closed here, Decision #2), a formal test-case schema, generation
rules, the eight-dimension expected-behavior spec, the hard-confusable-pair
matrix, automated tests (AT1-AT9), human-review test definitions (HT1-HT5),
and failure thresholds.

No new dataset (Decision #1): every case is a ``dataset.DatasetRecord``
living in the existing Adversarial or Hard-case dataset. No training
happens here (Decision #7 precedent from Phase 14): a case the model fails
routes back to whichever training phase (10-13) owns the capability.

No third-party dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

import dataset as ds
import architecture as arch
import evaluation as ev

# --------------------------------------------------------------------------
# Section 1 -- taxonomy groups
# --------------------------------------------------------------------------

TAXONOMY_GROUPS = {
    "A": {  # keyword / label misdirection
        "categories": ("misleading_keywords", "incorrect_labels",
                       "repository_specific_terminology", "irrelevant_context",
                       "conflicting_context"),
        "phase1_failure": "9.1 fabricated grounding via surface pattern-matching; "
                          "9.5 inventing components/tech from a decoy term",
        "failure_modes": ("keyword_misdirection", "label_authority_override"),
    },
    "B": {  # requirement pathology
        "categories": ("contradictory_requirements", "missing_requirements",
                       "ambiguous_language"),
        "phase1_failure": "9.4 failing to flag genuine ambiguity",
        "failure_modes": ("unflagged_ambiguity", "forced_resolution_of_contradiction"),
    },
    "C": {  # structural complexity
        "categories": ("multiple_roles", "multiple_technologies",
                       "mixed_frontend_backend_work"),
        "phase1_failure": "9.3 (adjacent) collapsing composite task into a single-axis label",
        "failure_modes": ("role_collapse", "technology_anchoring"),
    },
    "D": {  # depth/size mismatch
        "categories": ("hidden_complexity", "superficially_simple_but_deep",
                       "large_but_technically_simple"),
        "phase1_failure": "9.3 conflating task size/length with experience or complexity",
        "failure_modes": ("size_complexity_conflation", "depth_underestimation"),
    },
    "E": {  # domain-sensitive framing
        "categories": ("security_sensitive_issues", "performance_issues"),
        "phase1_failure": "9.2 unwarranted confidence; tone-driven miscalibration",
        "failure_modes": ("tone_driven_confidence_shift",),
    },
    "F": {  # malformation / length extremes
        "categories": ("malformed_issues", "very_short_issues", "very_long_issues"),
        "phase1_failure": "9.6 unparseable output; 9.4 failure to abstain",
        "failure_modes": ("structural_non_robustness", "underabstention", "relevance_drift"),
    },
}


def taxonomy_group_for_failure_mode(mode: str) -> str | None:
    for group, spec in TAXONOMY_GROUPS.items():
        if mode in spec["failure_modes"]:
            return group
    return None


# --------------------------------------------------------------------------
# Section 2 -- failure_mode_targeted vocabulary (closes Phase 7 D13)
# --------------------------------------------------------------------------
# Each entry: definition + a pass-check function, where mechanically checkable.
# ``pass_check(case, record)`` returns True/False; None means human-judgment
# only (HT tests own it, Section 8).


def _prov(record: dict, f: str) -> dict:
    return record.get("provenance", {}).get(f, {})


def _cites_bait(record: dict, field_name: str, bait: str) -> bool:
    evidence = (_prov(record, field_name).get("evidence") or "").lower()
    return bait.lower() in evidence


def _pass_keyword_misdirection(case: "AdversarialTestCase", record: dict) -> bool:
    return not any(_cites_bait(record, f, case.bait_element) for f in record.get("provenance", {}))


def _pass_unflagged_ambiguity(case, record: dict) -> bool:
    field_name = case.target_field or "task_type"
    return (record["task"].get(field_name) == "Unknown"
            and _prov(record, field_name).get("source") == "UNKNOWN"
            and (record["uncertainty"].get("missing_information")
                 or record["uncertainty"].get("uncertain_information")))


def _pass_forced_resolution_of_contradiction(case, record: dict) -> bool:
    return (record["review"].get("review_required") is True
            and any((case.target_field or "") in r for r in record["review"].get("review_reasons", [])))


def _pass_role_collapse(case, record: dict) -> bool:
    return record["task"].get("role") == "Fullstack"


def _pass_technology_anchoring(case, record: dict) -> bool:
    incidental = case.metadata.get("incidental_tech", [])
    return not any(t in record["task"].get("components", []) + record["task"].get("systems", [])
                   for t in incidental)


def _pass_size_complexity_conflation(case, record: dict) -> bool:
    return record["task"].get("complexity") == case.expected_value


def _pass_depth_underestimation(case, record: dict) -> bool:
    return record["task"].get("complexity") == case.expected_value


def _pass_tone_driven_confidence_shift(case, record: dict) -> bool:
    return record["task"].get("task_type") == case.expected_value


def _pass_structural_non_robustness(case, record: dict) -> bool:
    import derived
    return derived.validate_all(record) == []


def _pass_underabstention(case, record: dict) -> bool:
    unknown_fields = [f for f, v in record["task"].items()
                       if v == "Unknown" or (isinstance(v, list) and not v)]
    return len(unknown_fields) >= case.metadata.get("min_unknown_fields", 1)


def _pass_relevance_drift(case, record: dict) -> bool:
    tangent = case.metadata.get("tangent_text", "")
    if not tangent:
        return True
    for f in ("title", "summary", "objective", "description", "expected_outcome"):
        if tangent.lower() in (record["task"].get(f) or "").lower():
            return False
    return True


FAILURE_MODES = {
    "keyword_misdirection": {
        "definition": "A term strongly associated with one classification appears "
                      "in the issue with no supporting engineering signal for it.",
        "pass_check": _pass_keyword_misdirection,
    },
    "label_authority_override": {
        "definition": "Issue's existing GitHub label(s) conflict with what the "
                      "issue text actually describes.",
        "pass_check": None,  # follows text, disagreement flagged -- HT1
    },
    "unflagged_ambiguity": {
        "definition": "Issue text is genuinely indeterminate on a field.",
        "pass_check": _pass_unflagged_ambiguity,
    },
    "forced_resolution_of_contradiction": {
        "definition": "Issue contains two mutually exclusive statements bearing "
                      "on the same field.",
        "pass_check": _pass_forced_resolution_of_contradiction,
    },
    "role_collapse": {
        "definition": "Issue genuinely spans two roles.",
        "pass_check": _pass_role_collapse,
    },
    "technology_anchoring": {
        "definition": "Multiple technologies appear; one is incidental.",
        "pass_check": _pass_technology_anchoring,
    },
    "size_complexity_conflation": {
        "definition": "Issue length/word count is a poor proxy for complexity "
                      "or experience_level.",
        "pass_check": _pass_size_complexity_conflation,
    },
    "depth_underestimation": {
        "definition": "Issue reads as simple but the underlying engineering "
                      "work is not.",
        "pass_check": _pass_depth_underestimation,
    },
    "tone_driven_confidence_shift": {
        "definition": "Issue is written with urgency/alarm or flatly, "
                      "independent of actual severity.",
        "pass_check": _pass_tone_driven_confidence_shift,
    },
    "structural_non_robustness": {
        "definition": "Issue text is truncated, has broken markdown/encoding, "
                      "or is otherwise malformed.",
        "pass_check": _pass_structural_non_robustness,
    },
    "underabstention": {
        "definition": "Issue is extremely short (a title-only stub, one sentence).",
        "pass_check": _pass_underabstention,
    },
    "relevance_drift": {
        "definition": "Issue is very long, containing tangents unrelated to "
                      "the actual task.",
        "pass_check": _pass_relevance_drift,
    },
}

assert set(FAILURE_MODES) == ds.FAILURE_MODES, \
    "adversarial.FAILURE_MODES must match the registry dataset.py already gates on"


def check_failure_mode_pass(mode: str, case: "AdversarialTestCase", record: dict) -> bool | None:
    """Returns True/False for a mechanically-checkable mode, None if the
    ground-truth signature requires human judgment (Section 2 table)."""
    spec = FAILURE_MODES.get(mode)
    if spec is None:
        raise ValueError(f"unknown failure_mode_targeted: {mode}")
    check = spec["pass_check"]
    return check(case, record) if check else None


# --------------------------------------------------------------------------
# Section 3 -- test case schema and generation rules
# --------------------------------------------------------------------------

CONSTRUCTION_METHODS = {"real_issue_perturbation", "synthetic_construction",
                         "contrast_pair_derivation"}


@dataclass
class AdversarialTestCase:
    """3.1: a dataset.DatasetRecord's dataset_assignment/inclusion_reason plus
    an additive adversarial_metadata block. Does not alter the DatasetRecord
    contract."""
    example_id: str
    dataset_id: str                       # "adversarial" | "hard_case"
    inclusion_type: str                   # "failure_mode_probe" | "contrast_pair"
    failure_mode_targeted: str
    taxonomy_group: str
    construction_method: str
    bait_element: str = ""
    contrast_pair_id: str | None = None
    expected_behavior_refs: tuple = ()
    secondary_failure_modes: tuple = ()
    target_field: str | None = None
    expected_value: Any = None
    metadata: dict = field(default_factory=dict)


def validate_case_shape(case: AdversarialTestCase) -> list[str]:
    errors = []
    if case.dataset_id not in ("adversarial", "hard_case"):
        errors.append("dataset_id must be adversarial or hard_case")
    if case.inclusion_type not in ("failure_mode_probe", "contrast_pair"):
        errors.append("inclusion_type must be failure_mode_probe or contrast_pair")
    if case.failure_mode_targeted not in FAILURE_MODES:
        errors.append(f"failure_mode_targeted not in registry: {case.failure_mode_targeted}")
    if case.taxonomy_group not in TAXONOMY_GROUPS:
        errors.append(f"unknown taxonomy_group: {case.taxonomy_group}")
    elif case.failure_mode_targeted not in TAXONOMY_GROUPS[case.taxonomy_group]["failure_modes"]:
        errors.append(f"{case.failure_mode_targeted} is not a failure mode of group {case.taxonomy_group}")
    if case.construction_method not in CONSTRUCTION_METHODS:
        errors.append(f"unknown construction_method: {case.construction_method}")
    if case.dataset_id == "hard_case" and case.inclusion_type != "contrast_pair":
        # contrast pairs live in hard_case (Section 5); failure_mode_probe cases live in adversarial
        pass
    for m in case.secondary_failure_modes:
        if m not in FAILURE_MODES:
            errors.append(f"unknown secondary failure mode: {m}")
    return errors


def bait_zero_signal_violations(bait_element: str, other_evidence: Iterable[str]) -> list[str]:
    """3.3 Group A rule + 3.4: bait must carry zero independent supporting
    signal. If it happens to also be genuinely supported by other content,
    the case tests nothing and is rejected at review."""
    bait = bait_element.lower()
    if any(bait in e.lower() for e in other_evidence):
        return [f"bait element '{bait_element}' has independent supporting signal "
               "elsewhere in the issue -- case tests nothing, reject at review"]
    return []


def group_b_submode_violations(has_both_statements: bool, is_single_ambiguous: bool) -> list[str]:
    """3.3 Group B rule: contradiction needs BOTH conflicting statements
    verbatim, never merged with the single-ambiguous-statement sub-case."""
    if has_both_statements and is_single_ambiguous:
        return ["contradiction case cannot also be a single-ambiguous-statement case "
               "-- the two Group B sub-modes are never merged"]
    return []


def bait_only_signal_violations(bait_is_only_content: bool, taxonomy_group: str) -> list[str]:
    """3.4: a case where the bait is the ONLY signal is not a hard case, it's
    underspecified -- must route to Group B (unflagged_ambiguity) with
    ground truth Unknown, not stay in its original group."""
    if bait_is_only_content and taxonomy_group != "B":
        return ["bait element is the issue's only content -- route to Group B "
               "(unflagged_ambiguity, ground truth Unknown), not scored as this group"]
    return []


def compounding_share_violations(total_cases: int, compounded_cases: int, *,
                                  target: float = 0.15) -> list[str]:
    """3.5: compounded cases capped at a minority share (target <=15%,
    empirical)."""
    if total_cases == 0:
        return []
    share = compounded_cases / total_cases
    if share > target:
        return [f"compounded-case share {share:.2%} exceeds target ceiling {target:.0%}"]
    return []


# --------------------------------------------------------------------------
# Section 4 -- expected behavior specification (eight dimensions)
# --------------------------------------------------------------------------

EXPECTED_BEHAVIOR_DIMENSIONS = (
    {"n": 1, "name": "engineering_intent", "bound_to": ("A", "C")},
    {"n": 2, "name": "keyword_independence", "bound_to": ("A",),
     "failure_mode": "keyword_misdirection"},
    {"n": 3, "name": "uncertainty_detection", "bound_to": ("B",),
     "failure_mode": "unflagged_ambiguity"},
    {"n": 4, "name": "unsupported_assumption_prevention", "bound_to": ("A", "D")},
    {"n": 5, "name": "schema_validity", "bound_to": ("F",)},
    {"n": 6, "name": "source_faithfulness", "bound_to": ("A", "B", "C", "D", "E", "F")},
    {"n": 7, "name": "context_handling", "bound_to": ("A",)},
    {"n": 8, "name": "confidence_calibration", "bound_to": ("E",)},
)


# --------------------------------------------------------------------------
# Section 5 -- hard-confusable-pair matrix
# --------------------------------------------------------------------------

HARD_CONFUSABLE_PAIRS = {
    "beginner_intermediate": {
        "signal": "whether the fix requires reasoning about why it works, "
                 "not just where to apply it, independent of length",
        "collapse_mode": "size_complexity_conflation",
        "construction": "hold task length fixed; vary only mechanism-vs-pattern reasoning",
    },
    "intermediate_advanced": {
        "signal": "whether the task requires reasoning about system-wide "
                 "consequences vs. a well-scoped local change",
        "collapse_mode": "depth_underestimation",
        "construction": "vary only presence/absence of a cross-cutting concern",
    },
    "frontend_fullstack": {
        "signal": "whether a genuine backend-side change is required, or only "
                 "described",
        "collapse_mode": "role_collapse",
        "construction": "hold frontend description near-identical; vary backend "
                        "contract requirement",
    },
    "backend_fullstack": {
        "signal": "whether a genuine UI-facing change is required, or only mentioned",
        "collapse_mode": "role_collapse",
        "construction": "mirrored, symmetric to frontend_fullstack",
    },
    "feature_improvement": {
        "signal": "whether new user-facing capability is added vs. an existing "
                 "one strengthened",
        "collapse_mode": "task_type_confusion",
        "construction": "vary only new-capability-vs-strengthened; keep scope comparable",
    },
    "bug_maintenance": {
        "signal": "whether current behavior violates a spec (bug) vs. is correct "
                 "but needs upkeep",
        "collapse_mode": "task_type_confusion",
        "construction": "vary only user-visible-wrong vs. stale implementation",
    },
    "low_medium": {
        "signal": "whether the change touches one well-isolated unit vs. "
                 "coordinates more than one",
        "collapse_mode": "size_complexity_conflation",
        "construction": "hold estimated diff size roughly fixed; vary component count",
    },
    "medium_high": {
        "signal": "whether the change has a knowable bounded solution path vs. "
                 "requires exploration/design trade-offs",
        "collapse_mode": "depth_underestimation",
        "construction": "vary only whether a design decision is genuinely open",
    },
}

MIN_INSTANCES_PER_PAIR = 20  # empirical minimum per release, Section 5


def pair_matrix_violations(pair_name: str, instance_count: int) -> list[str]:
    if pair_name not in HARD_CONFUSABLE_PAIRS:
        return [f"unknown hard-confusable pair: {pair_name}"]
    if instance_count < MIN_INSTANCES_PER_PAIR:
        return [f"{pair_name} has {instance_count} instances, below the "
               f"minimum {MIN_INSTANCES_PER_PAIR} per release"]
    return []


def pair_systematic_collapse(pair_name: str, accuracy: float, majority_class_baseline: float) -> bool:
    """Section 9: a pair's systematic at-or-below-chance collapse is a hard
    fail regardless of the tuned threshold."""
    return accuracy <= majority_class_baseline


# --------------------------------------------------------------------------
# Section 6 -- relationship to Phase 7 datasets and Phase 14 reporting
# --------------------------------------------------------------------------


def to_dataset_record(case: AdversarialTestCase, ex: dict, version: str) -> dict:
    """Inserts the case into Phase 7's existing DatasetRecord shape (no
    seventh dataset, Decision #1), plus the additive adversarial_metadata."""
    reason = {
        "type": case.inclusion_type,
        "detail": f"taxonomy group {case.taxonomy_group}",
        "failure_mode_targeted": case.failure_mode_targeted,
    }
    if case.secondary_failure_modes:
        reason["secondary_failure_modes"] = list(case.secondary_failure_modes)
    rec = ds.make_record(ex, case.dataset_id, version,
                          method="curated", reason=reason)
    rec["adversarial_metadata"] = {
        "taxonomy_group": case.taxonomy_group,
        "construction_method": case.construction_method,
        "bait_element": case.bait_element,
        "contrast_pair_id": case.contrast_pair_id,
        "expected_behavior_refs": list(case.expected_behavior_refs),
    }
    return rec


TAXONOMY_REPORTING_AXIS = "failure_mode_targeted"


def evaluation_run_missing_taxonomy_axis(run: "ev.EvaluationRun") -> bool:
    """A Phase 14 EvaluationRun against Adversarial/Hard-case must report
    every Section 4 dimension broken out by taxonomy group/failure mode
    (Section 6) -- an aggregate pass rate alone does not satisfy Phase 14
    Section 10's 'cube, not a scalar' rule."""
    return TAXONOMY_REPORTING_AXIS not in run.by_axis


# --------------------------------------------------------------------------
# Section 7 -- automated tests (AT1-AT9)
# --------------------------------------------------------------------------


def at1_keyword_independence(original_record: dict, masked_record: dict,
                              unaffected_fields: Iterable[str]) -> list[str]:
    """For every Group A case: classification for any field not evidenced by
    the bait term must be identical with and without it (metamorphic)."""
    violations = []
    for f in unaffected_fields:
        if original_record["task"].get(f) != masked_record["task"].get(f):
            violations.append(f"field '{f}' changed when the bait term was masked/removed")
    return violations


def at2_schema_validity_under_malformation(records: Iterable[dict]) -> list[str]:
    import derived
    violations = []
    for r in records:
        errs = derived.validate_all(r)
        if errs:
            violations.append(f"record failed schema validity under malformation: {errs}")
    return violations


_VALID_LEVELS = (0, 1, 2, 4, 5)  # architecture.py's own H1-H5 levels; 5 = reject


def at3_degradation_lattice_order(trace: "arch.InferenceTrace",
                                   result: "dict | arch.RejectedResult") -> list[str]:
    """Degradation must follow repair(1) -> downgrade(2) -> abstain(4) in
    order; reject(5, a RejectedResult) only when abstain was also
    unrecoverable, never as a first response to a merely-repairable input."""
    violations = []
    level = trace.degradation_level
    if level not in _VALID_LEVELS:
        violations.append(f"unrecognized degradation level: {level}")
    is_reject = isinstance(result, arch.RejectedResult)
    if is_reject and level == 0:
        violations.append("rejected without attempting repair/downgrade/abstain first")
    if is_reject and not trace.repairs and not trace.downgrades and level != 0:
        pass  # level>0 with no logged repairs/downgrades can still be a
              # legitimate level-4 abstain path; nothing more to check here
    if not is_reject and level not in _VALID_LEVELS[:-1]:
        violations.append(f"non-reject result carries an invalid degradation level: {level}")
    return violations


def at4_grounding_ceiling_on_bait(record: dict, bait_field: str,
                                   bait_segment_ids: set[str],
                                   segments_by_id: dict[str, "arch.Segment"]) -> list[str]:
    """No field claims a source stronger than the bait segment's own ceiling
    (Phase 8 2.A), restricted to the bait element specifically (Groups A,
    E). Reconstructs the FieldProposal H2 would have seen and re-runs
    architecture.py's own clip_to_source_ceiling, so this doesn't
    re-derive the ceiling table -- it re-checks the pipeline's own output
    against it."""
    entry = _prov(record, bait_field)
    resolved = [s for sid, s in segments_by_id.items() if sid in bait_segment_ids]
    if not resolved or entry.get("source") in (None, "UNKNOWN"):
        return []
    proposal = arch.FieldProposal(field=bait_field, value=record["task"].get(bait_field),
                                   source=entry["source"], pointers=list(bait_segment_ids))
    trace = arch.InferenceTrace()
    clipped = arch.clip_to_source_ceiling(proposal, resolved, trace)
    if clipped.source != entry["source"]:
        return [f"field '{bait_field}' claims {entry['source']} on bait content whose "
               f"ceiling only supports {clipped.source}"]
    return []


def at5_abstention_rate_on_short_stubs(records: Iterable[dict], *, floor: float) -> dict:
    rates = []
    for r in records:
        fields = r.get("task", {})
        n = len(fields) or 1
        unk = sum(1 for v in fields.values() if v == "Unknown" or v == [])
        rates.append(unk / n)
    mean_rate = sum(rates) / len(rates) if rates else None
    return {"mean_abstention_rate": mean_rate,
            "pass": mean_rate is not None and mean_rate >= floor}


def at6_relevance_on_long_cases(record: dict, tangent_texts: Iterable[str]) -> list[str]:
    violations = []
    for f in ("title", "summary", "objective", "description", "expected_outcome"):
        text = (record["task"].get(f) or "").lower()
        for tangent in tangent_texts:
            if tangent.lower() in text:
                violations.append(f"tangent segment leaked into '{f}'")
    return violations


def at7_contradiction_non_resolution(record: dict, contradicted_field: str) -> list[str]:
    violations = []
    if not record["review"].get("review_required"):
        violations.append("review_required is False on a forced_resolution_of_contradiction case")
    elif not any(contradicted_field in r for r in record["review"].get("review_reasons", [])):
        violations.append("review_reasons does not name the contradicted field")
    return violations


def at8_calibration_delta_on_pair(harder_confidence: float, easier_confidence: float,
                                   harder_correct_by_coincidence: bool) -> list[str]:
    """Confidence must not increase when the harder side is classified
    correctly by coincidence."""
    if harder_correct_by_coincidence and harder_confidence > easier_confidence:
        return ["confidence rose on the harder pair member despite only a "
               "coincidental correct classification"]
    return []


def at9_tone_invariance(cells: dict[tuple[str, str], dict]) -> list[str]:
    """Compare classification/confidence across the four tone x topic cells
    (Group E). ``cells``: {(topic, tone): {"task_type": ..., "confidence": ...}}"""
    violations = []
    by_topic: dict[str, list] = {}
    for (topic, tone), vals in cells.items():
        by_topic.setdefault(topic, []).append((tone, vals))
    for topic, entries in by_topic.items():
        task_types = {v["task_type"] for _, v in entries}
        if len(task_types) > 1:
            violations.append(f"task_type varies by tone for topic '{topic}': {task_types}")
    return violations


AUTOMATED_TESTS = ("AT1", "AT2", "AT3", "AT4", "AT5", "AT6", "AT7", "AT8", "AT9")


# --------------------------------------------------------------------------
# Section 8 -- human-review tests (data only; judgment is out of scope here)
# --------------------------------------------------------------------------

HUMAN_REVIEW_TESTS = {
    "HT1": {"group": "A", "judges": "engineering-intent correctness: real content vs. keyword-driven guess"},
    "HT2": {"group": "C", "judges": "role-split correctness: independently-verifiable work on both sides"},
    "HT3": {"group": "D", "judges": "depth-assessment correctness: non-obvious work surfaced, not echoed framing"},
    "HT4": {"group": "E", "judges": "security/performance risk read, independent of tone"},
    "HT5": {"group": None, "judges": "case-construction quality gate (Section 3.4), run once at authoring time"},
}


def ht5_construction_quality_violations(case: AdversarialTestCase, *,
                                         bait_zero_signal_ok: bool) -> list[str]:
    """HT5: before a new case enters Adversarial/Hard-case, a reviewer
    confirms it satisfies 3.4 -- bait is not the only signal."""
    if not bait_zero_signal_ok:
        return [f"case {case.example_id} fails construction quality gate: "
               "bait may be the only signal (Section 3.4)"]
    return []


# --------------------------------------------------------------------------
# Section 9 -- failure thresholds
# --------------------------------------------------------------------------

HARD_GATE_TESTS = frozenset({"AT1", "AT2", "AT7"})  # 100%-or-fail, no tuning


def hard_gate_violations(results: dict[str, list[str]]) -> list[str]:
    """AT1/AT7 (keyword independence, contradiction non-resolution) and AT2
    (schema validity under malformation) are hard, 100%-or-fail. AT3's
    ordering rule is also hard (checked separately, since it is boolean per
    trace rather than a rate)."""
    violations = []
    for test in HARD_GATE_TESTS:
        if results.get(test):
            violations.append(f"{test} is a hard gate and had failures: {results[test]}")
    return violations


def failure_threshold_verdict(*, hard_results: dict[str, list[str]],
                               at3_violations: list[str],
                               empirical_results: dict[str, dict],
                               pair_collapses: list[str]) -> dict:
    blockers = list(hard_gate_violations(hard_results))
    if at3_violations:
        blockers.append(f"AT3 degradation lattice ordering violated: {at3_violations}")
    blockers.extend(pair_collapses)
    cells = {}
    for name, result in empirical_results.items():
        actual = result.get("actual")
        cells[name] = "[INSUFFICIENT DATA]" if actual is None else (
            "pass" if actual >= result.get("min", 0) else "fail")
        if cells[name] == "fail":
            blockers.append(f"{name} below empirical threshold")
    return {"verdict": "blocked" if blockers else "clear", "blockers": blockers, "cells": cells}
