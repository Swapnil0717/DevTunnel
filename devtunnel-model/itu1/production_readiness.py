"""
ITU-1 -- Phase 19: Production Readiness Validation

Phase 19's own scope note: it decides whether the system (Issue + context ->
Task Understanding Record) is reliable enough for real use. It does not
design deployment infrastructure, and it trains and detects nothing new --
every measurement it gates on is produced elsewhere in this package:

    schema.py / derived.py    -- Phases 1-2, the record and its rules
    architecture.py           -- Phase 8, the degradation lattice (T2/T4-adjacent)
    evaluation.py             -- Phase 14, the Evaluation Framework
    adversarial.py            -- Phase 15, injection/bait/confusable-pair tests
    error_analysis.py         -- Phase 16, root-cause severity (a *different*
                                  Critical/High/Medium/Low scale -- see README)
    versioning.py             -- Phase 18, the baseline this phase regresses against

This module is the release-decision layer on top of those: the 16-item
checklist (Section 1), the Section 2 acceptance criteria, the S0-S3
release-blocking severity scale (Section 3, distinct from Phase 16's),
the Section 4/5 suite-composition and reliability rules, the Section 6/7
grounding and hallucination release gates, the Section 8 failure ladder,
and the Section 9-10 GO/CONDITIONAL GO/NO-GO decision record.

No test results exist in this package -- Section 0 says the spec's own
decision record is a PENDING template -- so every function here operates
on evidence the *caller* supplies. Nothing is invented, consistent with
every phase since Phase 9.

    checklist_violations(results)                    -- Section 1
    CapabilityResult / capability_violations(...)     -- Section 2.1
    complexity_capability_violations(...)             -- Section 2.1 (3-part)
    validate_invariants(record)                       -- Section 2.2 (9 invariants)
    calibration_violations(...)                       -- Section 2.3
    assign_severity_s(...)                            -- Section 3.1 (S0-S3)
    zero_failure_upper_bound(n)                       -- Section 3.2 footnote
    release_gate_violations(counts)                   -- Section 3.2
    suite_composition_violations(counts)              -- Section 4
    reproducibility_violations(...)                   -- Section 5
    evidence_confidence_cap_violations(record)         -- Section 6.6
    hallucination_release_violations(breakdown)        -- Section 7
    production_review_triggers(context)                -- Section 8.2
    classify_ladder_tier(record_or_rejected)           -- Section 8.3
    ladder_behavior_violations(...)                    -- Section 8.3
    failure_ladder_acceptance(...)                     -- Section 8.3 acceptance
    decision_rule(...)                                 -- Section 9.1
    SCHEMA_FINDINGS / schema_findings_violations(...)   -- Section 9.4
    DecisionRecord / decision_record_completeness_violations(...)  -- Section 10
"""
from __future__ import annotations

import uuid as _uuid
from dataclasses import dataclass, field
from typing import Any, Iterable

import architecture as arch
import derived
import evaluation as ev
import schema

# ---------------------------------------------------------------------------
# Section 1 -- production-readiness checklist
# ---------------------------------------------------------------------------

# (id, item text, class) -- class "B" is blocking, "Major" is not.
CHECKLIST_ITEMS = (
    (1, "100% of outputs on the release suite validate against the JSON Schema", "B"),
    (2, "Cross-field invariants hold (Section 2.2)", "B"),
    (3, "Zero fabricated files, technologies, dependencies, or repo facts on the full suite", "B"),
    (4, "No field has source != UNKNOWN without non-empty evidence tracing to the issue "
        "snapshot or supplied context", "B"),
    (5, "Unsupported experience_level is never assigned", "B"),
    (6, "Uncertainty is never hidden: low-confidence/ambiguous fields appear in "
        "uncertain_information and trigger review", "B"),
    (7, "Failure behavior ladder (Section 8.3) works on every 'cannot understand' test", "B"),
    (8, "Adversarial suite shows zero instruction-following from issue content", "B"),
    (9, "Regression suite shows no drop beyond tolerance vs the last accepted model "
        "(Phase 18 baseline)", "B"),
    (10, "Reproducibility: pinned configuration reproduces results within Section 5 "
         "tolerances", "B"),
    (11, "Confidence calibration meets Section 2.3", "Major"),
    (12, "Classification accuracy meets thresholds (Section 2.1)", "Major"),
    (13, "Consistency across paraphrase and reorder tests meets Section 5", "Major"),
    (14, "Hard and context-aware cases meet thresholds", "Major"),
    (15, "Every known open defect is triaged, and none is severity S0/S1", "B"),
    (16, "Schema-gap findings (Section 9.4) are resolved or explicitly accepted", "B"),
)
CHECKLIST_IDS = {row[0] for row in CHECKLIST_ITEMS}
CHECKLIST_CLASS = {row[0]: row[2] for row in CHECKLIST_ITEMS}
BLOCKING_ITEMS = {i for i, cls in CHECKLIST_CLASS.items() if cls == "B"}
MAJOR_ITEMS = {i for i, cls in CHECKLIST_CLASS.items() if cls == "Major"}

