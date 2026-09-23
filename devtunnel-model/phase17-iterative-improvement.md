# Phase 17 — Iterative Improvement
## Specialized AI Software Engineering Model: The Controlled Improvement Cycle for ITU-1

Source of truth: Phase 1 (§8–§9 success/failure criteria), Phase 2 (`task-schema.v2.json`), Phase 6 (annotation/adjudication), Phase 7 (six datasets — Training, Validation, Test, Hard-case, Adversarial, Regression), Phase 8 (architecture, H1–H5), Phase 10–13 (training stages and checkpoint lineage), Phase 14 (Evaluation Framework, L0–L3, reporting cube, acceptance-threshold shape), Phase 15 (adversarial taxonomy), Phase 16 (error taxonomy, `FailureRecord` schema, root-cause families, corrective-action routing). This document does not redefine any of them. It closes the loop each of them left open at its boundary: Phase 16 §5 routes a diagnosed failure to an owning phase as a corrective action, but nothing yet governs how that phase's *change* gets tested before it's trusted, how "improved" is distinguished from "moved," or who is authorized to call a checkpoint released. Phase 17 is that governance layer.

**Scope boundary.** This phase produces the **Controlled Improvement Cycle** — a lifecycle for candidate changes, a classification of change types, an experiment methodology, a regression methodology, model-release acceptance rules, rollback criteria, and an experiment-tracking schema. It does **not**:
- Perform any corrective action itself (collect data, re-annotate, change architecture, retrain). Phase 17 governs how a change proposed by Phase 16 §5's routing is tested and judged; the change itself remains owned by whichever phase Phase 16 named (Phase 4–13, per §5's table there).
- Redefine any Phase 14 metric or Phase 15 test. Phase 17 consumes both as fixed instruments to evaluate a candidate against; it does not re-derive what they measure.
- Redefine Phase 16's error taxonomy or root-cause methodology. Phase 17's Section 2 change classification is the *other side* of Phase 16 §5's routing table — Phase 16 asks "what caused this failure," Phase 17 asks "what kind of change fixes it, and how do we know the fix worked without breaking something else."
- Own long-term monitoring infrastructure or deployment mechanics. Section 6's rollback criteria define *when* a rollback is warranted and *what* it must preserve; they do not specify a serving/deployment architecture, which remains out of scope for this project per Phase 1's original boundary.

---

## 0. Position in the Pipeline

```
Phase 16 output: FailureRecord corpus, root-cause attributions,
                 routed corrective_action (owning phase, action_type)
                        │
                        ▼
Phase 17 (this phase): governs everything between "a fix was proposed"
   and "a fix is released or rejected" — the loop the master prompt names:

   Model ──► Evaluation (Phase 14) ──► Error Analysis (Phase 16)
     ▲                                        │
     │                                        ▼
     └────── Retraining ◄── Data/Model Changes (§1–§2, this phase)
                  │
                  ▼
             Evaluation (Phase 14, re-run) ──► §4 Regression check
                                                     │
                                                     ▼
                                          §5 Acceptance decision
                                          (release / reject / iterate)
                                                     │
                                          ┌──────────┴──────────┐
                                          ▼                     ▼
                                     Released                Rejected
                                     checkpoint          (back into loop,
                                          │                new candidate)
                                          ▼
                                  §6 Rollback monitoring
```

**Why this phase is not just "Phase 14 run again."** Phase 14 answers "how good is this checkpoint" for any checkpoint handed to it, once. Phase 17 answers a different, comparative question that no prior phase owns: "is this *specific proposed change*, evaluated against the checkpoint it's meant to replace, actually an improvement — accounting for the possibility that it helped the thing it targeted while quietly breaking something it didn't." That comparison, the discipline against accepting a single improved metric, and the authority to call the result released or rolled back did not exist before this phase; Phase 14 §12 and Phase 15 §10 each explicitly deferred the release decision as an open item, naming it as future work.

---

## 1. Improvement Lifecycle

Every candidate change moves through a fixed sequence of states, tracked as an `ImprovementCandidate` (Section 7). No state may be skipped, and no candidate may re-enter a later state after failing an earlier one without restarting from `proposed`.

