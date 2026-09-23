# Phase 8 — Model Architecture
## Specialized AI Software Engineering Model: Conceptual Architecture for Issue → Task Understanding (ITU-1)

Source of truth: Phase 1 (model definition, boundaries, uncertainty/grounding policy), Phase 2 (`task-schema.v2.json` and its 12 validation rules), Phase 3 (data strategy, Context Tiers 1–7, leakage rules), Phase 6 (label definitions), Phase 7 (six datasets, `DatasetRecord`). This document does not redefine any of them. It defines the **conceptual structure of the model** that must produce Phase 2-conformant records and be trained on Phase 7 datasets.

**Scope boundary.** Conceptual architecture only: components, responsibilities, interfaces, data flow. No framework choice, parameter counts, hyperparameters, serving/API/deployment design (Phase 1 §14 excludes these), and no implementation of deep repository reasoning. Where a component is *specified but not built* in the current stage, it is marked **[DEFINED, NOT ACTIVE]**.

**Terminology.** "Context Tier 1–7" is Phase 3's name for the inference-time context stages (Phase 1 §13). "Phase N" is the project workflow step. The master prompt's six-step evolution maps to tiers as follows:

| Master-prompt stage | Context Tier | Status in Phase 8 |
|---|---|---|
| Issue only | 1 | **ACTIVE (baseline)** |
| Issue + comments | 1 (comments are part of Tier 1 input, Phase 1 §4) | **ACTIVE** |
| Issue + repository | 2 (structure, README, metadata) | Interface defined; light, optional [DEFINED, NOT ACTIVE] |
| Issue + relevant code | 3 (source excerpts, config) | [DEFINED, NOT ACTIVE] |
| Issue + documentation + dependencies | 4 and 5 | [DEFINED, NOT ACTIVE] |
| Issue + PRs + commits + project history | 6 (and 7, project conventions) | [DEFINED, NOT ACTIVE], with the strictest leakage guard |

---

## 0. Architectural Thesis

Three commitments drive every choice below. Each traces to a Phase 1 requirement.

1. **Evidence is selected, not invented.** The most important behavioral constraint in the project (Phase 1 §11) is that the model never generates evidence that doesn't exist in the input. The architecture makes this structural: evidence for every field is a **pointer** to an input segment/span, produced by a selection mechanism, and only rendered into the schema's `evidence` string afterward. A field with no valid pointer cannot be non-`UNKNOWN` (except `INFERRED`, which must still point at the premises it reasons from).
2. **`UNKNOWN` is a first-class output of every head, and the universal safe fallback.** Every classification head has an explicit `Unknown` class, and the validator can always degrade a field to `UNKNOWN` (null evidence, null confidence) while remaining schema-valid. Abstention is architecturally cheap and never an error path (Phase 1 §10).
3. **The model proposes; deterministic code disposes.** Everything Phase 2 defines as *derived or rule-checkable* (`overall_confidence`, `review_required`, `uncertainty.*` rollups, provenance completeness, disjointness, ref resolution, etc.) is computed or checked by a deterministic layer, never authored by the neural model. This is Phase 2's own decision (Phase 2 §9) applied to the architecture.

**"Engineering-understanding system, not a keyword classifier"** is enforced by mechanism, not slogan (Section 8.4): evidence-grounded heads, metadata dropout, length decorrelation for experience vs. complexity, contrast-pair and adversarial training/eval data, and calibration by source type.

---

## 1. Architecture Diagram

### 1.1 System view (Tier 1 active; higher tiers plug in at the Context Layer)

```text
                          ┌────────────────────────────────────────────────────┐
                          │                  INFERENCE REQUEST                 │
                          │  issue snapshot (title, body, labels, comments,    │
                          │  snapshot_fetched_at) + context_tier_ceiling +     │
                          │  optional context handles                          │
                          └───────────────────────────┬────────────────────────┘
                                                      │
        ┌─────────────────────────────────────────────▼──────────────────────────────┐
        │  A. INPUT & CONTEXT LAYER                                                   │
        │  A1 Segmenter/Normalizer  → typed, ID'd Segments (ISSUE_TITLE, ISSUE_BODY,  │
        │                              COMMENT, LABEL, ...)                           │
        │  A2 Context Manager       → tier gating, segment budget, source ceilings    │
        │  A3 Retriever   [DEFINED, NOT ACTIVE for Tier ≥2] → typed segments          │
        │  A4 Leakage Guard         → drops anything post-snapshot / resolving PRs    │
        └─────────────────────────────────────────────┬──────────────────────────────┘
                                                      │  Segment set S (each with segment_id, type, origin, tier)
        ┌─────────────────────────────────────────────▼──────────────────────────────┐
        │  B. SHARED REPRESENTATION                                                   │
        │  Engineering-aware encoder over S → token states H, segment states, and     │
        │  a pooled issue state. Multilingual. Segment-type & tier embeddings.        │
        └───────┬───────────────┬───────────────┬────────────────┬───────────────────┘
                │               │               │                │
   ┌────────────▼───┐ ┌─────────▼─────────┐ ┌───▼────────────┐ ┌─▼──────────────────────┐
   │ C. CLASSIFY    │ │ D. TECHNICAL      │ │ E. EVIDENCE &  │ │ F. TASK GENERATION     │
   │ role           │ │ EXTRACTION        │ │ PROVENANCE     │ │ claim planner →        │
   │ experience     │ │ tech/lang/fwk     │ │ per-field      │ │ realizer (constrained) │
   │ complexity     │ │ technical_areas   │ │ evidence       │ │ title/summary/objective│
   │ task_type      │ │ components ⊥      │ │ pointer heads  │ │ description/outcome/   │
   │ (each w/       │ │ systems           │ │ + source-type  │ │ scope/acceptance/      │
   │  Unknown)      │ │ affected_areas    │ │ head           │ │ constraints            │
   │                │ │ dependencies      │ │                │ │                        │
   └───────┬────────┘ └─────────┬─────────┘ └───────┬────────┘ └──────────┬─────────────┘
           └─────────────┬──────┴───────────────────┴─────────────────────┘
                         │  Raw proposals: values + evidence pointers + source-type + logits
        ┌────────────────▼───────────────────────────────────────────────────────────┐
        │  G. UNCERTAINTY & CALIBRATION                                               │
        │  per-field calibrated confidence (conditioned on field × source type) +     │
        │  abstention decision (→ UNKNOWN) + ambiguity flags + missing-info proposer  │
        └────────────────┬───────────────────────────────────────────────────────────┘
                         │
        ┌────────────────▼───────────────────────────────────────────────────────────┐
        │  H. ASSEMBLY & VALIDATION (deterministic)                                   │
        │  H1 Structure-constrained decoding grammar (from task-schema.v2.json)       │
        │  H2 Grounding verifier (pointer resolves; source ceiling; claim support)    │
        │  H3 Rule engine: Phase 2 Rules 1–12                                         │
        │  H4 Derivation: uncertainty rollups, overall_confidence, review_required    │
        │  H5 Degradation lattice (repair → downgrade → abstain → reject)             │
        └────────────────┬───────────────────────────────────────────────────────────┘
                         │
                         ▼
             TaskUnderstandingRecord (schema 2.x) + InferenceTrace (internal, not part of the record)
```