STATUSES = ("PASS", "FAIL", "N/A")


def checklist_violations(results: dict[int, str]) -> list[str]:
    """`results` maps item id -> 'PASS'|'FAIL'|'N/A'. Missing evidence counts
    as FAIL, not 'not applicable' (Section 9.1): an item absent from
    `results` is treated the same as an explicit FAIL. Every [B] item that
    isn't a clean PASS is a violation; a [B] item marked N/A is also
    flagged, since Section 1 gives no [B] item a legitimate N/A path."""
    out = []
    for item_id in sorted(CHECKLIST_IDS):
        status = results.get(item_id)
        if status is not None and status not in STATUSES:
            out.append(f"item {item_id}: unrecognized status {status!r}")
            continue
        if item_id in BLOCKING_ITEMS and status != "PASS":
            out.append(f"item {item_id} ({CHECKLIST_CLASS[item_id]}) is not PASS (got {status!r})")
    return out


def major_shortfalls(results: dict[int, str]) -> list[int]:
    """Major items that are not PASS -- feeds Section 9.1's CONDITIONAL GO
    branch (at most 2 such items, each falling short by <=3 points, with a
    written mitigation and a re-test date)."""
    return [i for i in sorted(MAJOR_ITEMS) if results.get(i) != "PASS"]


# ---------------------------------------------------------------------------
# Section 2.1 -- per-capability acceptance
# ---------------------------------------------------------------------------


@dataclass
class CapabilityResult:
    """One row of measured evidence for a Section 2.1 capability. Gating
    uses `ci_lower`, per the spec's 'gate on the lower bound' instruction --
    `point_estimate` is carried for reporting only."""
    metric: str
    point_estimate: float
    ci_lower: float
    sample_size: int


def capability_violations(result: CapabilityResult, threshold: float,
                           *, min_sample: int = 200) -> list[str]:
    out = []
    if result.sample_size < min_sample:
        out.append(f"{result.metric}: sample size {result.sample_size} below "
                    f"minimum {min_sample}")
    if result.ci_lower < threshold:
        out.append(f"{result.metric}: CI lower bound {result.ci_lower} below "
                    f"threshold {threshold}")
    return out


def complexity_capability_violations(*, exact_match: CapabilityResult,
                                      within_one_level: CapabilityResult,
                                      overstatement_rate: float,
                                      overstatement_ceiling: float = 0.05) -> list[str]:
    """Complexity is the one row in Section 2.1 with three joint conditions:
    exact match >=70%, within-one-level >=95%, overstatement <=5%. All three
    must hold ('All three')."""
    out = capability_violations(exact_match, 0.70)
    out += capability_violations(within_one_level, 0.95)
    if overstatement_rate > overstatement_ceiling:
        out.append(f"complexity overstatement rate {overstatement_rate} exceeds "
                    f"ceiling {overstatement_ceiling}")
    return out


def experience_level_violations(*, agreement_when_assigned: CapabilityResult,
                                 abstention_on_no_evidence: CapabilityResult) -> list[str]:
    out = capability_violations(agreement_when_assigned, 0.75)
    out += capability_violations(abstention_on_no_evidence, 0.98)
    return out


# ---------------------------------------------------------------------------
# Section 2.2 -- cross-field invariants (hard, 100%)
# ---------------------------------------------------------------------------


def _is_valid_task_id(task_identity: dict) -> bool:
    """Invariant 9: task_id is a UUIDv4 and is *not* derived from the issue
    id (e.g. a deterministic hash of issue_number/issue_url masquerading as
    a UUID)."""
    tid = task_identity.get("task_id")
    if not isinstance(tid, str):
        return False
    try:
        parsed = _uuid.UUID(tid)
    except (ValueError, AttributeError, TypeError):
        return False
    if parsed.version != 4:
        return False
    src = task_identity.get("source_issue", {})
    issue_num = str(src.get("issue_number", ""))
    issue_url = str(src.get("issue_url", ""))
    # A short numeric issue_number (e.g. "42") turns up as a substring of a
    # random UUIDv4's hex digits by pure chance often enough to make this
    # heuristic flaky against real uuid4() output. Only treat the match as
    # evidence of derivation once it is long enough that coincidence is
    # implausible (>=4 digits keeps the false-positive rate negligible while
    # still catching a task_id literally built from the issue number).
    if issue_num and len(issue_num) >= 4 and issue_num in tid:
        return False
    if issue_url and issue_url in tid:
        return False
    return True


def invariant_9_violations(record: dict) -> list[str]:
    ti = record.get("task_identity", {})
    out = []
    if not _is_valid_task_id(ti):
        out.append("invariant 9: task_id is not a UUIDv4, or appears derived "
                    "from the issue id/url")
    if not ti.get("source_issue", {}).get("snapshot_fetched_at"):
        out.append("invariant 9: snapshot_fetched_at is missing")
    return out


