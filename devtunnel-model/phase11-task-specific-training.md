# Phase 11 — Task-Specific Training
## Specialized AI Software Engineering Model: Training ITU-1 to Convert GitHub Issues into Structured Tasks

Source of truth: Phase 1 (model definition, uncertainty/grounding policy, §8 acceptance criteria, §9 failure criteria), Phase 2 (`task-schema.v2.json`, Rules 1–12), Phase 3 (data strategy, provenance vocabulary), Phase 6 (annotation/ground-truth process), Phase 7 (six datasets, `DatasetRecord`, leakage discipline, mutual exclusivity), Phase 8 (conceptual architecture — heads C–H, supervision map, validation lattice), Phase 9 (adapted base checkpoint), Phase 10 (domain-specialized checkpoint). This document does not redefine any of them. It **executes** the step every prior phase deliberately marked `[not authorized yet]`: attaching Phase 8's heads to a checkpoint and training them, jointly, on Phase 7 data.

**Scope boundary.** This phase produces a **task-trained, calibrated model checkpoint** — the first artifact in this project that is a candidate for the release criteria Phase 1 §8 actually describes. It does **not**:
- Redefine the schema (Phase 2), the architecture (Phase 8), or the datasets (Phase 7).
- Activate Context Tier ≥ 2. Training and evaluation stay at Tier 1 (issue + comments); Tier 2+ activation is a separately gated decision per Phase 8 §11.2, not bundled here.
- Perform subtask generation, dependency mapping beyond issue-level, impact analysis, or implementation context — all explicitly future, per Phase 1 §13.
- Touch deployment, serving, or API design (Phase 1 §14).

---

## 0. Position in the Pipeline

```
Phase 10 output: domain-specialized checkpoint
   (Stage D if promoted; Stage C if Stage D's regression gate failed — Phase 10 §4/§7)
        │
        ▼
Phase 11 (this phase): attach Phase 8 heads C–G to the checkpoint
        │  — joint multi-task supervised training on Phase 7 Training dataset
        │  — post-hoc calibration (G) on Validation
        │  — Phase 8's validation lattice (H) + Phase 1 §8 acceptance criteria, evaluated for the first time
        ▼
Phase 11 deliverable: ITU-1 v1 — a task-trained, calibrated, schema-valid checkpoint
        │
        ▼
[not authorized here] Release/serving decision; Context Tier ≥ 2 activation (Phase 8 §11.2)
```

Phase 9 Decision #11 and Phase 10 Decision #7 both deferred this step by name — "attach Phase 8 heads … multi-task supervised training … validation lattice, Phase 1 §8 acceptance criteria" — as a decision for "a later, not-yet-issued phase." This document is that phase. Everything upstream is reused as-is: no re-selection of base model (Phase 9), no re-derivation of the domain corpus (Phase 10), no re-litigation of the schema (Phase 2) or the six datasets (Phase 7).

---

## 1. Task-Training Strategy

### 1.1 What "task-specific" means here, distinguished from Phase 9/10

Phase 9 and Phase 10 trained a **representation** — the checkpoint could discuss engineering concepts and their relationships but had no mechanism to produce a `TaskUnderstandingRecord`. Phase 11 attaches Phase 8's **heads** (Components C–G; H is deterministic and is not trained) to that representation and teaches them, jointly, to reproduce the judgments a qualified annotator made under the discipline Phase 6 §1.2 sets. Concretely, three things change that did not exist in Phase 9/10:

1. **Labeled targets exist for the first time.** Every prior phase's objectives were self-supervised or lightly-structured contrastive (Phase 9 §3.2, Phase 10 §3). Phase 11 consumes Phase 7 `DatasetRecord.ground_truth` — real classification labels, real evidence spans, real prose — as supervision.
2. **The model must learn to abstain, not just to classify.** Per Phase 1 §10 and Phase 8 Decision #4, `Unknown`/`UNKNOWN` is a first-class training target, not an artifact of missing labels. Phase 3 §1.1's negative-space requirement (issues where the correct answer is genuinely `Unknown`) is what makes this trainable at all.
3. **Generation must be checkable, not just fluent.** Phase 8 §9.2's plan-then-realize split exists so that grounding failures are visible *during* training, not only caught by the deterministic verifier (H2) at inference. Section 3.3 below trains against exactly the failure this split is designed to expose.