### 1.2 Head-level view (what shares what)

```text
                     Shared encoder states H
                              │
     ┌──────────────┬─────────┼─────────────────┬──────────────────┐
     │              │         │                 │                  │
 Query set      Query set   Tagging        Pointer/relation    Decoder
 per field      per field   layer          layer               (cross-attends H)
 (evidence      (evidence   (BIO-style      (dependency ref,   ↓
  pooling)       pooling)    spans +        issue-ref links)   claim plan → text
     │              │        typing)
 role, task_type  experience,
                  complexity   ← separate query sets, separate pooling (Section 8.3)
```

---

## 2. Component Responsibilities

Each component states: responsibility, inputs → outputs, what it must **not** do, and the Phase requirement it serves.

### A. Input & Context Layer

| Component | Responsibility | In → Out | Must not | Serves |
|---|---|---|---|---|
| **A1 Segmenter/Normalizer** | Turn the issue snapshot into typed, addressable segments with stable `segment_id`s and character offsets; preserve raw text (Phase 5 normalization is a *training-data* sidecar concern and inference applies the same *non-destructive* conventions) | issue snapshot → `Segment[]` | Rewrite or drop text such that an evidence pointer can no longer resolve to original wording | Phase 1 §12 traceability |
| **A2 Context Manager** | Enforce `context_tier_ceiling`; assemble segments into a bounded input; record which tier each segment belongs to; attach the **source ceiling** per segment type (below) | segments + ceiling → ordered segment set S | Admit a higher-tier segment into a lower-tier request | Phase 3 IR-3 / Q-CTX |
| **A3 Retriever** [DEFINED, NOT ACTIVE for Tier ≥2] | Select relevant repository/code/doc/dependency/PR chunks for the issue and return them as typed segments with origin IDs | issue segments + repo handle → `Segment[]` | Return content dated after `snapshot_fetched_at`, or content that resolves the issue (A4) | Phase 1 §13 evolution |
| **A4 Leakage Guard** | Hard filter on every retrieved segment: post-snapshot timestamps, PRs/commits referencing the issue, and (at Tier 6) the resolving PR | segments → filtered segments | Be optional. It runs on every request at Tier ≥2 | Phase 3 CP-4 / ER-5 |

**Source ceiling table** (enforced by A2/H2). It bounds the *strongest provenance source* a field may claim when its evidence points at a given segment type. It encodes Phase 3 §2's "provenance category it can support" column:

| Evidence segment type | Max source it can support | Notes |
|---|---|---|
| `ISSUE_TITLE`, `ISSUE_BODY` | `EXPLICIT` | |
| `COMMENT` | `SUPPORTED_BY_CONTEXT` (`EXPLICIT` only if the comment author is the issue reporter *and* clarifies a fact) | Reporter identity comes from author metadata, informational per Phase 1 §4 |
| `LABEL`, `MILESTONE` | `SUPPORTED_BY_CONTEXT` | Never `EXPLICIT` (Phase 3 §2) |
| `REPO_META`, `README`, `FILE_TREE`, `DOC`, `CONFIG`, `DEP_GRAPH` | `SUPPORTED_BY_CONTEXT` | |
| `CODE` | `SUPPORTED_BY_CONTEXT` until Tier-3 verification exists; then a new value (see Section 11.3) | Phase 2 §5 forward-compat |
| `PR`, `COMMIT` (Tier 6, precedent only, never the resolving one) | `SUPPORTED_BY_CONTEXT` | |
| none (reasoning across premises) | `INFERRED` | Must still cite ≥1 premise pointer |

### B. Shared Representation

**Responsibility.** One encoder produces contextual token and segment representations that every head consumes. Rationale for sharing: role, task type, experience, complexity, technical entities and grounded generation all depend on the *same* comprehension of the issue; separate encoders would learn inconsistent readings of one text and would break cross-field consistency (e.g., `task_type: Bug` but a generated `objective` describing a feature).

Requirements on the representation (properties, not design):
- **Engineering-terminology aware.** Pretrained on both natural language and code/technical text, so that "race condition," "N+1 query," "hydration mismatch" are represented as concepts, not rare tokens. Capability #2.
- **Multilingual.** Phase 1 §4 and Phase 3 §8.2 include non-English issues. Language coverage is bounded by annotator coverage in training data (Phase 3 §8.2), and this is a known limit, not something the architecture hides.
- **Segment- and tier-aware.** Every token carries a learned segment-type and tier embedding, so the model can learn *different trust* for a body sentence vs. a label vs. a README chunk.
- **Long-input capable at Tier 1; budgeted at higher tiers.** Tier 1 inputs (issue + comments) must fit without truncating the body; the Context Manager's budget policy prioritizes title/body/reporter comments over later thread drift.

Outputs: token states `H`, per-segment states, pooled issue state, all with retained offsets back to source text.

