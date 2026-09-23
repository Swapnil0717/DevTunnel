# Phase 14 — Validation & Evaluation
## Specialized AI Software Engineering Model: The Consolidated Evaluation Framework for ITU-1

Source of truth: Phase 1 (§8 acceptance criteria, §9 failure criteria), Phase 2 (`task-schema.v2.json`, `sourceType` vocabulary), Phase 6 (annotation process, human agreement discipline), Phase 7 (six datasets — Training, Validation, Test, Hard-case, Adversarial, Regression), Phase 8 (§10 Validation Architecture — H1–H5, deterministic), Phase 11 (§6 task-training evaluation), Phase 12 (§7 context-tier evaluation), Phase 13 (§7 behavior/instruction evaluation battery). This document does not redefine any of them. It **executes** the consolidation every prior evaluation section left implicit: Phase 11 §6, Phase 12 §7, and Phase 13 §7 each built a *local* evaluation procedure for their own gate decision; Phase 14 generalizes those three into **one reusable Evaluation Framework** — a fixed set of metrics, benchmarks, and a reporting contract that any current or future ITU-1 checkpoint is run against the same way, rather than each phase re-deriving its own ad hoc measurement.

**Scope boundary.** This phase produces the **Evaluation Framework** — metric definitions, benchmark bindings, an automated pipeline design, a human-review protocol, and a reporting/acceptance contract — plus its first application, an **Evaluation Report** against the current release candidate (ITU-1 v1-b, Phase 13). It does **not**:
- Train, fine-tune, or modify any checkpoint. Phase 14 is measurement-only; where a metric reveals a deficiency, the response is a routing decision (back to Phase 11/12/13), not a fix applied here.
- Redefine the datasets (Phase 7), the schema (Phase 2), or the deterministic validators H1–H5 (Phase 8 §10) — H1–H5 are **inputs** to this framework (Section 4), not re-specified.
- Replace any prior phase's own gate. Phase 11 §7's promotion gate, Phase 12 §7's per-tier gate, and Phase 13 §8's behavior gate already fired for the checkpoints they cover; Phase 14 does not retroactively re-judge those decisions, it supplies the framework those decisions should have been (and future ones will be) measured against **consistently**.
- Decide release or serving (Phase 1 §14). Section 11's acceptance thresholds gate promotion to release-candidate status only; the release decision itself remains out of scope, as every prior phase has held.

---

## 0. Position in the Pipeline

```
Phase 11 output: ITU-1 v1                (task-trained, calibrated, Tier 1)
Phase 12 output: per-tier checkpoints     (Tier ≥ 2, where gated)
Phase 13 output: ITU-1 v1-b               (behavior-reinforced)
        │
        ▼
Phase 14 (this phase): one Evaluation Framework, applied uniformly to
   whichever checkpoint(s) are under review — not a new training stage
        │
        ▼
Phase 14 deliverable: Evaluation Framework spec + Evaluation Report
   for ITU-1 v1-b (current highest-lineage checkpoint)
        │
        ▼
[not authorized here] Release/serving decision (Phase 1 §14)
```

**Why this consolidation matters now, not earlier.** Phase 11 §6 could only define evaluation against Tier-1 classification/generation quality, because Tier ≥2 and behavior-under-framing-pressure didn't exist yet. Phase 12 §7 and Phase 13 §7 each then had to extend that local procedure ad hoc. With three checkpoints now in the lineage (v1, per-tier candidates, v1-b), running three divergent evaluation procedures against them would make cross-checkpoint comparison unreliable — exactly the "single overall score hides what matters" failure the master prompt warns against, just relocated from *within* a report to *across* reports. Phase 14 fixes the procedure, not the checkpoint.

---

## 1. Evaluation Architecture

The framework has four layers, run in this order for any checkpoint under evaluation:

