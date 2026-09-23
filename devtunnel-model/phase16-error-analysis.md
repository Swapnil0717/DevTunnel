# Phase 16 — Error Analysis
## Specialized AI Software Engineering Model: The Error Analysis & Root-Cause System for ITU-1

Source of truth: Phase 1 (§8 success criteria, §9 failure criteria, §10 uncertainty policy, §11 grounding policy), Phase 2 (`task-schema.v2.json` — `provenance`, `sourceType`, `uncertainty`, `confidence`, `review`), Phase 6 (annotation/adjudication discipline), Phase 7 (six datasets — Training, Validation, Test, Hard-case, Adversarial, Regression), Phase 8 (§10 deterministic validators H1–H5), Phase 14 (Evaluation Framework — L0–L3 layers, metrics, benchmarks, reporting cube), Phase 15 (adversarial taxonomy, `failure_mode_targeted` vocabulary). This document does not redefine any of them. It answers the question Phase 14 and Phase 15 deliberately left open: a `EvaluationRun` or adversarial test result tells you **that** a record failed and **on which metric**; Phase 16 builds the system that determines **why**, and routes that "why" to a corrective action.

**Scope boundary.** This phase produces the **Error Analysis System** — an error taxonomy, a per-failure record schema, a root-cause diagnostic methodology, a severity model, a correction-routing workflow, a reporting structure, and the feedback loop that closes the training cycle. It does **not**:
- Recompute or redefine any Phase 14 metric, benchmark, or gate. Phase 16 consumes a `EvaluationRun`'s failing records as input; it does not re-score them.
- Redefine Phase 15's adversarial taxonomy or `failure_mode_targeted` vocabulary. That taxonomy classifies **test cases by what they target**; Phase 16's taxonomy classifies **observed failures by why they happened** — related, not identical, and Section 1 states the mapping rather than merging the two.
- Perform the corrective action itself. A root cause routed to "Phase 6, re-annotate" or "Phase 11, retrain" is a decision record, not the annotation or training run — those remain owned by their phases, per this project's standing practice of disjoint phase ownership (Phase 15 decision #11).
- Decide release or serving. Phase 16 can block promotion via Section 7's re-entry gate; it does not itself authorize release (Phase 1 §14, unchanged).

---

## 0. Position in the Pipeline

```
Phase 14: EvaluationRun (per checkpoint, per benchmark) ──┐
Phase 15: Adversarial/Hard-case test results ─────────────┤
                                                            ▼
                                          Phase 16 (this phase)
                                          ┌──────────────────────────┐
                                          │ Evaluation                │
                                          │    ↓                      │
                                          │ Error Analysis (§1, §2)   │
                                          │    ↓                      │
                                          │ Root Cause (§3)           │
                                          │    ↓                      │
                                          │ Dataset/Model Change (§5) │
                                          │    ↓                      │
                                          │ Retraining (Phase 10–13)  │
                                          │    ↓                      │
                                          │ Evaluation (Phase 14) ────┼──► loop
                                          └──────────────────────────┘
                        │
                        ▼
         Phase 16 deliverable: FailureRecord corpus (§2) +
         ErrorAnalysisReport (§6) + routed corrective actions (§5)
                        │
                        ▼
        [not authorized here] Retraining execution (Phase 10–13),
        Release/serving decision (Phase 1 §14)
```

**Why this phase exists separately from Phase 14.** Phase 14 §1 was explicit that "no layer is collapsed into a single number" — but a per-field, per-class breakdown still only tells you *what* failed, not *why*. Two records can both fail `task_type` classification with identical surface symptoms (wrong label) for entirely different reasons — one because the training distribution under-represented that label (a data problem), one because the model's architecture cannot attend to a signal that far back in a long issue (an architecture problem). Averaging those two into "task_type F1 dropped" and routing both to the same fix would waste a retraining cycle on the record it can't help and leave the other one unaddressed. Phase 16 exists to prevent exactly that.

---

## 1. Error Taxonomy

Every failing record (a record that fails any Phase 14 L0–L3 check or Phase 15 automated/human test) is assigned exactly one primary `error_type` from the fixed vocabulary below. A record may carry secondary/contributing error types (Section 2), but the primary type drives routing (Section 5) and must be the single best explanation of the failure, not a checklist of everything arguably wrong with the record.