### C. Classification Components (role, experience, complexity, task_type)

Four **separate specialized heads** (Section 8). Each head:
- Predicts over its closed enum **including `Unknown`** (Phase 2 `roleValue`, `experienceValue`, `complexityValue`, `taskTypeValue`).
- Is paired with its own **evidence pointer head** (Section E) and **source-type head**.
- Emits logits, not just an argmax, so G can calibrate and abstain.
- `task_type` output space is the **registered** enum only. `Other` is a legitimate class (Phase 2 §2), not a failure sink. New values arrive via a registry MINOR bump plus retraining/head extension, never by free-text emission.

### D. Technical Extraction Components

| Output field | Mechanism | Constraint carried from Phase 2 |
|---|---|---|
| `technologies`, `languages`, `frameworks` | Span tagging over `H` plus normalization to canonical names (Phase 5 §2.2 vocabulary) | Named or strongly implied only; passing mentions that aren't relevant are negatives (Phase 3 cap. 7) |
| `technical_areas` | Span tagging **and** short abstractive labeling from a pooled state | Free-text set; each item needs a pointer |
| `components`, `systems` | Joint typed tagging with a **mutual-exclusion decode** so no string lands in both | Rule 8; granularity definitions in Phase 2 §4 |
| `affected_areas` | Same tagger family, lower-confidence prior | Provenance optional (Phase 2 §2) |
| `dependencies` | Two-stage: (1) candidate refs, meaning issue-reference regex matches plus mentions matching an extracted component/system; (2) relation classifier for `blocks / blocked_by / relates_to / requires` | Rule 9: `ref` must resolve to a component/system or match the issue-ref pattern; enforced at decode by restricting candidates |

Constraint: at Tier 1–2, `components` remain **unverified against code** (Phase 1 §6, Phase 2 §2). D never marks them beyond `SUPPORTED_BY_CONTEXT`/`INFERRED` on textual grounds. Real verification arrives with Tier 3 retrieval.

### E. Evidence & Provenance Heads

This is the mechanism that implements Phase 1 §11.

- **Per-field evidence pointer head.** For each tracked field, a field-specific query attends over segment/token states and outputs **one or more span pointers** `(segment_id, start, end)`. Unlike a generative rationale, a pointer cannot describe text that isn't there.
- **Source-type head.** Predicts `EXPLICIT / SUPPORTED_BY_CONTEXT / INFERRED / UNKNOWN` per field. Its output is **clipped by the source ceiling** of the segments it points to (table in Section 2.A). A head that says `EXPLICIT` while pointing only at a comment/label is downgraded by H2, and that event is logged.
- **Evidence rendering.** For `EXPLICIT`/`SUPPORTED_BY_CONTEXT`, the schema's `evidence` string is a *deterministic rendering* of the pointed span(s) (Phase 1 §11: "close paraphrase or reference … not a long quote"; rendering uses a pointer reference plus a short excerpt, never a long quote). For `INFERRED`, the evidence is a short reasoning statement produced by the realizer **in the form "premise pointers → conclusion"**, verified by H2 to cite ≥1 valid pointer.
- **`UNKNOWN` path.** If no pointer clears the evidence threshold, or the source-type head predicts `UNKNOWN`, evidence and confidence are `null` (Rule 2), and the reason is proposed for `missing_information`.

### F. Task Generation Component

Generates `title`, `summary`, `objective`, `description`, `expected_outcome`, `scope.in_scope/out_of_scope`, `acceptance_criteria`, `constraints` (Section 9). Generation is **plan-then-realize**, so that grounding is checkable at the *claim* level (Phase 3 capability 13).

### G. Uncertainty & Calibration Component

Detailed in Section 8.6. Responsibility: turn raw logits and pointer strengths into per-field calibrated confidence, decide abstention, and surface *specific* ambiguities and missing information (not boilerplate; Phase 3 cap. 12).

### H. Assembly & Validation (deterministic)

Detailed in Section 10. Responsibility: guarantee that anything leaving the system is schema-valid, rule-valid, and grounding-checked, and that derived fields are computed, not authored.

---

## 3. Data Flow

**Tier 1 inference flow (the active path).**

1. **Ingest.** Issue snapshot (title, body, labels, comments, `snapshot_fetched_at`) → A1 → typed segments.
2. **Gate.** A2 applies the tier ceiling (Tier 1), drops nothing else, computes segment budget.
3. **Encode.** B produces `H`.
4. **Parallel heads.** C (four classifiers), D (taggers/dependencies), E (pointers + source types) read `H`. They run in parallel and share no *output* state except through H, so a wrong role guess cannot silently steer the complexity head (see 8.3).
5. **Claim planning.** F's planner reads `H` plus the *proposed classification and extraction outputs* and produces an atomic claim list, each claim tied to pointers. This is the single deliberate point where head outputs feed generation, so prose is consistent with structured fields.
6. **Realization.** F's realizer writes the prose fields from the claim plan under constrained decoding.
7. **Calibrate.** G converts logits/pointer strength/source type → per-field confidence; applies abstention thresholds; drafts `uncertain` flags and `missing_information`.
8. **Verify & assemble.** H2 grounding checks → H3 rules → H4 derivations → H5 degradation as needed.
9. **Emit.** `TaskUnderstandingRecord` (with `task_identity` populated from the snapshot) + `InferenceTrace`.

**Higher-tier flow (defined, not active).** Steps 1–2 gain A3/A4: the Retriever returns typed segments at the ceiling tier, A4 filters, and everything else is unchanged. Because context enters *only as typed segments with IDs*, no head, pointer mechanism, or validator changes shape when a tier is added (Section 11).

**Failure flow.** Any H-stage failure enters the degradation lattice (Section 10.5); nothing malformed is emitted.

---

## 4. Input / Output Flow

### 4.1 Input contract (conceptual)