### 1.2 Starting point

Phase 11 begins from Phase 10's promoted checkpoint (Stage D, or Stage C if Stage D was deferred per Phase 10 §4/§7), its tokenizer, and its full identity-record lineage (Phase 9 §5, extended by Phase 10 §8 Decision #10). No component upstream of the Shared Representation (Phase 8 §2.B) is re-derived.

### 1.3 Attach, don't replace

All of Component C (four classifiers), D (extraction), E (evidence/provenance), and F (generation) are attached **simultaneously** to the shared encoder, rather than trained head-by-head in sequence. Sequential per-head training was considered and rejected: Phase 8 Decision #1's entire rationale for a shared encoder is that every field depends on the same comprehension of the issue, and training heads in isolation would let each shape the shared representation toward its own objective, reintroducing exactly the cross-field inconsistency (Section 8.1) sharing was meant to prevent. Component G (calibration) is the one exception — trained in a separate, later stage (Section 4), per Phase 8 §5.3's explicit requirement that calibration be a post-training stage fit on Validation only.

### 1.4 Two-stage curriculum, not one training run

| Stage | What trains | Encoder | Gate to advance |
|---|---|---|---|
| **Stage 1 — Joint head training** | C, D, E, F, all losses (Section 5) | Unfrozen, but at a lower learning rate than the heads (protects Phase 9/10's representation gains) | Section 6.1's per-field/per-component metrics clear a floor on Validation |
| **Stage 2 — Calibration** | G only | Frozen | Section 6's calibration criteria (Phase 1 §8 criterion 2) met on Validation |

Freezing the encoder for Stage 2 is a direct application of Phase 8 §8.6's requirement that calibration be conditioned on field × source type as a *statistical* fit, not something that should itself perturb what the heads already learned to predict.

---

## 2. Training Objectives

The master prompt's eleven training targets map onto Phase 8's components as follows. No new component is introduced; Phase 11's job is to give each of Phase 8's already-specified heads a supervised target.

| Master-prompt training target | Phase 8 component | Supervised target (from `ground_truth`) |
|---|---|---|
| 1. Issue understanding | B (shared encoder) | Not directly supervised — shaped jointly by every head below, per Phase 8 §2.B's rationale for sharing |
| 2. Objective extraction | F | `task.objective`, via claim plan → realization |
| 3. Task generation | F | `title`, `summary`, `description`, `scope.*`, `acceptance_criteria`, `constraints` |
| 4. Role classification | C | `task.role` ∈ {Frontend, Backend, Fullstack, Unknown} |
| 5. Experience classification | C | `task.experience_level` ∈ {Beginner, Intermediate, Advanced, Unknown} |
| 6. Complexity classification | C | `task.complexity` ∈ {Low, Medium, High, Unknown} |
| 7. Task-type classification | C | `task.task_type` (registered enum, Phase 2 §2) |
| 8. Technology identification | D | `technologies`, `languages`, `frameworks` |
| 9. Component identification | D | `components`, `systems` (mutual-exclusion decode, Rule 8) |
| 10. Expected-outcome extraction | F | `task.expected_outcome` |
| 11. Uncertainty detection | E (source-type head) + G | `provenance.<field>.source`, `provenance.<field>.confidence`, `uncertainty.uncertain_information`, `uncertainty.missing_information` |

Two targets named in Phase 8's architecture but not in the master prompt's list are trained alongside these because Rule 9 and Component E structurally require them: **dependency extraction** (`dependencies`, D) and **evidence pointer resolution** (E, every field). Both are prerequisites for the explicit-vs-inferred-vs-unknown distinction the master prompt does name, and are already scoped by Phase 8 §2.D–E — they are not new work, only unavoidable ones.

**Explicit/supported/inferred/unknown, restated as a training requirement.** The master prompt's distinction is Phase 2/3's `EXPLICIT / SUPPORTED_BY_CONTEXT / INFERRED / UNKNOWN` vocabulary verbatim. It is trained as the **source-type head's** target (Component E), jointly with — and consistency-coupled to (Phase 8 §8.2) — the value head's own `Unknown` class. A record is not correctly learned unless both agree.

---

## 3. Training Against Hallucination

The master prompt names six things the model must not invent: technologies, files, components, requirements, architecture, dependencies. Phase 8's architecture already makes most of this structurally hard to do (Section 3.1); Phase 11 is where that structure is actually exercised against labeled data.

### 3.1 Structural defenses already in place, now exercised
- **Pointer-based evidence (Phase 8 §2.E).** Because a field's evidence is a span pointer into the input, not free text, there is no generative pathway for the *evidence itself* to fabricate a source. Training a pointer head means training it to point correctly — a fundamentally different, more constrained problem than training a generator to produce plausible-sounding justifications.
- **Entity-copy constraint on generation (Phase 8 §9.2).** Component/technology names appearing in prose are constrained to be copied from pointed spans, not generated from the decoder's open vocabulary. This is trained via a copy-mechanism loss (Section 4.4), not left to decode-time constraint alone — decode-time constraints catch what training didn't prevent, but a model never trained to prefer copying will produce lower-quality copies even when forced to.
- **Consistency coupling (Phase 8 §8.2).** Value = `Unknown` ⇔ source = `UNKNOWN` ⇔ no pointer is trained as a joint objective (Section 4.2), not verified only at assembly (H3 Rules 2–3). A model whose heads disagree with each other at training time will disagree at inference time before H3 ever gets to repair it.

### 3.2 Where the training signal for hallucination-resistance comes from
Per Phase 7 §1 and Phase 8 §5.2, the **Adversarial dataset stays evaluation-only** — it is purpose-built to *measure* `fabricated_grounding_bait` and `spurious_keyword_correlation`, and Phase 7's structural rule makes it mutually exclusive with Training. Phase 11 does not violate this. The training-time counterpart is the **Training dataset's bounded synthetic contrast-pair share** (Phase 3 §8.4, Phase 8 §5.2's closing sentence): issue/near-issue pairs constructed so that a superficially similar technology/component mention is present but *not* actually implicated, teaching the extraction heads (D) that co-occurrence is not evidence. This preserves the separation between "what teaches the behavior" and "what measures whether the behavior was learned" that Phase 7's dataset architecture was built to enforce.

### 3.3 Unsupported-entity training signal
Every `technologies`/`components`/`systems`/`dependencies` item in `ground_truth` carries an aligned evidence pointer (Phase 6 §1.2 guideline 5; Phase 8 §5.1 notes that unaligned evidence falls back to value-only supervision for that item). Where alignment exists, the extraction heads' loss includes a penalty for any *predicted* item with no supporting pointer above threshold — the training-time analogue of H2's unsupported-entity check (Phase 8 §10.2.6), so the model is penalized for the failure mode before the deterministic layer would have to catch it.

---

## 4. Multi-Task Strategy

Realizing the diagram in the master prompt (issue representation → task/role/experience → complexity/type/technical information) as Phase 8's actual head layout:

```
                        Shared encoder B (from Phase 10)
                                   │
      ┌───────────┬────────────┬──┴───────────┬────────────────┐
      │           │            │               │                │
   C: role    C: experience  C: complexity  C: task_type    D: technical
   (separate  (separate      (separate      (separate       extraction
   query/pool)  query/pool)   query/pool)    query/pool)    (tech/lang/fwk/
      │           │            │               │             components/
      └─────┬─────┴──────┬─────┴───────┬───────┘             systems/areas/
            │             │             │                     dependencies)
       E: evidence   E: evidence   E: evidence  ◄──────────────────┘
       pointer +     pointer +     pointer +
       source-type   source-type   source-type
       (per field, all of C and D)
            │
            ▼
       F: claim planner → realizer
       (title/summary/objective/description/expected_outcome/scope/
        acceptance_criteria/constraints)
```

### 4.1 Shared-parameter rationale
This is Phase 8 §2.B and §8.1's shared-encoder-plus-specialized-heads design, unmodified. Training reinforces two things architecture alone cannot guarantee:
- **Cross-field consistency** — a jointly trained encoder is pushed toward a reading of the issue that satisfies role, task_type, and the generated `description` simultaneously, rather than three independently plausible readings. Phase 8 §9.2 already requires H3 to check this at assembly (e.g., every prose-named tracked entity should appear in its structured list); joint training reduces how often that check needs to *repair* rather than merely *confirm*.
- **Experience ⊥ Complexity, trained not just architected.** Phase 8 §8.3's three defenses (separate query/pooling, cross-tab data, nuisance-feature control) are architectural provisions; Phase 11 is where the decoupling penalty (Section 5.2 below) and the length/verbosity decorrelation objective are actually applied against Training data carrying the Phase 3 capability-4/5 contrast pairs.

### 4.2 Task-tier conditioning
Every `DatasetRecord` consumed carries a `context_tier`; per Phase 8 §5.3, input assembly reuses Component A2 so no training example exposes the model to a higher-tier segment than its own `context_tier` permits. Since this phase trains and evaluates at Tier 1 only (Section 0's scope boundary), in practice this means: only `context_tier: 1` `DatasetRecord`s are consumed by Stage 1/2 training. Higher-tier records exist in Phase 7's datasets but are reserved for the future, separately authorized Tier ≥ 2 activation (Phase 8 §11.2).

### 4.3 Metadata dropout and length decorrelation
Both carried forward as stated requirements from Phase 8 §5.3, now actually implemented as training-time procedures: labels/milestones randomly withheld per example (so C cannot learn to copy triage labels instead of reading the issue), and length/verbosity treated as a nuisance variable for the experience and complexity heads specifically (augmentation and a regularization term discouraging those two heads from using token count as a difficulty proxy).

---

## 5. Loss / Objective Strategy

A single multi-task loss, summed (with per-term weights left empirical, per Section 9's open items) over every attached head:

| Term | Component | Form (conceptual) | Purpose |
|---|---|---|---|
| **L_value** | C (×4), D (tagging/typing) | Class-weighted cross-entropy over each field's closed enum (or BIO tagging loss for D's span-tagged fields), `Unknown`/`UNKNOWN`-inclusive | Core classification/extraction target |
| **L_pointer** | E | Span-selection loss (start/end or span-scoring) against aligned evidence spans; skipped for items whose evidence didn't align (Phase 8 §5.1) | Grounds every value in an actual input span |
| **L_source** | E | Cross-entropy over `EXPLICIT / SUPPORTED_BY_CONTEXT / INFERRED / UNKNOWN`, **clipped at training time by the same source-ceiling table** (Phase 8 §2.A) used at inference, so the loss never rewards an over-claimed source type even before H2 would catch it | Trains the explicit/supported/inferred/unknown distinction directly |
| **L_consistency** | C + E jointly | Penalty when value = `Unknown` and source ≠ `UNKNOWN` (or vice versa), and when a non-`UNKNOWN` source has no corresponding pointer | Prevents the head disagreement Section 3.1 names as a training-time analogue of H3 Rules 2–3 |
| **L_decouple** | C (experience, complexity) | Penalty on similarity between the two heads' pointer distributions over the same input (Phase 8 §8.3.1) | Structural enforcement of experience ⊥ complexity |
| **L_dependency** | D | Relation classifier loss over `{blocks, blocked_by, relates_to, requires}` for candidate refs restricted per Rule 9 | Trains `dependencies` without opening free-text ref generation |
| **L_claim** | F (planner) | Loss over claim selection/typing (`STATED / CONTEXT / INFERRED`) against claim plans derived from annotator prose + evidence (Phase 8 §5.1) | Makes the intermediate claim plan itself a supervised, checkable object |
| **L_realize** | F (realizer) | Sequence loss over prose fields, conditioned on the claim plan, constrained-decoding-aware | Trains fluent realization without decoupling it from the claim plan that grounds it |
| **L_copy** | F (realizer) | Auxiliary loss rewarding copy-mechanism attention over pointed spans for entity mentions in prose, versus open-vocabulary generation | Direct training-time hallucination defense (Section 3.1) |
| **L_unsupported** | D | Penalty for predicted extraction items with no supporting pointer above threshold | Training-time analogue of H2's unsupported-entity check (Section 3.3) |
| **L_abstain** | C, D | `Unknown`/negative-class targets carry their own (non-zero) loss weight, per Phase 8 §5.3's abstention-supervision requirement | Prevents the model being implicitly penalized for correctly abstaining |

**Calibration is not a loss term above.** Per Phase 8 §8.6 and Section 1.4's Stage 2, G is fit *after* Stage 1 converges, on Validation, using a calibrator per (field, source type) — a statistical fit against held-out agreement, not a differentiable term jointly optimized with the rest.

**Quality-tier weighting.** Per-example loss is weighted by `quality_status.tier` (Phase 7 Section 3, Phase 8 §5.2: "GOLD ≥ SILVER"), and the bounded synthetic share (Phase 3 §8.4) is capped as a minority of any batch, never filling a floor alone.

---

## 6. Evaluation Strategy

This is the first phase in the project where Phase 1 §8's acceptance criteria and Phase 8's full validation lattice are actually evaluated — Phase 9 §7.7/§11 Decision #8 and Phase 10 §5.7 both named this explicitly out of scope for themselves.

### 6.1 Classification
Phase 1 §8 criterion 1, evaluated on Test (one-shot, Section 6.6) and continuously on Validation during Stage 1: per-field agreement with ground truth for role, experience, complexity, task_type, against a threshold set empirically on Validation (Phase 1 §8: "to be set empirically... not assumed here" — this document does not fix a number).

### 6.2 Task generation
Claim-support rate (what fraction of generated sentences entail only their cited claims, Phase 8 §9.2/§10.2.5) and acceptance-criteria adequacy (Rule 5 satisfaction rate) on Validation/Test, plus human-reviewed spot samples against Phase 6 §1.1's own standard ("what would a competent engineer... correctly conclude").

### 6.3 Grounding
Pointer-resolution rate (H2.1), source-ceiling compliance rate before H2 downgrade (H2.2 — a high pre-downgrade violation rate signals a training problem in L_source, not just an assembly-time nuisance), and `EXPLICIT`-textual-support rate (H2.3), each measured on Validation/Test and tracked as a first-class training metric, not only an inference-time gate.

### 6.4 Hallucination
Evaluated on the **Adversarial dataset**, per its `failure_mode_targeted` tags (Phase 7 §1): `fabricated_grounding_bait`, `spurious_keyword_correlation`, `experience_complexity_collapse`. This is the first phase where Adversarial is actually exercised as a model-evaluation instrument rather than a dataset-construction concern. Failure rate on each targeted mode is reported separately, not pooled, so a strength on one mode cannot mask a weakness on another.

### 6.5 Schema validity
Phase 1 §8 criterion 6: 100% of emitted records validate against `task-schema.v2.json`, measured as the complement of the `RejectedResult` rate (Phase 8 §10.5's Level-5 outcome) across Validation/Test — this is a hard requirement, not a quality target with room underneath it.

### 6.6 Uncertainty
Phase 1 §8 criteria 2 and 4 (calibration, appropriate abstention), evaluated on Validation (for calibrator fitting, Section 1.4 Stage 2) and confirmed on Test and on the **Hard-case dataset**, which exists specifically to stress-test calibration and the `Unknown` machinery (Phase 7 §1). Calibration is measured per (field, source type), matching Phase 8 §8.6's fit granularity — a single pooled calibration number would hide exactly the `EXPLICIT`-vs-`INFERRED` distinction Phase 1 §10 requires.

### 6.7 One-shot Test discipline
Test is consumed **exactly once**, at the end of Stage 2, per Phase 7 §6.3's rule that Test is never used for calibration or threshold tuning. All threshold-setting, calibrator-fitting, and iterative model-selection decisions in Sections 6.1–6.6 above are made on Validation and Hard-case only.

### 6.8 Regression
The **Regression dataset** — every record a prior model version got wrong in a way judged a genuine failure (Phase 7 §1) — is run once Test has been consumed, as a trip-wire: any regression against a previously-fixed case is a release blocker (Section 8), independent of whether aggregate Test metrics improved.

---

## 7. Checkpoint Strategy

Extends Phase 9 §5 / Phase 10 §8's identity-record discipline with Phase 11-specific fields, rather than introducing a parallel scheme:

- **Identity record**, per checkpoint: source checkpoint (Phase 10 Stage C or D, whichever was promoted), tokenizer version (unchanged since Phase 9), head configuration (which of C–G are attached and their architecture version, per Phase 8 §1.2), training-data manifest hash (which Phase 7 Training/Validation snapshot, per dataset version — Phase 7 §6), loss-weight configuration, and training stage (`stage_1_joint` or `stage_2_calibrated`).
- **Stage 1 and Stage 2 checkpoints are retained separately.** A Stage-2 (calibrated) checkpoint is never treated as interchangeable with its Stage-1 parent — calibration is fit against a specific Stage-1 state, and re-running Stage 2 against a different Stage-1 checkpoint requires a new identity record, not an in-place update.
- **Promotion gate.** A checkpoint is promoted from Stage 1 to Stage 2 only once Section 6.1–6.5's Validation-measured criteria clear a floor (empirical, Section 9). A checkpoint is promoted to **release-candidate** status only once Section 6's full suite — including the one-shot Test pass and the Regression trip-wire — has run and passed. This mirrors Phase 10 §4's stage-gating discipline, extended to a two-stage (not four-stage) curriculum because Phase 11, unlike Phase 10, has only one reversible juncture (Stage 1 → Stage 2) rather than four.
- **Rollback.** A Stage-2 checkpoint that fails Section 6's release criteria rolls back to its Stage-1 parent for re-calibration (cheap — Stage 2 is calibration-only) before a full Stage-1 re-run is considered (expensive — touches every head and the encoder).
- **One artifact.** Per Section 0, the phase's deliverable is a single checkpoint: **ITU-1 v1**, the first checkpoint in this project's lineage that is a release-candidate rather than a representation-quality artifact.

---

## 8. Failure Criteria

Model-level failure is **Phase 1 §9, applied for the first time** rather than restated: a trained checkpoint has failed on a given record if it fabricates grounding, overclaims confidence on an inference, conflates task length with experience, fails to flag genuine ambiguity, invents an unsupported entity, or emits non-schema-conformant output. Phase 11 adds training/release-process failure criteria specific to this phase:

| Failure mode | Signal | Response |
|---|---|---|
| Adversarial failure rate on any single `failure_mode_targeted` category exceeds its release threshold | Section 6.4 | **Hard blocker** for release-candidate promotion; return to Stage 1 with adjusted L_unsupported/L_copy weighting or expanded contrast-pair share (Section 3.2), not a Stage-2-only fix |
| Regression trip-wire fires (a previously-fixed case reappears) | Section 6.8 | **Hard blocker**, same discipline as Phase 7/9/10's hard-blocker precedent: the specific regression is diagnosed before any further Test/Regression cycle is spent |
| Schema validity below 100% on Validation/Test (any `RejectedResult`) | Section 6.5 | Diagnose whether the failure is a Level-4/5 degradation-lattice pattern (Phase 8 §10.5) concentrated in one field — often signals L_consistency or L_pointer under-training for that field specifically |
| Calibration fails Phase 1 §8 criterion 2 (high confidence not more often right) for a given (field, source type) cell | Section 6.6 | Re-fit Stage 2 for that cell; if the underlying miscalibration is systematic (not a fitting artifact), return to Stage 1 — a calibrator cannot fix a head that doesn't actually discriminate |
| Experience/complexity evidence-identity violation (Rule 7) reappears at a non-trivial rate post-training | Section 4.1, Phase 8 §8.3 | Increase L_decouple weight; audit whether Training's cross-tab contrast pairs (Phase 3 cap. 4–5) are underrepresented in the current Training snapshot |
| Test consumed more than once before a release decision | Section 6.7 | **Process failure**, not a model failure — logged and treated as invalidating that Test pass per Phase 7 §6.3; a fresh Test-equivalent is not simply re-drawn to paper over the violation |
| System-level: downstream users cannot act differently on high- vs. low-confidence output | Phase 1 §9's system-level failure condition, restated | Treated as a release blocker regardless of aggregate accuracy — the uncertainty machinery being decorative rather than load-bearing was named in Phase 1 as failure at the system level, not merely a quality gap |

---

## 9. Phase-11 Decision Record

| # | Decision | Rationale |
|---|---|---|
| 1 | Phase 11 **executes** the step Phase 9 §1.6 and Phase 10 §8 both deferred by name ("attach Phase 8 heads… multi-task supervised training… validation lattice, Phase 1 §8 acceptance criteria") | The master prompt authorizes task-specific training; this document is the "later, not-yet-issued phase" those documents pointed to, kept traceable to that exact handoff language rather than treated as a fresh design |
| 2 | Heads C–F are attached and trained **jointly**, not sequentially per head; G is trained in a **separate, later, encoder-frozen stage** | Preserves Phase 8 Decision #1's shared-encoder rationale (joint training protects cross-field consistency); preserves Phase 8 §5.3/§8.6's explicit requirement that calibration be a post-hoc statistical fit on Validation, not a jointly optimized term |
| 3 | Training and evaluation are scoped to **Context Tier 1 only**; Tier ≥ 2 activation is explicitly out of scope | Matches Phase 8 §11.2's advance rule (a tier activates only once its data, ablation uplift, calibration stability, and leakage tests all clear) — none of which this phase attempts to establish; keeps Tier 2+ a separately authorized decision, as Phase 8 §11.1 requires |
| 4 | Hallucination defenses are trained via the **Training dataset's bounded synthetic contrast-pair share only**; the Adversarial dataset remains strictly evaluation-only | Preserves Phase 7 §1's structural mutual-exclusivity rule between Training and Adversarial; training directly on Adversarial examples would inflate Section 6.4's measurement of exactly the behavior it exists to test |
| 5 | Explicit/supported/inferred/unknown is trained as **Component E's source-type head, consistency-coupled to each value head's `Unknown` class**, not as a separate post-hoc classifier bolted onto finished predictions | Matches Phase 8 §8.2's consistency-coupling design; a decoupled classifier could learn to agree with the value head's *output* without the source-ceiling clipping (Section 5's L_source) that keeps the label honest relative to what the evidence can actually support |
| 6 | A **two-stage curriculum** (joint heads, then calibration) replaces Phase 9/10's four-stage pattern | Phase 11 has only one architecturally required reversible juncture (representation-shaping training vs. a post-hoc statistical fit); imposing Phase 10's four-stage granularity here would be process for its own sake, not a distinction this phase's objectives actually contain |
| 7 | Phase 1 §8's acceptance criteria and Phase 8's full validation lattice are evaluated **here, for the first time in the project** | Both were explicitly deferred by Phase 9 §11 Decision #8 and Phase 10 §5.7 as requiring trained heads and labels neither phase had; this is the first phase with both |
| 8 | Test is consumed **exactly once**, after Stage 2, with Regression run immediately after | Phase 7 §6.3's one-shot discipline exists precisely for the moment a phase like this one is tempted to iterate against Test; Regression follows Test rather than preceding it so it measures the checkpoint that would actually ship, not an intermediate one |
| 9 | Deliverable is **one artifact** — ITU-1 v1, a release-candidate checkpoint — using the same identity-record and rollback discipline as Phase 9 §5/Phase 10 §8, extended with head configuration and training stage | Keeps traceability continuous (Phase 1 §12's principle, already extended twice) rather than starting a new bookkeeping scheme for the first phase that actually produces a candidate for release |
| 10 | Loss-term weights, abstention operating points, and Stage-1→Stage-2 promotion thresholds are **not fixed in this document** | Consistent with this project's practice throughout (Phase 7 §6.3, Phase 8 "Open items," Phase 9/10 "Open items"): thresholds are empirical and set once a baseline measurement exists on the actual Training/Validation data, not asserted in advance |

### Open items (deliberately deferred, not forgotten)
- **Loss-term weights** (Section 5) — set once a baseline Stage-1 run exists to tune against on Validation.
- **Abstention operating points and Stage-1/Stage-2/release promotion thresholds** (Sections 6, 7) — empirical, per this project's consistent practice.
- **Human-review sampling rate** for Section 6.2's spot-check of generated prose against Phase 6 §1.1's standard — a QA-process decision, not fixed here.
- **Context Tier ≥ 2 activation** — remains a separately authorized decision per Phase 8 §11.2/§11.1; this document does not trigger it.
- **Release/serving decision for ITU-1 v1** — a decision for a later, not-yet-issued phase, outside this document's scope boundary (Phase 1 §14).
