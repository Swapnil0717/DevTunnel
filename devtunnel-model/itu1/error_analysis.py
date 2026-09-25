"""
ITU-1 -- Phase 16: Error Analysis

Answers the question Phase 14/15 deliberately leave open: an EvaluationRun or
adversarial result tells you a record failed and on which metric; this module
determines *why* and routes that "why" to a corrective action.

Does NOT:
  - recompute or redefine any Phase 14 metric/benchmark/gate (consumes
    failing records, does not re-score them)
  - redefine Phase 15's failure_mode_targeted vocabulary (that classifies
    test cases by what they target; this classifies observed failures by
    why they happened -- Section 1)
  - perform the corrective action itself (Section 5 routes; Phase 6/8/10-13/
    12 execute)
  - decide release or serving (Section 7's re-entry gate can block
    promotion; it does not authorize release -- Phase 1 Section 14)

No third-party dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

import adversarial as adv

# ---------------------------------------------------------------------------
# Section 1 -- Error taxonomy
# ---------------------------------------------------------------------------

ERROR_TYPES = (
    "Data quality", "Incorrect annotation", "Insufficient examples",
    "Label ambiguity", "Model misunderstanding", "Context failure",
    "Retrieval failure", "Reasoning failure", "Schema failure",
    "Hallucination", "Confidence failure", "Technical knowledge gap",
    "Context conflict",
)

FAMILIES = (
    "Data problem", "Annotation problem", "Architecture problem",
    "Training problem", "Context problem", "Inference problem",
)

SEVERITY_VALUES = ("Critical", "High", "Medium", "Low")

# Section 1's table: each error_type's *default* primary family. Hallucination
# defaults to Inference problem and is reclassified to Training problem only
# via the systematic check (Section 3.4) -- never assigned Training directly
# from this table.
DEFAULT_FAMILY_FOR_ERROR_TYPE = {
    "Data quality": "Data problem",
    "Incorrect annotation": "Annotation problem",
    "Insufficient examples": "Data problem",
    "Label ambiguity": "Annotation problem",
    "Model misunderstanding": "Training problem",
    "Context failure": "Context problem",
    "Retrieval failure": "Context problem",
    "Reasoning failure": "Inference problem",
    "Schema failure": "Architecture problem",
    "Hallucination": "Inference problem",
    "Confidence failure": "Training problem",
    "Technical knowledge gap": "Training problem",
    "Context conflict": "Context problem",
}

ACTION_TYPES = (
    "data_collection", "re_annotation", "schema_clarification",
    "dataset_rebalance", "architecture_change", "retraining_target",
    "context_pipeline_fix", "no_action_expected_behavior", "review_gate_fix",
)

CORRECTIVE_ACTION_STATUSES = ("open", "in_progress", "resolved", "wont_fix", "deferred")

ADJUDICATION_CONFIDENCE_VALUES = (
    "single_annotator", "adjudicated_agreement", "adjudicated_disagreement",
)

BENCHMARK_SOURCES = ("Test", "Hard-case", "Adversarial", "Regression", "Context-tier", "Human-review")
DETECTED_BY_VALUES = ("automated_metric", "automated_test", "human_reviewer")
DIAGNOSED_BY_VALUES = ("automated_diagnostic", "human_reviewer")
TARGET_DATASETS = ("Training", "Regression", "Hard-case", "Adversarial", "none")


def relationship_to_failure_mode_targeted(pairs: Iterable[tuple[str, str]]) -> dict:
    """Cross-tab of Phase 15's failure_mode_targeted vs this phase's
    error_type (Section 1's 'Relationship' note). Neither substitutes for
    the other; a single probe type can surface as different error types."""
    out: dict[str, dict[str, int]] = {}
    for mode, error_type in pairs:
        out.setdefault(mode, {})
        out[mode][error_type] = out[mode].get(error_type, 0) + 1
    return out


# ---------------------------------------------------------------------------
# Section 2 -- FailureRecord schema
# ---------------------------------------------------------------------------

_TOP_REQUIRED = (
    "failure_id", "created_at", "source", "input", "ground_truth",
    "model_output", "expected_output", "error_type", "severity",
    "root_cause", "corrective_action", "training_data_disposition",
)


def validate_failure_record(record: dict) -> list[str]:
    """Checkable subset of the FailureRecord JSON Schema (Section 2)."""
    errors: list[str] = []
    if not isinstance(record, dict):
        return ["failure record must be an object"]

    for f in _TOP_REQUIRED:
        if f not in record:
            errors.append(f"missing required field: {f}")
    if errors:
        return errors  # further checks assume the shape is present

    src = record["source"]
    for f in ("task_id", "benchmark", "checkpoint", "detected_by"):
        if f not in src:
            errors.append(f"source missing required field: {f}")
    if src.get("benchmark") not in BENCHMARK_SOURCES:
        errors.append(f"source.benchmark invalid: {src.get('benchmark')!r}")
    if src.get("detected_by") not in DETECTED_BY_VALUES:
        errors.append(f"source.detected_by invalid: {src.get('detected_by')!r}")

    gt = record["ground_truth"]
    for f in ("field", "value", "adjudication_confidence"):
        if f not in gt:
            errors.append(f"ground_truth missing required field: {f}")
    if gt.get("adjudication_confidence") not in ADJUDICATION_CONFIDENCE_VALUES:
        errors.append(
            f"ground_truth.adjudication_confidence invalid: {gt.get('adjudication_confidence')!r}"
        )

    eo = record["expected_output"]
    for f in ("field", "acceptable_values"):
        if f not in eo:
            errors.append(f"expected_output missing required field: {f}")
    if "acceptable_values" in eo and not isinstance(eo["acceptable_values"], list):
        errors.append("expected_output.acceptable_values must be a list")

    if record["error_type"] not in ERROR_TYPES:
        errors.append(f"error_type invalid: {record['error_type']!r}")
    for sec in record.get("secondary_error_types", []):
        if sec not in ERROR_TYPES:
            errors.append(f"secondary_error_types contains invalid value: {sec!r}")

    if record["severity"] not in SEVERITY_VALUES:
        errors.append(f"severity invalid: {record['severity']!r}")

    rc = record["root_cause"]
    for f in ("family", "statement", "diagnosed_by", "confidence"):
        if f not in rc:
            errors.append(f"root_cause missing required field: {f}")
    if rc.get("family") not in FAMILIES:
        errors.append(f"root_cause.family invalid: {rc.get('family')!r}")
    if rc.get("diagnosed_by") not in DIAGNOSED_BY_VALUES:
        errors.append(f"root_cause.diagnosed_by invalid: {rc.get('diagnosed_by')!r}")
    conf = rc.get("confidence")
    if not isinstance(conf, (int, float)) or not (0.0 <= conf <= 1.0):
        errors.append("root_cause.confidence must be a number in [0, 1]")

    ca = record["corrective_action"]
    for f in ("action_type", "owning_phase", "status"):
        if f not in ca:
            errors.append(f"corrective_action missing required field: {f}")
    if ca.get("action_type") not in ACTION_TYPES:
        errors.append(f"corrective_action.action_type invalid: {ca.get('action_type')!r}")
    if ca.get("status") not in CORRECTIVE_ACTION_STATUSES:
        errors.append(f"corrective_action.status invalid: {ca.get('status')!r}")

    tdd = record["training_data_disposition"]
    for f in ("promote", "target_dataset"):
        if f not in tdd:
            errors.append(f"training_data_disposition missing required field: {f}")
    if tdd.get("target_dataset") not in TARGET_DATASETS:
        errors.append(f"training_data_disposition.target_dataset invalid: {tdd.get('target_dataset')!r}")
    if "promote" in tdd and not isinstance(tdd["promote"], bool):
        errors.append("training_data_disposition.promote must be a boolean")

    return errors


def label_ambiguity_signal(record: dict) -> bool:
    """ground_truth.value not among expected_output.acceptable_values, or
    more than one acceptable value -- structural Label-ambiguity signal
    (Section 2's rationale for keeping the two fields separate)."""
    gt = record.get("ground_truth", {})
    eo = record.get("expected_output", {})
    acceptable = eo.get("acceptable_values", [])
    if len(acceptable) > 1:
        return True
    return bool(acceptable) and gt.get("value") not in acceptable


# ---------------------------------------------------------------------------
# Section 3.1 -- the six-way family distinction (documentation table, kept
# as data so callers/tests can enumerate it)
# ---------------------------------------------------------------------------

FAMILY_QUESTIONS = {
    "Data problem": "Was the input or the training distribution defective?",
    "Annotation problem": "Is the ground truth itself wrong or contested?",
    "Architecture problem": "Can the model, as structured, represent this input/output relationship at all?",
    "Training problem": "Did the model see enough of the right signal during training to generalize this pattern?",
    "Context problem": "Was the right information assembled and presented to the model at inference time?",
    "Inference problem": "Given correct input and correct context, did the reasoning chain itself break?",
}


# ---------------------------------------------------------------------------
# Section 3.2 -- fixed-order diagnostic elimination sequence
# ---------------------------------------------------------------------------

@dataclass
class Diagnosis:
    error_type: str | None
    family: str | None
    step: int
    requires_human: bool = False
    ambiguous_between: tuple[str, ...] = ()
    note: str = ""


def diagnose(
    *,
    schema_violations: list[str] | None = None,
    input_integrity_violations: list[str] | None = None,
    readjudication: dict | None = None,
    evidence_check: dict | None = None,
    distributional: dict | None = None,
) -> Diagnosis:
    """Section 3.2's six-step elimination sequence. Each keyword arg is the
    pre-computed signal for that step; steps are checked in fixed order and
    the sequence stops at the first that fires.

    readjudication: {"outcome": "overturned" | "split" | "confirmed"}
    evidence_check: {
        "cites_absent_content": bool,       # Hallucination
        "cites_subset_rest_present": bool,  # Context failure
        "never_in_assembled_context": bool, # Retrieval failure
        "accurate_but_conclusion_broken": bool,  # Reasoning failure
        "unresolved_source_conflict": bool, # Context conflict
    }
    distributional: {
        "below_representation_floor": bool,
        "is_knowledge_gap": bool,      # discriminates within "below floor"
        "confidence_miscalibrated": bool,  # discriminates within "above floor"
    }
    """
    # Step 1: schema/structural check
    if schema_violations:
        return Diagnosis("Schema failure", "Architecture problem", step=1,
                          note="H1/H3/H4/H5 rejected the record; sequence stops here.")

    # Step 2: input integrity check
    if input_integrity_violations:
        return Diagnosis("Data quality", "Data problem", step=2)

    # Step 3: re-adjudication check (mandatory before any model-side attribution)
    if readjudication is not None:
        outcome = readjudication.get("outcome")
        if outcome == "overturned":
            return Diagnosis("Incorrect annotation", "Annotation problem", step=3)
        if outcome == "split":
            return Diagnosis("Label ambiguity", "Annotation problem", step=3)
        # "confirmed" falls through to step 4

    # Step 4: evidence-trail check (only if steps 1-3 pass)
    if evidence_check is not None:
        if evidence_check.get("cites_absent_content"):
            return Diagnosis("Hallucination", "Inference problem", step=4)
        if evidence_check.get("cites_subset_rest_present"):
            return Diagnosis("Context failure", "Context problem", step=4)
        if evidence_check.get("never_in_assembled_context"):
            return Diagnosis("Retrieval failure", "Context problem", step=4)
        if evidence_check.get("unresolved_source_conflict"):
            return Diagnosis("Context conflict", "Context problem", step=4)
        if evidence_check.get("accurate_but_conclusion_broken"):
            return Diagnosis("Reasoning failure", "Inference problem", step=4)

    # Step 5: distributional check (surviving cases: correct evidence, wrong output)
    if distributional is not None:
        below_floor = distributional.get("below_representation_floor")
        if below_floor:
            if distributional.get("is_knowledge_gap"):
                return Diagnosis("Technical knowledge gap", "Training problem", step=5)
            return Diagnosis("Insufficient examples", "Data problem", step=5)
        elif below_floor is False:
            if distributional.get("confidence_miscalibrated"):
                return Diagnosis("Confidence failure", "Training problem", step=5)
            return Diagnosis("Model misunderstanding", "Training problem", step=5)

    # Step 6: nothing resolved -- human confirmation required
    return Diagnosis(None, None, step=6, requires_human=True,
                      note="Ambiguous between families; route to human review "
                           "rather than auto-resolve (Section 3.2 step 6).")


# ---------------------------------------------------------------------------
# Section 3.3 -- confusable-pair guardrails
# ---------------------------------------------------------------------------

CONFUSABLE_PAIRS = (
    {
        "pair": ("Insufficient examples", "Architecture problem"),
        "cheaper_wrong_default": "More data would fix it",
        "discriminator": "Check whether a related, better-represented pattern of "
                          "comparable structural complexity succeeds; if related "
                          "patterns also fail regardless of representation, suspect "
                          "architecture, not data volume.",
    },
    {
        "pair": ("Context failure", "Reasoning failure"),
        "cheaper_wrong_default": "The model just reasoned wrong",
        "discriminator": "Check provenance.evidence completeness first (Section "
                          "3.2 step 4) -- a model cannot be charged with a "
                          "reasoning failure over evidence it never cited.",
    },
    {
        "pair": ("Hallucination", "Technical knowledge gap"),
        "cheaper_wrong_default": "The model made it up",
        "discriminator": "A hallucination invents content absent from input; a "
                          "knowledge gap misapplies content that is present.",
    },
    {
        "pair": ("Confidence failure", "Label ambiguity"),
        "cheaper_wrong_default": "The model is miscalibrated",
        "discriminator": "Check expected_output.acceptable_values -- if ground "
                          "truth itself is contested, low model confidence may be "
                          "correct behavior being miscounted as a failure.",
    },
)


def insufficient_examples_or_architecture(related_pattern_also_fails: bool) -> str:
    """Guardrail 1: a related, better-represented pattern also failing points
    to Architecture problem, not Insufficient examples (Data problem)."""
    return "Architecture problem" if related_pattern_also_fails else "Data problem"


def hallucination_or_knowledge_gap(content_present_in_input: bool) -> str:
    """Guardrail 3: content present but misapplied is a knowledge gap;
    content absent entirely is a hallucination."""
    return "Technical knowledge gap" if content_present_in_input else "Hallucination"


def confidence_or_label_ambiguity(acceptable_values: list) -> str:
    """Guardrail 4: contested ground truth means low confidence may be
    correct behavior, not a Confidence failure."""
    return "Label ambiguity" if len(acceptable_values) > 1 else "Confidence failure"


# ---------------------------------------------------------------------------
# Section 3.4 -- systematic vs. isolated attribution
# ---------------------------------------------------------------------------

# Only these families are eligible for cluster-level reclassification; a
# single instance never triggers it (mirrors Phase 15 AT9's discipline).
_RECLASSIFIABLE_FAMILIES = ("Inference problem",)


def systematic_reclassification(
    records: list[dict],
    *,
    pattern_key,
    min_cluster: int = 2,
    architecture_signal: bool = False,
) -> dict[str, str]:
    """Groups FailureRecords sharing pattern_key(record) among those
    currently attributed to an Inference problem; a cluster of size
    >= min_cluster is reassigned to Training problem (or Architecture
    problem if architecture_signal is set for that pattern), matching the
    root cause to the pattern rather than the single instance.

    Returns {failure_id: new_family} for every record that was reclassified.
    Records outside a qualifying cluster are left untouched (absent from
    the returned mapping)."""
    groups: dict[Any, list[dict]] = {}
    for rec in records:
        family = rec.get("root_cause", {}).get("family")
        if family not in _RECLASSIFIABLE_FAMILIES:
            continue
        key = pattern_key(rec)
        groups.setdefault(key, []).append(rec)

    reassignment: dict[str, str] = {}
    for key, cluster in groups.items():
        if len(cluster) < min_cluster:
            continue
        new_family = "Architecture problem" if architecture_signal else "Training problem"
        for rec in cluster:
            reassignment[rec["failure_id"]] = new_family
    return reassignment


def apply_systematic_reclassification(records: list[dict], reassignment: dict[str, str]) -> list[dict]:
    """Applies systematic_reclassification's output; the evidence trail is
    unchanged, only root_cause.family. Returns new record dicts (does not
    mutate the input)."""
    out = []
    for rec in records:
        if rec["failure_id"] in reassignment:
            rec = dict(rec)
            rc = dict(rec["root_cause"])
            rc["family"] = reassignment[rec["failure_id"]]
            rec["root_cause"] = rc
        out.append(rec)
    return out


# ---------------------------------------------------------------------------
# Section 4 -- severity model
# ---------------------------------------------------------------------------

# Phase 1 Section 9's six hard failure criteria, restated as labels only
# (the criteria themselves are owned by Phase 1; this module does not
# redefine them, it just names which one a Critical case violates).
HARD_FAILURE_CRITERIA = (
    "fabricated_grounding",
    "unwarranted_confidence_on_guess",
    "experience_complexity_collapse",
    "silent_non_abstention_on_ambiguity",
    "invented_technology_or_component",
    "malformed_output",
)


def excluded_from_failure_corpus(model_returned_unknown: bool, input_insufficient: bool) -> bool:
    """Section 4: correctly abstaining on genuinely insufficient input is the
    system working as designed (Phase 1 Section 10), not a failure at all --
    such cases never become a FailureRecord."""
    return model_returned_unknown and input_insufficient


def assign_severity(
    *,
    hard_failure_criterion: str | None = None,
    systematic_hard_gated_metric: bool = False,
    high_impact_field_wrong: bool = False,
    context_conflict_resolved_silently_no_fabrication: bool = False,
    weak_not_fabricated_evidence: bool = False,
    underspecified_but_correct: bool = False,
    confidence_miscalibration_within_tolerance: bool = False,
    cosmetic_or_stylistic: bool = False,
    unknown_correctly_returned_verbose_missing_info: bool = False,
) -> str:
    """Section 4: severity is independent of error_type/family. Checked
    Critical -> High -> Medium -> Low; any qualifying criterion at a level
    is sufficient."""
    if hard_failure_criterion is not None or systematic_hard_gated_metric:
        return "Critical"
    if high_impact_field_wrong or context_conflict_resolved_silently_no_fabrication:
        return "High"
    if (weak_not_fabricated_evidence or underspecified_but_correct
            or confidence_miscalibration_within_tolerance):
        return "Medium"
    if cosmetic_or_stylistic or unknown_correctly_returned_verbose_missing_info:
        return "Low"
    return "Low"


# ---------------------------------------------------------------------------
# Section 5 -- correction workflow
# ---------------------------------------------------------------------------

ROUTING_TABLE = {
    "Data problem": {
        "typical_error_types": ("Data quality", "Insufficient examples"),
        "owning_phase": "Phase 4/5/7",
        "corrective_action": "Source additional examples for the under-represented "
                              "pattern; fix/discard the defective input; rebalance "
                              "the Training split (Phase 7 Section 3).",
        "retraining_required": "yes_once_rebalanced",
    },
    "Annotation problem": {
        "typical_error_types": ("Incorrect annotation", "Label ambiguity"),
        "owning_phase": "Phase 6",
        "corrective_action": "Re-adjudicate with a fresh, blind reviewer pool; if "
                              "genuinely ambiguous, consider a Phase 2 schema "
                              "clarification (a documented tie-break rule).",
        "retraining_required": "no_ground_truth_correction_only",
    },
    "Architecture problem": {
        "typical_error_types": ("Schema failure",),
        "owning_phase": "Phase 8",
        "corrective_action": "Structural change (context window, output "
                              "representation, validator logic).",
        "retraining_required": "yes_new_architecture_variant",
    },
    "Training problem": {
        "typical_error_types": ("Model misunderstanding", "Confidence failure",
                                 "Technical knowledge gap"),
        "owning_phase": "Phase 10-13",
        "corrective_action": "Targeted curriculum change, additional fine-tuning "
                              "examples, calibration-specific training pass "
                              "(Phase 11 Section 6.6).",
        "retraining_required": "yes",
    },
    "Context problem": {
        "typical_error_types": ("Context failure", "Retrieval failure",
                                 "Context conflict"),
        "owning_phase": "Phase 12",
        "corrective_action": "Fix retrieval/assembly logic; add a "
                              "conflict-detection check that forces "
                              "review_required: true on cross-source disagreement.",
        "retraining_required": "sometimes_confirm_via_rerun",
    },
    "Inference problem": {
        "typical_error_types": ("Reasoning failure", "Hallucination"),
        "owning_phase": "Phase 11/13",
        "corrective_action": "If isolated: no dataset action, monitor. If it "
                              "recurs, reclassify per Section 3.4 and route as "
                              "Training problem instead.",
        "retraining_required": "only_if_reclassified_systematic",
    },
}


def route_correction(family: str) -> dict:
    if family not in ROUTING_TABLE:
        raise ValueError(f"unknown root-cause family: {family!r}")
    return ROUTING_TABLE[family]


def grader_ground_truth_mismatch_disposition(
    *, model_returned_unknown: bool, ground_truth_resolves_value: bool,
    input_supports_value: bool,
) -> dict | None:
    """Section 5's no_action_expected_behavior disposition: the model
    correctly abstained but the automated grader scored it wrong because
    ground truth resolves a value the input doesn't actually support. The
    correction is fixing the grader/ground-truth, never the model."""
    if model_returned_unknown and ground_truth_resolves_value and not input_supports_value:
        return {
            "family": "Annotation problem",
            "action_type": "no_action_expected_behavior",
            "note": "Model's Unknown was correct; ground truth over-resolves "
                    "beyond what the input supports.",
        }
    return None


def training_data_disposition(
    family: str, *, corrected_and_confirmed: bool, previously_passing_pattern: bool = False,
) -> dict:
    """A resolved FailureRecord whose root cause is Data/Annotation/Training,
    once its corrected version is confirmed correct, is a promotion
    candidate: Regression if a previously-passing pattern broke, Training
    if it's a genuinely new pattern. Everything else: no promotion."""
    if not corrected_and_confirmed or family not in (
        "Data problem", "Annotation problem", "Training problem",
    ):
        return {"promote": False, "target_dataset": "none"}
    target = "Regression" if previously_passing_pattern else "Training"
    return {"promote": True, "target_dataset": target}


def hard_case_or_adversarial_promotion_allowed(
    case: "adv.AdversarialTestCase", ex: dict, *, taxonomy_group: str,
) -> list[str]:
    """Hard-case/Adversarial promotion additionally requires Phase 15's HT5
    construction-quality gate rather than being granted automatically by
    this phase (Decision #9). Non-empty return blocks promotion."""
    return adv.ht5_construction_quality_violations(case, ex, taxonomy_group=taxonomy_group)


# ---------------------------------------------------------------------------
# Section 6 -- error dashboard / report structure
# ---------------------------------------------------------------------------

def _crosstab(records: list[dict], key_a, key_b) -> dict:
    out: dict = {}
    for rec in records:
        a = key_a(rec)
        b = key_b(rec)
        out.setdefault(a, {})
        out[a][b] = out[a].get(b, 0) + 1
    return out


def error_type_x_severity(records: list[dict]) -> dict:
    return _crosstab(records, lambda r: r["error_type"], lambda r: r["severity"])


def error_type_x_family(records: list[dict]) -> dict:
    return _crosstab(records, lambda r: r["error_type"], lambda r: r["root_cause"]["family"])


def family_x_owning_phase(records: list[dict]) -> dict:
    return _crosstab(records, lambda r: r["root_cause"]["family"],
                      lambda r: r["corrective_action"]["owning_phase"])


def error_type_x_axis(records: list[dict], axis_key) -> dict:
    """Concentration view: error_type x an arbitrary Phase 14 reporting axis
    (role, experience, complexity, task_type, technology, repo type,
    context tier). axis_key(record) -> the axis value for that record."""
    return _crosstab(records, lambda r: r["error_type"], axis_key)


def corrective_action_status_by_phase(records: list[dict]) -> dict:
    """Open/in-progress/resolved/wont-fix/deferred per owning_phase --
    the operational view of Section 7's loop closing."""
    return _crosstab(records, lambda r: r["corrective_action"]["owning_phase"],
                      lambda r: r["corrective_action"]["status"])


def training_data_disposition_summary(records: list[dict]) -> dict:
    return _crosstab(records, lambda r: r["training_data_disposition"]["promote"],
                      lambda r: r["training_data_disposition"]["target_dataset"])


def labeled_root_cause_counts(records: list[dict]) -> dict:
    """Automated-diagnostic and human-confirmed root causes reported in
    separate, labeled columns, never merged (reused from Phase 14 Section
    10's discipline) -- an automated count is a throughput metric, not a
    validated-finding count, until a human-confirmation rate is reported
    alongside it."""
    automated = sum(1 for r in records if r["root_cause"]["diagnosed_by"] == "automated_diagnostic")
    human = sum(1 for r in records if r["root_cause"]["diagnosed_by"] == "human_reviewer")
    return {"automated_diagnostic": automated, "human_reviewer": human}


@dataclass
class ErrorAnalysisReport:
    records: list[dict]
    error_type_severity: dict = field(default_factory=dict)
    error_type_family: dict = field(default_factory=dict)
    family_owning_phase: dict = field(default_factory=dict)
    action_status_by_phase: dict = field(default_factory=dict)
    training_data_disposition: dict = field(default_factory=dict)
    root_cause_counts: dict = field(default_factory=dict)


def build_report(records: list[dict]) -> ErrorAnalysisReport:
    for rec in records:
        violations = validate_failure_record(rec)
        if violations:
            raise ValueError(f"malformed FailureRecord {rec.get('failure_id')}: {violations}")
    return ErrorAnalysisReport(
        records=records,
        error_type_severity=error_type_x_severity(records),
        error_type_family=error_type_x_family(records),
        family_owning_phase=family_x_owning_phase(records),
        action_status_by_phase=corrective_action_status_by_phase(records),
        training_data_disposition=training_data_disposition_summary(records),
        root_cause_counts=labeled_root_cause_counts(records),
    )


def malformed_error_report_violations(report: ErrorAnalysisReport) -> list[str]:
    """Section 6: 'What the dashboard explicitly does not produce' -- no
    single aggregate error rate or health score for a checkpoint."""
    errors: list[str] = []
    for banned in ("error_rate", "health_score", "overall_score", "overall_error_rate"):
        if hasattr(report, banned):
            errors.append(f"report must not carry an aggregate '{banned}' field")
    return errors


# ---------------------------------------------------------------------------
# Section 7 -- feedback loop / re-entry gate
# ---------------------------------------------------------------------------

def mark_resolved(
    action: dict, *, reverified_pass: bool = False, reannotation_confirmed: bool = False,
) -> dict:
    """A corrective action is 'resolved' only once the specific
    FailureRecord(s) that motivated it are re-run through Phase 14/15 and
    pass, or -- for Annotation-problem corrections -- once re-adjudication
    is independently confirmed. It is never marked resolved on the owning
    phase's own say-so (Decision #8)."""
    action = dict(action)
    if reverified_pass or reannotation_confirmed:
        action["status"] = "resolved"
    elif action.get("status") == "resolved":
        # Someone tried to self-report resolution without verification.
        action["status"] = "in_progress"
    return action


def regression_protection_reused() -> str:
    """Documents Section 7's regression-protection claim: any FailureRecord
    promoted into Phase 7's Regression dataset is re-checked on every
    subsequent EvaluationRun by Phase 7's own existing mechanism (dataset.py
    build_datasets / check_leakage), not re-implemented here."""
    return ("Regression protection is Phase 7's existing Regression dataset "
            "mechanism (dataset.py); Phase 16 promotes into it (Section 5) "
            "but does not re-check it.")