```yaml
InferenceInput:
  issue:
    repo: string
    issue_number: int
    issue_url: uri
    snapshot_fetched_at: datetime        # pins the snapshot (Phase 1 §12)
    title: string
    body: string                          # may be empty
    labels: [string]                      # signal, not ground truth
    comments: [ { author_role: string, body: string, created_at: datetime } ]
  context_tier_ceiling: 1-7               # highest tier the caller authorizes
  context_handles:                        # empty at Tier 1
    repo: handle | null
    # code / docs / deps / PR-history handles appear as tiers activate
```

This deliberately mirrors the `input` block of Phase 3's `TrainingExample` so training and inference see the same shape.

### 4.2 Output contract

- **Primary output:** a `TaskUnderstandingRecord` conforming to `task-schema.v2.json` (2.x). This is the *only* consumer-facing artifact.
- **Secondary output (internal):** an `InferenceTrace`: pointer resolution results, which downgrades/repairs fired, pre-/post-calibration confidences, which validation rules were exercised. It supports audit and Phase 6-style error analysis and is **not** part of the record. It also must not be confused with the record's field-level provenance, nor with Phase 3 §7 data provenance.

### 4.3 Field-to-component map (who produces what)

| Record section / field | Produced by | Derived/validated by |
|---|---|---|
| `task_identity.*` | A1 (from the snapshot) plus assembler (UUIDv4, timestamp) | H1 |
| `task.role / experience_level / complexity / task_type` | C | H2, H3 |
| `task.technologies … affected_areas`, `dependencies` | D | H3 (Rules 8, 9) |
| `task.title … expected_outcome`, `scope`, `acceptance_criteria`, `constraints` | F | H2 (claim support), H3 (Rule 5) |
| `provenance.<field>` | E (pointers, source type) + G (confidence) | H2 (ceiling, evidence rules), H3 (Rules 1–3, 7) |
| `uncertainty.explicit/inferred_information` | **H4 derives from `provenance`** | Rule 6 |
| `uncertainty.uncertain_information` | H4 derives from confidence < 0.6 (Phase 2 default) **plus** G's ambiguity flags | Rule 6 |
| `uncertainty.missing_information` | G proposes; H validates non-boilerplate | |
| `confidence.overall_confidence` | **H4 computes** `weighted_mean_v1` | Rule 10 |
| `review.*` | **H4 computes** the Phase 2 §4 trigger rules | Rule 11 |

---

## 5. Training Interfaces

Training consumes **Phase 7 `DatasetRecord`s** and nothing else. The architecture defines *what each component is trained against*, not the training procedure.

### 5.1 Supervision map

| Component | Supervised target (from `ground_truth`) | Notes |
|---|---|---|
| C role/experience/complexity/task_type | enum labels including `Unknown` | `Unknown` examples (Phase 3 §1.1 negative space) are positives for the `Unknown` class, not filtered noise |
| D extraction | technology/language/framework/area/component/system/affected_area sets; dependency triples | Includes negatives: passing mentions (Phase 3 cap. 7) |
| E pointers | annotators' evidence, aligned to source spans | Phase 6 requires evidence per field; alignment of evidence to spans is a data-prep step. Records whose evidence cannot be aligned supervise value heads but not pointer heads |
| E source type | `provenance.<field>.source` | |
| F generation | prose fields; acceptance criteria; scope | Trained on claim plan → text; claim plans derived from annotator prose and evidence |
| G calibration | agreement between predictions and labels on held-out data | Fit on **Validation** only |

### 5.2 Which dataset does what (Phase 7 alignment)

| Dataset | Role in training/eval |
|---|---|
| **Training** (GOLD+SILVER, bounded synthetic) | Parameter learning. Loss weighting by `quality_status.tier`: GOLD ≥ SILVER; BRONZE not in Phase 7 Training |
| **Validation** (GOLD) | Model selection, threshold tuning, calibrator fitting, abstention operating points |
| **Test** (GOLD, frozen) | One-shot per release. **Never** used for calibration or threshold tuning (Phase 7 §6.3) |
| **Hard-case** | Targeted measurement of calibration and `Unknown` behavior |
| **Adversarial** | Targeted measurement per `failure_mode_targeted` (fabricated grounding, overclaimed confidence, experience/complexity collapse, spurious keyword correlation) |
| **Regression** | Trip-wire across versions; never trained on |

Adversarial and Hard-case are evaluation instruments, not training data, because Phase 7 makes them mutually exclusive with Training. The training-time counterparts of these failure modes (contrast pairs, synthetic bait) come from the Training dataset's bounded synthetic share.

### 5.3 Training-time behaviors the architecture requires

These are *interface-level requirements*, not procedures:

- **Multi-task training over shared encoder B** so classification, extraction, pointers, and generation shape one representation.
- **Context-tier conditioned training.** Each `DatasetRecord` carries a `context_tier`; input assembly for training reuses A2 so the model never sees a higher-tier segment than the record's tier (Phase 3 Q-CTX; Phase 7 §2.3 sibling integrity).
- **Metadata dropout.** Labels/milestones are randomly withheld so the model can't learn to copy triage labels (Phase 3 cap. 9, Phase 1 §4).
- **Length/verbosity decorrelation** for the experience and complexity heads (Section 8.3).
- **Abstention supervision.** `Unknown` targets carry their own loss; the model isn't rewarded for guessing when ground truth is `Unknown`.
- **Post-training calibration stage.** Separate from representation learning; consumes Validation only.
- **No PR/commit text in any training input** for the issue it resolves (Phase 3 CP-4). Where Tier 6 training examples exist, they include only *precedent* PR/commit context permitted by Phase 3/7.

---

## 6. Inference Interfaces

Conceptual contracts. These are function-level and deliberately not endpoints, since Phase 1 §14 excludes API/deployment concerns.

```text
understand(InferenceInput)                 -> (TaskUnderstandingRecord | RejectedResult, InferenceTrace)

Internal stage interfaces (each independently testable / replaceable):
  segment(issue)                           -> Segment[]
  gate(Segment[], ceiling)                 -> Segment[]
  retrieve(issue_segments, handles, tier)  -> Segment[]           [DEFINED, NOT ACTIVE]
  encode(Segment[])                        -> EncodedContext
  classify(EncodedContext)                 -> {field: (logits, pointers, source_logits)}
  extract(EncodedContext)                  -> {field: (items, pointers)}
  plan_claims(EncodedContext, proposals)   -> ClaimPlan
  realize(ClaimPlan)                       -> ProseFields
  calibrate(proposals, ClaimPlan)          -> {field: confidence, abstain?}
  validate_and_assemble(all, snapshot)     -> Record | Rejected
```