| State | Entry condition | Exit condition | Owner |
|---|---|---|---|
| **1. Proposed** | One or more Phase 16 `FailureRecord`s (or a cluster, per Phase 16 §3.4) name a corrective action | Change is classified (§2) and assigned a single primary change type | Phase 16 output, received by Phase 17 |
| **2. Scoped** | Classification (§2) assigns blast radius and identifies which Phase 14 reporting-axis cells and which Section 4 regression dimensions are plausibly affected | An experiment plan (§3) exists naming baseline, candidate construction method, and required benchmarks | Owning phase (per Phase 16 §5's routing) + Phase 17 |
| **3. Executed** | The owning phase produces a candidate checkpoint or corrected dataset | Candidate is evaluated through Phase 14's full framework against all five required benchmarks (§3) | Owning phase (Phase 4–13) |
| **4. Regression-checked** | Executed candidate has a complete `EvaluationRun` on all five benchmarks | Every Section 4 dimension is checked against the previous accepted checkpoint; regressions are flagged, not silently netted against the target-metric gain | Phase 17 |
| **5. Accepted / Rejected** | Regression check is complete | Section 5's acceptance rules are applied in full; result is `accepted` (release candidate) or `rejected` (returns to Proposed with the regression findings attached as new diagnostic input) | Phase 17, per Section 5's authority rule |
| **6. Released** | An `accepted` candidate additionally clears whatever staged-rollout policy is in force (Section 5) | Checkpoint becomes the new "previous accepted checkpoint" baseline for all future candidates | Phase 17 release authority |
| **7. Monitored** | A checkpoint is released | Either stays released indefinitely, or triggers rollback (Section 6) | Ongoing, post-release |

**A rejected candidate is not discarded.** Its full `EvaluationRun` and regression-check results become new input to Phase 16 (a rejected candidate that regressed Grounding while fixing Role classification is itself a diagnosable failure — why did fixing one break the other?), closing the loop the master prompt's diagram implies but does not spell out: rejection feeds error analysis, not just a retry queue.

---

## 2. Change Classification

Every `ImprovementCandidate` is assigned exactly one primary change type from the nine named in the master prompt. This is the deliberate counterpart to Phase 16 §5's routing table: Phase 16 names *which phase* owns a fix; Section 2 here names *what kind of change* that phase is making, which determines the experiment methodology (§3) and blast radius (which Section 4 dimensions are plausibly at risk).

| # | Change type | Typical Phase 16 root-cause family / error type it addresses | Owning phase | Blast radius | Dimensions most at risk (§4) |
|---|---|---|---|---|---|
| 1 | **More training data** | Data problem — Insufficient examples | Phase 4, 7, 10–13 | Narrow if targeted to one class/technology; broad if the addition shifts overall distribution | Whichever cell was targeted, plus overall Task type / Technical understanding balance |
| 2 | **Better annotations** | Annotation problem — Incorrect annotation, Label ambiguity | Phase 6, 7 | Narrow — affects only records sharing the corrected label pattern, unless the correction reveals a systemic labeling-guideline gap | Role / Experience / Complexity / Task Type (whichever field was re-adjudicated) |
| 3 | **Better data balance** | Data problem — Insufficient examples (distributional form) | Phase 7 | Broad — rebalancing shifts class priors project-wide, not just for the target class | All classification dimensions; Confidence calibration (indirectly, since priors shift) |
| 4 | **Better context** | Context problem — Context failure, Context conflict | Phase 12 | Moderate — affects only context-tier ≥2 records, but across all fields those tiers touch | Context understanding; secondarily Role/Task Type where context resolves ambiguity |
| 5 | **Better retrieval** | Context problem — Retrieval failure | Phase 12 | Moderate — same as above, isolated to the retrieval/assembly step rather than context *use* | Context understanding; Grounding (evidence pointers now have more to correctly cite) |
| 6 | **Architecture changes** | Architecture problem — Schema failure, systematic Reasoning/Hallucination clusters | Phase 8 | Broad — a structural change is never guaranteed local; treat as maximum blast radius by default | All ten Section 4 dimensions, without exception |
| 7 | **Training-objective changes** | Training problem — Model misunderstanding, Confidence failure, systematic clusters | Phase 10–13 | Broad — an objective/loss change affects every downstream capability trained on it | All ten Section 4 dimensions, without exception |
| 8 | **Output-schema changes** | Architecture problem — Schema failure, or an Annotation problem revealing the schema itself under-specifies a case (Phase 16 §5's "schema clarification" action) | Phase 2, 8 | Broad — every downstream consumer (Phase 6 annotation, Phase 8 validators H1–H5, Phase 14 metrics) reads the schema | L0 structural validity (directly); all others indirectly, since metrics are keyed to schema fields |
| 9 | **Better uncertainty handling** | Training problem — Confidence failure; Context problem — Context conflict (silent resolution) | Phase 11 (calibration), Phase 12 (conflict flagging) | Moderate — targets `confidence`/`review`/`uncertainty` specifically but can shift abstention rates project-wide | Uncertainty (directly); Hallucination and Grounding (a calibration change that raises confidence broadly raises hallucination risk if not paired with grounding checks) |

**Default-to-broad rule.** Where a change type's true blast radius is uncertain at proposal time (most acutely for #6, #7, #8), Section 2 requires treating it as broad by default — every Section 4 dimension is checked — rather than assuming locality and being surprised. A change later shown to be genuinely local can be *narrowed* for future iterations of the same change type, but only after evidence (a clean regression check) supports that narrowing; it is never assumed at proposal time.

**Multiple change types per failure cluster.** Phase 16 §3.4's systematic-cluster reassignment can implicate more than one change type at once (e.g., a Hallucination cluster reassigned to Training problem might require both #1 more training data and #9 better uncertainty handling). Where this happens, Section 3 requires each change type to be tested as a **separate candidate** wherever feasible, specifically so Section 4's regression check can attribute any new regression to the correct change — bundling them by default would reproduce the exact attribution problem Phase 16 §3 was built to avoid, one level up.

---

## 3. Experiment Methodology

### 3.1 Baseline and candidate

Every experiment compares exactly two checkpoints: the **previous accepted checkpoint** (the current release, or the most recent `accepted` candidate if none has been released yet) and the **candidate checkpoint** (the output of Section 2's change, applied to the same starting point). A candidate is never compared only against its own predecessor-in-training if that predecessor was never itself accepted — comparing against an unaccepted intermediate would let successive small regressions accumulate invisibly, each one individually clearing a "no worse than the last unaccepted build" bar.

### 3.2 Required benchmarks

Per the master prompt, every candidate is evaluated against all five, not a subset chosen for favorability:

| Benchmark | What it answers here | Reused from |
|---|---|---|
| **Current benchmark** | Does the candidate perform acceptably on the present, current-distribution Test set? | Phase 14 §3 Generalization benchmark |
| **Previous benchmark** | Was the *previous accepted checkpoint's* own Test-set performance, on the same Test set, matched or exceeded — not just "is the candidate good," but "is it better than what it replaces" | Phase 14 `EvaluationRun` history for the previous accepted checkpoint, re-queried, not re-run (the previous checkpoint's report already exists) |
| **Regression dataset** | Has any previously-fixed failure mode reappeared? | Phase 7 Regression dataset, Phase 14 §3 Regression benchmark |
| **Adversarial dataset** | Does the candidate hold up under the failure modes Phase 15 specifically constructs to probe? | Phase 7 Adversarial dataset, Phase 15's automated (AT1–AT9) and human-review (HT1–HT4) tests |
| **Hard-case dataset** | Does the candidate hold the line on the boundary/contrast-pair cases that are difficult but not adversarial? | Phase 7 Hard-case dataset, Phase 15 §5 hard-confusable-pair matrix |

A candidate that has not been run against all five is not eligible for Section 5's acceptance decision — an incomplete benchmark set is treated the same way Phase 14 treats a malformed L0 record: excluded from the decision, not defaulted to pass.

### 3.3 Controlled comparison

- **One change type per experiment**, per Section 2's multiple-change-types rule — isolates attribution for the regression check (§4).
- **Same input snapshot, same evaluation harness.** The candidate and baseline are scored by the identical Phase 14 pipeline run in the same pass, not by comparing a new run's numbers against an old report generated under a possibly-since-modified harness — a harness change is itself a change type this section does not cover and must go through its own Phase 17 cycle if made.
- **Statistical significance, not point-estimate comparison.** Per-cell metrics (Phase 14 §10's cube) are compared with a significance test appropriate to the metric (e.g., a proportion test for accuracy/F1 cells, a paired comparison for calibration curves), at a pre-registered significance level set before the experiment runs — not chosen after seeing results. A cell where sample size is below Phase 14 §11's flagged `[INSUFFICIENT DATA]` threshold cannot be used to claim either an improvement or a non-regression; it is reported as inconclusive.
- **Pre-registration of the target metric.** Section 2's classification names which cell(s) the change is expected to improve, before the experiment runs. This prevents the specific failure mode the master prompt warns against directly: scanning the full results cube after the fact and reporting whichever cell happened to move as "the improvement."

---

## 4. Regression Methodology

**The rule, stated directly per the master prompt: an improvement is never accepted on the strength of one metric increasing.** Every candidate is checked against all ten named dimensions, every time, regardless of which dimension the change targeted.

| # | Dimension | Checked via | What counts as regression |
|---|---|---|---|
| 1 | **Role** | Phase 14 §2.1 classification metrics, per class, per reporting-axis cell | Statistically significant accuracy/F1 drop in any cell, or a new systematic confusion-matrix pattern (Phase 14 §2.1) not present in the baseline |
| 2 | **Experience** | Same as Role | Same, plus specifically: any drop in Phase 1 §9 criterion-3 independence checks (experience/complexity collapse reappearing) |
| 3 | **Complexity** | Same as Role | Same as Experience |
| 4 | **Task Type** | Same as Role | Same as Role, with particular attention to rare classes (`Security`, `Performance`) per Phase 14 §2.1's macro-averaging rationale |
| 5 | **Task generation** | Phase 14 §2.2 (faithfulness, completeness, relevance, clarity, technical correctness, consistency) | Drop in any of the six sub-metrics, human-reviewed (Phase 14 §5) where automation can't decide |
| 6 | **Technical understanding** | Phase 14 §2.2 technical-correctness sub-metric, plus Phase 16 §1's Technical knowledge gap error-type rate | Increase in Technical-knowledge-gap-attributed `FailureRecord`s, or drop in technical-correctness score |
| 7 | **Grounding** | Phase 14 §6, H2 | Any increase in evidence-pointer resolution failures, or in the rate of `EXPLICIT`/`SUPPORTED_BY_CONTEXT` fields whose evidence doesn't hold up under Phase 14 §6's five-way lens |
| 8 | **Hallucination** | Phase 14 §7 | Any increase in hallucination rate, by type, by reporting-axis cell — this dimension carries the hard-ceiling status Phase 14 §11 already assigns it; no accepted candidate may exceed the existing ceiling, improvement elsewhere notwithstanding |
| 9 | **Uncertainty** | Phase 14 §8 (calibration, uncertainty detection, insufficient-information detection) | Calibration (ECE) worsening in any (field, source-type) cell; drop in abstention precision/recall against Hard-case's negative-space records |
| 10 | **Context understanding** | Phase 14 §9, Phase 12's tier-sibling comparison and advance rule | Any tier that previously cleared Phase 12 §11.2's advance rule failing to clear it under the candidate |

### 4.1 Net-acceptability rule

A candidate passes the regression methodology only if **all ten dimensions** are either improved, unchanged (within the pre-registered significance threshold), or — for at most one dimension outside the targeted one — regressed by an amount below a severity-weighted tolerance (Phase 16 §4's severity model applied to the regression itself: a Low-severity dip in one non-targeted dimension may be tolerated if the targeted dimension's gain is Critical/High-severity in impact; any Medium-or-above regression in a non-targeted dimension is an automatic fail, no netting permitted). Hallucination (dimension 8) and L0 structural validity are never eligible for this tolerance — both remain hard, matching Phase 14 §11's treatment of the same two items.

### 4.2 Explicit anti-cherry-picking check

Before any candidate proceeds to Section 5, the regression check must produce and retain the **full ten-dimension table**, including dimensions where nothing changed — an `ImprovementCandidate` record with only the targeted metric reported and the other nine omitted is treated as an incomplete regression check (Section 3.2's completeness rule extended to this table), not as an implicit pass on the missing nine.

---

## 5. Acceptance Criteria

This section defines the model-release acceptance rules the project has deferred since Phase 14 §12's open items and Phase 15 §10's open items each named a future "release/serving decision" without specifying it. Phase 17 is the phase that decision belongs to.

**A candidate is `accepted` as a release candidate only if all of the following hold, jointly:**

1. **Complete benchmark coverage** (§3.2) — all five required benchmarks run, none skipped, none `[INSUFFICIENT DATA]`-flagged on the target cell.
2. **L0 structural validity at 100%** on Test — unchanged, non-negotiable, per Phase 1 §8 criterion 6 / Phase 14 §11.
3. **No hard-ceiling violation** — hallucination rate does not exceed the existing ceiling in any type/cell (§4, dimension 8), and no Regression-dataset case reappears (§3.2).
4. **Regression methodology passes** (§4.1) — all ten dimensions clear, with at most one non-targeted, sub-Medium-severity exception as defined there.
5. **Target metric improvement is statistically significant** at the pre-registered level (§3.3) — an improvement indistinguishable from noise does not justify accepting whatever regression tolerance it might otherwise be traded against.
6. **Adversarial and Hard-case performance holds** — Phase 15's automated tests (AT1–AT9) pass at their existing thresholds, and the hard-confusable-pair matrix (Phase 15 §5) shows no pair collapsing to at-or-below-chance performance (Phase 15 §9's hard-fail condition, reused unchanged).
7. **Human-review agreement does not drop** — Phase 14 §5's human-vs-model agreement rate, on the same stratified sampling discipline, is not significantly worse than the previous accepted checkpoint's rate.

**Acceptance is necessary but not sufficient for release.** An `accepted` candidate becomes the new **release candidate**; the move from release candidate to **released** additionally requires:
8. **Sign-off recorded.** At least one human reviewer independent of the change's owning phase (Section 2's table) confirms the Section 5 checklist was applied correctly to the actual `EvaluationRun` data, not asserted from memory — mirroring Phase 6's adjudication-independence principle applied to release governance rather than annotation.
9. **Rollback plan exists before release**, per Section 6 — a candidate cannot be released without the previous accepted checkpoint remaining retrievable and redeployable within whatever operational bound the project sets (an operational detail, deferred as an open item, consistent with this document's scope boundary).

**What this section deliberately does not do.** It does not require every dimension to *improve* — Criterion 4's "unchanged is acceptable" clause reflects that a change targeting one failure mode (Section 2) is not expected to move unrelated dimensions, and demanding universal improvement would make incremental, well-scoped fixes (the kind Section 1's lifecycle is built around) practically unshippable. The bar is: the targeted thing got measurably better, and nothing else got measurably worse beyond the bounded, severity-weighted exception in §4.1.

---

## 6. Rollback Criteria

A **released** checkpoint is rolled back to the previous accepted checkpoint if, after release, monitoring surfaces evidence that Section 5's acceptance was based on an incomplete or since-invalidated picture:

| Trigger | Detection | Action |
|---|---|---|
| **Regression-dataset reappearance in production** | A production input matches (or is confirmed by Phase 16 diagnosis to match the pattern of) an existing Regression-dataset case | Immediate rollback — matches Phase 14 §11's hard-blocker treatment of Regression, extended to post-release monitoring |
| **Hallucination rate exceeds ceiling in live traffic**, not just in the pre-release Test-set measurement | Ongoing Phase 16-style error analysis applied to a sampled stream of production outputs | Immediate rollback — dimension 8's hard-ceiling status (§4) does not relax after release |
| **A Section 4 dimension regresses beyond tolerance in production**, undetected pre-release because the affected cell was `[INSUFFICIENT DATA]`-flagged at release time and only accumulates enough volume post-release to become measurable | Recurring Phase 14-style evaluation cadence applied to accumulating production data, or a spike in a specific Phase 16 `error_type`/dimension pairing | Rollback, and the newly-measurable cell's threshold is set (closing the prior `[INSUFFICIENT DATA]` gap) before any future candidate is evaluated against it |
| **Sign-off is later found to have been based on incorrect data** (a reporting/tooling bug in the `EvaluationRun` the sign-off relied on) | Audit, triggered by any anomaly report | Rollback, plus the underlying `EvaluationRun`/reporting defect is itself routed through Phase 16 as a Data-quality-class failure of the evaluation pipeline, not the model |

**Rollback procedure.** Revert live serving to the previous accepted checkpoint (preserved per Section 5 criterion 9); the released-then-rolled-back checkpoint's triggering failure(s) are converted into new `FailureRecord`s (Phase 16 §2) and, once the specific pattern is fixed and independently re-verified, into new Regression-dataset cases (Phase 7) — so the exact failure that caused this rollback is guaranteed to be checked on every subsequent candidate, permanently, the same way Phase 16 §7's re-entry gate already guarantees for pre-release failures.

**Rollback authority.** Symmetric to Section 5 criterion 8's sign-off requirement — a rollback decision can be initiated by any monitoring signal but is confirmed by a human reviewer independent of the change's owning phase, preventing the owning phase from being sole judge of whether its own change should be reverted.

---

## 7. Experiment Tracking

Every candidate, from proposal through release-or-rejection (and rollback, if applicable), is tracked as one `ImprovementCandidate` record, cross-referencing the `FailureRecord`(s) (Phase 16 §2) that motivated it and the `EvaluationRun`(s) (Phase 14) produced for it — not duplicating their contents.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.org/schemas/improvement-candidate/1.0.0.json",
  "title": "Improvement Candidate",
  "type": "object",
  "required": [
    "candidate_id", "created_at", "originating_failures", "change_type",
    "owning_phase", "blast_radius", "state", "baseline_checkpoint",
    "target_metric", "benchmark_runs", "regression_check", "acceptance", "history"
  ],
  "additionalProperties": false,
  "properties": {
    "candidate_id": { "type": "string" },
    "created_at": { "type": "string", "format": "date-time" },

    "originating_failures": {
      "type": "array",
      "items": { "type": "string", "description": "FailureRecord.failure_id references (Phase 16 §2)." },
      "minItems": 1
    },

    "change_type": { "$ref": "#/$defs/changeType" },
    "owning_phase": { "type": "string", "description": "Per §2's table, e.g. 'Phase 12'." },
    "blast_radius": { "enum": ["narrow", "moderate", "broad"], "description": "§2's default-to-broad rule applies at proposal time." },

    "state": { "$ref": "#/$defs/lifecycleState" },

    "baseline_checkpoint": { "type": "string", "description": "Identifier of the previous accepted checkpoint (§3.1) this candidate is compared against." },
    "candidate_checkpoint": { "type": ["string", "null"], "description": "Null until state reaches 'executed'." },

    "target_metric": {
      "type": "object",
      "required": ["field", "reporting_axis_cell", "pre_registered_threshold"],
      "description": "§3.3's pre-registration — fixed before the experiment runs.",
      "properties": {
        "field": { "type": "string" },
        "reporting_axis_cell": { "type": "string" },
        "pre_registered_threshold": { "type": "number" }
      }
    },

    "benchmark_runs": {
      "type": "object",
      "required": ["current", "previous", "regression", "adversarial", "hard_case"],
      "description": "§3.2 — each value references an EvaluationRun id (Phase 14); all five required before state can reach 'regression_checked'.",
      "properties": {
        "current": { "type": ["string", "null"] },
        "previous": { "type": ["string", "null"] },
        "regression": { "type": ["string", "null"] },
        "adversarial": { "type": ["string", "null"] },
        "hard_case": { "type": ["string", "null"] }
      }
    },

    "regression_check": {
      "type": "object",
      "description": "§4's full ten-dimension table; §4.2 requires completeness even where a dimension is unchanged.",
      "properties": {
        "dimensions": {
          "type": "array",
          "minItems": 10,
          "items": {
            "type": "object",
            "required": ["dimension", "result", "significance"],
            "properties": {
              "dimension": { "enum": ["Role", "Experience", "Complexity", "Task Type", "Task generation", "Technical understanding", "Grounding", "Hallucination", "Uncertainty", "Context understanding"] },
              "result": { "enum": ["improved", "unchanged", "regressed_within_tolerance", "regressed_fail"] },
              "significance": { "type": ["number", "null"] }
            }
          }
        }
      }
    },

    "acceptance": {
      "type": "object",
      "required": ["decision", "checklist", "signed_off_by"],
      "properties": {
        "decision": { "enum": ["pending", "accepted", "rejected", "released", "rolled_back"] },
        "checklist": { "type": "array", "items": { "type": "boolean" }, "description": "§5 criteria 1-7, in order." },
        "signed_off_by": { "type": ["string", "null"], "description": "Reviewer independent of owning_phase, per §5 criterion 8." },
        "rollback_ref": { "type": ["string", "null"], "description": "Set only if decision = 'rolled_back'; references the §6 trigger record." }
      }
    },

    "history": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["timestamp", "from_state", "to_state"],
        "properties": {
          "timestamp": { "type": "string", "format": "date-time" },
          "from_state": { "$ref": "#/$defs/lifecycleState" },
          "to_state": { "$ref": "#/$defs/lifecycleState" },
          "note": { "type": "string" }
        }
      },
      "description": "Full state-transition audit trail — no state (§1) may be skipped; a gap here is itself a process defect."
    }
  },

  "$defs": {
    "changeType": {
      "enum": [
        "More training data", "Better annotations", "Better data balance",
        "Better context", "Better retrieval", "Architecture changes",
        "Training-objective changes", "Output-schema changes", "Better uncertainty handling"
      ]
    },
    "lifecycleState": {
      "enum": ["proposed", "scoped", "executed", "regression_checked", "accepted", "rejected", "released", "monitored", "rolled_back"]
    }
  }
}
```

**Why `history` is a required, append-only array rather than a single `updated_at`.** Section 1's lifecycle rule — no state skipped, no re-entry without restarting from `proposed` — is only enforceable if it's auditable. A record that only stores current state cannot later prove a rejected candidate wasn't quietly re-accepted without a fresh regression check; the transition log is what makes Section 1 a process, not a policy.

---

## 8. Phase-17 Decision Record

| # | Decision | Rationale |
|---|---|---|
| 1 | The improvement lifecycle (Section 1) is a strict state machine — no state skippable, no re-entry into a later state after failing an earlier one | Without this, "regression-checked" could be reached by a shortcut path that never actually ran all five benchmarks, silently defeating §3.2's completeness requirement |
| 2 | Change classification (Section 2) is the explicit mirror of Phase 16 §5's routing table — one names *why* something failed, the other names *what kind of fix* addresses it and how far the fix can plausibly reach | Keeps the two phases' taxonomies aligned by construction rather than by convention, so a future reader can trace failure → root cause → change type → owning phase as one continuous chain |
| 3 | Blast radius defaults to **broad** for architecture, training-objective, and schema changes, narrowing only after evidence from a clean regression check | These three change types have historically the highest chance of an unanticipated side effect (they touch shared machinery, not an isolated dataset slice); assuming locality by default is exactly the assumption that lets a "small" architecture tweak regress something untested |
| 4 | All five required benchmarks (current, previous, Regression, Adversarial, Hard-case) are mandatory for every candidate, with incomplete coverage treated as a blocking defect, not a partial pass | Directly executes the master prompt's explicit instruction; a candidate tested only against the benchmark most likely to show improvement would reproduce the cherry-picking failure this whole phase exists to prevent |
| 5 | The regression methodology (Section 4) checks all ten named dimensions on **every** candidate, regardless of which dimension the change targeted, and requires a complete table even where nothing changed (§4.2) | The master prompt's instruction — do not accept an improvement because one metric increased — is only enforceable if the other nine dimensions are actually measured and recorded, not assumed unchanged |
| 6 | A bounded, severity-weighted exception (§4.1) permits at most one non-targeted, sub-Medium regression, rather than requiring zero regression anywhere | A zero-tolerance rule would make Section 1's incremental-fix lifecycle impractical in practice (nearly any real change touches something at the margin); the bound is deliberately narrow — one dimension, capped severity, hallucination and L0 explicitly exempted from it — so it cannot be used to smuggle a real regression through |
| 7 | Hallucination and L0 structural validity are **never** eligible for the §4.1 tolerance, matching Phase 14 §11's existing hard-ceiling treatment of the same two items | Consistency with prior phases' non-negotiable criteria; introducing a tolerance for these specific two here would quietly reopen a question Phase 1 §8/§9 and Phase 14 §11 already closed |
| 8 | Acceptance (Section 5) and release are treated as **two separate gates** (`accepted` → release candidate; sign-off + rollback-plan-exists → `released`), rather than one combined decision | Separates "did this change meet the bar" (a measurement question, decidable from `EvaluationRun`/regression data alone) from "are we ready to deploy it" (an operational readiness question, e.g. rollback plan) — conflating them would make a technically-sound candidate blocked on operational readiness look like a failed experiment, or the reverse |
| 9 | Sign-off (criterion 8) and rollback confirmation (Section 6) both require a reviewer **independent of the change's owning phase** | Mirrors Phase 6's adjudication-independence principle; without it, the phase most invested in a change being accepted would also be the phase certifying it met the bar |
| 10 | This phase explicitly closes the "release/serving decision" left as an open item by Phase 14 §12 and Phase 15 §10 | Both phases named it as deferred future work rather than leaving it unaddressed; Phase 17 is the first phase whose scope is comparative (candidate vs. previous accepted checkpoint) rather than absolute (a single checkpoint's quality), which is what a release decision actually requires |
| 11 | Rollback criteria (Section 6) require every triggering failure to be converted into a `FailureRecord` and, once fixed, a permanent Regression-dataset case | Reuses Phase 16 §7's re-entry-gate and Phase 7's Regression-dataset machinery rather than inventing a separate post-release tracking system; guarantees a rolled-back failure can never silently reappear in a future candidate the way Phase 14 §11 already guarantees for pre-release Regression cases |
| 12 | No deployment/serving architecture is specified; rollback is defined by what must be preserved and who confirms it, not by infrastructure mechanics | Matches Phase 1's original scope boundary (no deployment/API/application-layer concerns) — an operational detail belongs to a systems-design phase this project has never opened, not to the model-improvement governance this phase owns |

### Open items (deliberately deferred, not forgotten)
- **Numeric significance level and per-cell tolerance magnitudes** for §3.3/§4.1 — set empirically once a populated history of `ImprovementCandidate` experiments exists, per this project's consistent practice (Phase 7 §6.3, Phase 14 §11).
- **Operational rollback bound** (how quickly the previous accepted checkpoint must be redeployable) — an infrastructure/SLA decision explicitly out of this phase's scope (decision #12).
- **Cadence for re-evaluating `[INSUFFICIENT DATA]`-flagged cells post-release** as production volume accumulates — ties to Phase 14 §12's own deferred monitoring-cadence question; not re-derived independently here.
- **Bundled multi-change-type candidates**, where Section 2's separate-candidate default is impractical (e.g., a schema change that mechanically requires a paired training-objective change) — a controlled-bundling methodology is deferred until a concrete case requires it, rather than speculatively designed now.
- **Long-term checkpoint lineage retention policy** (how many previous accepted checkpoints remain rollback-eligible, not just the immediately previous one) — an operational/storage decision, deferred alongside the rollback bound above.