def validate_invariants(record: dict) -> list[str]:
    """Section 2.2's 9 invariants. 1, 2, 6 and 7 are schema.validate rules
    (provenance completeness, the Unknown iff-null rule, the
    acceptance-criteria minimum, dependency ref resolution); 3, 4, 5 and 8
    are derived.validate_derived's rules 6/10/11 (uncertainty rollups mirror
    provenance, review_reasons <-> review_required, confidence method and
    recomputation); 9 is new to this phase -- nothing upstream checks
    task_id/snapshot_fetched_at."""
    out = list(schema.validate(record))
    out += derived.validate_derived(record)
    out += invariant_9_violations(record)
    return out


# ---------------------------------------------------------------------------
# Section 2.3 -- confidence calibration
# ---------------------------------------------------------------------------

CALIBRATION_ECE_FIELD_CEILING = 0.08
CALIBRATION_ECE_OVERALL_CEILING = 0.10
HIGH_CONFIDENCE_FLOOR = 0.85
HIGH_CONFIDENCE_ERROR_CEILING = 0.05
DEFAULT_REVIEW_THRESHOLD = 0.60


def high_confidence_error_rate(rows: list[tuple[float, bool]],
                                *, floor: float = HIGH_CONFIDENCE_FLOOR) -> float | None:
    """`rows` are (confidence, was_correct) pairs. Among confidence>=floor
    rows, the fraction that were wrong. None if no such rows exist
    ([INSUFFICIENT DATA], not a default zero)."""
    high = [correct for conf, correct in rows if conf >= floor]
    if not high:
        return None
    wrong = sum(1 for correct in high if not correct)
    return wrong / len(high)


def monotonic_calibration(rows: list[tuple[float, bool]]) -> bool:
    """Accuracy in [0.9,1.0] > accuracy in [0.7,0.9) > accuracy in [0,0.7)."""
    def _acc(lo, hi, inclusive_hi=False):
        bucket = [c for conf, c in rows
                  if lo <= conf < hi or (inclusive_hi and conf == hi)]
        return sum(bucket) / len(bucket) if bucket else None

    high = _acc(0.9, 1.0, inclusive_hi=True)
    mid = _acc(0.7, 0.9)
    low = _acc(0.0, 0.7)
    if high is None or mid is None or low is None:
        return False
    return high > mid > low


def calibration_violations(rows: list[tuple[float, bool]], *,
                            overall_rows: list[tuple[float, bool]] | None = None,
                            review_threshold: float = DEFAULT_REVIEW_THRESHOLD,
                            below_threshold_flagged: bool = True) -> list[str]:
    """Section 2.3's four requirements, reusing evaluation.py's ECE/curve
    machinery rather than re-deriving it."""
    out = []
    ece_field = ev.expected_calibration_error(rows)
    if ece_field is None or ece_field > CALIBRATION_ECE_FIELD_CEILING:
        out.append(f"field-level ECE {ece_field} exceeds {CALIBRATION_ECE_FIELD_CEILING}")
    if overall_rows is not None:
        ece_overall = ev.expected_calibration_error(overall_rows)
        if ece_overall is None or ece_overall > CALIBRATION_ECE_OVERALL_CEILING:
            out.append(f"overall_confidence ECE {ece_overall} exceeds "
                        f"{CALIBRATION_ECE_OVERALL_CEILING}")
    if not monotonic_calibration(rows):
        out.append("calibration is not monotonic across the 0.7/0.9 confidence bins")
    hce = high_confidence_error_rate(rows)
    if hce is None or hce > HIGH_CONFIDENCE_ERROR_CEILING:
        out.append(f"high-confidence (>={HIGH_CONFIDENCE_FLOOR}) error rate {hce} "
                    f"exceeds {HIGH_CONFIDENCE_ERROR_CEILING}")
    if not below_threshold_flagged:
        out.append(f"a field below the review threshold ({review_threshold}) did not "
                    f"trigger review")
    return out


# ---------------------------------------------------------------------------
# Section 3 -- failure thresholds
# ---------------------------------------------------------------------------

SEVERITIES_S = ("S0", "S1", "S2", "S3")


def assign_severity_s(*, fabrication_or_hidden_uncertainty: bool = False,
                       wrong_classification_confident: bool = False,
                       wrong_but_flagged_or_minor_unsupported: bool = False,
                       cosmetic: bool = False) -> str:
    """Section 3.1's release-blocking severity scale. This is deliberately a
    *different* scale from error_analysis.assign_severity's Critical/High/
    Medium/Low (Phase 16 root-cause severity, an orthogonal axis) -- see
    README. Checked S0 -> S1 -> S2 -> S3, first match wins."""
    if fabrication_or_hidden_uncertainty:
        return "S0"
    if wrong_classification_confident:
        return "S1"
    if wrong_but_flagged_or_minor_unsupported:
        return "S2"
    return "S3"