**Modes** (same model, differing only in ceiling and post-processing):
- *Standard:* full record.
- *Tier-ceiling:* caller may lower `context_tier_ceiling` to *ablate* context (used in evaluation to measure per-tier uplift).

**Determinism.** For a fixed snapshot, tier, and model version, the record must be reproducible, or variation must be bounded and logged. This matters for the audit story (Phase 1 §12) and for Regression tests.

**Rejected results.** `RejectedResult` is a defined, machine-parseable *non-record* (reason codes only). It is not a malformed record. It exists because Phase 1 §8 treats malformed output as hard failure: the system must prefer "no record, clearly labeled" to "a record that violates the schema" (see Section 10.5).

---

## 7. Context Architecture

### 7.1 Principle

**Context enters only as typed, ID'd, tier-tagged segments.** Every head, pointer, validator rule, and calibrator operates on segments. Consequently a new context source is a new segment type and a new tier gate, not a new model.

### 7.2 Segment schema (conceptual)

```yaml
Segment:
  segment_id: string            # stable within a request
  type: ISSUE_TITLE | ISSUE_BODY | COMMENT | LABEL | MILESTONE | REPO_META | README |
        FILE_TREE | DOC | CODE | CONFIG | DEP_GRAPH | PR | COMMIT | PROJECT_CONVENTION
  tier: 1-7                     # earliest tier at which this type may appear (Phase 3 §2)
  origin: { uri or repo path, fetched_at }
  text: string
  meta: { author_role?, created_at?, language? }
```

### 7.3 Context Manager policy

- **Tier gate:** reject any segment whose `tier` exceeds the ceiling.
- **Temporal gate:** reject any segment with `created_at`/`fetched_at` after `snapshot_fetched_at` (plus the Leakage Guard for Tier ≥2).
- **Trust encoding:** tell the model each segment's type via embeddings (B) *and* bound its influence on provenance via the source ceiling (H2). The first shapes *what the model believes*; the second bounds *what it may claim*.
- **Budgeting:** priority order for Tier 1 is title, body, reporter comments, other comments, labels. For higher tiers, retrieved segments are budgeted per type so a large code dump cannot crowd out the issue itself (Phase 3 §2: source code "must be excerpted/retrieved relevantly, not dumped wholesale").

### 7.4 Retrieval [DEFINED, NOT ACTIVE for Tier ≥ 2]

Role, when activated: bring *only relevant* repository knowledge to the issue so `components/systems` and technology fields can be grounded better, and later so `affected_areas` and complexity can use code reality. Requirements defined now to avoid rework later:
- Query formed from the issue's extracted technical entities and segment states, not raw text alone.
- Returns segments with origin IDs so pointers remain resolvable.
- Result set is passed through A4 unconditionally.
- Retrieval quality is measured separately from classification quality (Section 11), so "the model doesn't understand" and "the retriever didn't find it" stay distinguishable. This is the same separation Phase 1 §14 states as the reason context was deferred.

### 7.5 Context and provenance interplay

Adding context does **not** weaken the grounding rule. It adds segment types with their own ceilings. A `SUPPORTED_BY_CONTEXT` claim from a README chunk is auditable exactly like one from a comment, because the pointer resolves to a specific segment and origin.

---

## 8. Classification Architecture

### 8.1 Why specialized heads on a shared encoder

- **Shared encoder**: one comprehension of the issue (Section 2.B).
- **Specialized heads**: the four fields have different label semantics, different evidence, different confusion structures, and different data balances (Phase 3 §8.1). One monolithic "classification head" would force a common decision surface where none exists, and would make the experience/complexity independence requirement unenforceable.

### 8.2 Head structure (each of C's four heads)

```text
field query q_f ── attends over H ──► field-pooled state h_f
                                        ├─► value head    → logits over enum (with Unknown)
                                        ├─► pointer head  → evidence spans
                                        └─► source head   → EXPLICIT / SUPPORTED_BY_CONTEXT / INFERRED / UNKNOWN
```

- **Value head** gives the decision. **Pointer head** gives the grounding. **Source head** gives the provenance type. All three are conditioned on the same `h_f`, so the evidence pooled is the evidence actually used.
- **Consistency coupling.** Value `Unknown` ⇔ source `UNKNOWN` ⇔ no pointer. Enforced at training via joint loss and at assembly by H3 (Rules 2–3).

### 8.3 Experience ⊥ Complexity (Phase 1's explicit anti-goal, enforced structurally)

Phase 1 §9 lists collapsing size/length with experience as a **named failure**, and Phase 2 Rule 7 forbids identical evidence for both. The architecture gives it three layers of defense:

1. **Separate query sets and pooling** for experience and complexity (different `q_f`, different `h_f`), with a decoupling penalty discouraging identical pointer distributions.
2. **Cross-tab data design.** Phase 3 cap. 4–5 requires both 2×2 extremes (short/advanced, long/beginner). The Training dataset's contrast pairs supply this; the heads are also evaluated against Hard-case/Adversarial (`experience_complexity_collapse`).
3. **Nuisance-feature control.** Issue length/verbosity is treated as a nuisance variable: augmentation/regularization to discourage the heads from using it as a shortcut, and evaluation slices stratified by length.

Additionally: experience evidence must reference *technical difficulty signals* (domain knowledge required, subtlety, blast radius) per Phase 3 cap. 4. This is a **label-definition and data** requirement (Phase 6 §3.2) that the head learns; it is not something the architecture can assert on its own.

### 8.4 Anti-keyword-shortcut mechanisms (collected)