| Layer | What it measures | Owns |
|---|---|---|
| **L0 — Structural** | Is the output even a valid `TaskUnderstandingRecord`? | Phase 8 H1/H3/H4/H5 (reused, not re-derived) — a hard gate; anything failing L0 is excluded from L1–L3, not averaged in |
| **L1 — Classification** | Per-field correctness against ground truth (Section 2.1) | Role, experience, complexity, task_type |
| **L2 — Generation & Grounding** | Quality and honesty of generated prose and evidence (Section 2.2, 6, 7) | title/summary/objective/description/expected_outcome, `provenance`, `dependencies` |
| **L3 — Uncertainty & Behavior** | Calibration, abstention correctness, framing-robustness (Section 2.3, 8; Phase 13's battery folded in here) | `confidence`, `uncertainty`, `review` |

**Explicit design rule (master prompt): no layer is collapsed into a single number, and no single number is reported as "the" score.** Section 10's reporting contract enforces this structurally — an Evaluation Report with fewer than the required per-field, per-class, and per-cut breakdowns is itself a malformed report, checked the same way H1 checks record structure.

---

## 2. Metrics

### 2.1 Classification metrics (Role, Experience, Complexity, Task Type)
For each of the four fields, computed against the tier-appropriate reference (Phase 12 §7.2 — reused unchanged, since a lower-tier checkpoint's honestly-correct answer may legitimately be `Unknown` where a higher tier resolves it):
- **Accuracy** (exact match, including `Unknown` as a valid class)
- **Precision, Recall, F1** — macro-averaged across classes (so a large `Feature`/`Bug` majority doesn't drown out rare classes like `Security`) **and** per-class, both reported (Section 10)
- **Per-class performance** — one row per class value, including `Unknown` as its own class, not a residual bucket
- **Confusion matrix** — full N×N matrix per field, including the `Unknown` row/column; a systematic `Unknown → wrong-class` or `class-A → class-B` pattern is diagnostic in a way a scalar F1 cannot show, per Phase 1 §9's failure-mode-5 (experience/complexity collapse) and Phase 8 §8.3

### 2.2 Task-generation metrics
| Metric | Definition |
|---|---|
| **Faithfulness** | Does generated prose (title/summary/objective/description/expected_outcome) accurately represent what the issue says, with no added or altered meaning? Scored per Phase 8 §9.3's must-never list, automated via H2 (Section 6) plus human spot-check (Section 5) |
| **Completeness** | Does the record capture everything the issue's own text supports being captured (not everything a fuller investigation *might* reveal — that's a missing-information gap, not a completeness failure)? |
| **Relevance** | Is every included statement actually pertinent to the task, or has irrelevant issue content (e.g., an unrelated aside in a long issue) been carried in verbatim? |
| **Clarity** | Is the generated prose actionable and unambiguous to the developer-oriented reader named in the master prompt (Phase 1 §3), independent of whether it's faithful? |
| **Structural validity** | 100%-or-fail per Phase 1 §8 criterion 6 — delegated entirely to H1/H3 (Section 6), not independently re-measured here |
| **Technical correctness** | Are named technologies, components, and mechanisms used consistently with their actual meaning (e.g., not calling a caching layer a "database")? Distinct from faithfulness (which checks fidelity to the issue) and grounding (which checks evidentiary support) — this checks internal technical accuracy |
| **Grounding** | Section 6, in full |
| **Hallucination** | Section 7, in full |
| **Consistency** | Cross-field agreement (a `task_type: Documentation` record should not carry a `role: Backend` justified by database schema reasoning) and re-run stability (Phase 13 Section 2's determinism check, reused here as a standing metric rather than a one-off) |

### 2.3 Uncertainty metrics
- **Confidence calibration** — reliability diagrams and Expected Calibration Error (ECE) per (field, source type), extending Phase 11 §6.6's calibration cells into a standing metric rather than a one-time release check
- **Uncertainty detection** — precision/recall of the model's `uncertain_information` flag against records a human reviewer independently marks as genuinely contestable (Section 5)
- **Insufficient-information detection** — precision/recall of `Unknown` assignment against records where ground truth itself is `Unknown` (Phase 7's Hard-case negative-space records, Phase 3 §1.1) — this is the direct operationalization of Phase 1 §8 criterion 4 ("appropriate abstention"), now a tracked metric rather than a pass/fail check

---

## 3. Benchmark Definitions

The framework does not introduce new data; it binds each metric layer to the Phase 7 dataset(s) that legitimately support it, and states what each benchmark is — and is not — allowed to answer:

| Benchmark | Dataset(s) (Phase 7) | Answers | Does not answer |
|---|---|---|---|
| **Generalization benchmark** | Test | "How does the checkpoint perform on realistic, unseen, naturally-distributed issues?" | Targeted robustness to any specific failure mode (too rare in a naturally-distributed sample to power that measurement) |
| **Calibration benchmark** | Test + Hard-case | "Is confidence trustworthy, especially near the abstention boundary?" | Raw accuracy (Hard-case is deliberately skewed toward difficulty, not representative) |
| **Hallucination benchmark** | Adversarial | "Does the checkpoint fabricate grounding under conditions built to bait it?" (Section 7) | Base rate of hallucination in ordinary traffic (Adversarial is intentionally adversarial, not representative — reported separately, never pooled with Test) |
| **Framing-robustness benchmark** | Adversarial + Phase 13's paired-framing records | Phase 13's 12-category battery (Section 7 there), re-run here as a standing part of every Evaluation Report rather than a one-off Phase 13 artifact | Whether a category's *underlying issue* was classified correctly — that's the generalization benchmark's job; this benchmark isolates stability, not accuracy |
| **Regression benchmark** | Regression | "Has any previously-fixed failure reappeared?" | Anything not already a known prior failure — Regression is a trip-wire, not a generalization measure |
| **Context-tier benchmark** | Tier-sibling issues within Test (Phase 12 §7.1) | Section 9, in full | Absolute tier quality in isolation — always a same-issue, cross-tier comparison, never a cross-issue one |

---

## 4. Automated Evaluation

1. **L0 gate first, always.** Every candidate output is run through H1 (structural validity), H3 (rule engine), H4 (derived fields), H5 (degradation lattice) before any other metric is computed. A record that fails L0 is logged as a structural failure (Section 10) and excluded from L1–L3 aggregates — averaging a malformed record's "accuracy" into a classification score would misrepresent both.
2. **L1 (classification)** is fully automated: exact-match scoring against the tier-appropriate reference, computed in one pass over Test.
3. **L2 (generation/grounding)** is automated where H2 (Phase 8 §10.2, evidence-facing grounding verification) can decide the question mechanically (e.g., does every `EXPLICIT` field's `evidence` pointer resolve to actual input text) and routed to human review (Section 5) where it cannot (faithfulness, clarity, technical correctness of free text — H2 checks evidence *existence*, not prose *quality*).
4. **L3 (uncertainty/behavior)** is automated for calibration curves and abstention precision/recall (both computable against ground truth without a human in the loop); Phase 13's framing-robustness battery is likewise fully automated, since it compares the model against itself (Section 2.2, consistency) rather than against a human judgment.
5. **Pipeline output** is one `EvaluationRun` record per checkpoint per benchmark (Section 3), never a single blended pass — Section 10 defines the shape.

---

## 5. Human Evaluation

Automated metrics (Section 4) cannot judge faithfulness, clarity, or technical correctness of free-text generation, or independently validate that the model's `uncertain_information` flags track genuine ambiguity rather than a learned shortcut. Human evaluation closes that gap, using the same reviewer pool and discipline Phase 6 already established for ground-truth annotation — not a separately invented review process:

- **Sampling.** A stratified sample of L2/L3 outputs is drawn from each benchmark (Section 3), stratified across the same axes as Section 10's reporting cuts (role, experience, complexity, task type, technology, repository type, context level), so human judgment isn't concentrated on whichever category happens to be easiest to sample.
- **Reviewer protocol.** Reviewers score faithfulness, completeness, relevance, clarity, and technical correctness (Section 2.2) on the record alone, blind to the model's own confidence and provenance annotations, then separately confirm or reject each `uncertain_information`/`review_required` flag with their own reasoning — mirroring Phase 6's adjudication discipline so a reviewer's agreement with the model is measured, not assumed.
- **Agreement measurement.** Human-vs-model agreement rate is reported per Section 2.2's metric, per Section 10's cuts, the same way Phase 6 reports inter-annotator agreement — a low agreement rate on a specific cut (e.g., security-sensitive issues) is a finding, not noise to be averaged away.
- **Escalation.** A human reviewer who flags a record as faithfulness-violating or technically incorrect routes that record toward the Regression dataset (Phase 7) the same way a Phase 11–13 evaluation failure does, once confirmed as a genuine failure rather than reviewer disagreement (Phase 6 §4.3's fact-vs-intent distinction applies here too — a reviewer's stylistic preference is not a faithfulness failure).

---

## 6. Grounding Evaluation

The master prompt's five-way grounding taxonomy (**Explicitly stated, Inferred from context, Strongly supported, Uncertain, Unsupported**) is an **evaluation-time lens**, distinct from and mapped onto Phase 2's four-way production `sourceType` (`EXPLICIT`, `SUPPORTED_BY_CONTEXT`, `INFERRED`, `UNKNOWN`). The model never emits "Unsupported" — a claim scored as Unsupported at evaluation time is, by definition, a claim the model should not have made at all (Section 7):

| Evaluation-time category | Maps to production `sourceType` | What it checks |
|---|---|---|
| Explicitly stated | `EXPLICIT` | Evidence pointer resolves to a direct statement in the input |
| Strongly supported | `SUPPORTED_BY_CONTEXT` (high-confidence band) | Evidence pointer resolves to strong surrounding signal, not a direct statement |
| Inferred from context | `SUPPORTED_BY_CONTEXT` (lower band) / `INFERRED` | Evidence pointer resolves to a reasoning chain, per Phase 1 §11 |
| Uncertain | Any non-`UNKNOWN` source type with confidence below Section 8's threshold, **or** a claim present in `uncertain_information` | Field has a value, but the evidentiary basis is thin — checked, not assumed, against the same threshold Section 8 calibration uses |
| Unsupported | *(no valid production mapping)* | Evidence-checking (H2) finds no input text or context segment that supports the claim at all — this is a **grounding failure**, feeding directly into Section 7 |

Every technical claim in `task` — not just fields with their own `provenanceEntry` — is passed through this categorization, including claims embedded in free-text fields (`description`, `expected_outcome`) that H2's evidence check must locate and verify independently of the structured `provenance` map, since free text can smuggle in an ungrounded claim a schema-level field check would not catch.

---

## 7. Hallucination Evaluation

Directly operationalizes Phase 1 §9's failure criteria and Phase 13 §6's must-not list as a measured rate, not a binary pass/fail:

| Hallucination type | Detection method | Benchmark |
|---|---|---|
| Fabricated entity (file/component/system not in input) | Evidence-check (H2) finds no supporting segment | Adversarial + Test spot-check |
| Fabricated dependency (`dependency.ref` invented or unresolvable) | Schema-level check: does `ref` resolve to a declared component/system or a valid external-issue pattern? (Phase 2) | Adversarial |
| Unrequested scope expansion (constraint/criterion the issue didn't ask for) | Human review (Section 5), since this requires judging intent, not just presence of text | Test human sample |
| Overclaimed confidence on a weak-evidence field | Calibration check (Section 8) — a confidence/source-type mismatch, not a separate detector | Test + Hard-case |
| Keyword-triggered classification (Phase 13 category 10) | Framing-robustness benchmark (Section 3) — same issue, keyword swapped, classification must not move without evidence change | Adversarial + paired-framing records |
| Evidence claimed for an `UNKNOWN` field | Schema-level check (`evidence`/`confidence` must both be null when `source: UNKNOWN`) | Automated, all benchmarks |

**Reported metric:** hallucination rate = (Unsupported claims, Section 6) ÷ (total technical claims evaluated), broken out per type above and per Section 10's cuts — never collapsed into one "hallucination score," since a model that hallucinates rarely but severely on security-sensitive issues is a different risk profile than one with a flat low rate everywhere, and a single rate would make the two indistinguishable.

---

## 8. Uncertainty Evaluation

- **Calibration curves** per (field, source type, context tier) — extends Phase 11 §6.6 and Phase 12 §7.5 into the standing framework; a well-calibrated model's confidence-N bucket is empirically correct N% of the time.
- **Expected Calibration Error (ECE)** computed per cell above, reported alongside the curve (a single ECE number is diagnostic but insufficient alone — the curve shows *where* miscalibration occurs, e.g. only at high confidence).
- **Abstention precision/recall** — of the records where the model outputs `Unknown` or flags `uncertain_information`, what fraction were genuinely warranted (precision), and of the records that genuinely warranted it, what fraction did the model catch (recall)? Both matter: high precision with low recall means the model is honest but under-cautious; the reverse means it's over-flagging and eroding the signal's usefulness (Phase 1 §9's system-level failure condition).
- **Insufficient-information detection**, scored against Phase 3 §1.1's deliberately-curated negative-space records (issues where the correct answer is genuinely `Unknown`) — this is the one uncertainty metric with unambiguous ground truth, and the most direct test of Phase 1 §10's abstention principle.

---

## 9. Context Evaluation

Generalizes Phase 12 §7's per-tier comparison from a training-gate procedure into a standing part of every Evaluation Report, mapped onto the master prompt's five named comparison points:

| Master-prompt comparison point | Context Tier (Phase 3/8/12) | Compared using |
|---|---|---|
| Issue only | Tier 1 (partial) | Tier-sibling issues (Phase 12 §7.1) |
| Issue + comments | Tier 1 (full) — ITU-1 v1's baseline | " |
| Issue + repository | Tier 2 | " |
| Issue + relevant code | Tier 3 | " |
| Issue + deeper engineering context | Tiers 4–7, whichever have cleared Phase 12's advance gate | " |

For each comparison, Section 2.1's per-field accuracy against the **tier-appropriate reference** (Phase 12 §7.2, reused) is reported as an uplift delta between adjacent tiers, alongside Section 8's calibration-preservation check (a richer tier must not make the model less honest when that context isn't available) and Section 6's grounding-category mix (does more context shift claims from "Inferred" toward "Explicitly stated"/"Strongly supported," as it should, or merely toward higher-confidence-but-still-Uncertain claims — a subtler failure Phase 12 alone did not separately track). A tier not yet promoted by Phase 12 is reported as `[NOT ACTIVE]` in this comparison, not silently omitted, so the report always shows the full five-point ladder even where some rungs are currently empty.

---

## 10. Reporting Format

**Structural rule, restated from Section 1: an Evaluation Report is a cube, not a scalar.** Every metric in Sections 2, 6, 7, 8, 9 is reported cut by each of the following axes, independently — not just in aggregate:

| Reporting axis | Source |
|---|---|
| Role | `task.role` |
| Experience | `task.experience_level` |
| Complexity | `task.complexity` |
| Task type | `task.task_type` |
| Technology | `task.technologies` (one row per technology with sufficient sample size; long tail pooled into "Other," logged) |
| Repository type | Phase 3's stratification axes (language/ecosystem, framework, domain, size/maturity — Section 2.5) |
| Context level | Section 9's five-point ladder |

An `EvaluationRun` record therefore holds: checkpoint identity (Phase 9–13's lineage record, unchanged), benchmark (Section 3), the full L0–L3 metric set (Section 2), grounding/hallucination breakdowns (Sections 6–7), calibration data (Section 8), context-tier comparison (Section 9, where applicable), and one results table per reporting axis above — plus the human-review agreement rates (Section 5) as a parallel, explicitly-labeled-as-human column alongside each automated metric, never merged into it. A report that presents only aggregate accuracy, or that blends automated and human-derived numbers into one column without distinguishing them, does not satisfy this section.

---

## 11. Acceptance Thresholds

Per this project's consistent practice (Phase 7 §6.3, Phase 8–13's "Open items"), numeric thresholds are **empirical**, set once a baseline `EvaluationRun` exists — Phase 14 fixes the *shape* of the gate, not the numbers:

- **L0 structural validity** — must be 100% on Test (Phase 1 §8 criterion 6, non-negotiable, not empirically tuned).
- **L1–L3 thresholds** — set per (metric, reporting-axis cell), not one global floor, so that a checkpoint strong in aggregate but weak on a specific cut (e.g., `Security` task_type recall) does not silently clear the gate. A cell with insufficient sample size to set a meaningful threshold is flagged `[INSUFFICIENT DATA]` rather than defaulted to pass or fail.
- **Hallucination rate (Section 7)** — a hard ceiling per type, since Phase 1 §9 treats fabricated grounding as failure, not a quality gradient to be traded off against accuracy.
- **Regression benchmark** — any reappearance of a previously-fixed case is a hard blocker, unchanged from Phase 11 §8's precedent.
- **Context-tier comparison (Section 9)** — reuses Phase 12 §11.2's five-part advance rule as the gate for whether a given tier's uplift is real; Phase 14 does not introduce a competing threshold for the same decision.

---

## 12. Phase-14 Decision Record

| # | Decision | Rationale |
|---|---|---|
| 1 | Phase 14 **consolidates** Phase 11 §6, Phase 12 §7, and Phase 13 §7 into one framework, rather than adding a fourth local evaluation procedure | Three divergent ad hoc procedures already exist; a fourth would make the exact problem worse instead of solving it — consolidation, not addition, is the only version of this phase that satisfies its own purpose |
| 2 | The framework is **measurement-only**; no training happens here | Keeps the project's ownership boundaries intact — a deficiency found here routes back to whichever phase owns the fix (11/12/13), it is not patched in place |
| 3 | Four measurement layers (L0–L3), gated in order, with **L0 as a hard exclusion filter** rather than a scored component | A malformed record has no meaningful classification/generation/uncertainty score; including it in those averages would corrupt exactly the metrics Sections 2/6/7/8 exist to keep honest |
| 4 | The master prompt's **five-way grounding taxonomy** is treated as an evaluation-time lens mapped onto Phase 2's four-way production `sourceType`, with **"Unsupported" carrying no valid production mapping** | The model has no legitimate way to emit "Unsupported" — it is by construction a grounding failure; giving it a production-side equivalent would legitimize the very state Phase 1 §11 exists to prevent |
| 5 | Hallucination is reported as a **rate, broken out by type and by reporting axis**, never a single score | A flat rate hides exactly the concentration-of-risk pattern (e.g. rare-but-severe on security-sensitive issues) that matters most for downstream trust (Phase 1 §9's system-level failure condition) |
| 6 | Human evaluation reuses **Phase 6's reviewer pool and adjudication discipline**, rather than a new review process | Keeps human-judgment quality consistent across annotation (Phase 6) and evaluation (Phase 14); a second, differently-calibrated review process would make the two hard to compare |
| 7 | Automated vs. human-derived metrics are **always reported as separate, labeled columns**, never merged | Merging would hide which numbers are mechanically verifiable and which rest on reviewer judgment — a distinction Section 10 treats as load-bearing, not cosmetic |
| 8 | Context evaluation (Section 9) **reuses Phase 12's tier-sibling comparison and advance rule** rather than introducing a competing tier-quality measure | Avoids exactly the risk Section 0 names: two different procedures answering the same question differently. Phase 12 owns tier promotion; Phase 14 reports it, on the master prompt's five-point ladder, without re-deciding it |
| 9 | Reporting is defined as a **cube over seven axes** (Section 10), with an explicit rule against scalar-only reports | Directly satisfies the master prompt's own instruction ("DO NOT USE ONLY ONE OVERALL SCORE"); making this structural (a malformed-report check) rather than a stated preference prevents it from eroding over time the way an unenforced norm would |
| 10 | Acceptance thresholds are **empirical and per-cell**, except L0 validity (100%, fixed) and hallucination ceilings (hard, not tuned) | Consistent with the project's practice throughout; the two exceptions are exceptions because Phase 1 §8/§9 already treat them as non-negotiable, not because Phase 14 introduces new absolutism |
| 11 | Deliverable is the **framework plus its first Evaluation Report** against ITU-1 v1-b, not a framework alone | An untested framework risks being aspirational; running it once, now, against the current lineage checkpoint validates the framework itself is usable, not just well-specified |

### Open items (deliberately deferred, not forgotten)
- **Per-cell acceptance thresholds** (Section 11) — set once a baseline `EvaluationRun` exists on real Test/Hard-case/Adversarial data, per this project's consistent practice.
- **Sample sizes for Section 5's stratified human-review draw** — a QA-process/budget decision, not fixed here.
- **Minimum sample size per reporting-axis cell** before a cell is flagged `[INSUFFICIENT DATA]` rather than scored — empirical, set once real cut-level counts exist.
- **Cadence for re-running the framework** (per checkpoint only, vs. a periodic standing re-evaluation against a live/growing Test set) — a monitoring-process decision, outside this document's measurement-framework scope.
- **Release/serving decision** for any checkpoint that clears Section 11's gates — a decision for a later, not-yet-issued phase, outside this document's scope boundary (Phase 1 §14), same as every prior phase's equivalent open item.