| # | Error type | Definition | Typical symptom | Root-cause family (§3) |
|---|---|---|---|---|
| 1 | **Data quality** | The input issue itself is malformed, truncated, near-duplicate-conflicting, or otherwise defective independent of the model | Model output is reasonable given the input, but the input was bad | Data problem |
| 2 | **Incorrect annotation** | The ground truth the model is being scored against is itself wrong | Model's answer looks defensible or is independently verified correct; "ground truth" disagrees | Annotation problem |
| 3 | **Insufficient examples** | Ground truth is correct and the input is fine, but the training distribution had too few (or zero) examples resembling this case for the pattern to be learned | Systematic failure concentrated in one class/technology/repo-type, absent elsewhere | Data problem |
| 4 | **Label ambiguity** | Ground truth and model output are both defensible; the schema's classes (Phase 2 `$defs`) don't cleanly partition this case | Human reviewers disagree with each other, not just with the model (Phase 6 adjudication signal) | Annotation problem |
| 5 | **Model misunderstanding** | The model demonstrably misread what the issue is asking for (not a grounding or reasoning-chain failure — a comprehension failure) | Generated `summary`/`objective` describes a different task than the issue states | Training problem |
| 6 | **Context failure** | Relevant signal existed in available context (Phase 12 tiers) but was not used | Correct answer is derivable from Tier ≥2 context the model had access to but the output matches Tier-1-only reasoning | Context problem |
| 7 | **Retrieval failure** | Relevant signal existed but was never surfaced to the model (a context *assembly* failure, not a reasoning failure over what was given) | Correct answer requires context that Phase 12's retrieval/assembly step should have included and did not | Context problem |
| 8 | **Reasoning failure** | All necessary signal was present and correctly read, but the inference chain connecting evidence to conclusion broke | `evidence` correctly quotes the relevant text, but the field value doesn't follow from it | Inference problem |
| 9 | **Schema failure** | Output does not conform to `task-schema.v2.json` — an L0 failure (Phase 14 §1) | H1/H3/H4/H5 reject the record outright | Architecture problem |
| 10 | **Hallucination** | A field is asserted with `EXPLICIT` or `SUPPORTED_BY_CONTEXT` source type and evidence that does not exist in the input (Phase 1 §9 criteria 1 and 5; Phase 14 §7) | `evidence` pointer resolves to nothing, or names a component/technology absent from input | Inference problem (or Training, if systematic — Section 3.4) |
| 11 | **Confidence failure** | Source type and evidence are correct, but `confidence` is miscalibrated relative to Phase 14 §2.3's calibration benchmark | High-confidence wrong answers, or low-confidence right answers, concentrated in a cell | Training problem |
| 12 | **Technical knowledge gap** | The model's classification is wrong specifically because it lacks or misapplies domain/technology knowledge (not because of a comprehension or grounding defect) | Consistent mislabeling of a specific framework/technology's typical layer (e.g., treats a caching library as a database) | Training problem |
| 13 | **Context conflict** | Two or more context sources (issue text vs. repo context vs. history, Phase 12) disagree, and the model resolved the conflict silently instead of flagging it | `review.review_required` is `false` where a genuine cross-source contradiction existed | Context problem |

**Relationship to Phase 15's `failure_mode_targeted`.** Phase 15's vocabulary classifies *constructed adversarial test cases* by the failure mode they are designed to probe (e.g., `keyword_shortcut`, `role_split_underdetection`). Phase 16's taxonomy classifies *any observed failure*, adversarial-sourced or not, by its actual cause once diagnosed. A single `failure_mode_targeted` value can surface as different Phase 16 error types across different records — a `keyword_shortcut` adversarial case might fail as **Reasoning failure** in one instance and **Insufficient examples** in another, if the underlying cause differs. Section 6's dashboard reports both axes side by side; neither substitutes for the other.

**Worked example (from the master prompt).**

| Field | Value |
|---|---|
| Input | "Refactor auth middleware and update login state." |
| Ground truth | `role: Fullstack` |
| Model output | `role: Backend` |
| Error type | Context failure |
| Diagnostic note | The issue names two independently classifiable spans — backend middleware and frontend login state. The model's `evidence` for `role` cites only the middleware span; the login-state span is present in the input but absent from `provenance.role.evidence`, indicating the signal was read but not weighted, not that it was missing from context (which would instead be Retrieval failure) |
| Root cause | Training problem — the task-type/role joint-classification training distribution (Phase 11) under-represents issues with two independently-sufficient role signals, so the model learns to classify on the first/strongest signal rather than the union |