| Mechanism | Guards against |
|---|---|
| Evidence pointers required for non-`Unknown` output | Predicting from global keyword statistics with no grounded basis |
| Metadata dropout on labels/milestones | Copying triage labels |
| Length decorrelation on experience/complexity | Length as difficulty proxy |
| Contrast pairs and Hard-case eval | Confusable pairs (Bug vs. Performance; Improvement vs. Refactor) |
| Adversarial eval (`spurious keyword correlation`, `fabricated_grounding_bait`) | Surface-cue reliance, fabricated grounding |
| Repo-level split and near-dup clusters (Phase 7) | Repo-specific phrasing memorization |

### 8.5 Role: 3-class plus explicit ambiguity

`Fullstack` must be reserved for genuine cross-cutting work (Phase 3 cap. 3); multiple-role-implicated cases that are not truly `Fullstack` follow Phase 6 §4.4's edge-case rule. Architecturally this needs no special component: the head predicts `Frontend/Backend/Fullstack/Unknown` and G's ambiguity flagging carries the "more than one role is plausible" signal into `uncertain_information`.

### 8.6 Uncertainty Estimation & Confidence (Component G in detail)

**What is estimated.**
- **Per-field confidence** `∈ [0,1]` for every non-`UNKNOWN` tracked field. Required output of `provenance.<field>.confidence`.
- **Abstention.** Whether to return `UNKNOWN` for the field.
- **Ambiguity flags.** Fields with a value but genuine ambiguity (competing interpretations, contradictory evidence, Phase 6 §4.1/4.3) → `uncertain_information` with a `note`.
- **Missing information.** Specific, issue-grounded statements ("does not say which platform"), not templated text.

**How (conceptually).**
- **Inputs to confidence:** head logits/entropy, pointer strength and coverage, agreement between value head and source head, **source type**, and (optionally) disagreement across an ensemble or perturbed passes.
- **Calibration is conditioned on field × source type.** Phase 1 §10 requires confidence to correlate with source type, and Phase 2 Rule 4 expects `EXPLICIT` entries to sit ≥ 0.75 in aggregate. A calibrator per (field, source type) lets an `INFERRED` `experience_level` be honestly ~0.5 while an `EXPLICIT` `task_type` is honestly ~0.9. This is a **statistical target evaluated over samples**, not a per-record clamp, matching Rule 4.
- **Abstention operating points** are set per field on **Validation**, at a target precision/coverage tradeoff chosen by the project. The numbers are empirical and are not fixed in this document (consistent with Phase 1 §8: "to be set empirically").
- **Missing-information proposer.** A small generation head conditioned on which fields are `UNKNOWN`/low-confidence and which segment types are absent; H rejects generic phrases not tied to an unresolved field.

**What G does not do.** It does not compute `overall_confidence` or `review_required`. It supplies the per-field inputs; H4 derives the rest (Rules 10–11).

**Quality criterion.** Phase 1 §8: "when the model reports high confidence, it is right more often than when it reports low confidence." Evaluated on Validation/Test/Hard-case using calibration metrics per field and per source type. It is a release criterion, not a nicety.

---

## 9. Generation Architecture

### 9.1 What is generated

`title`, `summary`, `objective`, `description`, `expected_outcome`, `scope.in_scope`, `scope.out_of_scope`, `acceptance_criteria`, `constraints`, plus short `INFERRED` evidence statements and `missing_information` text.

### 9.2 Plan-then-realize

```text
Encoded context + structured proposals (role, type, entities, pointers)
                 │
                 ▼
     CLAIM PLANNER  ─────►  ClaimPlan = [ {claim, pointers[], kind: STATED | CONTEXT | INFERRED} , ... ]
                 │
                 ▼
     REALIZER (constrained)  ─────►  prose fields, each sentence tagged with the claim(s) it realizes
                 │
                 ▼
     Claim-support verifier (H2)  ─────►  every sentence entails only its cited claims
```

- **Why two stages.** Grounding is checkable on *claims* (does each cited pointer support this claim?) and on *realization* (does this sentence say only what its claims say?). A single end-to-end generator would leave nothing intermediate to verify, and Phase 3 identifies grounded generation as "the hardest capability … the dataset's highest-scrutiny field."
- **Reframing is allowed, fabrication is not** (Phase 2 §1): title/summary/description may reword or narrow the issue; the original stays in `issue_title_raw`. Narrowing must be *principled*: claims that narrow scope are recorded (Phase 3 cap. 2) and the dropped material is reflected in `scope.out_of_scope` where the issue supports it.
- **`acceptance_criteria`.** Each item is a testable statement derived from claims. Where criteria are inferred rather than stated, they are `INFERRED` with premise pointers (typically). Rule 5 requires ≥ 1 item unless all four classification fields are `Unknown`; the generator is trained on both patterns.
- **`scope`.** `out_of_scope` may be empty; the generator is not required to invent exclusions.
- **Consistency with structured fields.** The planner conditions on the classification/extraction proposals, and H3 cross-checks (e.g., every entity named in prose that is a tracked category should appear in the corresponding list). Conflicts trigger repair, not silent divergence.
- **Decoding constraints.** Structure-constrained decoding from the JSON Schema (lengths, required fields), plus entity-copy constraints so component/technology names in prose are copied from pointed spans rather than invented.

### 9.3 What the generator must never do (from Phase 1 §9)

Assert an unstated fact as stated; invent a component/technology/area; present a guess without a premise trail; resolve a genuine contradiction silently (Phase 3 Q-CONTRA). The verifier checks these; a failed sentence is dropped or the claim is downgraded (Section 10.5).

---

## 10. Validation Architecture

Validation is a **separate, deterministic, mostly non-learned layer** so its guarantees don't depend on model behavior. It has five parts.

### 10.1 H1: Structural validity (before and during decoding)
Decoding is constrained by a grammar derived from `task-schema.v2.json` (required sections, enum closure, `additionalProperties: false`, string bounds, `schema_version` pattern). Enum heads cannot emit unregistered `task_type` values (Phase 2 T15). The schema governs structure; H3 handles what JSON Schema can't express.