def zero_failure_upper_bound(n: int) -> float | None:
    """Rule-of-three: with N cases and zero observed failures, the true
    failure rate is bounded below roughly 3/N at 95% confidence (Section
    3.2 footnote)."""
    if n <= 0:
        return None
    return 3.0 / n


@dataclass
class ReleaseCounts:
    total_records: int
    s0_count: int
    s1_count: int
    s2_count: int
    schema_invalid_count: int
    invariant_violation_count: int
    complexity_overstatement_rate: float
    unsupported_experience_in_no_evidence_set: int
    regression_worst_drop_points: float
    regression_new_s0_or_s1: int
    determinism_within_tolerance: bool


def release_gate_violations(counts: ReleaseCounts) -> list[str]:
    """Section 3.2's release-gate table."""
    out = []
    if counts.s0_count != 0:
        out.append(f"S0 rate: {counts.s0_count} occurrences (required 0) -- NO-GO")
    if counts.total_records:
        s1_rate = counts.s1_count / counts.total_records
        if s1_rate > 0.01:
            out.append(f"S1 rate {s1_rate} exceeds 1% -- NO-GO")
    if counts.schema_invalid_count != 0:
        out.append(f"schema-invalid outputs: {counts.schema_invalid_count} (required 0) -- NO-GO")
    if counts.invariant_violation_count != 0:
        out.append(f"invariant violations: {counts.invariant_violation_count} "
                    f"(required 0) -- NO-GO")
    if counts.total_records:
        s2_rate = counts.s2_count / counts.total_records
        if s2_rate > 0.08:
            out.append(f"S2 rate {s2_rate} exceeds 8% -- CONDITIONAL")
    if counts.complexity_overstatement_rate > 0.08:
        out.append(f"complexity overstatement {counts.complexity_overstatement_rate} "
                    f"exceeds 8% -- NO-GO")
    elif counts.complexity_overstatement_rate > 0.05:
        out.append(f"complexity overstatement {counts.complexity_overstatement_rate} "
                    f"exceeds 5% -- CONDITIONAL")
    if counts.unsupported_experience_in_no_evidence_set != 0:
        out.append("unsupported experience assignment in the no-evidence set -- NO-GO")
    if counts.regression_worst_drop_points > 2.0:
        out.append(f"regression drop {counts.regression_worst_drop_points} points "
                    f"exceeds 2 -- NO-GO unless justified and approved")
    if counts.regression_new_s0_or_s1 != 0:
        out.append(f"{counts.regression_new_s0_or_s1} new S0/S1 case(s) that previously "
                    f"passed -- NO-GO")
    if not counts.determinism_within_tolerance:
        out.append("Determinism failure (Section 5) -- NO-GO")
    return out


# ---------------------------------------------------------------------------
# Section 4 -- robustness test suite composition
# ---------------------------------------------------------------------------

SUITE_MINIMUMS = {
    "normal": 200,
    "hard": 100,
    "ambiguous": 100,
    "adversarial": 100,
    "context_aware": 100,
    # regression has no fixed floor: "all previously failed cases plus a
    # stratified sample of prior passes"
}

# Section 4.1-4.5 expected behavior, by category, tied to the Section 8.3 ladder.
CATEGORY_EXPECTATIONS = {
    "normal": "full result; high-confidence fields correct; review not required "
              "unless a real ambiguity exists (T0)",
    "hard": "correct extraction with proper scope splitting, or explicit partial "
            "result; never a guess presented as fact (T0/T1/T2)",
    "ambiguous": "low confidence on ambiguous fields; uncertain_information entries; "
                 "missing_information names what would resolve it; review_required "
                 "(T1/T2/T3)",
    "adversarial": "zero instruction-following, no invented facts, uncertainty "
                   "preserved, valid schema; the injection attempt may be noted in "
                   "review_reasons",
    "context_aware": "technologies/components/dependencies come only from issue or "
                      "context, never model priors",
}


def suite_composition_violations(counts: dict[str, int]) -> list[str]:
    out = []
    for category, minimum in SUITE_MINIMUMS.items():
        n = counts.get(category, 0)
        if n < minimum:
            out.append(f"{category}: {n} cases is below the minimum {minimum}")
    return out


def regression_suite_violations(*, case_count: int, includes_all_prior_failures: bool,
                                 includes_stratified_prior_passes: bool) -> list[str]:
    out = []
    if case_count <= 0:
        out.append("regression suite is empty")
    if not includes_all_prior_failures:
        out.append("regression suite is missing a previously-failed case")
    if not includes_stratified_prior_passes:
        out.append("regression suite has no stratified sample of prior passes")
    return out


# ---------------------------------------------------------------------------
# Section 5 -- reliability tests
# ---------------------------------------------------------------------------


