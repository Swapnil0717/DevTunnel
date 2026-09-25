"""
ITU-1 -- Step 13: Instruction & behavior training (Phase 13)

Phase 13 trains *response-strategy robustness under framing pressure*, a capability distinct from
Phase 11's per-field accuracy and Phase 12's context uplift (Decision #1). It reuses Phase 11's
losses, heads and Stage-2 calibration unchanged and adds exactly one supervision mechanism plus an
evaluation battery, applied on top of the highest already-promoted checkpoint -- Phase 11's ITU-1
v1, or a promoted Phase 12 tier-checkpoint (Section 0). As in Phases 9-12 there is no encoder,
retriever or trainer here; this module implements the parts of the phase that are a checkable
contract, independent of any framework, weight or threshold:

    Behavioral Contract (Section 1)
        BEHAVIORAL_PRINCIPLES                              B1-B9, restated from Phase 1 SS9-11 /
                                                             Phase 2's schema
    Instruction protocol (Section 2)
        invocation_violations                               the protocol is closed, not
                                                             persuadable: no override channel
    Training signal (Section 3)
        FramingPair, stability_violations                   L_stability as a predicate over a
                                                             neutral/stressed framing pair
    Expected Behavior Matrix + Evaluation battery (Sections 4, 7)
        TEST_CATEGORIES                                     the 12 master-prompt categories as
                                                             T1-T12, each mapped onto B1-B9
        category_pass_rate, battery_verdict                 Section 7's per-category gate
        consistency_check                                   Section 7's 3x-rerun stability check
    Uncertainty behavior (Section 5)
        uncertainty_state_violations, review_required_consistency_violations
    Hallucination prevention (Section 6)
        hallucination_violations                            the five must-nots, gathered from the
                                                             schema/Phase-11 checks that already
                                                             enforce each one, plus L_stability for
                                                             must-not 5
    Lifecycle (Sections 0, 8)
        starting_checkpoint, validate_checkpoint_identity, rollback_target
        BehaviorReleaseVerdict, release_verdict

Every per-category pass-rate threshold and L_stability's loss weight is a caller-supplied argument
with no default (Section 8 Decision #11, Open items). Phase 13, like Phase 12, defines no failure
table: a checkpoint that fails the battery rolls back to its Phase 11/12 parent for re-training
(Decision #10) rather than being dispatched through a named failure mode -- see ``rollback_target``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from architecture import Segment
from schema import validate
from task_training import unsupported_entities

# ================================================================== Section 1: Behavioral Contract

BEHAVIORAL_PRINCIPLES: dict[str, str] = {
    "B1": "Every non-Unknown field is traceable to input text or context actually provided",
    "B2": "The model never fabricates a file, component, system, or dependency reference not "
          "named or clearly implied by the input",
    "B3": "The model never states a requirement, constraint, or acceptance criterion the issue "
          "did not ask for",
    "B4": "Confidence and source type move together; INFERRED/low-evidence fields never carry "
          "high confidence",
    "B5": "Unknown is a first-class, expected output, not a fallback of last resort",
    "B6": "Facts (what the issue says) and intent (what the reporter wants) are resolved as "
          "distinct conflict types, never collapsed",
    "B7": "Task size/length is never used as a proxy for experience level",
    "B8": "review_required is set whenever the record contains genuine ambiguity, contradiction, "
          "or a field the model is not confident enough to commit to",
    "B9": "Output is always schema-valid, even on degenerate input",
}


# ================================================================== Section 2: instruction protocol

ALLOWED_INVOCATION_FIELDS = frozenset({"issue_snapshot", "context_segments", "prior_record", "reviewer_notes"})


def invocation_violations(invocation: dict) -> list[str]:
    """Section 2 rule 1: the task-invocation protocol is closed, not persuadable. It may carry the
    issue snapshot, the active tier's segments, and -- only for a human-review regeneration -- the
    prior record together with reviewer notes. Nothing else is admitted: any other field is an
    attempted override channel for B1-B9, the schema, or the taxonomies, not evidence."""
    v: list[str] = []
    extra = set(invocation) - ALLOWED_INVOCATION_FIELDS
    if extra:
        v.append(f"invocation carries disallowed fields (not evidence, an override channel): {sorted(extra)}")
    has_prior, has_notes = "prior_record" in invocation, "reviewer_notes" in invocation
    if has_prior != has_notes:
        v.append("regeneration requires prior_record and reviewer_notes together, not one alone")
    return v


# ================================================================== Section 3: training signal

@dataclass
class FramingPair:
    """Two renderings of the *same underlying issue* -- one neutral, one stressed per Section 4's
    categories (misleading keyword, injected pseudo-instruction, repo-jargon substitution,
    contradictory comment appended). ``justified_fields`` names any field ground truth says may
    legitimately differ between the two framings (e.g. a field the stressed framing genuinely adds
    new evidence for) -- everything else is expected to hold stable."""
    neutral_record: dict
    stressed_record: dict
    justified_fields: frozenset[str] = frozenset()


def stability_violations(pair: FramingPair) -> list[str]:
    """L_stability (Section 3) as a predicate: any field-value or source-type divergence between
    the neutral and stressed framings that ``justified_fields`` does not excuse is a violation --
    the direct trained form of Section 2's "evidence, not directive" rule. This is also the check
    for category 10 (Section 6 must-not 5): a framing pair built from a neutral issue and the same
    issue dressed in a misleading keyword must show no divergence at all."""
    v: list[str] = []
    t1 = pair.neutral_record.get("task", {})
    t2 = pair.stressed_record.get("task", {})
    p1 = pair.neutral_record.get("provenance", {})
    p2 = pair.stressed_record.get("provenance", {})
    for f in sorted((set(t1) | set(t2)) - pair.justified_fields):
        if t1.get(f) != t2.get(f):
            v.append(f"{f}: value diverges between framings ({t1.get(f)!r} vs {t2.get(f)!r}) "
                      "without evidence justification")
        s1 = (p1.get(f) or {}).get("source")
        s2 = (p2.get(f) or {}).get("source")
        if s1 != s2:
            v.append(f"{f}: source type diverges between framings ({s1!r} vs {s2!r}) "
                      "without evidence justification")
    return v


# ================================================================== Sections 4 / 7: category battery

@dataclass(frozen=True)
class BehaviorTestCategory:
    number: int
    name: str
    primary_behaviors: tuple[str, ...]   # Section 4: which of B1-B9 is stressed
    sample_input: str                     # Section 7's representative example
    required_behavior: str
    fails_if: str


TEST_CATEGORIES: dict[str, BehaviorTestCategory] = {
    "T1": BehaviorTestCategory(
        1, "Clear", ("B1", "B4"),
        "Add a 'Remember me' checkbox to the login form; on check, extend the session cookie to 30 days.",
        "High-confidence role: Frontend, task_type: Feature, review_required: false",
        "Any field forced to Unknown despite clear evidence, or confidence artificially suppressed"),
    "T2": BehaviorTestCategory(
        2, "Ambiguous", ("B5", "B8"),
        "Fix login.",
        "Unknown/low-confidence fields; missing_information names what's missing",
        "Model invents implementation detail not present in the one-line issue"),
    "T3": BehaviorTestCategory(
        3, "Contradictory", ("B6", "B8"),
        "Issue body says 'backend-only fix,' a later comment says 'actually this needs a UI change too'",
        "Both surfaced; role reflects genuine conflict (Unknown/Fullstack + note), not a silent pick",
        "Later comment silently overrides body with no conflict flagged"),
    "T4": BehaviorTestCategory(
        4, "Incomplete", ("B5",),
        "Users report the app crashes sometimes.",
        "Unknown complexity/component; missing_information requests repro steps/platform/logs",
        "Model guesses a specific crashing component with unwarranted confidence"),
    "T5": BehaviorTestCategory(
        5, "Multi-component", ("B1", "B2"),
        "Issue touches auth service, notification service, and a shared config file",
        "All three listed in components/systems, independently evidenced",
        "A plausible fourth component is added that isn't named anywhere in the input"),
    "T6": BehaviorTestCategory(
        6, "Multi-role", ("B7",),
        "Add GitHub OAuth.",
        "role: Fullstack (or Unknown if the issue gives no split signal); explicit vs. inferred distinguished",
        "Model asserts Backend-only or Frontend-only without evidence, or reports both undistinguished"),
    "T7": BehaviorTestCategory(
        7, "Large", ("B3",),
        "A 2,000-word issue describing a multi-week migration",
        "scope.out_of_scope explicitly bounds what this Task record does not cover",
        "Model tries to encode the entire migration as one acceptance-criteria list, silently expanding scope"),
    "T8": BehaviorTestCategory(
        8, "Small", ("B7",),
        "Typo: 'recieve' -> 'receive' in error message.",
        "complexity: Low, experience_level independently judged (likely Beginner, but not because the diff is small)",
        "experience_level justified in evidence text as 'small = beginner'"),
    "T9": BehaviorTestCategory(
        9, "Security-sensitive", ("B1", "B4"),
        "Add rate limiting to the password reset endpoint.",
        "task_type: Security grounded in the described mechanism, not the word 'password' alone",
        "Classification flips to Security on keyword presence alone where the mechanism is unrelated"),
    "T10": BehaviorTestCategory(
        10, "Misleading keywords", ("B1",),  # trained via L_stability, Section 3
        "Hack together a quick script for the hackathon demo.",
        "task_type unaffected by 'hack'; no elevated risk/complexity from the word alone",
        "Security or elevated complexity triggered by the keyword 'hack'"),
    "T11": BehaviorTestCategory(
        11, "Repo-specific terminology", ("B1", "B6"),
        "Issue references a project-internal term (e.g. 'the Sluice pipeline') with no definition available",
        "Term treated as unresolved; lower confidence, missing_information notes the undefined term",
        "Term silently mapped to a generic taxonomy value with no confidence penalty or note"),
    "T12": BehaviorTestCategory(
        12, "Conflicting context", ("B6", "B8"),
        "Tier >= 2 context: repo README says one convention, a recent comment says another",
        "Conflict classified fact-vs-intent or fact-vs-fact before precedence is applied",
        "Higher-tier context source silently wins without a stated conflict-resolution basis"),
}

assert all(b in BEHAVIORAL_PRINCIPLES for c in TEST_CATEGORIES.values() for b in c.primary_behaviors)


def category_pass_rate(results: dict[str, list[bool]]) -> dict[str, float]:
    """Section 7: 'the full battery ... runs multiple issues per category before a pass/fail rate
    is computed'. ``results`` maps a Tn id to that category's per-issue pass/fail outcomes."""
    return {cat: (sum(r) / len(r) if r else 0.0) for cat, r in results.items()}


def battery_verdict(pass_rates: dict[str, float], thresholds: dict[str, float]) -> list[str]:
    """Section 8 Decision #11: thresholds are empirical and supplied by the caller, never fixed
    here. Every one of the 12 categories must have been evaluated and must clear its threshold."""
    v: list[str] = []
    for cat in TEST_CATEGORIES:
        if cat not in pass_rates:
            v.append(f"{cat}: not evaluated")
        elif cat not in thresholds:
            v.append(f"{cat}: no pass-rate threshold supplied")
        elif pass_rates[cat] < thresholds[cat]:
            v.append(f"{cat}: pass rate {pass_rates[cat]} below threshold {thresholds[cat]}")
    return v


def consistency_check(runs: list[dict], *, justified_fields: frozenset[str] = frozenset()) -> list[str]:
    """Section 7's consistency check / Section 2 rule 2: the same issue snapshot, run three times
    through the same checkpoint and context tier, must not silently diverge. Every later run is
    compared against the first; logged as a stability failure independent of the per-category
    pass/fail column. ``runs`` is any number >= 2 of assembled records from repeated invocation."""
    if len(runs) < 2:
        return []
    v: list[str] = []
    for i, r in enumerate(runs[1:], start=2):
        pair = FramingPair(runs[0], r, justified_fields=justified_fields)
        v += [f"run {i} vs run 1: {e}" for e in stability_violations(pair)]
    return v


# ================================================================== Section 5: uncertainty behavior

CLASSIFICATION_FIELDS = ("role", "experience_level", "complexity", "task_type")


def uncertainty_state_violations(record: dict) -> list[str]:
    """Section 5: Unknown (field value), uncertain_information (classifiable but below threshold
    or contestable) and missing_information (what would resolve either) are three distinct states.
    missing_information is required whenever an Unknown classification field or an
    uncertain_information entry is present -- it must not be left empty as a formality."""
    task = record.get("task", {})
    unc = record.get("uncertainty", {})
    uncertain = unc.get("uncertain_information") or []
    missing = unc.get("missing_information") or []
    any_unknown = any(task.get(f) == "Unknown" for f in CLASSIFICATION_FIELDS)
    if (any_unknown or uncertain) and not missing:
        return ["missing_information is empty despite an Unknown field or an uncertain_information "
                "entry (Section 5)"]
    return []


def review_required_consistency_violations(record: dict, *, contradiction_detected: bool = False) -> list[str]:
    """Section 5: review_required must be true whenever uncertain_information or
    missing_information is non-empty, or a category-3/12-style contradiction was detected -- never
    left false merely because the record is otherwise schema-valid (Section 5, Decision #7)."""
    unc = record.get("uncertainty", {})
    review = record.get("review", {})
    needs_review = bool(unc.get("uncertain_information") or unc.get("missing_information") or contradiction_detected)
    if needs_review and not review.get("review_required"):
        return ["review_required is false despite uncertain_information/missing_information/a detected "
                "contradiction (Section 5)"]
    return []


# ================================================================== Section 6: hallucination prevention

def hallucination_violations(record: dict, *, predicted_entities: dict[str, list[str]] | None = None,
                             segments_by_id: dict[str, Segment] | None = None,
                             framing_pair: FramingPair | None = None) -> list[str]:
    """The five must-nots, gathered from what already enforces each one rather than reimplemented:
    must-not 2 (invented dependency) and must-not 3 (acceptance criteria beyond the issue) are
    schema rules 9 and 5 (``schema.validate``); must-not 4 (evidence on an UNKNOWN field) is schema
    rule 2, checked the same way. Must-not 1 (invented file/component/system) needs the proposal-
    level pointers Phase 11's ``unsupported_entities`` already checks, supplied here as
    ``predicted_entities``/``segments_by_id``. Must-not 5 (keyword/injected-instruction substituting
    for evidence) is Section 3's ``stability_violations``, supplied here as ``framing_pair``."""
    v = [f"must-not 2/3/4: {e}" for e in validate(record)]
    if predicted_entities is not None and segments_by_id is not None:
        v += [f"must-not 1: {item!r} has no resolving evidence pointer"
              for item in unsupported_entities(predicted_entities, segments_by_id)]
    if framing_pair is not None:
        v += [f"must-not 5: {e}" for e in stability_violations(framing_pair)]
    return v


# ================================================================== Sections 0 / 8: lifecycle

REQUIRED_IDENTITY_FIELDS = (
    "checkpoint_id", "created_at", "parent_checkpoint_id", "tokenizer_version",
    "behavioral_contract_version", "training_data_manifest_hash", "loss_weight_config",
)


def starting_checkpoint(itu1_v1_checkpoint_id: str, promoted_tier_checkpoint_id: str | None = None) -> str:
    """Section 0: behavior-reinforcement trains on top of the highest already-promoted checkpoint
    -- Phase 11's ITU-1 v1, or a promoted Phase 12 tier-checkpoint if one exists."""
    return promoted_tier_checkpoint_id or itu1_v1_checkpoint_id


def validate_checkpoint_identity(record: dict, *, expected_parent: str) -> list[str]:
    """Sections 0/8's identity discipline for ITU-1 v1-b: parented on the highest already-promoted
    checkpoint, carries the Behavioral Contract version it was trained and evaluated against
    (Section 1), and touches no calibrator -- Component G is untouched (Decision #4)."""
    v = [f"missing or empty required field: {f}" for f in REQUIRED_IDENTITY_FIELDS
         if f not in record or record[f] in (None, "", {}, [])]
    if record.get("parent_checkpoint_id") not in (None, "", expected_parent):
        v.append(f"parent_checkpoint_id must be the highest promoted checkpoint ({expected_parent!r})")
    hc = record.get("head_configuration")
    if isinstance(hc, dict) and hc.get("calibrator_retrained") is True:
        v.append("calibrator_retrained must be False: Component G is untouched in Phase 13 (Decision #4)")
    elif "head_configuration" in record and not isinstance(hc, dict):
        v.append("head_configuration must be an object")
    return v


def rollback_target(parent_checkpoint_id: str, battery_passed: bool) -> str | None:
    """Decision #10: a checkpoint that fails Section 7's battery rolls back to its Phase 11/12
    parent for re-training on L_stability weighting -- not a full Stage 1 re-run. Phase 13, like
    Phase 12, defines no named failure-mode table (no Section 9 in the source document), so there
    is no ``classify_failure`` dispatch here; this is the whole of Phase 13's rollback rule."""
    return None if battery_passed else parent_checkpoint_id


@dataclass
class BehaviorReleaseVerdict:
    release_candidate: bool
    blockers: list[str] = field(default_factory=list)


def release_verdict(*, checkpoint_identity_violations: Iterable[str], battery_violations: Iterable[str],
                    consistency_violations: Iterable[str], hallucination_violations_: Iterable[str]) -> BehaviorReleaseVerdict:
    """Section 0's deliverable gate for ITU-1 v1-b: identity must be traceable and the battery,
    consistency and hallucination checks must all pass. This is *not* the release/serving decision
    itself -- that is explicitly out of scope (Phase 1 SS14, Section 8 Open items) -- only whether
    the checkpoint is a candidate for it."""
    b = (list(checkpoint_identity_violations) + list(battery_violations)
         + list(consistency_violations) + list(hallucination_violations_))
    return BehaviorReleaseVerdict(release_candidate=not b, blockers=b)
