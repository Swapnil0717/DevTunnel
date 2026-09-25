# ITU-1 — Issue-to-Task Understanding: data pipeline, validators, and a conceptual-architecture skeleton

Built step by step from `model.md` (the 20-phase spec, all 20 phases now covered). This package is
pure Python standard library — nothing to install.

**Read the "Training" section before expecting a trained model: there is no model in here yet.**

## Status

| Step | File(s) | Spec | What it does |
|---|---|---|---|
| 1 | `schema.py` | Phase 2 | Task Understanding Record shape + validation rules (1–3, 5, 7–9, 12) |
| 2 | `derived.py` | Phase 2 §3–4 | Computes overall confidence, uncertainty rollups, review flag; rules 6, 10, 11 |
| 3 | `example.py` | Phase 3 | `TrainingExample` format; context-tier, leakage and label-quality checks |
| 4 | `intake.py`, `sensitive.py` | Phase 4 | `CollectedRecord`, lineage log, and every collection gate that needs no network |
| 5 | `clean.py` | Phase 5 | Cleaning: parsing, repair, redaction, normalization, refined dedup, leakage, gates |
| 6 | `annotation.py` | Phase 6 | `annotation_meta` schema, inter-annotator agreement, adjudication, QA checks, ground-truth gate |
| 7 | `dataset.py` | Phase 7 | Six mutually exclusive datasets, deterministic repo-level split, L1–L7 leakage gates, statistics, versioning, gated release |
| 8 | `architecture.py` | Phase 8 | The deterministic H layer (assembly, grounding checks, rule engine, derivation, degradation lattice) plus the A1/A2 segmenter/gate and the C–G proposal contract, wired into a testable `understand()` pipeline |
| 9 | `pretrain.py` | Phase 9 | Tokenizer offset round-trip gate, corpus contamination/license filtering against Phase 7's `repo_split`, staged checkpoint lifecycle, retention/rollback, failure dispatch |
| 10 | `domain_training.py` | Phase 10 | Same machinery reused with Phase 10's A–D stage names: widened PR-resolving-text exclusion, concept-coverage gate, relation-probe overfit gate, Stage-D "not automatically superior" deliverable rule, its own failure table |
| 11 | `task_training.py` | Phase 11 | The checkable contract around task-specific training: two-stage identity/lineage/retention, run-config rules (joint C–F, lower encoder LR, frozen-encoder G-only Stage 2), Tier-1/Training-only data selection, metadata dropout, length-decorrelation audit, L_consistency/L_source/L_unsupported as predicates, per-field/per-mode/per-cell evaluation gates, one-shot Test log validation, release verdict, its own failure table |
| 12 | `context_training.py` | Phase 12 | Tier-by-tier activation of Context Tiers 2–7: tier map and Level→Tier mapping, activation/ordering/blocking rules (Tier 6 blocked), retrieval and A4 checks, logged ranking and per-type budgets, conflict resolution, multi-ceiling grounding degradation, tier-appropriate-reference scoring, the five-part advance rule, per-tier one-shot Test log |
| 13 | `instruction_training.py` | Phase 13 | The Behavioral Contract (B1–B9); the closed task-invocation protocol; `L_stability` as a predicate over a neutral/stressed framing pair; the 12 master-prompt categories as a data-driven battery with per-category pass rate and gate; the 3×-rerun consistency check; the three-way Unknown/uncertain/missing disambiguation and `review_required` consistency; the five hallucination-prevention must-nots (reusing Phase 2/11's own checks); checkpoint identity, rollback and release verdict for ITU-1 v1-b |
| 14 | `evaluation.py` | Phase 14 | The consolidated Evaluation Framework: L0 structural gate (reuses schema/derived), L1 classification reports scored against Phase 12's tier-appropriate reference, cross-field agreement + re-run stability, the five-way grounding taxonomy mapped onto production `sourceType`, hallucination rate broken out by type (never one score), calibration curves/ECE/abstention precision-recall, benchmark-scope checks (Section 3's six benchmarks), stratified human-eval sampling + agreement + escalation, the five-point context-tier ladder, the seven-axis reporting cube with a malformed-report check, and an acceptance verdict (L0 hard 100%, hallucination hard ceilings, regression reappearance blocks, everything else empirical/per-cell) |
| 15 | `adversarial.py` | Phase 15 | The Adversarial Test Framework: six taxonomy groups mapped to Phase 1 §9 failure criteria; the `failure_mode_targeted` registry closing Phase 7 D13 (asserted to match `dataset.FAILURE_MODES`), each with a mechanical pass-check where one is possible; the `AdversarialTestCase` schema (an additive layer over Phase 7's `DatasetRecord`, no seventh dataset) plus construction-rule checks (bait zero-signal, Group B submode separation, bait-only-signal routing, compounding-share cap); the eight expected-behavior dimensions; the eight hard-confusable pairs with per-pair minimums and a chance-or-worse collapse check; automated tests AT1–AT9; the HT1–HT5 human-review test definitions and HT5's construction-quality gate; and a failure-threshold verdict (AT1/AT2/AT7 and AT3's ordering rule hard, the rest empirical/per-cell) |
| 16 | `error_analysis.py` | Phase 16 | The Error Analysis System: the 13-value `error_type` taxonomy mapped to 6 root-cause families; the `FailureRecord` schema (extends, doesn't duplicate, the Phase 2 record); the six-step fixed-order diagnostic elimination sequence (schema → input integrity → re-adjudication → evidence trail → distributional check → human confirmation); the four confusable-pair guardrails; systematic-vs-isolated cluster reclassification (mirrors Phase 15 AT9); the severity model (independent of error_type/family) with the correct-abstention exclusion; the `(error_type, family, severity)` correction-routing table plus the `no_action_expected_behavior` grader-mismatch disposition; the error dashboard (extends Phase 14's reporting cube, refuses a single aggregate score); and the Section 7 re-entry gate (`resolved` only on re-verification, never self-report) |
| 17 | `improvement.py` | Phase 17 | The Controlled Improvement Cycle: the nine-way change-type classification with a default-to-broad blast-radius rule for architecture/training-objective/schema changes; the 9-state improvement lifecycle as a strict, auditable state machine (no skipped state, no re-entry into a later state without restarting from `proposed`); Section 3's baseline-selection and five-required-benchmark coverage rule; the ten-dimension regression methodology with Section 4.1's bounded, severity-weighted, single-non-targeted-dimension tolerance (Hallucination hard-excluded) and Section 4.2's anti-cherry-picking completeness check; the Section 5 acceptance checklist (seven joint criteria) as a separate gate from the two-criteria release verdict (independent sign-off + rollback plan); the four Section 6 rollback triggers, independent-confirmation rule, and the FailureRecord-then-Regression-dataset rollback procedure; and the `ImprovementCandidate` experiment-tracking record with its own malformed-report check |
| 18 | `versioning.py` | Phase 18 | The Versioning Architecture, Model Registry, Permanent Benchmark and Release Record: `name@semver+hash12` reference format; the Section 2.2 bump table (highest trigger wins, weights-changed floors at MINOR, PATCH needs a passing equivalence run); the `ModelVersionRecord` shape plus the three most-faked fields (derived-not-authored limitations, non-vacuous regressions, evidence-gated supported context); the status lifecycle as a strict forward graph with Phase-17-authority gating; dataset-layer additions (annotation-version histogram, Regression monotonicity); the schema cross-line ripple table; the Section 4.4 generation stamp (Rules 13–15); benchmark-edition bump rules; the `ExposureLedger` (open/gate/sealed tiers, burn accounting, one-gated-run-per-partition); evalsuite versioning; the BC1/BC2/BC4/BC8/BC9 contamination tests plus taint propagation along lineage; the four reproducibility levels and repro-manifest completeness; and `ReleaseRecord` completeness (every field resolvable except the one deferrable rollback field) |
| 19 | `production_readiness.py` | Phase 19 | The release-decision layer on top of everything above: the 16-item production-readiness checklist ([B]locking vs Major); Section 2.1 per-capability acceptance gated on the CI lower bound (with complexity's 3-part joint rule); the 9 cross-field invariants (1/2/6/7 reuse `schema.validate`, 3/4/5/8 reuse `derived.validate_derived`, 9 — `task_id`/`snapshot_fetched_at` — is new); Section 2.3 calibration (ECE ceilings, bin monotonicity, high-confidence error rate, reusing `evaluation.py`'s ECE machinery); the S0–S3 release-blocking severity scale and Section 3.2's release-gate table, plus the rule-of-three zero-failure bound; Section 4/5's suite-composition minimums and reliability-test predicates (repeat consistency, paraphrase/format/order invariance, reproducibility, snapshot integrity, load independence); Section 6's evidence-confidence cap (new — nothing upstream audits confidence-vs-source) and repository-fact grounding (reuses `evaluation.evidence_resolves`); Section 7's per-category hallucination release ceilings (gates `evaluation.hallucination_breakdown`'s output, doesn't re-detect); Section 8.2's 7 production review triggers (additive to, not a replacement for, Phase 2's R1–R6 — see judgement calls) and the Section 8.3 T0–T4 failure ladder (classification, per-tier structural checks, and the failure-test-set acceptance rule); Section 9's GO/CONDITIONAL GO/NO-GO decision rule and the Section 9.4 schema-findings tracker; and the Section 10 `DecisionRecord`, which ships as a `PENDING` template with an explicit "no invented results" completeness check |
| 20 | `continuous_learning.py` | Phase 20 | The Continuous Learning and Improvement design: `FeedbackRecord` shape/G0 gate (Section 2.2); the five-step verdict classifier and verdict→destination map (Section 3.1/3.2); G1's six automated checks, reusing `derived.validate_all` rather than re-deriving schema/invariant checks (Section 3.3); G2 human-triage sample rates and the four source-trust tiers with the 20-item reliability-promotion floor (Section 3.4/3.5); the six annotation example types and missing-type/gold-seed/blind-labeling/independence checks (Section 4); partition `trained_on` status, thread-level partition-straddle and the 5%/2%/0.5% overfitting caps (Section 5); the seven retraining triggers, the change-axis→version-level map, the training-mix minimums, the six hard prohibitions, and the targeted-cluster acceptance rule (Section 6); the ten-row regression-gate check, the forgetting-metric limit, and the seen/unseen-repo overfitting check (Section 7); five drift-alert predicates and the four alert-response routes (Section 8); quarantine triggers, the bad-label re-audit threshold, and the recovery threshold (Section 9); artifact-bundle completeness, per-level required eval suites, the 10-state release lifecycle (with `shadow` optional) and rollback triggers (Section 10); the "ground in context before weights" table, with `team_convention` hard-coded to never justify a weight change, and learning-health-metric checks (Section 11); and a `Phase20DecisionRecord` that ships `PROPOSED` with a completeness rule that only bites once someone marks it `APPROVED` without real approvals/owners/baselines (Section 12) |
| bridge | `export_sft.py` | (Phases 7/11, simplified) | Repo-level split, chat-format JSONL export, and model-output → validated record |
| — | `demo.py` | | Runs intake → clean on three toy issues, `architecture.understand()` on them, a Phase 13 stability/invocation check, a Phase 14 L0/grounding pass, a Phase 15 adversarial case check, a Phase 16 diagnosis + error-dashboard build, a Phase 17 `ImprovementCandidate` moving from proposed through an accepted release verdict, a Phase 18 registration of that accepted candidate as a versioned, stamped `ModelVersion`, a Phase 19 release-gate/decision-rule/ladder-tier pass, and a Phase 20 feedback item moving through classification, G1, a retrain trigger, and a candidate-acceptance check |

**Not built:** GitHub fetching (Phase 4 stages 1–7, needs network), the annotation *tooling* itself
(queue, UI, double-blind assignment — Phase 6 explicitly scopes this out), any learned model or an
actual base-model choice/corpus/compute run (Phases 9–10 are gates and lifecycle only, not a
trained checkpoint — see below), any actual Phase 11 head training or loss implementation, any
retriever/encoder or tier-N training run, any actual `L_stability` training or a real ITU-1 v1-b
checkpoint (Phase 13 is the same kind of gates-and-contract package, not a trained checkpoint), any
actual Evaluation Report against a real checkpoint (Phase 14 is the framework only — there is
nothing trained to run it against yet), no populated Adversarial/Hard-case corpus (Phase 15
supplies the taxonomy, vocabulary and test logic; the ≥20-instances-per-pair and real bait-case
volume are real-data work, not code), and no populated `FailureRecord` corpus or real
`ErrorAnalysisReport` (Phase 16 is the diagnostic system and routing logic only — there are no
real evaluation failures to diagnose yet, since there is no trained checkpoint to fail), and no
populated `ImprovementCandidate` history (Phase 17 is the governance layer only — there is no
released checkpoint yet for a candidate to be compared against, and no actual retraining run
behind any candidate's `candidate_checkpoint`), and no live Model Registry, Benchmark Edition, or
Exclusion Ledger (Phase 18 is the identity/comparability/contamination rule layer only — a real
registry service, database and trusted clock are explicitly out of scope for Phase 18 itself, and
there is no registered `ModelVersion` or `itu-bench` edition yet for it to govern), and no real
Phase-19 decision record — Phase 19's own Section 0 says the decision record is a `PENDING`
template with no invented outcomes until an actual release suite has been run against an actual
checkpoint, and this package has neither. Phase 20 is the same story one layer up: no feedback
ledger, no annotation workspace, no dataset store, no retraining controller, and no monitor actually
running — Phase 20's own Assumptions say its decision record is `PROPOSED` with blank
approvals/owners/baselines, and `continuous_learning.py` implements only the rules a real pipeline
would have to satisfy once one exists.

## Setup

```bash
unzip itu1.zip && cd itu1
python3 --version        # written for 3.10+; only tested on 3.12
```

No `pip install` step. No network access is used anywhere.

## Test

```bash
python3 -m unittest            # all suites, from inside the itu1 folder
python3 -m unittest test_clean # a single suite
python3 demo.py                # optional smoke run
```

All tests pass on delivery (see the count in the chat message). The tests cover the spec's own test
cases where they exist (Phase 2 T1–T15, Phase 5 V1–V11 and V13–V15).

## Use

**Validate a record** (Phase 2):
```python
from derived import finalize, validate_all
record = finalize(record)          # fills confidence, uncertainty rollups, review
errors = validate_all(record)      # [] means valid
```

**Validate a training example** (Phase 3):
```python
from example import validate_example, model_input, eligible_uses
validate_example(ex)   # [] if valid; tier leakage, closing-PR text, label quality, provenance match
model_input(ex)        # exactly what the model would see
eligible_uses(ex)      # {"train", "eval"} for GOLD, {"train"} for SILVER/BRONZE, set() for REJECTED
```

**Intake, then cleaning** (Phases 4–5) — see `demo.py` for a runnable version:
```python
import intake, clean
cfg, index, log = intake.Config(), intake.CorpusIndex(), intake.LineageLog()

rec = intake.new_collected_record(collection_id="c1", repo="acme/shop", issue_number=42,
        issue_url="https://github.com/acme/shop/issues/42", title="...", body="...",
        snapshot_fetched_at="2026-09-24T00:00:00Z", license="MIT")
rec, meta = intake.process(rec, cfg, index, log)     # -> READY_FOR_LABELING / REDACTION_HELD / DEDUP_HELD / ...
cleaned = clean.clean(rec)                            # -> ANNOTATION_READY / EXCLUDED / DEDUP_HELD / EVAL_RESERVED
cleaned["cleaning"]["cleaned_view"]                   # repaired + redacted + pseudonymized text, typed spans
cleaned["cleaning"]["normalized_terms"]               # sidecar; every entry has a span_ref into the RAW text
cleaned["cleaning"]["transformation_log"]             # every edit, auditable
```
Persist `index.to_dict()` between runs (`CorpusIndex.from_dict`) so dedup works against the whole corpus.
`LineageLog.dump_jsonl(path)` writes the audit log.

To feed your own fetched issues in, build `CollectedRecord`s with `new_collected_record(...)` (or fill the
same dict shape yourself) and put the tiered context in `context_bundle`.

**Annotation and ground truth** (Phase 6) — turns two independent human labelings of the same issue
into promoted ground truth. This module does not implement an annotation UI or queue (Phase 6 §0 is
explicit that Phase 6 defines the process, not tooling); it implements the rules a tool would need to
enforce.

```python
from annotation import (
    validate_annotation, strip_annotation_meta, detect_disagreements,
    disagreement_severity, valid_adjudicator, resolve_disagreement,
    ready_for_ground_truth, closed_enum_agreement, provenance_source_agreement,
    array_agreement, agreement_level, unknown_usage_rate, unknown_rate_outlier,
    passes_calibration, run_qa_checks, annotation_tier,
)

# Two annotators independently fill in a Phase 2 record + annotation_meta.
validate_annotation(record_a)          # [] if the record + its annotation_meta are well-formed

# Auto-diff two submissions (Section 7.1) -- annotators never hand-report disagreement.
entries = detect_disagreements(record_a, record_b)
for e in entries:
    severity = disagreement_severity(e["field"], e["annotator_1_value"], e["annotator_2_value"])
    # "minor" -> third-annotator tie-break; "major" -> named adjudicator (Section 7.2)

# Adjudicator resolves, logs it, never adjudicates their own annotation (Section 7.6).
assert valid_adjudicator("lead1", ["a1", "a2"])
resolved = resolve_disagreement(entries[0], "Backend", "lead1", "maintainer comment names the API")

# Batch agreement, once a repo has enough dual-annotated pairs (Section 6.2).
pairs = [(record_a, record_b)]  # ... across a batch
kappa = closed_enum_agreement(pairs, "role")
agreement_level(kappa)          # "unstable" | "substantial" (>=0.7) | "solved" (>=0.85)

# Only promote to the training/eval pool once all three Section 6.3 conditions hold.
ok, reasons = ready_for_ground_truth(final_record)   # (True, []) or (False, [why...])
ground_truth = strip_annotation_meta(final_record)   # annotation_meta dropped, not just ignored

# Per-record QA (Section 8.3), run before a submission is eligible for adjudication.
run_qa_checks(record_a, issue_text)   # fabrication / empty_uncertainty / collapse / confidence-mismatch
```

**Dataset construction** (Phase 7) — `dataset.py` turns validated TrainingExamples into the six datasets
(training / validation / test / hard_case / adversarial / regression) and refuses to publish a release
that fails any leakage (L1–L7) or validation (D1–D14) check.

```bash
# examples.jsonl: one validated TrainingExample per line (GOLD/SILVER/... from the earlier steps)
python3 dataset.py build examples.jsonl release/ --salt my-salt-v1 --release-id release-2026-09 \
        --train-cutoff 2026-03-01T00:00:00Z --val-cutoff 2026-06-01T00:00:00Z
python3 dataset.py verify release/      # re-checks hashes, every record, and L1-L7 from disk
```
Writes `release/{training,validation,test,hard_case,adversarial,regression}-<version>.jsonl`,
`manifest.json` and `manifest-<release_id>.json`. Re-running on the same folder versions each dataset
independently (MINOR for additions, MAJOR for removals or a salt change) and never overwrites a published file.

```python
import dataset as ds
cfg = ds.BuildConfig(split_salt="my-salt-v1", train_cutoff="2026-03-01T00:00:00Z", val_cutoff="2026-06-01T00:00:00Z")
datasets, release, result = ds.build_release(examples, cfg, "release-2026-09")
ds.release_gate(release)                                   # [] means publishable
ds.publish_release(datasets, release, "release/")

# a prior model got a Test record wrong: MOVE it (and its issue/cluster siblings) into Regression
new, moved = ds.relocate_to_regression(datasets, example_id, "itu1-0.3", "wrong role")
```
Optional keys on an input example steer curation (stripped from the stored record):
`annotation_summary.agreement_status` (disagreed/adjudicated -> hard_case),
`curation = {"inclusion_type": "contrast_pair" | "failure_mode_probe", "failure_mode_targeted": ..., "detail": ...}`
(adversarial records must be SYNTHETIC and use a tag from `ds.FAILURE_MODES`), and
`corpus_meta = {"dedup_cluster_id", "repo_type", "domain"}`.

**Architecture / inference skeleton** (Phase 8) — Phase 8 is a *conceptual* architecture: components,
interfaces, data flow, no framework/parameters/training procedure (its own Scope boundary). Most of it
is therefore not code that can be "built" yet — there's no encoder, no heads, no learned weights. What
Phase 8 *does* hand to deterministic code is component **H** (assembly & validation, Section 10) plus
the **contract** every learned component must satisfy (Sections 2, 4.3). `architecture.py` implements
exactly that: A1/A2 (segmenting and tier-gating), the source-ceiling table (Section 2.A), H1–H5
(structural validity, grounding checks, the Phase 2 rule engine, derived-field computation, and the
five-level degradation lattice), and a `FieldProposal` contract that a real C/D/E/F/G would emit.

```python
from architecture import InferenceInput, understand, HeuristicStubEngine, NullEngine

inp = InferenceInput(
    repo="acme/shop", issue_number=42, issue_url="https://github.com/acme/shop/issues/42",
    snapshot_fetched_at="2026-09-24T00:00:00Z", title="Button crashes on click",
    body="Clicking the checkout button throws an error in the React frontend.",
    labels=["bug"],
)
record, trace = understand(inp, engine=HeuristicStubEngine())   # or engine=NullEngine()
# record is a schema.validate_all-clean TaskUnderstandingRecord, or a RejectedResult
# trace is an InferenceTrace: what H repaired, downgraded, or abstained on
```

**There is no C/D/E/F/G here** — `NullEngine` returns nothing (every field lands on the safe `UNKNOWN`
fallback) and `HeuristicStubEngine` is a keyword-matching placeholder used only to exercise `understand()`
and the H layer end-to-end in tests. It is explicitly disclaimed in its own docstring as not a design
proposal for the real model: it does none of Section 8.4's anti-keyword-shortcut work (no learned
evidence pointers, no length decorrelation, no calibration). A real engine is Phase 9+'s job — swap it in
by implementing `.propose(segments) -> list[FieldProposal]` and passing it to `understand(inp, engine=...)`.

What H actually guarantees, independent of which engine (or no engine) is plugged in:
- Every emitted record passes `schema.validate` + `derived.validate_all` (Phase 1 §8 criterion 6 —
  100% output validity). A record that can't be repaired into validity never leaves the system; it comes
  back as a `RejectedResult` (reason codes only) or the canned Level-4 "abstain" record instead.
- **Source ceiling enforcement** (Section 2.A table): a claim of `EXPLICIT` grounded only in a `LABEL` or
  `COMMENT` segment is clipped to `SUPPORTED_BY_CONTEXT` and logged in the trace, never silently accepted.
- **Degradation lattice** (Section 10.5): Level 1 repairs (drop a components/systems overlap, drop an
  unresolved dependency ref, re-stamp `schema_version`), Level 2 (downgrade an individual field to
  `Unknown`), Level 4 (the whole-record abstain pattern from Phase 2's Example 3), Level 5
  (`RejectedResult` when even abstaining can't be made valid, e.g. the input snapshot itself is missing
  required identity fields).

## Training — what is and is not possible today

There is nothing to train on yet, and no trainer in this package. What the spec requires before training:

1. **Labeled data (Phase 6).** Every training example needs a human- or adjudicated-labeled Phase 2
   `ground_truth` with per-field evidence. `clean.py` produces annotation-*ready* records; it never
   produces labels. Someone (or a reviewed process) has to write them.
2. **Dataset construction (Phase 7)** and a **base model and architecture (Phases 8–10)**. The spec's
   Phase 8 is a multi-head design (classification, pointer/extraction, generation, calibration), not a
   plain text-to-text model. Phases 9 and 10 are explicit that they each produce **one artifact** — an
   adapted, then a domain-specialized, checkpoint from continued pretraining — and stop there; neither
   attaches Phase 8's heads or touches Phase 6/7 labels (Phase 9 §0/1.6, Phase 10 §0/Decision #7).
   `pretrain.py` and `domain_training.py` implement the gates and lifecycle bookkeeping both phases
   define (tokenizer offset validation, corpus contamination/license filtering, staged advancement,
   checkpoint retention/rollback, failure dispatch) — neither chooses a base model, assembles a real
   corpus, or spends any compute, because the spec itself leaves those as open items (Phase 9/10 §11)
   pending an actual license/compatibility review.

```python
from pretrain import roundtrip_offset_check, corpus_inclusion_check, CorpusSource

# Section 2 hard gate: run before spending any pretraining compute.
violations = roundtrip_offset_check(tokens, text)   # [] == passes

# Section 4.3/4.4: filter a candidate corpus source against Phase 7's split manifest.
decision = corpus_inclusion_check(
    CorpusSource("src1", "code", license="mit", repo="org/repo"),
    repo_split=build_result.repo_split,              # from dataset.build_datasets(...)
    allowed_licenses={"mit", "apache-2.0"},
)
```

Phase 10 (`domain_training.py`) picks up from Phase 9's Stage-3 checkpoint and reuses the same
machinery with its own A–D stage names and a widened corpus exclusion (Section 2.4: a Training
repo's issue-*resolving* PR text is excluded alongside issue text; general PR process/review text
is fine):

```python
from domain_training import domain_corpus_inclusion_check, select_deliverable_checkpoint
from pretrain import CorpusSource, StageRecord

decision = domain_corpus_inclusion_check(
    CorpusSource("src2", "pr_resolving", license="mit", repo="org/repo"),
    repo_split=build_result.repo_split, allowed_licenses={"mit"},
)  # excluded, even though the repo itself is Training

# Section 4's Stage-D exception: if Stage D's regression check fails, the deliverable falls back
# to the last stage that *did* pass its gate (typically Stage C), not to Stage D's own attempt.
deliverable = select_deliverable_checkpoint(stage_history)  # -> checkpoint_id, stage, stage_d_deferred
```

Phase 12 (`context_training.py`) is the tier-by-tier activation of Context Tier ≥ 2. Same stance: rules and gates, no retriever
or trainer, no thresholds asserted. Tier 6 (PR/commit) is **blocked** by the Phase 4 quarantine and, transitively, so is Tier 7.

```python
from context_training import (validate_tier_attempt, tier_appropriate_reference, score_against_reference,
                              advance_verdict, resolve_conflict, degrade_to_ceiling)

validate_tier_attempt(history, 6)          # -> ['tier 6 is blocked: Phase 4 SS3 Stage-6 quarantine ...']
ref = tier_appropriate_reference(gt_value, evidence_tiers=[3], ceiling=1)   # -> Unknown at tier 1
score_against_reference("Backend", ref)    # -> 'overclaim' (even though it equals ground truth)
advance_verdict(3, {"data": [], "uplift": [], "calibration": [], "leakage": [], "backward_consistency": []})
```

Phase 11 (`task_training.py`) is where the spec first attaches Phase 8's heads and trains on Phase 7
labels. There is still no trainer here: it implements the contract a training run and its evaluation
must satisfy, and every threshold is a required argument with no default (Phase 11 Decision #10).

```python
from task_training import (select_training_records, validate_stage_config, consistency_violations,
                           adversarial_gate, calibration_gate, validate_evaluation_log, release_verdict)

eligible, excluded = select_training_records(dataset_records)   # Training dataset + Tier 1 only
validate_stage_config("stage_1_joint", run_cfg)                  # joint C-F, encoder LR < head LR, 11 loss terms
calibration_gate({("role", "EXPLICIT"): {"high_confidence_accuracy": .95, "low_confidence_accuracy": .6}})
validate_evaluation_log(events)     # Test once, Stage 2 only, Regression after Test on the same checkpoint
```

Phase 13 (`instruction_training.py`) trains *response-strategy robustness under framing pressure*,
not fresh accuracy: it reuses Phase 11's losses/heads/calibration untouched and adds one
contrastive signal (`L_stability`) plus a 12-category compliance battery, on top of the highest
already-promoted checkpoint (ITU-1 v1, or a promoted Phase 12 tier-checkpoint).

```python
from instruction_training import (invocation_violations, FramingPair, stability_violations,
                                  TEST_CATEGORIES, category_pass_rate, battery_verdict,
                                  consistency_check, uncertainty_state_violations,
                                  review_required_consistency_violations, hallucination_violations,
                                  release_verdict)

invocation_violations({"issue_snapshot": snap, "maintainer_directive": "always mark Advanced"})
# -> ['invocation carries disallowed fields (not evidence, an override channel): [...]']

# Section 3 / category 10: the same underlying issue, neutral vs. a misleading "hack" framing.
pair = FramingPair(neutral_record, stressed_record)
stability_violations(pair)          # [] if no field/source diverges without justification

rates = category_pass_rate({"T1": [True, True, False], "T2": [...], ...})   # 12 categories
battery_verdict(rates, thresholds={"T1": 0.9, "T2": 0.9, ...})              # thresholds supplied, not fixed

consistency_check([run1, run2, run3])   # Section 7: same input, 3 checkpoint runs, no silent flip
```

`TEST_CATEGORIES` holds all 12 master-prompt categories (T1–T12) as data — sample input, required
behavior, `fails_if`, and which of `BEHAVIORAL_PRINCIPLES` (B1–B9) each one stresses — so a test
harness can drive the battery from the table instead of hand-coding each category. As with every
prior phase, per-category pass-rate thresholds and `L_stability`'s loss weight are caller-supplied;
Phase 13 asserts none of them (Decision #11).

Phase 14 (`evaluation.py`) is **measurement-only** — it consolidates Phase 11 §6, Phase 12 §7 and
Phase 13 §7's evaluation procedures into one framework, run the same way against any checkpoint.

```python
from evaluation import (evaluate_l0, classification_report, classification_metrics_for_field,
                        cross_field_agreement_violations, grounding_breakdown,
                        hallucination_breakdown, calibration_curve, expected_calibration_error,
                        abstention_precision_recall, benchmark_scope_violations,
                        stratified_sample, human_agreement_rate, context_tier_comparison,
                        EvaluationRun, malformed_report_violations, acceptance_verdict)

l0 = evaluate_l0(candidate_records)             # hard exclusion filter, not scored (Section 1)
report = classification_metrics_for_field("role", rows)   # scored vs. tier-appropriate reference
grounding_breakdown(record, source_segments=segs, confidence_threshold=.6, uncertain_fields=set())
hallucination_breakdown(items)                  # rate by type, never one score (Decision #5)
benchmark_scope_violations("generalization", {"test", "adversarial"})   # catches accidental pooling

run = EvaluationRun(checkpoint_id="itu1-v1-b", benchmark="generalization", l0=l0,
                     by_axis={"role": {...}})    # seven-axis cube (Section 10)
malformed_report_violations(run)                 # [] only if it's a cube, not a scalar
acceptance_verdict(run, per_cell_thresholds={...}, hallucination_ceilings={...},
                   regression_reappearances=0)
```

Phase 15 (`adversarial.py`) builds the **Adversarial Test Framework** — the taxonomy, the
`failure_mode_targeted` vocabulary Phase 7 D13 deferred, and AT1–AT9/HT1–HT5. No seventh dataset:
every case is a `dataset.DatasetRecord` living in Adversarial or Hard-case (Decision #1).

```python
from adversarial import (AdversarialTestCase, validate_case_shape, check_failure_mode_pass,
                         bait_zero_signal_violations, to_dataset_record,
                         at1_keyword_independence, at2_schema_validity_under_malformation,
                         at3_degradation_lattice_order, failure_threshold_verdict,
                         HARD_CONFUSABLE_PAIRS, pair_matrix_violations)

case = AdversarialTestCase(example_id="adv-1", dataset_id="adversarial",
                           inclusion_type="failure_mode_probe",
                           failure_mode_targeted="keyword_misdirection", taxonomy_group="A",
                           construction_method="synthetic_construction", bait_element="database")
validate_case_shape(case)                        # [] once group/mode/method line up
check_failure_mode_pass("keyword_misdirection", case, model_output)   # True/False/None (human-only)
rec = to_dataset_record(case, example, "1.0.0")   # a normal DatasetRecord + adversarial_metadata

at1_keyword_independence(original_output, masked_output, unaffected_fields=["role"])
failure_threshold_verdict(hard_results={"AT1": [], "AT2": [], "AT7": []}, at3_violations=[],
                          empirical_results={"AT5": {"actual": .3, "min": .2}}, pair_collapses=[])
```

Phase 16 (`error_analysis.py`) builds the **Error Analysis System** — it answers *why* a record that
Phase 14/15 flagged as failing actually failed, and routes that to a corrective action. It does not
re-score anything (Phase 14 owns the metrics) and does not perform the fix (Phase 6/8/10-13/12 do).

```python
import error_analysis as ea

# Section 3.2: the six-step fixed-order elimination sequence
diagnosis = ea.diagnose(evidence_check={"cites_subset_rest_present": True})
# Diagnosis(error_type="Context failure", family="Context problem", step=4, ...)

failure_record = {...}  # a FailureRecord (Section 2)
ea.validate_failure_record(failure_record)              # [] once the shape is right
ea.label_ambiguity_signal(failure_record)                # structural ground_truth != expected_output check

# Section 3.4: a single Inference-problem record stays put; a shared-pattern cluster gets reclassified
reassignment = ea.systematic_reclassification(records, pattern_key=lambda r: r["error_type"])
records = ea.apply_systematic_reclassification(records, reassignment)

ea.assign_severity(high_impact_field_wrong=True)          # "High" -- independent of error_type/family
ea.route_correction("Context problem")                    # owning_phase, corrective_action, retraining_required
ea.grader_ground_truth_mismatch_disposition(               # the no_action_expected_behavior case
    model_returned_unknown=True, ground_truth_resolves_value=True, input_supports_value=False)

report = ea.build_report(records)                          # raises if any record fails validate_failure_record
ea.malformed_error_report_violations(report)                # [] only if it's a cube, never an aggregate score

# Section 7: a corrective action only becomes resolved on re-verification, never on self-report
ea.mark_resolved({"status": "in_progress"}, reverified_pass=True)
```

Phase 17 (`improvement.py`) builds the **Controlled Improvement Cycle** — governance for a change
Phase 16 §5 routed: how it's tested, what "improvement" means, and who can call it released. It does
not perform the fix, re-derive a Phase 14 metric, or specify deployment mechanics.

```python
import improvement as imp

# Section 2: nine change types; #6/7/8 default to broad blast radius no matter how targeted they look
imp.classify_change("Better retrieval")            # {"root_cause_families": ..., "owning_phase": "Phase 12", ...}
imp.default_blast_radius("Architecture changes")    # "broad" -- always, at proposal time
imp.narrow_blast_radius_allowed("Architecture changes", clean_regression_check=True)  # only after evidence
imp.separate_candidates_for_cluster(["More training data", "Better uncertainty handling"])  # never bundled

# Section 1: the 9-state lifecycle as an auditable, strictly-forward state machine
candidate = imp.ImprovementCandidate(
    candidate_id="cand-1", created_at="2026-09-24T00:00:00Z",
    originating_failures=["demo-failure-1"], change_type="Better retrieval",
    owning_phase="Phase 12", blast_radius="moderate", baseline_checkpoint="itu1-v1-b",
    target_metric={"field": "role", "reporting_axis_cell": "context_tier=3", "pre_registered_threshold": 0.02})
imp.validate_improvement_candidate(candidate)        # [] once shape + state/history agree

candidate.history = [{"from_state": "proposed", "to_state": "scoped"}]
imp.validate_history(candidate.history)              # [] -- catches skipped states and gaps
imp.current_state(candidate.history)                 # "scoped"

# Section 4: all ten dimensions, every time -- at most one non-targeted, sub-Medium tolerance; Hallucination never
dims = [{"dimension": d, "result": "unchanged", "significance": None} for d in imp.REGRESSION_DIMENSIONS]
imp.net_acceptability(dims)                          # [] -- clean pass
imp.apply_tolerance("Grounding", "regressed", severity="Low", is_targeted=False)  # "regressed_within_tolerance"

# Section 5: acceptance (measurement) and release (operational readiness) are two separate gates
verdict = imp.acceptance_checklist(
    benchmark_runs={k: "run-id" for k in imp.REQUIRED_BENCHMARKS}, l0_structural_validity=1.0,
    hallucination_ceiling_violations=[], regression_reappearances=0, dimensions=dims,
    target_metric_significant=True, adversarial_tests_pass=True,
    hard_confusable_pair_collapse=False, human_agreement_not_worse=True)
imp.release_verdict(acceptance_decision=verdict["decision"], signed_off_by="reviewer-x",
                     owning_phase="Phase 12", rollback_plan_exists=True)

# Section 6: rollback -- independent confirmation, then the failure re-enters Phase 16/7 permanently
imp.rollback_decision("hallucination_ceiling_exceeded_live",
                       confirmed_by_independent_reviewer=True, owning_phase="Phase 12", reviewer="reviewer-y")
imp.rollback_to_failure_record("regression_reappearance", "cand-1", "prod repro of the fixed pattern")
```

Phase 18 (`versioning.py`) builds the **Versioning Architecture, Model Registry, Permanent Benchmark
and Release Record** — the layer none of Phases 1–17 owned: which exact model, on which exact data,
under which schema/guidelines, produced a task, and which benchmark edition it was judged against. It
trains and decides nothing; Phase 17 keeps the accept/release authority.

```python
import versioning as ver

# Section 1.4: every stored reference is name@semver+hash12; a label alone or a hash alone is invalid
ver.valid_ref("itu-1@0.2.0+3f9a1c7e2b40")            # True
ver.valid_ref("itu-1@latest")                        # False -- no floating references (I4)

# Section 2.2: the bump table. Weights changed => at least MINOR; PATCH needs a passing equivalence run
ver.required_bump("Architecture changes", weights_changed=True)                       # 'MAJOR'
ver.required_bump("metadata_only", weights_changed=False, equivalence_run_passed=True)  # 'PATCH'

# Section 2.4/2.6: the record shape, plus the three fields most often faked
ver.validate_model_version_record(model_version_record)
ver.validate_known_limitations(record["known_limitations"], evaluation_runs=runs)   # derived, not authored
ver.validate_known_regressions(record["known_regressions"])                         # [] needs a ref, never bare

# Section 2.7: status only moves forward, never skips; Phase 17 remains the authority for the four gated transitions
ver.validate_status_transition("evaluated", "release_candidate", has_phase17_decision_ref=True)

# Section 4.4 Rules 13-15: the generation stamp -- computed by the deterministic layer, never modeled
ver.validate_generation_stamp(stamp, registered_model_refs={"itu-1@0.3.0+abc..."}, model_max_active_tier=1)

# Section 5.4: exposure control -- an opened (burned) item leaves Gate scoring and can never become Training
ledger = ver.ExposureLedger()
ledger.open_item("bench-item-1", reason="failure_record_created", at="2026-09-24T00:00:00Z")
ledger.is_gate_eligible("bench-item-1")              # False
ledger.eligible_for_training("bench-item-1")          # False, always, once opened

# Section 6.4: BC-tests and taint propagation
ver.bc1_ledger_preflight(manifest_ids, ledger_ids)     # pre-flight: fails before training can start
ver.propagate_taint({"itu-1@0.1.0+..."}, lineage)      # every descendant along parent/checkpoint_chain

# Section 9: a ReleaseRecord is complete iff every field resolves, except rollback.redeploy_bound
ver.release_record_completeness_violations(release_record)
```

Phase 19 (`production_readiness.py`) is the **final release gate**: it decides GO / CONDITIONAL GO /
NO-GO, but trains and detects nothing new — every measurement it gates on already exists elsewhere
in this package.

```python
import production_readiness as prod

# Section 1: the 16-item checklist. Missing evidence counts as FAIL, not N/A (Section 9.1)
prod.checklist_violations({i: "PASS" for i in prod.CHECKLIST_IDS if i != 3})  # item 3 missing -> FAIL

# Section 2.1: gate on the CI lower bound, never the point estimate
r = prod.CapabilityResult("task_type", point_estimate=0.88, ci_lower=0.81, sample_size=240)
prod.capability_violations(r, threshold=0.80)                        # []

# Section 2.2: 9 invariants -- 8 reuse schema.py/derived.py, invariant 9 (task_id/snapshot) is new
prod.validate_invariants(finalized_record)

# Section 2.3: ECE ceilings + bin monotonicity + high-confidence error rate, on evaluation.py's rows
prod.calibration_violations(confidence_correctness_pairs, overall_rows=overall_pairs)

# Section 3: the S0-S3 release-blocking scale -- NOT Phase 16's Critical/High/Medium/Low
prod.assign_severity_s(fabrication_or_hidden_uncertainty=True)       # 'S0'
prod.release_gate_violations(release_counts)                         # Section 3.2's table

# Section 6.6: confidence must not exceed evidence -- nothing upstream checks this
prod.evidence_confidence_cap_violations(record)                      # INFERRED>0.75, EXPLICIT>0.9

# Section 8.3: classify an actual output onto the T0-T4 ladder, then check it behaves accordingly
tier = prod.classify_ladder_tier(record_or_rejected_result)
prod.ladder_behavior_violations(record_or_rejected_result, tier)

# Section 9.1: GO / CONDITIONAL GO / NO-GO
prod.decision_rule(checklist_results=results, s0_count=0, s1_rate=0.004,
                    regression_within_tolerance=True, reproducibility_confirmed=True)

# Section 10: ships PENDING until a real run exists -- no invented outcomes
record = prod.pending_decision_record("P19-20261101-1")
prod.decision_record_completeness_violations(record)                 # []
```

Phase 20 (`continuous_learning.py`) is the **long-term learning design**: how feedback becomes
better model versions without an online-learning shortcut and without losing existing capability.
It never weakens the Phase 19 gate, and it trains nothing itself.

```python
import continuous_learning as cont

# Section 2.2 / 2.1 stage 1: G0 -- a complete feedback record, or rejected as unusable
cont.validate_feedback_record(feedback_dict)
cont.g0_gate(feedback_dict)

# Section 3.1/3.2: the five-step decision procedure -> exactly one verdict
verdict = cont.classify_feedback({
    "manipulation": False, "duplicate": False, "tied_to_field": True,
    "objectively_checkable": True, "evidence_supports": True,
})                                                    # 'useful_correction'
cont.destination_for_verdict(verdict)                 # 'annotation_to_dataset_candidate'

# Section 3.3 (G1): evidence presence, schema/invariants (reuses derived.validate_all),
# grounding, Unknown-without-evidence, and self-contradiction
cont.g1_violations(feedback_dict, snapshot_text=issue_text, unsupported_entities=[])

# Section 3.4/3.5: default human-triage sample rates and the 20-item promotion floor
cont.triage_sample_rate(tier_group="trusted_or_mid", enters_training=True)   # 1.0
cont.reliability_promotion_eligible(adjudicated_item_count=25)               # True

# Section 5.1: overfitting caps on a training increment (5% repo / 2% submitter / 0.5% cluster)
cont.overfitting_cap_violations(increment_stats)

# Section 6.1/6.3/6.5: did a retrain trigger fire, is the proposed mix in-policy,
# and did the candidate actually fix something measurable?
cont.trigger_fired("volume", {"new_examples": 620, "new_repos": 24})         # True
cont.training_mix_violations(proposed_mix)
cont.candidate_acceptance(relative_error_reduction=0.35,
                           absolute_improvement_ci_supported=False, all_gates_passed=True)

# Section 7.2: the ten-row regression gate every candidate must clear
cont.regression_gate_violations(candidate_eval_results)

# Section 8.2/8.4: drift alert predicates and their response route
cont.drift_alert("calibration_ece_delta", 0.05)                              # True
cont.alert_response("calibration_or_accuracy_drift")

# Section 9.2/9.3/9.5: quarantine, bad-label re-audit, and recovery thresholds
cont.quarantine_required({"statistical_anomaly_cluster": True})
cont.recovery_required(mislabeled_fraction=0.01)

# Section 11.1: new knowledge is grounded in context first -- weights change only if
# the named condition is actually met (never for a team convention)
cont.weights_change_justified("new_technology", condition_met=True)         # True
cont.weights_change_justified("team_convention", condition_met=True)        # False, always

# Section 12: ships PROPOSED with blanks; only an APPROVED record without real
# evidence is a violation
cont.decision_record_violations(cont.Phase20DecisionRecord())               # []
```

`export_sft.py` is a **stand-in** so you can experiment with an off-the-shelf instruction-tuned LLM.
It is not the Phase 8 training interface.

```bash
# examples.jsonl: one validated TrainingExample per line
python3 export_sft.py examples.jsonl out/ --eval-fraction 0.1 --seed 0
# -> out/train.jsonl, out/eval.jsonl   ({"messages": [system, user, assistant]} per line)
```
What the exporter guarantees: invalid examples are dropped and listed; the split is by repository, and
repositories sharing a near-duplicate cluster go to the same side; eval is GOLD-only; the assistant
target contains only what the model must author (`task`, `provenance`, `missing_information`) because
confidence, rollups and the review flag are computed, never learned.

Then fine-tune with whatever framework you use (not included, not tested here). At inference:
```python
from export_sft import parse_model_text, assemble_record
pred, err = parse_model_text(model_output_text)
record, errors = assemble_record(pred, source_issue_dict)   # computes derived fields, then validates
# errors != [] -> reject or route to human review
```

## Decisions to check (the spec was silent or ambiguous)

* **Missing files.** Your uploads contained `schema.py`/`derived.py` and their tests but not `example.py`
  or `test_example.py` from step 3. I **rebuilt them from the step-3 summary**, so they may differ from
  your originals in wording. Compare if you kept the originals.
* **BRONZE in training.** Phase 3 §6.5 allows BRONZE in training; Phase 7 says it is not in the Training
  set. `export_sft.py` defaults to GOLD+SILVER (`--tiers` to change).
* **Near-duplicate threshold** (`near_dup_max_hamming = 8`, bigram simhash) is tuned on toy text only.
  The spec says to set it empirically; calibrate on pilot data before trusting cluster counts.
* **Licence allowlist** in `intake.Config` is a placeholder policy, not legal advice.
* **Language ID** is a small stopword/script heuristic. Text under 25 letters is "too short to tell",
  not "unidentified", so minimal issues are kept as the inclusion rules require. Plug in a real detector
  via `process(..., detect_language_fn=...)`.
* **Vulnerability screen (ER-3)** is a hook (`Config.vuln_check`). Without it, records get the flag
  `vuln_screen_not_run`.
* **Home-directory usernames** (`/home/alice/`) are masked even inside stack traces. Frames, line numbers
  and order are untouched, but strictly this is not byte-verbatim.
* **Unclosed code fences** are closed at end of text (the spec says "next blank line", which would cut
  real code that contains blank lines).
* **Secret detector** is pattern-based. Ambiguous credential-looking values score 0.6, below the 0.8
  redaction floor, so those records are excluded (ER-4) instead of shipped half-redacted. Expect some
  false exclusions.
* **Tier 6** (PRs/commits) may sit on a record but is never returned by `model_visible_bundle()`, never
  counted in `max_tier_available`, and never copied into `cleaned_view`.
* **Tier 7** examples cannot carry extra context: the Phase 3 example shape has no field for it.
* **Disagreement severity (Phase 6 §7.2).** The spec gives worked examples (role differences and
  `Security` involvement are major; adjacent `Intermediate`/`Advanced` is minor) but not a full rule
  table. `annotation.py` fills the gaps: any `Unknown`-vs-concrete split is major; non-adjacent
  `experience_level`/`complexity` pairs (e.g. `Beginner` vs `Advanced`) are major; a `task_type`
  disagreement not involving `Security` is minor; provenance-source-only disagreements are minor.
  Reasonable defaults, not spec text — revisit if your adjudicators disagree with the triage.
* **Fabrication check (Phase 6 §8.3.1)** is the spec's own "cheap automatable proxy": token overlap
  between an `EXPLICIT`/`SUPPORTED_BY_CONTEXT` evidence string and the issue text, stopwords removed.
  It catches zero-overlap fabrication, not subtler unsupported claims — the spec says genuine grounding
  is confirmed in human review, not by this check.
* **Ground-truth promotion gate (Phase 6 §6.3.3)** blocks promotion only when an *unresolved*
  disagreement touches a field that feeds `review.review_required`'s trigger rules (`role`,
  `experience_level`, `complexity`, `task_type`, `acceptance_criteria`, `overall_confidence`). A
  resolved disagreement on those fields, or any disagreement elsewhere, does not block promotion.
* **`Unknown`-rate outlier detection (Phase 6 §6.2)** has no spec-given threshold ("a statistical
  outlier"). `unknown_rate_outlier` uses a population z-score with a default of 2 standard deviations —
  calibrate once you have real annotator populations to compare against.

## Phase 8 judgement calls (`architecture.py`)

- **Level 1 repair set is a fixed, small list**, not a general repair engine: components/systems overlap
  (rule 8), unresolved dependency refs (rule 9), collapsed experience/complexity evidence (rule 7), and a
  bad `schema_version`. The spec names these as *examples* of Level-1 repairs (Section 10.5), not an
  exhaustive list; other repairable violations would need their own repair function added here.
- **No Level 3 (regenerate).** The spec's lattice has a "regenerate prose under stricter constraints" step
  between downgrade and abstain. There is no generator in this package (Phase 8 has none either — F is
  conceptual), so any failure that would call for regeneration falls straight through to Level 4 abstain.
  This is a strictly *more* conservative choice than the spec's lattice, never a less safe one: it can
  only downgrade further or abstain, never silently keep bad output. "Regenerate" only means anything
  once a real generation component exists.
- **Rule 7 repair picks a "loser" by comparing the two fields' proposed confidence** and downgrades the
  lower one. The spec doesn't say which of the pair to drop when both are wrong; this is my rule, not
  the spec's.
- **`is_reporter_clarification`** (the COMMENT → `EXPLICIT` exception in Section 2.A) is a flag the caller
  sets on the segment; there is no reporter-identity or clarification detector here. Section 2.A itself
  says this identity comes from author metadata, which A1 doesn't have without a real GitHub fetch.
- **Unsupported-entity dropping (H2.6)** is field-level here, not item-level: a `FieldProposal` for a list
  field (`technologies`, etc.) is all-or-nothing per pointer set, rather than resolving each list item's
  own pointer independently. A real D component would emit one proposal per extracted item; this package's
  `FieldProposal` doesn't yet have that granularity, so `HeuristicStubEngine` never emits partially-grounded
  lists to demonstrate it.
- **Tier 2–7 (retrieval, A3/A4, the higher source-ceiling rows) are represented in `SOURCE_CEILING`/
  `SEGMENT_TYPES` but never exercised**: `segment_issue()` only ever builds Tier-1 segments, matching
  Phase 8's own "[DEFINED, NOT ACTIVE]" status for those tiers. `gate()` still enforces the ceiling
  correctly if a caller constructs higher-tier segments by hand (tested), but nothing in this package
  produces them.
- **`HeuristicStubEngine`'s keyword lists** are illustrative, not calibrated on any real data, and (as its
  docstring says at length) not a stand-in for what Section 8.4 requires of a real model. Treat it as a
  pipeline-plumbing fixture, not a baseline to report accuracy numbers against.

## Phase 9 judgement calls (`pretrain.py`)

- **Nothing here trains or chooses anything.** Phase 9's own decision record (#1, #2, #9) refuses to
  fix a base model, a compute figure, or a corpus size in advance — those need an actual licensing
  review Section 11 explicitly defers. `pretrain.py` implements only the parts Phase 9 states as
  checkable independent of that choice: the tokenizer gate, the contamination/license filters, the
  stage state machine, and the failure-mode dispatch table.
- **`roundtrip_offset_check`'s coverage rule.** The spec requires lossless offset mapping (Section 2)
  but doesn't specify exactly how a real fast-tokenizer's `offset_mapping` should be validated. This
  implementation treats any uncovered, non-empty gap between token spans as a violation, and any
  token whose declared text doesn't match its own source span (Section 2's whitespace/no-destructive-
  normalization requirement) as a separate violation — including the lowercasing/whitespace-collapse
  cases the spec calls out by name. A tokenizer that legitimately drops zero-width or truly empty
  spans is not penalized; one that silently drops real characters is.
- **`fragmentation_rate` has no pass/fail band.** Section 7.2/Stage 0 call for "an acceptable band"
  without giving one — an open item (Section 11: "probe thresholds ... empirical"). The function
  returns the raw tokens-per-character rate and leaves the threshold to the caller.
- **Corpus check order.** `corpus_inclusion_check` applies the Section 4.4 license gate before the
  Section 4.3 repo/contamination gate. The spec doesn't order these explicitly; license is checked
  first here because it's a property of the source alone, independent of Phase 7's manifest.
- **Unassigned repos default to included.** A repo absent from `repo_split` (Phase 7 hasn't touched
  it, or it's a non-GitHub source) is treated as unassigned rather than excluded, since Section 4.3's
  exclusion rule is specifically "assigned to Validation/Test/Hard-case/Adversarial/Regression" — an
  absent repo hasn't been assigned there. Combine with your own out-of-band policy if you want
  unassigned repos excluded too.
- **`checkpoints_to_retain`'s "best" is a caller-supplied scalar.** Section 5 says "best-validation
  checkpoint per stage" without naming the metric; this module takes whatever `validation_metric` the
  caller attaches and assumes higher is better. Invert the sign yourself if your metric is a loss.
- **Stage-order enforcement is strict and only forward.** `validate_stage_advance` blocks skipping
  ahead and blocks re-running an already-gated stage; it does not model partial re-runs within a
  stage (e.g. resuming Stage 1 from an intermediate, ungated checkpoint) beyond what `StageRecord`
  already expresses — that bookkeeping is left to the caller's checkpoint log.

## Phase 10 judgement calls (`domain_training.py`)

- **Deliberately thin.** Phase 10's own Decision #1 frames it as an additive continuation of Phase
  9, reusing the same tokenizer, checkpoint-identity, retention and contamination discipline rather
  than redefining any of it (Decision #10). So `domain_training.py` is almost entirely thin wrappers
  around `pretrain.py`'s now-generalized stage-gating and corpus-filtering functions, plus the small
  number of things genuinely new to this phase (concept-coverage gate, relation-probe gate, the
  Stage-D deliverable exception, its own failure table).
- **`pretrain.py` was generalized, not duplicated**, to support this: `next_expected_stage`,
  `validate_stage_advance`, `validate_checkpoint_identity`, `corpus_inclusion_check`,
  `contamination_reaudit` and `classify_failure` all gained optional keyword parameters
  (`stage_order`, `excluded_training_repo_content_types`, `table`) with defaults matching their
  original Phase 9 behavior exactly — Phase 9's own tests were re-run unchanged after this and still
  pass, which is the check that the defaults didn't drift.
- **`relation_probe_gate`'s "exceeds baseline" is strict.** The spec says the in-distribution score
  must "exceed" the Phase 9 baseline (Section 5.2) — read as strictly greater than, not
  greater-or-equal, so a tie with the baseline (no measurable relational signal added) fails the
  gate by default. `min_improvement_over_baseline` raises that bar further if you want a real margin,
  not just a positive one.
- **`max_phrasing_gap` (default 0.15) is an invented number.** The spec requires a held-out
  relation-phrasing split to catch overfitting (Section 7) but gives no numeric tolerance —
  consistent with every other threshold in Phases 7–10 being left empirical. Treat 0.15 as a
  placeholder to replace once real probe scores exist, not a calibrated value.
- **`select_deliverable_checkpoint`'s "last gated checkpoint" already implements the Stage-D
  exception** without special-casing Stage D by name in the core logic — it's the same rule
  `pretrain.rollback_target` uses. The function's real job is only to *label* the outcome
  (`stage_d_deferred`) so a caller can tell "Stage D was attempted and properly deferred" apart from
  "Stage D was never reached," which the spec's own wording treats as worth distinguishing.
- **`concept_coverage_gate` takes the probe verdict as given.** Section 4's Stage A gate is "domain
  probes show measurable coverage" — this function does not run or simulate a probe; it only checks
  a caller-supplied set of already-confirmed categories against Section 2.1's required list. Wiring
  up an actual probe suite is out of scope for the same reason it was for Phase 9.

## Phase 11 judgement calls (`task_training.py`)

- **Contract, not a trainer.** Phase 11 executes the step Phases 9/10 deferred, but the loss terms,
  heads and encoder cannot exist without a framework and a base-model choice the spec still defers.
  So the module checks what the spec states as rules: identity and lineage, stage configuration,
  which records may supervise, grounding predicates, gates and the Test/Regression discipline.
  `L_consistency`, `L_source` and `L_unsupported` are exposed as predicates/targets (the things a loss
  would be computed from), not as differentiable losses.
- **No invented thresholds.** Every floor/ceiling (classification, grounding, generation, adversarial,
  length correlation) is a required argument. The one number stated in the spec's own words is that
  synthetic data is "a minority of any batch"; `batch_composition_check` reads that as *strictly* less
  than 0.5 (exactly half fails), overridable via `max_synthetic_share`.
- **Stage 2 may be re-attempted, Stage 1 may not.** `pretrain.validate_stage_advance` forbids re-running a
  gated stage, but Section 7's rollback re-fits Stage 2 against its Stage-1 parent after a failed
  release check. `validate_stage_advance(..., recalibrating=True)` allows exactly that and nothing else.
- **Stage 1 carries no calibrator.** Section 0 says heads C–G are "attached"; Section 1.4 trains G only
  in Stage 2. I read the Stage-1 identity as heads C–F (G absent) and Stage 2 as C–G with a required
  `parent_checkpoint_id`. If you meant G attached-but-untrained in Stage 1, relax the `"G" in heads` check.
- **Stage 2 must match its parent's state.** Stage 2 trains only G on a frozen encoder, so
  `validate_stage2_lineage` requires source checkpoint, tokenizer, data-manifest hash and loss config to
  equal the named Stage-1 parent's; a mismatch means a different lineage, which Section 7 says needs a
  new record. This is my reading of "calibration is fit against a specific Stage-1 state".
- **Zero loss weights are rejected.** Weights are empirical, but a zero weight silently disables an
  objective the spec requires (and `L_abstain` must be non-zero explicitly), so every term must be > 0.
- **Failure-table severity.** The spec labels adversarial failure, the regression trip-wire and
  non-actionable confidence as blockers. It calls schema validity a "hard requirement" and Test reuse a
  "process failure" that invalidates the pass; I marked both `hard_blocker=True`. Say so if you would
  rather the Test-reuse row be a non-blocking process note.
- **Spec inconsistency: adversarial mode names.** Phase 11 §6.4 names `fabricated_grounding_bait`,
  `spurious_keyword_correlation` and `experience_complexity_collapse`. Phase 7's D13 registry
  (`dataset.FAILURE_MODES`, the Phase 15 list) contains none of them, so no Adversarial record can
  currently carry those tags. `adversarial_gate` evaluates whichever modes you pass (defaulting to the
  three Phase 11 names as required) and `adversarial_registry_gaps` reports the mismatch; resolving it
  is a spec decision (rename in one phase, or map between them), not something to patch silently here.
- **Not implemented:** Phase 1 §9's per-record failure judgments (deciding whether one output
  fabricated grounding, etc.) — that needs gold comparison and belongs to Phase 14; `L_decouple`'s
  pointer-distribution similarity (only its Rule 7 evidence-identity audit is here); the human-review
  sampling rate for generated prose (an open item in the spec).

## Phase 12 judgement calls (`context_training.py`)

- **Rules and gates, not a retriever or trainer.** Ranking, budgeting, conflict resolution and grounding
  degradation are implemented as deterministic functions over segments and claims (what A2/A3/H would
  compute), so a real retriever or head can be checked against them. Nothing learns anything here.
- **Tier 7 is blocked whenever Tier 6 is.** Section 8/open items make Tier 7 contingent on Tiers 2–6
  clearing their gates, and Tier 6 is blocked pending a Phase 4 addendum that does not exist. So
  `validate_tier_attempt(…, 7)` fails until that addendum lands and Tier 6 is promoted. That follows the
  spec literally; if you meant "Tiers 2–5 plus Tier 6 if unblocked", it is a one-line change.
- **"In order" vs "a failed tier does not block downstream".** Read as: an earlier tier must have been
  *decided* (promoted, or its one-shot Test spent without promotion) before a later one starts, and the only
  hard dependency is the spec's own — Tiers 4–5 need Tiers 2 and 3's *retriever infrastructure* flagged
  ready, not their accuracy gate. I did not add a Tier 3→2 infrastructure dependency the spec doesn't state.
- **Tier-appropriate reference uses "any pointer within the ceiling".** §7.2 says "ground truth's own
  evidence pointer" (singular). With several aligned tiers I treat the tier as supporting GT's answer if
  at least one lies at or below the ceiling; "all must" would be stricter. Evidence that is not aligned to a
  segment is `excluded` from scoring rather than guessed (Phase 8 §5.1's value-only fallback).
  Ground-truth `evidence` in this package is a string, so the alignment (`evidence_tiers`) is supplied by
  the caller.
- **`overclaim` even when it matches GT.** A non-Unknown answer where the tier supports none is an
  overclaim regardless of value (§7.2). A GT-Unknown record answered confidently is also an overclaim.
- **Type priors are required arguments.** §4 names "segment-type prior" from Phase 3's matrix, but that
  matrix has no numeric form in this package (Phase 8's ceiling table gives CODE and DOC the same
  ceiling, so it cannot break that tie). `rank_segments` takes the prior as input instead of inventing one.
  Signal order is fixed (overlap, directness, type prior, authority, recency); weights are not a thing.
- **Conflict precedence details are my reading.** "Directly checkable" sources are CODE, CONFIG and
  DEP_GRAPH (the spec names code/config and gives a dependency-version example). Same-tier order is
  authority, then canonicality, then recency; the spec lists "authority/recency extended with canonicality"
  without a priority between the three. An intent conflict with no eligible text claim is unresolved.
- **Degradation keeps the value only if some evidence survives.** `degrade_to_ceiling` drops out-of-scope
  pointers, re-clips the source, resets confidence to None (the lower tier must re-derive its own) and
  falls back to Unknown if nothing survives. It cannot tell whether a surviving pointer justifies the
  *value* on its own — that judgment belongs to the model and H2.
- **Multi-ceiling rendering must include N and N−1.** §6.2 says "multiple tier ceilings"; I require the
  tier's own and the previous one. Backward consistency against Tier 1 is measured separately (§7.7).
- **Calibration preservation uses Phase 11's separation measure** (high- minus low-confidence accuracy per
  cell, now with a tier in the key). The spec says "not worse"; the tolerance is the caller's.
- **Decision #10 is enforced as a tripwire.** `schema_enactment_violations` fails if `PROVENANCE_SOURCE` or
  the ceiling ranks are widened; the `VERIFIED` strength is exposed only as `PROPOSED_SCHEMA_CHANGE`.
- **No failure table.** Phase 12 has no equivalent of Phase 11 §8, so there is no dispatch function;
  the outcome of a failed tier is a `decision_record`, per Decision #11.
- **Not implemented:** Pass-0 entity extraction itself (only the call-order contract), the retriever,
  the human-review spot sample, the Tier 7 convention-profile format (an open item), and any Phase 4
  addendum work.

## Phase 13 judgement calls (`instruction_training.py`)

- **Scope: robustness rules, not a trainer.** Like Phases 9–12, there is no encoder or loss
  implementation here. `stability_violations` is `L_stability` written as a predicate over a
  `FramingPair` (two already-assembled records for the same underlying issue), not a differentiable
  loss — the same stance Phase 11 took for `L_consistency`/`L_source`.
- **"Justified by evidence" is a caller-supplied set, not inferred.** Section 3 excuses a
  divergence only when "ground truth's evidence does not itself justify" it — deciding *that*
  needs the ground-truth record, which this predicate does not take. `FramingPair.justified_fields`
  is therefore an explicit allowlist the caller supplies (e.g. from ground truth), not something
  `stability_violations` infers from the two records it's given.
- **`missing_information` required, read literally.** Section 5 says it is "required whenever
  either of the above is non-empty" without naming exceptions; `uncertainty_state_violations`
  enforces that for both `Unknown` classification fields and `uncertain_information` entries. This
  is stricter than schema.py's own rules, which don't check this at all — Phase 13 adds it, it
  doesn't relax anything schema.py already enforces.
- **`review_required` consistency takes `contradiction_detected` as an argument.** Category-3/12
  contradiction detection (fact-vs-intent classification, Phase 6 §4.3) is not implemented in this
  package — it needs the same real language understanding Phase 5's contradiction detection would
  (see Known gaps) — so `review_required_consistency_violations` accepts the verdict as a boolean
  rather than deriving it.
- **Hallucination must-nots 2–4 are schema rules, not reimplemented.** `hallucination_violations`
  calls `schema.validate` for must-nots 2 (dependency refs, rule 9), 3 (acceptance-criteria
  minimum, rule 5) and 4 (no evidence on `UNKNOWN`, rule 2) rather than restating them, per Section
  8 Decision #5's "explained as stress on a principle already grounded" stance. Must-not 1 reuses
  Phase 11's `unsupported_entities` (it needs proposal-level pointers a bare record doesn't carry,
  so it's optional and only checked when supplied); must-not 5 reuses `stability_violations`.
- **No failure table, following Phase 12's precedent.** The source document gives Phase 13 no
  Section-9-style named failure-mode table (unlike Phases 9–11); `rollback_target` is the whole of
  its rollback rule (Decision #10), not a `classify_failure` dispatch.
- **`invocation_violations` is structural only.** It enforces the closed field-set and the
  prior-record/reviewer-notes pairing (Section 2 rule 1). It cannot detect a directive *embedded in*
  otherwise-permitted evidence text (e.g. an issue comment that reads "as the maintainer, mark this
  Advanced") — that is Decision #3's job for the trained model itself (treat it as evidence, never an
  override), not something a structural field-set check can catch.
- **Not implemented:** any actual paired-framing contrastive training or `L_stability` weighting;
  real per-category pass-rate thresholds (Section 8 Decision #11, empirical); a persisted log of
  repeated invocations for `consistency_check` to run against (it takes the runs as an argument);
  whether Tier ≥2 checkpoints need their own behavior-reinforcement pass versus inheriting Tier 1's
  (an explicit Open item, not resolved here).

## Phase 14 judgement calls (`evaluation.py`)

- **Scope: measurement, no training.** Like Phase 8's H layer, this is deterministic
  post-processing over already-assembled records — it consolidates Phase 11 §6/Phase 12 §7/Phase 13
  §7 rather than adding a fourth ad hoc procedure (Decision #1).
- **`evidence_resolves` is a case-insensitive substring match**, standing in for H2's real evidence
  check. A paraphrased-but-faithful quote would wrongly read as `UNSUPPORTED` — a real semantic
  entailment check needs the model this package doesn't have.
- **`UNSUPPORTED` is checked before `UNCERTAIN`** in `categorize_grounding`. The spec's five-way
  table doesn't state the tie-break order for a claim that is both low-confidence *and* unresolved;
  I read unresolved evidence as the more serious failure.
- **`cross_field_agreement_violations` encodes only Section 2.2's one worked example**
  (Documentation + database-reasoned Backend role) as a rule table. There is no general algorithm in
  the spec for detecting semantic cross-field conflicts — a real implementation would need the same
  language understanding Phase 5/13's contradiction detection would.
- **`malformed_report_violations`'s blended-column check is a heuristic** keyed on a metric name
  appearing in both `l1`/`l2`/`l3` and `human_columns` — not a full schema validator for what counts
  as "merged."
- **Hallucination typing is caller-supplied.** `hallucination_breakdown` takes a `hallucination_types`
  map per item rather than inferring which of the six named types an `UNSUPPORTED` claim is — that
  classification needs the detectors named in Section 7's table (H2, schema checks, the framing-
  robustness benchmark), which the caller is expected to have already run.
- **Not implemented:** any real `EvaluationRun` against a trained checkpoint (there is nothing
  trained to run this against), the Section 5 human-review protocol's actual reviewer pool, and
  per-cell/per-type acceptance thresholds (Section 11, deliberately empirical and deferred).

## Phase 15 judgement calls (`adversarial.py`)

- **Scope: taxonomy, vocabulary and test logic, not a populated suite or a trainer.** Like Phase 14,
  this is measurement/specification-only; a case the model fails routes back to Phases 10–13
  (Decision #3 precedent).
- **`FAILURE_MODES` is asserted equal to `dataset.FAILURE_MODES`** at import time. `dataset.py`
  already gated on this set (Phase 7 D13) before Phase 15 existed to define it; the assertion is a
  tripwire against the two silently drifting apart, not a design choice either module makes alone.
- **Not every failure mode has a mechanical pass-check.** `label_authority_override` (Group A) needs
  judging whether the model's classification followed the *text* rather than a conflicting label —
  that is HT1's job (Section 8), so `check_failure_mode_pass` returns `None` for it, meaning "human
  review only," not "always passes."
- **AT4 reconstructs a `FieldProposal` from the finalized record** and re-runs
  `architecture.clip_to_source_ceiling` against it, rather than re-deriving the source-ceiling table
  independently. This means AT4 is only as good as the record's own `provenance.evidence` text
  matching a real segment id — once a real H2 pipeline exists with actual pointer ids threaded
  through to evaluation time, this should be rewired to check the *pre-assembly* proposal directly.
- **AT3's degradation-lattice check reads `architecture.InferenceTrace.degradation_level`** (0/1/2/4)
  plus whether the result is a `RejectedResult`, since `InferenceTrace` has no explicit ordered
  `steps` list — the check infers ordering from the level number and the presence/absence of logged
  repairs/downgrades rather than a literal step sequence.
- **`bait_only_signal_violations`'s routing rule is enforced as a check, not auto-applied.** Section
  3.4 says a bait-is-the-only-content case must be *routed* to Group B; this package flags the
  violation but does not itself reclassify the case, since that's a construction-time editorial
  decision (HT5's job), not something to do silently.
- **Pair collapse uses a caller-supplied majority-class baseline.** Section 9's "at or below chance"
  check (`pair_systematic_collapse`) needs the actual class distribution for each pair, which is
  real-data work, not something this package can derive without a populated Hard-case set.
- **Not implemented:** any actual constructed test-case content (real/synthetic issues, real bait
  elements) — this package is the taxonomy, vocabulary, schema and grading logic the content would
  be run through, not the ≥20-instances-per-pair corpus itself (Section 5's minimum, and Section 9's
  Open items, are explicitly deferred to when real volume exists).

## Phase 16 judgement calls (`error_analysis.py`)

- **Hallucination's *default* family is Inference problem, never Training directly.** Section 1's
  table row reads "Inference problem (or Training, if systematic)" — `DEFAULT_FAMILY_FOR_ERROR_TYPE`
  encodes only the default; the Training upgrade only happens through `systematic_reclassification`
  (Section 3.4), never as a first attribution, so a single hallucinated record can never land on
  Training problem by itself.
- **The six-step diagnostic sequence takes pre-computed signals, not live pipeline calls.** `diagnose()`
  mirrors every other Phase 9–15 module's style: it's the checkable *rule*, not an executor that
  itself runs Phase 5's cleaning validators or Phase 6's adjudication process. Wiring real
  `schema_violations`/`readjudication`/`evidence_check`/`distributional` inputs from those phases'
  actual outputs is real-pipeline work once a checkpoint exists to fail against.
- **Step 4's internal order (within "evidence-trail check") is my reading.** The spec lists five
  bullets in a fixed sequence but doesn't explicitly say what happens if more than one signal fires
  at once (e.g. an unresolved conflict that's also read-but-not-fully-cited). I check
  hallucination → context failure → retrieval failure → context conflict → reasoning failure, keeping
  the spec's bullet order and putting Context conflict before Reasoning failure since a conflict is a
  more specific diagnosis than "the value didn't follow from otherwise-fine evidence."
- **`systematic_reclassification` only reclassifies out of Inference problem.** Section 3.4's own
  worked example is Inference-problem records (Hallucination/Reasoning); the spec doesn't name a
  parallel cluster-promotion path for, say, a cluster of `Insufficient examples` records escalating to
  Architecture problem, so I didn't invent one — `_RECLASSIFIABLE_FAMILIES` is deliberately narrow
  rather than generalized past what Section 3.4 actually describes.
- **Severity's four bands are checked in strict Critical→High→Medium→Low order with no weighting.**
  Section 4 says "any one qualifies" per band but doesn't say what happens when flags from multiple
  bands are set on the same call; `assign_severity` returns the highest band with any qualifying
  flag, which matches the doc's own worked contrast (a Data quality error is "frequently Critical...
  and just as often Low" — i.e. severity is decided per-instance by whichever criteria actually
  apply, not summed).
- **`excluded_from_failure_corpus` is a caller-side check, not enforced inside `build_report`.**
  Section 4 says a correct abstention on bad input "is not a failure severity at all" and such cases
  "are not `FailureRecord`s" — this package gives you the predicate to decide that *before*
  constructing a `FailureRecord`, but doesn't retroactively filter a report's input list, since a
  `FailureRecord` that made it that far already passed `validate_failure_record`'s required-fields
  check and silently dropping records from a report felt like exactly the kind of quiet aggregation
  Phase 14/16 are designed to avoid.
- **`mark_resolved` reverts a bare self-reported `"resolved"` to `"in_progress"` rather than rejecting
  it outright.** Section 7's re-entry gate says resolution requires re-verification "not on the
  owning phase's own say-so" — I read that as the status claim being *wrong*, not the call being
  invalid, so the function corrects the status rather than raising, on the theory that a caller
  setting `status: resolved` without evidence is a workflow mistake to fix, not an error to crash on.
- **`hard_case_or_adversarial_promotion_allowed` is a thin wrapper over Phase 15's own `ht5_...`
  check**, not a new gate — Decision #9 is explicit that Phase 16 reuses Phase 7/15's existing
  promotion discipline rather than creating a second one, so there's deliberately no Phase-16-specific
  quality bar here to diverge from Phase 15's.
- **Not implemented:** any live wiring to a real `EvaluationRun`'s failing records (there is no
  checkpoint yet to produce one), the numeric severity/threshold calibration Section 8's Open items
  defer to real data, and the automated-vs-human-confirmed agreement-rate measurement for the
  mechanical steps of Section 3.2 (also an Open item, needing a populated `FailureRecord` corpus
  first).

## Phase 17 judgement calls (`improvement.py`)

- **The Section 4.1 tolerance never applies to the *targeted* dimension.** The spec's exception is
  phrased around "at most one non-targeted, sub-Medium regression" — I read the targeted dimension as
  categorically ineligible even at Low severity, since the point of naming a target metric (§3.3's
  pre-registration) is that it's expected to move in the improving direction; a regression there,
  however small, means the change didn't do the one thing it was proposed for. `apply_tolerance`
  forces `regressed_fail` whenever `is_targeted=True`, which is stricter than a literal reading that
  only excludes Hallucination and L0 by name.
- **L0 structural validity is checked as a Section 5 criterion, not folded into the ten-dimension
  regression table.** The spec's Section 4 dimension list is exactly ten items and doesn't include L0;
  Decision #7 pairs Hallucination and L0 together as "never eligible for the tolerance," but only
  Hallucination is one of the ten dimensions being toleranced in the first place. `acceptance_checklist`
  keeps L0 as its own required-100% criterion (criterion 2), matching how Phase 14 §11 already treats it,
  rather than inventing an eleventh regression-table row the JSON schema doesn't have room for.
- **`classify_dimension_raw_result`'s significance test is a caller-supplied `p_value`, not a computed
  one.** §3.3 names *which kind* of test fits each metric type (a proportion test for accuracy/F1, a
  paired comparison for calibration curves) without specifying an implementation; recomputing either
  from raw Phase 14 data is real-statistics work this package doesn't have the underlying per-record
  arrays for. The pre-registered significance level (`alpha`) and the [INSUFFICIENT DATA] threshold are
  both required arguments with no default, consistent with Phase 11 Decision #10's precedent of never
  defaulting a threshold the spec itself defers.
- **`rollback_to_failure_record`'s `error_type` mapping is a two-way split, not a full table.** Only
  `sign_off_based_on_incorrect_data` gets its own named error_type (`Data quality`, matching Section
  6's own instruction to route it "as a Data-quality-class failure of the evaluation pipeline, not the
  model"); the other three triggers all default to `Model misunderstanding` since the spec doesn't
  name a distinct `error_type` for a live regression/hallucination reappearance beyond "the exact
  failure that caused this rollback" — the real Phase 16 `error_type` for a specific production case
  still needs the six-step `diagnose()` sequence run against it, which this function doesn't do.
- **`malformed_candidate_report_violations` only checks regression-table completeness and
  checklist-presence**, not a full JSON-Schema validation of the `ImprovementCandidate` shape in
  Section 7 — that's `validate_improvement_candidate`'s job. Splitting the two mirrors how Phase 14/16
  separate structural validity from "is this report honest about what it's reporting" (Section 10 /
  Section 6 there), rather than one function doing both.
- **Not implemented:** any live wiring to a real released checkpoint or `EvaluationRun` history (there
  is nothing to compare a first candidate against yet), the numeric significance level and per-cell
  tolerance magnitudes Section 8's Open items explicitly defer to an empirical history of real
  `ImprovementCandidate` experiments, bundled multi-change-type candidates (also an Open item), and any
  actual production monitoring feed for Section 6's rollback triggers.

## Phase 18 judgement calls (`versioning.py`)

- **`required_bump` takes the change type(s) that fired, not a single label, and the highest wins.**
  A real candidate often combines triggers (e.g. more training data plus a calibrator refit); rather
  than force the caller to pre-resolve that to one string, the function accepts a list and applies
  Section 2.2's "highest applicable trigger wins" rule itself. A PATCH claim without a passing
  equivalence run raises rather than silently upgrading to MINOR, so a caller can't accidentally
  claim PATCH by omission.
- **`validate_model_version_record` checks Section 2.4's shape and the registry invariants that are
  answerable from the record alone** (ref formats, lineage consistency, the three Section 2.6 fields).
  R1–R3 and R9–R10 need a live registry (other datasets' publication status, other records' model_ref
  usage) to check, so they're exposed as separate functions (`propagate_taint` for R10) rather than
  folded into one validator that would need a database to run.
- **`validate_known_limitations`'s completeness check is optional (`evaluation_runs=None` skips it).**
  Section 2.6 Rule 1 requires limitations to be *derived* from attached runs, but a record built
  before any run is attached (the pre-seal view) can't be checked against runs that don't exist yet;
  the function checks shape unconditionally and the derivation-completeness rule only when runs are
  supplied, rather than making every caller pass an empty list to mean "no runs yet."
- **Status-graph terminal states (`rejected`, `rolled_back`, `withdrawn`) have no outgoing edges,
  including to `withdrawn` itself** — the spec's diagram shows `withdrawn` reachable "from any state,"
  which I read as any state still capable of further action, not from states that are already terminal
  (a rejected candidate withdrawing from what, exactly). Say if you meant something can genuinely
  move from `rejected` to `withdrawn` as a distinct status.
- **`propagate_taint`'s cleared-node semantics: a cleared ref is still reported as tainted-by-
  inheritance, but propagation stops there.** Section 6.4 C3 says a descendant is tainted "until
  cleared by its own BC1/BC2 re-run," which I read as clearing being per-ref (it stops that ref's own
  taint status and its downstream propagation) rather than retroactively un-tainting the ref for
  historical purposes — a model that *was* trained on contaminated data doesn't stop having been so
  once a later check clears its own outputs.
- **BC2/BC6/BC7 are implemented as the fingerprint-set-intersection / interface-only stand-ins the
  spec's own text anticipates**, not the real n-gram/MinHash/cross-lingual scan (BC2) or memorization/
  freshness-differential probes (BC6/BC7) — those need an actual corpus and a trained model to run
  against, which don't exist yet. `bc1`, `bc4`, `bc8`, `bc9` and `disposition_for_benchmark_sourced_
  failure` are checkable as pure predicates today and are fully implemented.
- **`release_record_completeness_violations` treats every top-level field's presence-but-empty as a
  gap**, including fields whose "empty" might legitimately mean "nothing to report" (e.g. an empty
  `hard_ceilings.hallucination_ceiling_runs`) — Section 9 Rule 1 says a record is complete "iff every
  field is present and resolvable," and an empty list doesn't resolve to anything, so I treated empty
  as equivalent to missing everywhere except `rollback.redeploy_bound`, the one field the spec names
  as legitimately deferrable.
- **Not implemented:** any live registry service, database, or trusted clock (Phase 18 explicitly
  scopes those out as "a specification of records... not a service"); the numeric thresholds Section
  10.3 defers (exposure/burn limits, power floors, temporal margins, the contract-freeze decision);
  the `private_authored`/`vault` partitions' sourcing and custody; and the five proposals to owning
  phases (§10.2) — this package implements Phase 18's own authority, not the schema/dataset/Phase 16/17
  changes it proposes to them.

## Phase 19 judgement calls (`production_readiness.py`)

- **Section 8.2's 7 review triggers are layered on top of Phase 2's R1–R6, not merged into them.**
  The two tables genuinely disagree: trigger 1 names `role`/`task_type`/`complexity`, while Phase 2's
  R1 names `role`/`experience_level`/`complexity` (`task_type` vs `experience_level` — a different
  field); trigger 2's `overall_confidence` floor is 0.60, while Phase 2's R3 uses 0.50. Rather than
  silently pick a winner or edit `derived.py`'s schema-level rule (which Phase 2 owns and other
  modules already depend on), `production_review_triggers` implements Section 8.2's table verbatim as
  an additive, release-suite-level gate (`P1`–`P7`), and this README flags the mismatch as a spec
  tension to reconcile rather than papering over it. Triggers 3–7 (conflicting evidence, missing/
  truncated input, injection detected, context-fetch failure, INFERRED-below-threshold) have no
  Phase-2 counterpart at all, so those five are purely new.
- **`classify_ladder_tier`'s T2-vs-T3 order matters, and T3 is checked first.** A record where every
  classification field is Unknown is *also* true of "any classification field is Unknown" (T2's
  condition), so T3 (all four Unknown, empty `acceptance_criteria`, low `overall_confidence`) is
  checked before the broader T2 test — otherwise a genuinely T3 case would always read as T2. In
  practice, `overall_confidence` staying low requires the *other* required fields (title, summary,
  technologies, ...) to be Unknown too, not just the four classifications — Section 8.3's own T3
  description ("free-text fields restate only what the issue says") reads as consistent with that,
  but the spec doesn't spell out exactly which fields must go Unknown for `overall_confidence` to
  drop, so this is calibrated to the weighted-mean formula in `derived.py`, not an independent rule.
- **The S0–S3 scale (`assign_severity_s`) is deliberately a *different, parallel* axis from Phase
  16's Critical/High/Medium/Low (`error_analysis.assign_severity`), not a renaming of it.** Phase 19's
  scale is release-blocking (does this case stop a GO decision), Phase 16's is root-cause severity
  (how bad is the underlying defect once diagnosed) — a single case could plausibly be S0 (fabrication,
  blocks release) and Medium (root cause was weak-not-fabricated evidence that got miscategorized
  upstream) at the same time. No function in this module coerces one scale into the other.
- **`evidence_confidence_cap_violations` (Section 6, rule 6) is new — nothing upstream enforces it.**
  `architecture.py`'s `clip_to_source_ceiling` caps how strong a *source label* (EXPLICIT/INFERRED/...)
  a segment type can support, which is a different axis from capping *confidence* once a source label
  is already assigned. A field could pass every existing check (valid source, evidence present,
  schema-valid) while still reporting INFERRED confidence above 0.75 or claiming EXPLICIT confidence
  above 0.9 on an ambiguous span — this function is the first place that gets checked.
- **`decision_rule`'s CONDITIONAL GO branch requires an explicit `MajorMitigation` per shortfall,
  each under the 3-point ceiling with both a mitigation and a re-test date filled.** Section 9.1 says
  "with a written mitigation... and a dated re-test," which I read as a per-item requirement, not a
  blanket statement covering all shortfalls at once — a candidate with two Major shortfalls needs two
  `MajorMitigation` entries, and a shortfall left unmitigated forces NO-GO even if it's within 3
  points, since Section 9.1 doesn't offer an unconditional "close enough" path.
- **`hallucination_release_violations`'s per-category ceilings are read off Section 2.1/Section 7's
  precision/recall numbers, not restated from a separate threshold table** — the spec gives
  "technologies precision ≥97%" and "dependencies precision ≥95%" as *capability* thresholds, and I
  translated those into hallucination-rate ceilings (invented-share ≤3% / ≤5% respectively) since
  Section 7 doesn't give its own separate numeric ceiling for those two rows the way it does for the
  zero-tolerance categories. Say if you'd rather these stay unset (required arguments, no default)
  until Section 7 gives its own number.
- **Not implemented:** any real `EvaluationRun`/checkpoint to gate (Section 0's own PENDING status —
  there are no test results to fill the decision record with yet); the human-annotator-driven parts
  of Sections 4/6/7 (hallucination scoring needs two independent annotators at κ≥0.7, which this
  module consumes as a supplied rate, not something it computes); and the actual release-suite
  construction (Normal/Hard/Ambiguous/Adversarial/Context-aware/Regression case authoring) — this
  module checks a suite's *composition* against the Section 4 minimums, it doesn't author the cases.

## Phase 20 judgement calls (`continuous_learning.py`)

- **`validate_feedback_record`'s "exactly one value slot" rule treats `False` specially.** A
  submitter saying "the model was *not* correct" isn't itself one of the three answer types
  Section 2.2 lists (`proposed_value` / `model_was_correct` / `unknown_is_correct`) — it's the
  absence of an answer, typically paired with a `proposed_value`. So `model_was_correct: False` on
  its own does not count as filling the slot, only `True` does (mirroring `proposed_value`, where
  any non-`None` value counts). This keeps a bare "no" from silently satisfying G0.
- **`classify_feedback`'s ambiguous branch returns `noisy_feedback`, not a fourth verdict.** Section
  3.2 step 4's "no" leaf mentions a "hard-case candidate" when the issue is genuinely ambiguous, with
  gold = Unknown/low-confidence — but Section 3.1's own verdict table only lists six named verdicts,
  and "hard-case candidate" isn't one of them. I read the ambiguous flag as routing the *item* (via
  Section 4's annotation workflow, once it reaches annotation) rather than creating a seventh verdict
  this classifier would have to invent. `signals["ambiguous"]` is accepted as an input but currently
  changes nothing observable — flag it if you'd rather it force `useful_correction` down a
  hard-case-tagged path instead.
- **`g1_violations` never asserts a check it can't evaluate.** Check 6 (Section 3.3's "reproduction" —
  an independent model run plus a human sample) needs infrastructure this package doesn't have
  (a second model to run), so it's simply absent rather than stubbed to always pass; a caller
  supplying nothing beyond a feedback dict and snapshot text gets checks 1–5 only, honestly.
- **`missing_example_types` only fires on a non-empty batch.** Section 4.2 says all six types are
  "required, not just corrections," but a single feedback item obviously can't itself be all six —
  the check is a *batch*-level composition gate (call it once you have a stack of examples heading
  to a training mix), not a per-item requirement, which the spec's own §6.3 quota table (per-mix
  percentages) also assumes.
- **Overfitting caps, training-mix minimums, and drift thresholds are the spec's own stated
  defaults, carried over verbatim** (5%/2%/0.5% caps, 40%/40%/10%/25%/10%/50% mix shares, PSI 0.2,
  ECE +0.03, etc.) — Section 12's own Assumptions say these are starting values to reconcile with
  Phases 14/18/19 once real data exists, not calibrated numbers. Every function that uses one takes
  it as a keyword default, never a hardcoded literal with no override.
- **`weights_change_justified("team_convention", ...)` ignores its `condition_met` argument and
  always returns `False`.** Section 11.1's own table says weights change "Never (subjective) unless
  convention converges across independent repos **and guidelines change**" — the second half of that
  condition is a guideline-authoring decision this predicate has no way to observe, so rather than
  accept an unverifiable "trust me, guidelines changed" flag, the function keeps this path
  categorically closed. A real convergence-triggered guideline change should route through the
  `new_engineering_pattern` or `new_task_category` keys instead, once it's actually a guideline
  change and not just repeated preference feedback.
- **`health_metric_violations` hardcodes only the one rule the spec states unconditionally** (a
  rising "incorrect correction" share). Section 11.4's other five metrics (repeat-failure rate,
  forgetting, held-out-repo gap, cost per example, backlog age) get no invented threshold — they're
  read from a `caller_thresholds` dict so a real number can be supplied once one is measured, per the
  same "no invented results" discipline every phase since Phase 9 has followed.
- **`validate_lifecycle_history` doesn't special-case a NO-GO/rejected exit.** Section 10.3's lifecycle
  is a straight line to `released`, but a real candidate can stop at the Phase 19 decision step
  without ever reaching it. Rather than hardcode one more terminal label this package doesn't
  otherwise define, the function accepts (and ignores) an opaque `"rejected_at_decision"` marker in
  the history list, so a caller can record the stop without the validator treating it as an unknown,
  out-of-order state.
- **Not implemented:** the feedback ledger, annotation workspace, dataset store, retraining
  controller, and monitor themselves (Section 1.1's components) — this module is the rule layer they
  would each enforce, not the services; the statistical anomaly detector and honeypot mechanism
  behind `quarantine_required`'s two boolean inputs (Section 9.2) — those are real detection systems
  this package has no data to build; and the registry-candidate/pattern-discovery/coverage-map
  machinery of Section 11.2 (recurring-term clustering, cluster naming) — genuinely exploratory work
  over real production traffic, not a checkable rule.
- **Found while wiring the demo:** `production_readiness.invariant_9_violations`' derived-task-id
  check flagged a small fraction of genuinely random `uuid.uuid4()` values as "derived from the issue
  number," because a short numeric `issue_number` (e.g. `"42"`) turns up as a substring of a random
  UUID's hex digits by chance often enough to make the full test suite flaky. Fixed by only treating
  the substring match as evidence of derivation once `issue_number` is at least 4 digits long — long
  enough that coincidence is implausible, while still catching a task_id literally built from the
  issue number. Confirmed stable over 30 repeated runs.

## Known gaps

* No populated Evaluation Report (Phase 14) or Adversarial/Hard-case test corpus (Phase 15) — both
  packages are frameworks/vocabularies run against real checkpoints and real data, neither of which
  exists yet.
* No populated `FailureRecord` corpus or real `ErrorAnalysisReport` (Phase 16) — same reason: there is
  no trained checkpoint to produce real evaluation failures to diagnose yet. Numeric severity/threshold
  calibration and the automated-vs-human root-cause agreement-rate measurement (both Section 8 Open
  items) are deferred to when one exists.
* No live Model Registry, Benchmark Edition, or Exclusion Ledger (Phase 18) — `versioning.py` is the
  rule layer a registry service would enforce, not the service; there is no `ModelVersion`, `itu-bench`
  edition, or trained checkpoint yet for it to govern.
* No real Phase-19 decision record, release suite, or reproducibility run (Phase 19) — `production_
  readiness.py` is the release-gate rule layer; there is no checkpoint to run the release suite
  against, so `pending_decision_record` is the only decision record this package can honestly produce.
* No real feedback ledger, annotation workspace, dataset store, retraining controller, or monitor
  (Phase 20) — `continuous_learning.py` is the rule layer those five components would enforce once
  built; the Phase-20 decision record ships `PROPOSED` with blank approvals/owners/baselines, exactly
  as Section 12 specifies for a design with no collected feedback yet.

* No contradiction detection (Phase 5 §6, V12) — needs real language understanding, not string rules.
* No real-name detection (needs NER); only `@mentions` and home-directory usernames are masked.
* Leakage detection catches long pasted/quoted overlap with Tier-6 text (5-word shingles, ≥8 shared and
  ≥60% containment). It will not catch a paraphrased resolution.
* Table repair handles only a missing trailing pipe.
* Repo-topic canonicalization and the human spot-audit (`HUMAN_REVIEWED` tag) are not implemented.
* Alias table is small (`aliases-0.1`); extend `_CANON`/`_ALIASES` in `clean.py`.
* No annotation tooling: no double-blind assignment queue, no UI, no persistence for `annotation_meta`
  across sessions. `annotation.py` implements the rules Section 6–8 place on such a tool, not the tool.
* Section 6.1 tier routing (`annotation_tier`) takes `domain_kappa` as an argument rather than computing
  a rolling window itself — there is no persistence layer here to track a domain's agreement history.
* Section 8.2's continuous 5% spot-check sampling and Section 8.5's per-annotator rolling-window
  performance tracking are not implemented; both need a persisted record store this package doesn't have.
* No encoder, no classification/extraction/pointer/generation heads, no calibrator — Phase 8 is
  architecture, not a model; there is nothing to run inference with except the deterministic H layer and
  the disclaimed `HeuristicStubEngine`/`NullEngine` fixtures. A3 (retriever) and A4 (leakage guard) for
  Tier ≥2 are not implemented; only Tier 1 (`segment_issue`) is active, matching Phase 8's own status table.
* No base model, no corpus, no compute, no head training, no retriever — Phases 9–12 are gates and lifecycle bookkeeping only (see
  above); there is no adapted or domain-specialized checkpoint anywhere in this package, and neither
  `pretrain.py` nor `domain_training.py` calls out to an actual tokenizer, probe suite, or trainer.
* No ITU-1 v1-b checkpoint, no `L_stability` training, no fact-vs-intent contradiction classifier for
  categories 3/12 — Phase 13 (`instruction_training.py`) is the same kind of gates/contract package as
  Phases 9–12, applied to behavior instead of accuracy; see its own judgement-calls section above.


## Phase 7 judgement calls (`dataset.py`)

- **Cluster ids on GOLD examples.** `example.py` forbids quality flags on GOLD, so a `near_dup_cluster:` flag can never mark
  a GOLD example. `dataset.py` therefore also reads `corpus_meta.dedup_cluster_id`. Decide which one your pipeline writes.
- **Time windows.** Test needs `snapshot_fetched_at` strictly later than every Training/Validation record, so out-of-window
  records are dropped (and listed), not moved. Pass the real Phase 4 cutoffs; without them cutoffs come from data
  quantiles and the release lists that under `known_issues`.
- **Hard-case is carved out first.** Any issue unit (same issue, or same near-dup cluster) with a disagreement/adjudication,
  a non-empty `uncertain_information`, or a contrast-pair tag leaves the 80/10/10 pool wholesale. With
  `low_confidence` on (the default) that can remove many GOLD records from Test; drop it via
  `hard_case_types=("disagreement", "contrast_pair")` if that skews Test too far. Siblings of a curated record that have no
  reason of their own are dropped rather than left behind, to keep L2/L4/L6 true.
- **Stratification** is a per-stratum threshold override (`stratum_fn`, `stratum_split`) on the hash bucket, so an assignment
  never changes when the corpus grows. Rank-based stratification would rebalance better but reshuffles on every addition.
- **Balance targets.** Phase 3 gives no numeric floors or ceilings, so every axis reports `no_target_defined` unless you set
  `BuildConfig.targets`. The one default is synthetic share of Training < 0.5 ("minority share"), my reading of the spec.
- **L1 and Regression.** L2–L7 run against all six datasets. L1 runs on Training/Validation/Test only, because a Regression
  record relocated from Test legitimately shares its repo with the records left behind.
- **`not_applicable`.** D8/D9/D12/D13/D14 report `not_applicable` when there is nothing to exercise (e.g. no regression
  records yet). That does not block a release but is never shown as `pass`. D12 is decided at publish time.
- **Versions.** Changed content under an unchanged `example_id` is MAJOR for the three pool datasets, MINOR otherwise.
  Removing anything from hard-case/adversarial is treated as MAJOR (the spec only names the pool datasets).
  Regression removal raises an error.
- **Not built:** eligible-repo-list change detection (a MAJOR trigger), per-field-category agreement stats, benchmark index
  building (you supply the texts).