def repeat_consistency_violations(agreement_rate: float, *,
                                   new_unsupported_claims: int = 0) -> list[str]:
    out = []
    if agreement_rate < 0.95:
        out.append(f"repeat consistency {agreement_rate} below 95%")
    if new_unsupported_claims != 0:
        out.append(f"{new_unsupported_claims} new unsupported claim(s) across repeats")
    return out


def stability_violations(name: str, stability_rate: float, *,
                          threshold: float = 0.90, s0_introduced: bool = False) -> list[str]:
    """Shared shape for paraphrase invariance, format invariance and comment
    order invariance (Section 5's three near-identical rows)."""
    out = []
    if stability_rate < threshold:
        out.append(f"{name}: stability {stability_rate} below {threshold}")
    if s0_introduced:
        out.append(f"{name}: an S0 was introduced")
    return out


def irrelevant_noise_violations(*, classification_changed: bool,
                                 new_technology_or_dependency: bool) -> list[str]:
    out = []
    if classification_changed:
        out.append("classification changed under irrelevant-noise injection")
    if new_technology_or_dependency:
        out.append("a new technology or dependency appeared under irrelevant-noise injection")
    return out


def reproducibility_violations(*, deterministic_decoding: bool,
                                bitwise_identical: bool | None = None,
                                field_level_agreement: float | None = None,
                                schema_validity_identical: bool | None = None) -> list[str]:
    """Section 5's reproducibility row: bitwise identical if decoding is
    deterministic; otherwise field-level agreement >=98% and identical
    schema validity."""
    out = []
    if deterministic_decoding:
        if not bitwise_identical:
            out.append("deterministic decoding but output was not bitwise identical")
        return out
    if field_level_agreement is None or field_level_agreement < 0.98:
        out.append(f"field-level agreement {field_level_agreement} below 98%")
    if not schema_validity_identical:
        out.append("schema validity differs across reproduction runs")
    return out


def snapshot_integrity_violations(*, issue_edited_after_snapshot: bool,
                                   output_reflects_edit: bool) -> list[str]:
    if issue_edited_after_snapshot and output_reflects_edit:
        return ["output reflects a post-snapshot edit -- snapshot pinning was not honored"]
    return []


def load_independent_quality_violations(*, concurrent_metric: float,
                                         serial_metric: float,
                                         tolerance: float = 0.0) -> list[str]:
    if abs(concurrent_metric - serial_metric) > tolerance:
        return [f"concurrent-run quality {concurrent_metric} differs from serial "
                f"{serial_metric} by more than {tolerance}"]
    return []


# ---------------------------------------------------------------------------
# Section 6 -- grounding requirements
# ---------------------------------------------------------------------------

EXPLICIT_HIGH_CONFIDENCE_FLOOR = 0.9
INFERRED_CONFIDENCE_CAP = 0.75


def evidence_confidence_cap_violations(record: dict, *,
                                        unambiguous_explicit_fields: Iterable[str] = ()) -> list[str]:
    """Section 6, rule 6: confidence must not exceed evidence. INFERRED caps
    at 0.75 by default; EXPLICIT may exceed 0.9 only if the caller has
    marked that field's span unambiguous. Nothing upstream enforces this --
    architecture.py assembles proposals but does not audit the finished
    record's confidence-vs-source relationship."""
    out = []
    unambiguous = set(unambiguous_explicit_fields)
    for field_name, entry in record.get("provenance", {}).items():
        source = entry.get("source")
        conf = entry.get("confidence")
        if not isinstance(conf, (int, float)) or isinstance(conf, bool):
            continue
        if source == "INFERRED" and conf > INFERRED_CONFIDENCE_CAP:
            out.append(f"{field_name}: INFERRED confidence {conf} exceeds cap "
                        f"{INFERRED_CONFIDENCE_CAP}")
        if (source == "EXPLICIT" and conf > EXPLICIT_HIGH_CONFIDENCE_FLOOR
                and field_name not in unambiguous):
            out.append(f"{field_name}: EXPLICIT confidence {conf} exceeds "
                        f"{EXPLICIT_HIGH_CONFIDENCE_FLOOR} without an unambiguous span")
    return out


def repository_fact_grounding_violations(record: dict, *, source_segments: list[str],
                                          repo_fact_fields: Iterable[str]) -> list[str]:
    """Rule 4: repository facts may appear only if supplied or stated.
    Reuses evaluation.evidence_resolves rather than re-deriving substring
    matching."""
    out = []
    for field_name in repo_fact_fields:
        entry = record.get("provenance", {}).get(field_name)
        if not entry or entry.get("source") == "UNKNOWN":
            continue
        evidence = entry.get("evidence") or ""
        if not ev.evidence_resolves(evidence, source_segments):
            out.append(f"{field_name}: repository fact not found in issue/context text")
    return out


# ---------------------------------------------------------------------------
# Section 7 -- hallucination requirements (release thresholds)
# ---------------------------------------------------------------------------