---

## 2. Failure Record Schema

Every failing record produces exactly one `FailureRecord`, extending — not duplicating — the `TaskUnderstandingRecord` (Phase 2) it was generated for. A `FailureRecord` references its source record by `task_id` rather than re-storing task fields wholesale, except where the whole-record snapshot is needed for audit (`model_output`).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.org/schemas/failure-record/1.0.0.json",
  "title": "Failure Record",
  "type": "object",
  "required": [
    "failure_id", "created_at", "source", "input", "ground_truth",
    "model_output", "expected_output", "error_type", "severity",
    "root_cause", "corrective_action", "training_data_disposition"
  ],
  "additionalProperties": false,
  "properties": {
    "failure_id": { "type": "string", "description": "UUIDv4, unique per failure record." },
    "created_at": { "type": "string", "format": "date-time" },

    "source": {
      "type": "object",
      "required": ["task_id", "benchmark", "checkpoint", "detected_by"],
      "properties": {
        "task_id": { "type": "string", "description": "References task_identity.task_id (Phase 2)." },
        "benchmark": { "enum": ["Test", "Hard-case", "Adversarial", "Regression", "Context-tier", "Human-review"] },
        "checkpoint": { "type": "string", "description": "Model checkpoint identifier (Phase 10-13 lineage)." },
        "detected_by": { "enum": ["automated_metric", "automated_test", "human_reviewer"], "description": "Which Phase 14/15 mechanism surfaced this failure." }
      }
    },

    "input": { "type": "string", "description": "The exact issue snapshot the model saw (Phase 1 §12 traceability)." },

    "ground_truth": {
      "type": "object",
      "description": "The adjudicated reference value(s) for the field(s) in question (Phase 6).",
      "required": ["field", "value", "adjudication_confidence"],
      "properties": {
        "field": { "type": "string", "description": "Dotted path into task (matches provenance keying, Phase 2)." },
        "value": {},
        "adjudication_confidence": { "enum": ["single_annotator", "adjudicated_agreement", "adjudicated_disagreement"], "description": "Distinguishes a solid label from one that was itself contested (feeds Label ambiguity detection, §3.2)." }
      }
    },

    "model_output": { "type": "object", "description": "Full TaskUnderstandingRecord as emitted, unmodified." },

    "expected_output": {
      "type": "object",
      "description": "What a passing output would have looked like for the specific field(s) that failed. May differ from ground_truth verbatim (e.g. Unknown is an acceptable expected_output even where ground_truth resolves a value, per Phase 1 §10) — the two are recorded separately so a mismatch between them is itself diagnostic of label ambiguity or an over-strict grader.",
      "required": ["field", "acceptable_values"],
      "properties": {
        "field": { "type": "string" },
        "acceptable_values": { "type": "array", "description": "One or more values that would have passed; length > 1 signals ambiguity at scoring time." }
      }
    },

    "error_type": { "$ref": "#/$defs/errorType" },
    "secondary_error_types": { "type": "array", "items": { "$ref": "#/$defs/errorType" }, "description": "Contributing factors that did not win primary attribution (§1)." },

    "severity": { "$ref": "#/$defs/severityValue" },

    "root_cause": {
      "type": "object",
      "required": ["family", "statement", "diagnosed_by", "confidence"],
      "properties": {
        "family": { "enum": ["Data problem", "Annotation problem", "Architecture problem", "Training problem", "Context problem", "Inference problem"] },
        "statement": { "type": "string", "description": "Free-text root-cause statement, evidence-backed (§3), not a restatement of error_type." },
        "diagnosed_by": { "enum": ["automated_diagnostic", "human_reviewer"] },
        "confidence": { "type": "number", "minimum": 0.0, "maximum": 1.0, "description": "Analyst's confidence in the root-cause attribution itself — distinct from the model's own confidence field." }
      }
    },

    "corrective_action": {
      "type": "object",
      "required": ["action_type", "owning_phase", "status"],
      "properties": {
        "action_type": { "enum": ["data_collection", "re_annotation", "schema_clarification", "dataset_rebalance", "architecture_change", "retraining_target", "context_pipeline_fix", "no_action_expected_behavior", "review_gate_fix"] },
        "owning_phase": { "type": "string", "description": "e.g. 'Phase 6', 'Phase 11', 'Phase 12' — per §5 routing table." },
        "ticket_ref": { "type": "string" },
        "status": { "enum": ["open", "in_progress", "resolved", "wont_fix", "deferred"] }
      }
    },

    "training_data_disposition": {
      "type": "object",
      "required": ["promote", "target_dataset"],
      "properties": {
        "promote": { "type": "boolean", "description": "Whether this record (corrected) should enter a Phase 7 dataset." },
        "target_dataset": { "enum": ["Training", "Regression", "Hard-case", "Adversarial", "none"] },
        "rationale": { "type": "string" }
      }
    }
  },

  "$defs": {
    "errorType": {
      "enum": [
        "Data quality", "Incorrect annotation", "Insufficient examples", "Label ambiguity",
        "Model misunderstanding", "Context failure", "Retrieval failure", "Reasoning failure",
        "Schema failure", "Hallucination", "Confidence failure", "Technical knowledge gap",
        "Context conflict"
      ]
    },
    "severityValue": { "enum": ["Critical", "High", "Medium", "Low"] }
  }
}
```

**Why `ground_truth` and `expected_output` are separate fields, not one.** Collapsing them would silently assume the schema's ground truth is always the unique correct answer — an assumption Phase 1 §10 and Phase 6's adjudication process both already reject (`Unknown` can be the correct expected behavior even where a fuller investigation could resolve a value; two annotators can adjudicate to disagreement). Keeping them separate makes a `ground_truth` ≠ `expected_output` record itself a **Label ambiguity** signal, detected structurally rather than requiring a human to notice it case by case.

---

## 3. Root-Cause Methodology

### 3.1 The six-way distinction

Every `error_type` (Section 1) maps to exactly one primary root-cause **family**; the family is what determines routing (Section 5), because two error types in the same family often share a fix even when their surface symptoms differ.

| Family | Question it answers | What confirms it | What it is not |
|---|---|---|---|
| **Data problem** | Was the input or the training distribution defective? | Independent inspection of the raw issue (Phase 4/5) or of class/technology counts in the training split (Phase 7 §3 balance statistics) shows a defect or gap | Not a model defect — the model is behaving reasonably given bad/thin evidence |
| **Annotation problem** | Is the ground truth itself wrong or contested? | Re-adjudication (Phase 6 process, blind to the model's answer) either overturns the original label or produces a split panel | Not a model defect at all; scoring against this ground truth would fail *any* correct model |
| **Architecture problem** | Can the model, as structured, represent this input/output relationship at all? | Failure persists across checkpoints/training runs and correlates with a structural limit (e.g., context window, output schema expressiveness — Phase 8) rather than with training data exposure | Not fixable by more data or a different training run alone |
| **Training problem** | Did the model see enough of the right signal during training to generalize this pattern? | Failure rate correlates with representation count for the pattern in Training (Phase 7/10-13); a targeted data/curriculum change measurably improves it in a re-run | Distinguished from Architecture by responsiveness to more/better training data |
| **Context problem** | Was the right information assembled and presented to the model at inference time? | The signal is demonstrably present in available context (Phase 12 tiers) but absent from, or unused in, the model's evidence trail | Not a knowledge gap — the model would likely succeed if the same signal were surfaced differently |
| **Inference problem** | Given correct input and correct context, did the reasoning chain itself break? | `evidence` is accurate and complete, but the field value doesn't follow from it — reproducible under repeated sampling, not a one-off | Distinguished from Context by having no missing-context explanation available |

### 3.2 Diagnostic procedure

For every `FailureRecord`, the diagnostic runs as a sequence of eliminations, in this fixed order — checking cheaper, more mechanical hypotheses before more expensive human judgment:

1. **Schema/structural check first.** If the record fails H1/H3/H4/H5 (Phase 8 §10), `error_type = Schema failure`, `family = Architecture problem`, and the sequence stops — a malformed record cannot be meaningfully diagnosed for reasoning or context quality until it is at least well-formed.
2. **Input integrity check.** Run the input issue through Phase 5's cleaning/normalization validators. A failure here (truncation, encoding corruption, near-duplicate conflict) yields `error_type = Data quality`, `family = Data problem`.
3. **Re-adjudication check.** Route the record, blind to the model's output, through Phase 6's adjudication process. If re-adjudication overturns or splits the original ground truth, `error_type = Incorrect annotation` or `Label ambiguity` (the latter if the panel splits rather than converges), `family = Annotation problem`. This step is mandatory before any model-side diagnosis proceeds — scoring model-side causes against wrong ground truth would misattribute every downstream step.
4. **Evidence-trail check** (only if steps 1–3 pass). Compare `model_output.provenance[field].evidence` against the full input, including available Phase 12 context tiers:
   - Evidence cites content absent from the input entirely → `Hallucination`, `family = Inference problem` (or `Training problem` if the same fabricated pattern recurs across many records — Section 3.4).
   - Evidence cites only a subset of relevant available-context content, with the rest of the relevant signal present in context but untouched → `Context failure`, `family = Context problem`.
   - Relevant signal was never in the assembled context at all (checked against what Phase 12's retrieval step *should* have included for this tier) → `Retrieval failure`, `family = Context problem`.
   - Evidence is accurate and complete, but the field value doesn't follow from it → `Reasoning failure`, `family = Inference problem`.
   - Two context sources visibly disagree and the disagreement was resolved without `review_required: true` → `Context conflict`, `family = Context problem`.
5. **Distributional check** (for surviving cases with correct evidence but wrong output — i.e., candidates for Training problem). Query Phase 7's training-split statistics for the pattern in question (class, technology, task-type combination). A representation count below the empirical floor established in Phase 11 §6 supports `Insufficient examples` or `Technical knowledge gap`; a well-represented pattern that still fails supports `Model misunderstanding` or `Confidence failure` depending on whether the field value or the confidence score is the locus of the failure.
6. **Human confirmation for anything ambiguous between families.** Any record where two families both have supporting evidence (e.g., thin training data *and* a plausible context-assembly gap) is routed to human review rather than auto-resolved — matching Phase 14 §5's reviewer discipline; a wrong automated root-cause attribution is worse than a slower correct one, since Section 5 routes fixes on it.

### 3.3 Confusable-pair guardrails

Certain root-cause pairs are easy to mis-attribute in the direction that avoids the more expensive fix. The methodology names these explicitly so analysts (automated or human) check for them rather than defaulting to the cheaper explanation:

| Confusable pair | Cheaper (wrong) default | Correct discriminator |
|---|---|---|
| Insufficient examples vs. Architecture problem | "More data would fix it" | Check whether a *related, better-represented* pattern of comparable structural complexity succeeds; if related patterns also fail regardless of representation, suspect architecture, not data volume |
| Context failure vs. Reasoning failure | "The model just reasoned wrong" | Check `provenance.evidence` completeness first (§3.2 step 4) — a model cannot be charged with a reasoning failure over evidence it never cited |
| Hallucination vs. Technical knowledge gap | "The model made it up" | A hallucination invents content absent from input; a knowledge gap misapplies content that *is* present (e.g., correctly quotes "uses Redis" but misclassifies which architectural layer Redis belongs to) — the fixes differ (Section 5) |
| Confidence failure vs. Label ambiguity | "The model is miscalibrated" | Check `expected_output.acceptable_values` (Section 2) — if ground truth itself is contested, low model confidence may be *correct* behavior being miscounted as a failure |

### 3.4 Systematic vs. isolated attribution

A single hallucinated or reasoning-broken record does not by itself indict training; the diagnostic re-runs Section 3.2 step 4/5 in aggregate across all `FailureRecord`s sharing the same `error_type` before assigning `family = Training problem` to any individual one on that basis. This mirrors Phase 15 AT9's aggregate-not-single-case discipline: one Inference-problem record stays `Inference problem`; a cluster of them sharing a structural pattern gets re-attributed to `Training problem` (or `Architecture problem`, per the guardrail above) at the cluster level, and every record in the cluster is updated to match — the individual record's evidence trail doesn't change, but its root cause does, because root cause is a property of the pattern, not just the instance.

---

## 4. Severity Model

Severity is assigned independently of `error_type`/`family` — two records with the same root cause can carry different severities, and routing (Section 5) uses both, not severity alone, since a Critical-severity Annotation problem is not routed the same way as a Critical-severity Training problem.

| Severity | Definition | Criteria (any one qualifies) |
|---|---|---|
| **Critical** | Violates a Phase 1 §9 hard failure criterion, or corrupts trust in a load-bearing field | Fabricated grounding (criterion 1); unwarranted confidence on a guess (criterion 2); experience/complexity collapse (criterion 3); silent non-abstention on genuine ambiguity (criterion 4); invented technology/component (criterion 5); malformed output (criterion 6); systematic pattern per §3.4 affecting a Phase 14 hard-gated metric |
| **High** | Wrong field value on a field the master prompt or Phase 1 §3 target users would act on directly, with no schema/grounding violation | Wrong `role`/`task_type`/`complexity` classification where the record is otherwise well-formed and honestly grounded; a Context conflict resolved silently but without fabricated evidence |
| **Medium** | Degrades usefulness without producing an actionably wrong decision | Weak but not fabricated evidence phrasing; `acceptance_criteria` or `scope` that's technically correct but underspecified; confidence miscalibration within a benchmark's empirical tolerance but outside its target band |
| **Low** | Cosmetic, stylistic, or within acceptable schema tolerance | Verbose or awkward but faithful prose (Phase 14 §2.2 clarity, not faithfulness); `Unknown` correctly returned but `missing_information` phrased less specifically than ideal |

**Severity does not equal error-type family.** A Data quality error (corrupted input) is frequently Critical if it caused fabricated grounding downstream, and just as often Low if the model correctly abstained given the bad input — abstaining on a defective input is the system working as designed (Phase 1 §10), not a failure severity at all, and such cases are excluded from the failure corpus entirely (they are not `FailureRecord`s; the model's `Unknown` output was correct).

---

## 5. Correction Workflow

Routing is a function of `(error_type, root_cause.family, severity)`, not any single one of the three — this prevents, e.g., every Hallucination from being routed identically regardless of whether it's an isolated Inference-problem instance or a systematic Training-problem cluster (Section 3.4).

| Root-cause family | Typical `error_type`s | Owning phase | Corrective action | Retraining required? |
|---|---|---|---|---|
| **Data problem** | Data quality, Insufficient examples | Phase 4 (collection), Phase 5 (cleaning), Phase 7 (rebalance) | Source additional examples targeting the under-represented pattern; fix/discard the defective input; rebalance the Training split per Phase 7 §3 | Yes, once rebalanced dataset exists |
| **Annotation problem** | Incorrect annotation, Label ambiguity | Phase 6 | Re-adjudicate with a fresh, blind reviewer pool; if genuinely ambiguous, consider a Phase 2 schema clarification (e.g., a documented tie-break rule) rather than forcing a single answer | No — ground truth correction only; re-run Phase 14 scoring against corrected label first, since the "failure" may disappear entirely |
| **Architecture problem** | Schema failure, systematic Reasoning/Hallucination clusters (§3.4) | Phase 8 | Structural change (context window, output representation, validator logic) | Yes, and requires a new architecture variant, not just a new training run on the existing one |
| **Training problem** | Model misunderstanding, Confidence failure, Technical knowledge gap, systematic clusters (§3.4) | Phase 10–13 (whichever stage owns the relevant capability) | Targeted curriculum change, additional fine-tuning examples, calibration-specific training pass (Phase 11 §6.6) | Yes |
| **Context problem** | Context failure, Retrieval failure, Context conflict | Phase 12 | Fix retrieval/assembly logic; add a conflict-detection check that forces `review_required: true` on cross-source disagreement | Sometimes — a retrieval/assembly fix may not require retraining if the model already handles the signal correctly once surfaced; confirm via re-run before committing to a training cycle |
| **Inference problem** | Reasoning failure, isolated Hallucination | Phase 11/13 (reasoning-pattern training) | If isolated: no dataset action, monitor. If it recurs, reclassify per §3.4 and route as Training problem instead | Only if reclassified as systematic |

**`no_action_expected_behavior` disposition.** Not every scored "failure" warrants a correction: a record where the model correctly returned `Unknown` on genuinely insufficient input, but the benchmark's automated grader scored it as wrong because `ground_truth` itself resolves a value the input doesn't actually support, resolves back through Section 3.2 step 3 to an Annotation problem — and the correction is fixing the grader/ground-truth, never the model.

**Corrected records feeding forward (§2 `training_data_disposition`).** A resolved `FailureRecord` whose root cause is Data/Annotation/Training and whose corrected version is now confirmed correct is a candidate for promotion into Phase 7's Training or Regression dataset — Regression specifically when the failure represents a previously-passing pattern that broke, per Phase 7's existing Regression purpose; otherwise Training if it represents a genuinely new pattern being added to fix an Insufficient-examples gap. Hard-case/Adversarial promotion follows Phase 15's own construction-quality gate (HT5) rather than being granted automatically by Phase 16.

---

## 6. Error Dashboard / Report Structure

Following Phase 14 §1's explicit rule — no layer collapsed to a single number — the `ErrorAnalysisReport` is a cube, not a scalar, extending Phase 14 §10's reporting cube with error-analysis-specific axes rather than replacing it.

**Required cross-tabulations** (every `ErrorAnalysisReport` must include all of the following, broken out per checkpoint):

| Cut | Reports |
|---|---|
| `error_type` × `severity` | Count and % of total failures, per cell — surfaces whether a common error type is mostly cosmetic or mostly critical |
| `error_type` × `root_cause.family` | Confirms/challenges the §1 default mapping — a mapping that holds for 95% of Hallucination records but not the rest is itself a finding |
| `root_cause.family` × `owning_phase` (§5) | Workload view — how many open corrective actions sit with each phase |
| `error_type` × Phase 14 reporting axes (role, experience, complexity, task_type, technology, repo type, context tier) | Concentration view — is a failure type isolated to one class/technology, or diffuse? Diffuse failures point toward Architecture; concentrated ones toward Data/Training for that slice specifically |
| `error_type` × `benchmark` (Test/Hard-case/Adversarial/Regression) | Distinguishes ordinary-traffic failure rates from adversarially-induced ones — pooling these would misrepresent both, per Phase 14 §3's benchmark-isolation rule |
| `corrective_action.status` × `owning_phase` × time | Open/in-progress/resolved/wont-fix/deferred, trended across evaluation cycles — the operational view of Section 7's loop actually closing |
| `training_data_disposition.promote` × `target_dataset` | How much of this cycle's failure corpus is feeding back into Phase 7, and where |

**Labeled-column discipline (reused from Phase 14 §10).** Automated-diagnostic root causes and human-confirmed root causes are reported in separate, labeled columns, never merged — an automated `root_cause.diagnosed_by` count is a throughput metric, not a validated-finding count, until Section 3.2 step 6's human confirmation rate is also reported alongside it.

**What the dashboard explicitly does not produce.** A single "error rate" or "health score" for a checkpoint. Phase 14 already rejected this pattern for evaluation; Phase 16 would reintroduce the exact failure mode one level downstream if it aggregated error analysis into one number after refusing to do so at the metric level.

---

## 7. Feedback Loop

The loop stated in the master prompt is operationalized as a **re-entry gate**, not a passive diagram:

1. **Evaluation** (Phase 14) produces failing records; Phase 15 contributes adversarial/hard-case failures on the same terms.
2. **Error Analysis** (§1–§2) classifies every failing record into exactly one `FailureRecord`.
3. **Root Cause** (§3) attributes each `FailureRecord` to a family, with the systematic-vs-isolated check (§3.4) applied before any cluster is routed as Training or Architecture.
4. **Dataset/Model Change** (§5) routes each resolved root cause to its owning phase as a corrective action with tracked `status`.
5. **Retraining** (Phase 10–13) or the equivalent non-training fix (Annotation correction, Context pipeline fix) executes the corrective action. This step is outside Phase 16's authority to perform, but Phase 16 tracks it via `corrective_action.status` until `resolved`.
6. **Evaluation** re-runs (Phase 14) against the new checkpoint or corrected dataset.

**Re-entry gate.** A corrective action is not marked `resolved` on the basis of the owning phase's own say-so; it is marked `resolved` only once the specific `FailureRecord`(s) that motivated it are re-run through Phase 14/15 and pass, or — for Annotation-problem corrections — once re-adjudication is independently confirmed (Phase 6 process). This closes a gap the raw diagram leaves open: "Dataset/Model Change → Retraining → Evaluation" describes a training cycle, but does not by itself guarantee the *specific* failure that triggered the cycle was actually fixed rather than incidentally unaffected by a training run that improved something else.

**Regression protection.** Every `FailureRecord` promoted into Phase 7's Regression dataset (§5) is, by Phase 7's existing design, re-checked on every subsequent `EvaluationRun` regardless of whether this cycle's changes targeted it — so a fix that resolves this cycle's failure but silently reopens a prior one is caught by Regression, not by Phase 16 re-diagnosing the same pattern from scratch.

**Cadence.** Error analysis runs once per `EvaluationRun` (Phase 14) and once per adversarial suite run (Phase 15), not on a fixed calendar schedule — matching those phases' own trigger discipline rather than introducing an independent cadence.

---

## 8. Phase-16 Decision Record

| # | Decision | Rationale |
|---|---|---|
| 1 | Thirteen `error_type` values (Section 1), each mapped to exactly one primary root-cause family, with an explicit distinction from Phase 15's `failure_mode_targeted` | Prevents the taxonomy from becoming a duplicate of Phase 15's test-design vocabulary; Phase 16 classifies observed causes, Phase 15 classifies intended probes — conflating them would lose the information that a single probe type can fail for different reasons |
| 2 | `ground_truth` and `expected_output` are separate, both-required fields in the `FailureRecord` schema (Section 2) | Directly operationalizes Phase 1 §10's stance that `Unknown` can be correct even where ground truth resolves a value; collapsing the two fields would silently assume every ground-truth label is the unique correct answer, which Phase 6's own adjudication process already disputes |
| 3 | Root-cause diagnosis runs as a **fixed-order elimination sequence** (§3.2: schema → input integrity → re-adjudication → evidence trail → distributional check → human confirmation), re-adjudication mandatory before any model-side attribution | A wrong-ground-truth record misdiagnosed as a model defect would send a corrective action to the wrong phase (Training/Architecture) for a problem only Phase 6 can actually fix; ordering re-adjudication early prevents downstream steps from being run against a false premise |
| 4 | Systematic vs. isolated attribution (§3.4) — a family reassignment (typically to Training or Architecture problem) requires a cluster of records sharing the pattern, not a single instance | Prevents one anomalous record from triggering a retraining cycle disproportionate to the evidence, and matches Phase 15 AT9's existing aggregate-based discipline rather than inventing a new one |
| 5 | Severity is assigned independently of `error_type`/root-cause family (Section 4), and routing (Section 5) is a function of all three jointly, not any one alone | A Critical Annotation problem and a Critical Training problem require entirely different fixes; collapsing severity into the family assignment would lose the routing information Section 5 depends on |
| 6 | Confusable-pair guardrails (§3.3) are named explicitly rather than left to individual analyst judgment | Each pair has a "cheaper," easier-to-default-to wrong attribution (e.g., blaming reasoning instead of checking evidence completeness first); naming them is the same defensive-construction principle Phase 15 decision #4 applied to adversarial bait — leaving it implicit invites the shortcut |
| 7 | The error dashboard (Section 6) extends Phase 14 §10's reporting cube with new axes rather than replacing it, and explicitly refuses to produce a single aggregate health score | Directly continues Phase 14 §1's "no layer collapsed to a single number" rule one level downstream, where the temptation to summarize is, if anything, stronger |
| 8 | The feedback loop (Section 7) includes a **re-entry gate**: a corrective action is `resolved` only once the originating `FailureRecord`(s) are independently re-verified, not on the owning phase's self-report | The master prompt's loop diagram describes a training cycle but not a verification step; without this gate, a training run that incidentally leaves the target failure unaddressed could be marked resolved by process completion alone |
| 9 | Promotion into Phase 7 datasets (Training/Regression) is routed through existing Phase 7 mechanisms; Hard-case/Adversarial promotion additionally requires Phase 15's HT5 construction-quality gate | Reuses established dataset-entry discipline instead of creating a second, differently-calibrated promotion path Phase 7/15 would then have to reconcile against |
| 10 | No new model architecture, training procedure, or release decision is made in this phase | Matches the explicit task boundary and this project's consistent practice of keeping phase ownership disjoint (Phase 14 decision precedent, Phase 15 decision #11) |

### Open items (deliberately deferred, not forgotten)
- **Numeric severity/threshold calibration** (e.g., what failure-rate-per-cell triggers mandatory routing vs. optional backlog) — set empirically once a populated `FailureRecord` corpus exists, per Phase 14 §11's practice for its own thresholds.
- **Automated-diagnostic accuracy for §3.2's mechanical steps** (schema/input/evidence-trail checks) versus human-confirmed root cause — needs its own agreement-rate measurement, mirrored on Phase 14 §5's human-vs-model agreement methodology, before automated diagnosis can be trusted to skip human confirmation by default.
- **Cross-phase corrective-action SLA / prioritization** when multiple `owning_phase` backlogs compete for the same retraining cycle — an operational scheduling question out of scope for this phase's system design.
- **Whether Context conflict (error type 13) should also trigger a standing Phase 12 automated test**, analogous to Phase 15's AT7 contradiction check, rather than only being caught retrospectively via Phase 16 — worth revisiting once Context-conflict volume is known.