### 10.2 H2: Grounding verification (model-adjacent, evidence-facing)
1. **Pointer resolution.** Every evidence pointer maps to a real segment and valid offsets.
2. **Source-ceiling check.** Claimed `source` ≤ ceiling implied by the pointed segment types (table in 2.A). Excess is downgraded and logged.
3. **`EXPLICIT` textual check.** The rendered evidence must correspond to text actually present in the pointed span (support test, not string-identity, to allow paraphrase).
4. **`INFERRED` premise check.** ≥ 1 valid premise pointer; the conclusion must not be stated as *present in text*.
5. **Claim-support check** for generated prose (Section 9.2).
6. **Unsupported-entity check.** Any component/technology/area with no supporting pointer is dropped from the record (Phase 1 §9 failure 5).

### 10.3 H3: Rule engine (Phase 2 Rules 1–12)

| Rule | Check | Owner |
|---|---|---|
| 1 Provenance completeness | Every tracked field has an entry | H3 |
| 2 UNKNOWN ⇒ null evidence/confidence | | H3 (and emission code path) |
| 3 Non-UNKNOWN ⇒ non-empty evidence + confidence | | H3 + H2 |
| 4 EXPLICIT calibration | Statistical, evaluated offline over samples; a per-record low value is a review/flag signal only | Evaluation harness (offline), G |
| 5 Acceptance-criteria minimum | | H3 |
| 6 Uncertainty/provenance consistency | Satisfied by *construction* (H4 derives rollups), verified here | H3 |
| 7 Experience/complexity evidence not identical | | H3, plus 8.3 decoupling |
| 8 Components/systems disjoint | Prevented at decode (D), verified here | D + H3 |
| 9 Dependency ref resolution | Candidates restricted at decode; verified here | D + H3 |
| 10 `overall_confidence` recompute (±0.01) | | H4 computes, H3 verifies |
| 11 `review_required` derived; reasons non-empty iff true | | H4 computes, H3 verifies |
| 12 `schema_version` | Emit current 2.x; reject other majors | H1 |

### 10.4 H4: Derived fields (computed, never modeled)
- `uncertainty.explicit_information` ← provenance entries with `EXPLICIT`; `inferred_information` ← `INFERRED`.
- `uncertainty.uncertain_information` ← non-`UNKNOWN` fields with confidence < **0.6** (Phase 2 default) ∪ G's ambiguity flags (with `note`).
- `confidence.overall_confidence` ← `weighted_mean_v1` (weight 2 for required `task` fields, else 1; known fields only; 0.0 if none known).
- `review.review_required` / `review_reasons` ← Phase 2 §4 triggers 1–6.

### 10.5 H5: Degradation lattice (never emit a malformed record)

```text
Level 0  Valid as produced                        → emit
Level 1  Repair: local, evidence-preserving fixes → re-validate
         (e.g., drop unsupported list item, re-render evidence, dedupe components/systems overlap
          by dropping the lower-confidence occurrence, downgrade over-claimed source type)
Level 2  Downgrade field: set to UNKNOWN          → null evidence/confidence, add missing_information
Level 3  Regenerate prose under stricter constraint (claim-plan limited to verified claims)
Level 4  Abstain record: all four classifications UNKNOWN, empty acceptance_criteria (Phase 2 Example-3 pattern), review_required = true
Level 5  RejectedResult (reason codes only)       → when even Level 4 can't be made valid
```

Design notes:
- **Why `UNKNOWN` is a safe landing.** Rules 2–3 make `UNKNOWN` valid without evidence.
- **Rule 5 caveat.** Downgrading only *some* classifications to `UNKNOWN` does not license an empty `acceptance_criteria`. If criteria generation cannot be salvaged while classifications remain known, the lattice must either regenerate (Level 3) or drop to Level 4. The lattice is written to respect this coupling rather than emitting an invalid record.
- **Downgrades are logged** in `InferenceTrace` and counted as a quality metric (a system that constantly downgrades is telling you the heads are miscalibrated).
- **Success criterion.** 100% of emitted `TaskUnderstandingRecord`s validate (Phase 1 §8 criterion 6); `RejectedResult` rate is monitored separately.

---

## 11. Scaling Path

### 11.1 Principle: additive, not a rewrite (Phase 1 §13)

Each tier adds (a) segment types, (b) a Context Manager gate, (c) a retriever source, (d) provenance ceilings, (e) training examples at that `context_tier` (Phase 3/7), and (f) an evaluation gate. Heads, pointers, validator, calibrator, and record schema are reused.

### 11.2 Tier-by-tier plan

| Stage | Adds | Architectural change | Gate to advance (evaluated on Test/Hard-case at that tier; thresholds empirical) |
|---|---|---|---|
| **Tier 1: Issue (+ comments)** *(current)* | none | Baseline: everything in Sections 1–10 | Meets Phase 1 §8 criteria 1–6 (accuracy, calibration, attribution, abstention, exp ⊥ complexity, output validity) |
| **Tier 2: + Repository structure/README/metadata** | `REPO_META`, `README`, `FILE_TREE` segments; light retriever | Activate A3 (light) + A4; component/system grounding upgraded but still text-adjacent | Measurable gain on `components/systems/technologies`, **no loss** of calibration; retrieval quality measured independently |
| **Tier 3: + Relevant code** | `CODE`, `CONFIG` segments; code-aware retrieval | Retriever gains code chunking/ranking; new provenance value for verified-against-code (Section 11.3); complexity/affected_areas may cite code | Improvement on `components` precision and `complexity` calibration; leakage tests pass |
| **Tier 4–5: + Docs + dependencies** | `DOC`, `DEP_GRAPH` segments | Retriever sources extended; dependency head gains graph-backed candidates | Improvement on `technical_areas`, `expected_outcome`, `dependencies`; no leakage |
| **Tier 6: + PRs, commits, history** | `PR`, `COMMIT` precedent segments | Retriever with **strict A4**: never the resolving PR/commit; precedent-based calibration of complexity/experience | Uplift is real *without* leakage: Phase 7 leakage tests L1–L7 plus tier-ablation confirm gain comes from precedent, not answers |
| **Tier 7: + Project conventions** | `PROJECT_CONVENTION` segments | Per-project conditioning (context, not per-project retraining) | Org-specific tuning improves classification without overfitting; repo-level generalization retained |