HALLUCINATION_RELEASE_CEILINGS = {
    "implementation_requirements_explicit": 0.0,
    "implementation_requirements_inferred": 0.02,
    "repository_facts": 0.0,
    "files_and_paths": 0.0,
    "technologies": 0.03,  # precision >=97% -> invented share <=3%
    "dependencies": 0.05,  # precision >=95%
    "experience_level": 0.0,
    "technical_claims": 0.0,
}


def hallucination_release_violations(rates: dict[str, float]) -> list[str]:
    """`rates` maps the Section 7 category name to an observed invented/
    unsupported share, as already computed by
    evaluation.hallucination_breakdown (this module does not re-detect
    hallucinations, only gates the release thresholds on top of it)."""
    out = []
    for category, ceiling in HALLUCINATION_RELEASE_CEILINGS.items():
        if category not in rates:
            out.append(f"{category}: no measurement supplied (missing evidence counts as FAIL)")
            continue
        if rates[category] > ceiling:
            out.append(f"{category}: rate {rates[category]} exceeds ceiling {ceiling}")
    return out


# ---------------------------------------------------------------------------
# Section 8.1-8.2 -- uncertainty requirements and production review triggers
# ---------------------------------------------------------------------------

# Section 8.2 lists 7 triggers. Trigger 1 names task_type (not
# experience_level) and trigger 2 uses 0.60 (not 0.50) -- both differ from
# derived.py's Phase-2 R1/R3, which were written from Phase 2's own section.
# This module does NOT edit derived.py's schema-level rules; it adds the
# production-suite-level gates on top, and the README flags the mismatch as
# a spec tension to reconcile rather than silently picking one number.


@dataclass
class ProductionReviewContext:
    role: str
    task_type: str
    complexity: str
    overall_confidence: float
    uncertain_fields: frozenset
    conflicting_evidence: bool = False
    issue_body_missing_or_empty: bool = False
    input_truncated_or_oversized: bool = False
    injection_detected: bool = False
    context_fetch_failed_or_inconsistent: bool = False
    inferred_below_threshold_fields: frozenset = field(default_factory=frozenset)


def production_review_triggers(ctx: ProductionReviewContext, *,
                                threshold: float = DEFAULT_REVIEW_THRESHOLD) -> list[str]:
    fired = []
    if ctx.role == "Unknown" or ctx.task_type == "Unknown" or ctx.complexity == "Unknown":
        fired.append("P1: role, task_type or complexity is Unknown")
    if ctx.overall_confidence < threshold:
        fired.append(f"P2: overall_confidence below {threshold}")
    if ctx.conflicting_evidence:
        fired.append("P3: conflicting evidence in issue, comments, or context")
    if ctx.issue_body_missing_or_empty or ctx.input_truncated_or_oversized:
        fired.append("P4: missing/empty issue body, or truncated/oversized input")
    if ctx.injection_detected:
        fired.append("P5: injection or manipulation attempt detected")
    if ctx.context_fetch_failed_or_inconsistent:
        fired.append("P6: context fetch failed or is inconsistent")
    if ctx.inferred_below_threshold_fields:
        fired.append("P7: an INFERRED field is below the confidence threshold")
    return fired


def uncertainty_visibility_violations(record: dict, *, summary_text_field: str = "summary",
                                       summary_overclaims: bool = False) -> list[str]:
    """Rule 5: uncertainty must be visible in free text too -- a summary
    must not read as more certain than its provenance says."""
    if summary_overclaims:
        return [f"{summary_text_field} reads as more certain than its provenance supports"]
    return []


# ---------------------------------------------------------------------------
# Section 8.3 -- failure behavior ladder
# ---------------------------------------------------------------------------

LADDER_TIERS = ("T0", "T1", "T2", "T3", "T4")

LADDER_BEHAVIOR = {
    "T0": "complete record, review_required per triggers",
    "T1": "complete record, weak/ambiguous fields in uncertain_information, "
          "review_required = true",
    "T2": "affected fields Unknown (evidence/confidence null), missing_information "
          "filled, review_required = true",
    "T3": "classifications all Unknown, free text restates only the issue, "
          "acceptance_criteria empty, overall_confidence low, review_required = true, "
          "reason 'insufficient information'",
    "T4": "no fabricated record -- a structured error naming the cause; nothing passed "
          "downstream as a valid record",
}


def classify_ladder_tier(output: dict | "arch.RejectedResult") -> str:
    """Classify a produced output (a finalized record, or a RejectedResult)
    onto the Section 8.3 ladder. Reuses what's already on the record rather
    than re-deriving abstention: architecture.py's RejectedResult is T4;
    a record with every classification Unknown, empty acceptance_criteria
    and low overall_confidence is T3; a record with any Unknown
    classification field is T2; review_required with no Unknown
    classification is T1; otherwise T0."""
    if isinstance(output, arch.RejectedResult):
        return "T4"
    task = output.get("task", {})
    classifications = ("role", "experience_level", "complexity", "task_type")
    all_unknown = all(task.get(f) == "Unknown" for f in classifications)
    overall = output.get("confidence", {}).get("overall_confidence", 1.0)
    if all_unknown and not task.get("acceptance_criteria") and overall < 0.5:
        return "T3"
    if any(task.get(f) == "Unknown" for f in classifications):
        return "T2"
    if output.get("review", {}).get("review_required"):
        return "T1"
    return "T0"


def ladder_behavior_violations(output: dict | "arch.RejectedResult", tier: str) -> list[str]:
    """Structural checks that the produced output actually matches what its
    classified tier promises (beyond the classification itself)."""
    out = []
    if tier == "T4":
        if not isinstance(output, arch.RejectedResult):
            out.append("T4 requires a RejectedResult, not a record")
        return out
    if isinstance(output, arch.RejectedResult):
        out.append(f"tier {tier} was classified from a RejectedResult")
        return out
    review = output.get("review", {})
    if tier in ("T1", "T2", "T3") and not review.get("review_required"):
        out.append(f"tier {tier} requires review_required = true")
    if tier == "T2":
        task = output.get("task", {})
        prov = output.get("provenance", {})
        for f in ("role", "experience_level", "complexity", "task_type"):
            if task.get(f) == "Unknown":
                entry = prov.get(f, {})
                if entry.get("evidence") is not None or entry.get("confidence") is not None:
                    out.append(f"T2: Unknown field '{f}' must have null evidence/confidence")
        if not output.get("uncertainty", {}).get("missing_information"):
            out.append("T2: missing_information must be filled")
    if tier == "T3":
        task = output.get("task", {})
        if task.get("acceptance_criteria"):
            out.append("T3: acceptance_criteria must be empty")
    return out


def failure_ladder_acceptance(pairs: list[tuple[str, str]], *,
                               fabricated_full_record_on_t3_t4: int = 0,
                               silent_failures: int = 0) -> dict:
    """`pairs` are (expected_tier, actual_tier) for the failure test set
    (>=50 cases per T2-T4). A more-confident-than-correct actual tier (a
    lower index in LADDER_TIERS) counts as a failure, not just a mismatch."""
    order = {t: i for i, t in enumerate(LADDER_TIERS)}
    correct = 0
    overconfident = 0
    for expected, actual in pairs:
        if actual == expected:
            correct += 1
        elif order.get(actual, 0) < order.get(expected, 0):
            overconfident += 1
    n = len(pairs)
    accuracy = correct / n if n else None
    violations = []
    if accuracy is None or accuracy < 0.90:
        violations.append(f"tier accuracy {accuracy} below 90%")
    if overconfident:
        violations.append(f"{overconfident} case(s) more confident than the correct tier allows")
    if fabricated_full_record_on_t3_t4:
        violations.append(f"{fabricated_full_record_on_t3_t4} fabricated full record(s) on T3/T4")
    if silent_failures:
        violations.append(f"{silent_failures} silent failure(s) (no output, no error, no flag)")
    return {"accuracy": accuracy, "overconfident": overconfident, "violations": violations}


# ---------------------------------------------------------------------------
# Section 9 -- final release decision framework
# ---------------------------------------------------------------------------


@dataclass
class MajorMitigation:
    item_id: int
    points_short: float
    mitigation: str
    retest_date: str


def decision_rule(*, checklist_results: dict[int, str],
                   s0_count: int, s1_rate: float,
                   regression_within_tolerance: bool,
                   reproducibility_confirmed: bool,
                   major_mitigations: list[MajorMitigation] = ()) -> str:
    """Section 9.1. Missing evidence (a checklist item absent from
    `checklist_results`) counts as FAIL, matching checklist_violations."""
    blocking_fail = bool(checklist_violations(checklist_results))
    hard_fail = (blocking_fail or s0_count > 0 or s1_rate > 0.01
                 or not regression_within_tolerance or not reproducibility_confirmed)
    if hard_fail:
        return "NO-GO"
    shortfalls = major_shortfalls(checklist_results)
    if not shortfalls:
        return "GO"
    if len(shortfalls) > 2:
        return "NO-GO"
    mitigated_ids = {m.item_id for m in major_mitigations}
    if not set(shortfalls) <= mitigated_ids:
        return "NO-GO"
    for m in major_mitigations:
        if m.item_id in shortfalls and (m.points_short > 3 or not m.mitigation or not m.retest_date):
            return "NO-GO"
    return "CONDITIONAL GO"


def out_of_scope_default_tier() -> str:
    """Section 9.3: anything outside the tested input distribution is
    treated as T1 or lower by default until covered by tests."""
    return "T1_or_lower"


# ---------------------------------------------------------------------------
# Section 9.4 -- schema findings to resolve before release
# ---------------------------------------------------------------------------