**Advance rule:** a tier is activated only when (1) its training data exists at that `context_tier` in Phase 7 datasets, (2) the tier-ablation eval shows uplift, (3) calibration does not degrade, (4) leakage tests pass, and (5) the lower-tier behavior is unchanged when the ceiling is lowered (backward-consistency check).

### 11.3 Schema evolution implications (Phase 2 §5)
- Grounding strength gain (e.g., verified-against-code) is a **MINOR** change: a new value in the `provenance.*.source` enum, or richer evidence under existing values. `components` keeps its path and type.
- Later capabilities (subtask decomposition, dependency mapping beyond issue-level, impact analysis, implementation context) attach as **new top-level record sections** in a future MAJOR version, each with its own head/component. They must not overload `dependencies` (Phase 2 §5).
- Adding a `task_type` value: registry MINOR bump plus head extension/retraining. Not free-text.

### 11.4 Scaling the model itself (conceptual)
- Capacity scaling (encoder/decoder size, retrieval index size) is decoupled from tier scaling. Neither is a precondition of the other.
- Scaling levers in order of preference: (1) better/more GOLD data and contrast pairs, (2) better calibration, (3) larger encoder, (4) larger generator. Because generation is the hardest-to-ground capability, generator scaling must be justified by measured claim-support failures, not by fluency.
- Multilingual coverage grows only as annotator coverage grows (Phase 3 §8.2).

### 11.5 Explicit non-goals for the current stage
No repository reasoning, code understanding, cross-issue reasoning, subtask/impact/implementation generation, code generation, assignment/routing, or autonomous action (Phase 1 §7). Defining tier interfaces now is **not** implementing them.

---

## 12. Phase-8 Decision Record

| # | Decision | Rationale |
|---|---|---|
| 1 | One **shared encoder** feeding specialized heads, rather than separate per-field models or one monolithic head | All fields depend on the same comprehension of the issue; sharing yields cross-field consistency. Separate heads let each field have its own label semantics, evidence, and calibration, and make experience ⊥ complexity enforceable (Phase 1 §15) |
| 2 | Evidence is produced as **span pointers over typed segments**, rendered into `evidence` afterward | Structural implementation of "never generate evidence that doesn't exist in the input" (Phase 1 §11); makes every claim auditable to a segment ID |
| 3 | **Source ceiling** by segment type bounds the provenance a field may claim | Encodes Phase 3 §2 (labels never `EXPLICIT`; comments at most `SUPPORTED_BY_CONTEXT` etc.) as a checkable rule rather than a hope about model behavior |
| 4 | `Unknown` is a class in every head and the universal safe fallback in the degradation lattice | Phase 1 §10 first-class abstention; also guarantees a schema-valid landing (Rules 2–3) |
| 5 | **Deterministic derivation** of `uncertainty` rollups, `overall_confidence`, and `review_required`; neural components only propose per-field inputs | Preserves Phase 2 §9's decision that meta-claims are computed, not authored; removes a whole class of model-authored inconsistency |
| 6 | **Plan-then-realize** generation with claim-level verification | Grounded task generation is the hardest capability (Phase 3 cap. 13); an intermediate claim plan gives something checkable |
| 7 | Experience and complexity get **separate query sets, pooling, and decoupling pressure**, plus length as a controlled nuisance variable | Phase 1's named failure (collapsing size and experience) and Phase 2 Rule 7 are treated as architectural requirements, not prompt instructions |
| 8 | **Calibration conditioned on field × source type**, fit on Validation only | Phase 1 §8/§10: confidence must track source type and be calibrated; using Test for calibration would invalidate its one-shot status (Phase 7 §6.3) |
| 9 | Context integrated exclusively as **typed, ID'd, tier-tagged segments**; retriever and Leakage Guard specified now but **not activated** beyond Tier 1–2 | Scaling by addition; avoids premature deep repository reasoning (master prompt) while preventing an interface rework later; keeps "model doesn't understand" separable from "model lacked data" (Phase 1 §14) |
| 10 | **Leakage Guard is mandatory** on every retrieval at Tier ≥ 2, including a hard rule against resolving PRs/commits | Phase 3 CP-4 names this the highest-leverage leakage vector; resolving PRs restate role/type/area outright |
| 11 | Validation is a separate deterministic layer with a **degradation lattice**; unrecoverable cases return `RejectedResult`, never a malformed record | Phase 1 §8 criterion 6 (output validity is a hard requirement); acknowledges Rule 5 coupling so the fallback never itself violates a rule |
| 12 | `InferenceTrace` kept separate from the record and from both provenance layers | Avoids a third conflation alongside Phase 3 §0's field-level vs. data provenance; supports audit without changing the consumer-facing schema |
| 13 | Training consumes Phase 7 datasets with **tier-conditioned inputs, metadata dropout, quality-tier weighting**; Adversarial/Hard-case/Regression are evaluation-only | Respects Phase 7's mutual-exclusivity rule; targets the specific shortcuts (labels, length, keywords) that would make this a keyword classifier |
| 14 | Scaling is gated per tier by data availability, ablation uplift, calibration stability, leakage tests, and backward consistency | Prevents a higher tier from being switched on because it *can* be, rather than because it measurably helps without eroding honesty |
| 15 | No parameter counts, framework choices, loss formulations, serving/API design, or deployment topology | Conceptual architecture phase; also honors Phase 1 §14's exclusion of application-layer concerns |

### Open items (deliberately deferred, not forgotten)
- **Thresholds** (abstention operating points, agreement minimums, gate values) are empirical, to be set on Validation once a baseline exists.
- **Pointer supervision coverage.** Depends on how cleanly Phase 6 annotator evidence aligns to source spans; a data-prep task with a fallback (value-only supervision) if alignment is poor.
- **Generator/verifier choice** (learned verifier vs. entailment model vs. hybrid) is an implementation decision within the contract in Sections 9–10.
- **Non-English coverage** is bounded by annotator coverage (Phase 3 §8.2).