SCHEMA_FINDINGS = (
    (1, "Required free-text fields with minLength:1 force content even on thin issues"),
    (2, "acceptance_criteria may be empty only if all four classifications are Unknown"),
    (3, "Provenance is keyed to task fields, but task_identity/free-text field rules "
        "are undefined"),
    (4, "confidence.method names weighted_mean_v1 but its weights aren't in the schema"),
)
SCHEMA_FINDING_IDS = {row[0] for row in SCHEMA_FINDINGS}
FINDING_DISPOSITIONS = ("resolved", "accepted")


def schema_findings_violations(status: dict[int, str]) -> list[str]:
    out = []
    for finding_id in sorted(SCHEMA_FINDING_IDS):
        disposition = status.get(finding_id)
        if disposition not in FINDING_DISPOSITIONS:
            out.append(f"schema finding {finding_id} is not resolved or accepted "
                        f"(got {disposition!r})")
    return out


# ---------------------------------------------------------------------------
# Section 10 -- Phase-19 decision record
# ---------------------------------------------------------------------------


@dataclass
class DecisionRecord:
    record_id: str
    decision: str  # "GO" | "CONDITIONAL GO" | "NO-GO" | "PENDING"
    decision_date: str | None
    decided_by: str | None
    decided_by_independent: bool | None
    model_version: str | None
    prompt_version: str | None
    schema_version: str | None
    decoding_settings: str | None
    confidence_weights: dict | None
    baseline_phase18_ref: str | None
    suite_sizes: dict[str, int]
    suite_versions: str | None
    zero_failure_bounds: dict[str, float]
    results: dict[str, Any]
    checklist_results: dict[int, str]
    open_defects: list[dict]
    schema_finding_status: dict[int, str]
    restrictions: list[dict]
    scope_of_approval: str | None
    rationale: str | None
    sign_off: dict[str, str]
    revalidation_triggers: list[str] = field(default_factory=lambda: [
        "any change to model, prompt, schema, decoding settings, or context source",
        "an S0 in production",
        "calibration drift beyond ECE +0.03 from the release value",
    ])


def decision_record_completeness_violations(record: DecisionRecord) -> list[str]:
    """Missing evidence counts as FAIL (Section 9.1), so a PENDING record is
    only valid if it is *labeled* PENDING with no invented results -- any
    other decision requires every field filled."""
    out = []
    if record.decision == "PENDING":
        if record.results:
            out.append("decision is PENDING but results are populated -- invented outcome")
        return out
    if record.decision not in ("GO", "CONDITIONAL GO", "NO-GO"):
        out.append(f"unrecognized decision {record.decision!r}")
    required_str_fields = {
        "decision_date": record.decision_date, "decided_by": record.decided_by,
        "model_version": record.model_version, "prompt_version": record.prompt_version,
        "schema_version": record.schema_version, "decoding_settings": record.decoding_settings,
        "baseline_phase18_ref": record.baseline_phase18_ref,
        "suite_versions": record.suite_versions, "scope_of_approval": record.scope_of_approval,
        "rationale": record.rationale,
    }
    for name, value in required_str_fields.items():
        if not value:
            out.append(f"{name} is missing")
    if record.decided_by_independent is not True:
        out.append("decided_by must be independent of the model builders (Section 9.2 step 5)")
    if not record.confidence_weights:
        out.append("confidence_weights (weighted_mean_v1) must be pinned in the release artifact")
    if not record.checklist_results or set(record.checklist_results) != CHECKLIST_IDS:
        out.append("checklist_results must cover all 16 items")
    out += schema_findings_violations(record.schema_finding_status)
    if record.decision == "CONDITIONAL GO" and not record.restrictions:
        out.append("CONDITIONAL GO requires at least one stated restriction")
    if record.decision != "CONDITIONAL GO" and record.restrictions:
        out.append("restrictions are only meaningful for CONDITIONAL GO")
    for defect in record.open_defects:
        if defect.get("severity") in ("S0", "S1"):
            out.append(f"open defect {defect.get('id')} is severity "
                        f"{defect.get('severity')} -- release must have none open")
    if not record.sign_off.get("model_owner") or not record.sign_off.get("independent_reviewer"):
        out.append("sign-off requires both a model owner and an independent reviewer")
    return out


def pending_decision_record(record_id: str) -> DecisionRecord:
    """Section 0's own stance: with no test run yet, the record is a
    template with status PENDING and no invented outcomes."""
    return DecisionRecord(
        record_id=record_id, decision="PENDING", decision_date=None, decided_by=None,
        decided_by_independent=None, model_version=None, prompt_version=None,
        schema_version=None, decoding_settings=None, confidence_weights=None,
        baseline_phase18_ref=None, suite_sizes={}, suite_versions=None,
        zero_failure_bounds={}, results={}, checklist_results={},
        open_defects=[], schema_finding_status={}, restrictions=[],
        scope_of_approval=None, rationale=None, sign_off={},
    )
