# Phase 9 — Base Model / Pretraining
## Specialized AI Software Engineering Model: Base Representation for ITU-1

Source of truth: Phase 1 (model definition, grounding/traceability policy, out-of-scope boundaries), Phase 3 (data source matrix, inclusion/exclusion/quality/privacy rules, contamination prevention), Phase 7 (`DatasetRecord`, split methodology, leakage tests), Phase 8 (`task-schema.v2.json`-conformant architecture — in particular Component **B: Shared Representation**, and Component **A**'s segment/offset contract). This document does not redefine any of them. It defines what happens **before** Phase 8's components exist as trained artifacts: the base language/engineering representation that Component B is instantiated from.

**Scope boundary.** This phase produces a **general-purpose engineering-domain representation** — a base model, adapted or pretrained, that understands programming concepts, code, and technical language. It does **not**:
- Train any of Phase 8's heads (C–F), pointer mechanism (E), calibrator (G), or validator (H).
- Consume Phase 7 `DatasetRecord`s or Phase 2 schema labels as training targets.
- Optimize for issue classification, task generation, or any Phase 2 field.
- Fix parameter counts, a specific framework, or a deployment topology (same exclusion as Phase 8 Decision #15 and Phase 1 §14).

Where the master prompt asks for schedules, resources, or checkpoint policy, this document gives **decision criteria and gates**, not fixed numbers — consistent with this project's stance throughout (Phase 7 §6, Phase 8 §11.1) that thresholds are empirical and set once real data/compute exist, not asserted in advance.

**Relationship to Phase 8.** Phase 8 Component B requires a representation that is "engineering-terminology aware... pretrained on both natural language and code/technical text" and "segment- and tier-aware" (Phase 8 §2.B). Phase 9 is the phase that produces that representation. Its output is a single artifact — the **adapted base checkpoint** — that a later, not-yet-authorized phase attaches Phase 8's heads to and trains against Phase 7 data. Nothing downstream of "checkpoint → heads" is in scope here.

---

## 0. Build-vs-Adopt: The Central Decision

Before anything else, Phase 9 must decide whether the base representation is trained from scratch or adapted from an existing pretrained model. This decision gates every other section, so it is made first and explicitly.

### 0.1 Options considered

| Option | Description |
|---|---|
| **From scratch** | Pretrain a model on the Section 3 corpus with no prior initialization. |
| **Adopt + continued pretraining (chosen)** | Start from an existing pretrained base model with general NL and code competence, then run domain-adaptive continued pretraining (CPT) on the Section 3 corpus. |
| **Adopt, frozen** | Use an existing pretrained model as-is, with no domain adaptation, and rely entirely on later task-specific fine-tuning. |

### 0.2 Decision

**Adopt + continued pretraining.** Rationale:

1. **General code/NL competence is not this project's differentiator.** Phase 1's core value proposition (§1–2) is honest, evidence-grounded *task understanding* — not general code fluency, which large existing pretrained models already have at a level a from-scratch run on this project's achievable corpus size could not match.
2. **Phase 8's specific requirements are additive, not foundational.** Segment/tier embeddings, evidence-pointer heads, and calibration (Phase 8 §2.B, §2.E, §2.G) are architectural additions on top of a competent encoder — they do not require the base representation itself to be trained from zero.
3. **From-scratch pretraining reintroduces exactly the risk Phase 1 §13/§14 was written to avoid**: conflating "does the model understand engineering text" with "did we have enough compute/data to train a model at all." Adoption separates those concerns.
4. **Frozen adoption is rejected** because Phase 8's segment-type/tier embeddings and the domain vocabulary gaps identified in Section 2 have no path into a frozen model; some continued pretraining is required for the representation properties Phase 8 assumes (§2.B: "race condition," "N+1 query," "hydration mismatch" as concepts, not rare tokens).

This mirrors Phase 8 Decision #9's principle (scale by addition; avoid premature deep work not yet justified by data) applied one layer down, to the base representation itself.

---

## 1. Base-Model Strategy

### 1.1 Base model requirements

Properties required of any candidate base model, independent of vendor or architecture family:

| Requirement | Rationale |
|---|---|
| Joint pretraining exposure to natural language **and** source code/technical text | Phase 8 §2.B: engineering terms must be concepts, not rare tokens |
| Multilingual pretraining coverage | Phase 1 §4, Phase 3 §8.2: non-English issues are in scope, bounded by annotator coverage |
| Sufficient context length to hold an unsegmented issue + comment thread without truncating the body | Phase 8 §2.B: "Tier 1 inputs must fit without truncating the body" |
| Exposes token-level hidden states (not only a final pooled output) | Phase 8's pointer heads (§2.E) attend over token/segment states, not a single vector |
| Supports insertion of new learned embeddings (segment-type, tier) without full retraining | Phase 8 §2.B segment/tier embeddings; Phase 8 §11.1 additive scaling |
| Tokenizer (or a replaceable tokenizer) that preserves lossless offsets back to raw source text | Phase 1 §11/§12 grounding and traceability requirements — see Section 2 |
| Weights and license available for continued pretraining and downstream fine-tuning under this project's intended use | Section 1.6 |
| Reasonable inference cost at the context lengths Section 1.1 requires | Practical constraint; not a Phase 1 requirement but a project-viability one |

Deliberately **not** required at this stage: a specific parameter count, a specific architecture family (encoder-only, decoder-only, encoder-decoder), or a specific training framework. Phase 8 Decision #15 excludes these from the architecture document, and Phase 9 preserves that exclusion — the requirements above are satisfiable by more than one architecture family, and locking one in now would be a premature commitment the project has consistently avoided (Phase 7 §6, Phase 8 §11.5).

### 1.2 Selection criteria (scorecard)

Candidates are evaluated on, in order of weight:

1. **Grounding compatibility** — can the tokenizer/offset contract in Section 2 be satisfied without lossy normalization? This is a **hard gate**, not a scored criterion: a candidate that fails it is disqualified regardless of other strengths, because it would break Phase 1 §11's evidence-pointer requirement structurally.
2. **Demonstrated code+NL joint competence** — measured on public code-and-technical-text benchmarks as a prior, then re-verified on Section 8's own probes after adaptation.
3. **License compatibility** — Section 1.6.
4. **Context length** at the Tier-1 budget the Context Manager (Phase 8 §2.A2) will need.
5. **Adaptability** — evidence that continued pretraining and embedding-table extension are supported/documented for the candidate family, not just zero-shot use.
6. **Multilingual coverage**, weighted by the language distribution Phase 3 §8.2 expects in the annotated data.
7. **Total cost of adaptation** (compute + engineering effort) relative to the alternatives.

### 1.3 Compatibility requirements

The chosen base model must expose, or be modifiable to expose, everything Phase 8 Component B promises downstream:
- Token states `H` and a pooled sequence state (Phase 8 §1.1, item B).
- A place to add segment-type and tier embeddings without disturbing pretrained positional/token embeddings (Phase 8 §2.B).
- Enough architectural transparency (open weights, documented tokenizer) to build the offset-preserving pipeline in Section 2 — a fully opaque API-only model is disqualified by the Section 1.2 hard gate, since Phase 9/Phase 8 need to attach new embedding tables and run continued pretraining, not just call an inference endpoint.

### 1.4 Licensing constraints

- The base model's weight license must permit **continued pretraining** and **downstream fine-tuning**, and must not restrict the resulting representation to non-commercial or research-only use, since Phase 1 §3 names engineering-organization users as consumers.
- Where the base model's own pretraining corpus provenance is undocumented, that is treated as a **risk factor** in the Section 1.2 scorecard, not silently accepted — the project inherits whatever provenance gaps the base model has, and this must be recorded, not assumed away.
- This document states requirements, not legal conclusions; a license compatibility review by qualified counsel is a precondition of adoption, not a step this phase substitutes for.
- Corpus-level licensing constraints (for the continued-pretraining corpus Phase 9 itself assembles) are separate and covered in Section 4.4.

### 1.5 Adaptation strategy

Continued (domain-adaptive) pretraining, staged (Section 6), rather than a single monolithic run:
1. Extend or verify the tokenizer against the domain corpus (Section 2) before any weight updates, so vocabulary gaps are caught before compute is spent.
2. Run continued pretraining on the Section 4 corpus using an objective consistent with the base model's native pretraining objective (Section 5) — changing objective family mid-adaptation is avoided as it risks destabilizing the pretrained representation.
3. Introduce segment-type/tier embeddings and warm them up on synthetically segmented data that mirrors Phase 8's segment taxonomy (`ISSUE_TITLE`, `ISSUE_BODY`, `COMMENT`, `LABEL`, ...), so those embedding tables are not cold-started only when Phase 8's task-specific training begins.
4. Validate at each stage boundary (Section 8) before proceeding — the same additive, gated discipline Phase 8 §11 applies to context tiers.

### 1.6 Fine-tuning path (what comes after Phase 9)

Phase 9's deliverable is one artifact: an **adapted base checkpoint** plus its tokenizer and a manifest (Section 7). The path forward, explicitly **not** executed in this phase:

```
Phase 9 output: adapted base checkpoint (general engineering representation)
        │
        ▼
[not authorized yet] Attach Phase 8 heads (C: classification, D: extraction,
   E: evidence/provenance, F: task generation) to the checkpoint
        │
        ▼
[not authorized yet] Multi-task supervised training on Phase 7 DatasetRecords
   (Phase 8 §5: supervision map, metadata dropout, length decorrelation,
   abstention supervision, post-hoc calibration)
        │
        ▼
[not authorized yet] Phase 8 validation lattice, Phase 1 §8 acceptance criteria
```

This keeps the "model doesn't understand the domain" failure mode (fixed here) structurally separable from "model wasn't trained on the task" (fixed in the next, unauthorized phase) — the same separation Phase 8 Decision #9 draws between representation and context-tier scaling.

---

## 2. Tokenization Requirements

Tokenization is treated as load-bearing infrastructure, not an implementation detail, because Phase 1 §11–12 requires every non-`UNKNOWN` field to carry an evidence pointer, and Phase 8 §2.E implements that as **span pointers over typed segments with character offsets** — a pointer is meaningless if the tokenizer cannot be mapped back to exact source-text offsets.

| Requirement | Detail |
|---|---|
| **Lossless offset mapping** | Every token must be traceable to an exact `(start, end)` character span in the untouched source text. This is a **hard requirement**, inherited directly from Phase 8 §2.A1 ("preserve raw text... [must not] rewrite or drop text such that an evidence pointer can no longer resolve to original wording"). |
| **Joint code+NL vocabulary** | Subword vocabulary must represent identifiers (including `camelCase`/`snake_case` sub-tokens), punctuation-dense code syntax, stack traces, and log-line formats without excessive fragmentation. |
| **No destructive normalization** | No lowercasing, no whitespace collapsing, no quote/encoding normalization that isn't reversible — this is a training-time mirror of Phase 8 §2.A1's inference-time non-destructive convention, so a token learned in pretraining behaves the same way the inference-time segmenter expects. |
| **Multilingual coverage** | Must not degrade to byte-fallback for the non-English languages Phase 3 §8.2 expects in the annotated data; byte-fallback for genuinely rare scripts is acceptable as a bounded, known limitation (Phase 8 §2.B already documents this limit for the representation generally). |
| **Whitespace/indentation sensitivity** | Must preserve significant whitespace faithfully for indentation-sensitive languages, since Tier 3+ (Phase 8 §11.2) will eventually feed real source code through the same tokenizer. |
| **Stability under vocabulary extension** | If domain terms require new tokens (Section 4), the extension mechanism must not silently break offset mapping for previously-tokenizable text. |

**Validation gate:** before any continued-pretraining compute is spent, the tokenizer is round-trip tested — tokenize then reconstruct — against a held-out sample of Phase 4-style collected issue text and Section 4 code/doc samples. Any reconstruction mismatch is a blocking failure (Section 10), because it silently breaks Phase 1's grounding guarantee three phases downstream, at a point where it would be far more expensive to trace back to its source.

---

## 3. Pretraining Strategy

### 3.1 What "pretraining" means at this phase

Continued, self-supervised domain-adaptive pretraining (CPT) on the corpus in Section 4 — not supervised training against any label set. No Phase 2 field, Phase 6 annotation, or Phase 7 `ground_truth` is touched here; those are reserved for the not-yet-authorized fine-tuning phase (Section 1.6).

### 3.2 Objective

The core objective is kept **consistent with the chosen base model's native pretraining objective** (e.g., causal next-token prediction, or span/denoising reconstruction, depending on the architecture family selected in Section 1) rather than introducing a new objective family mid-adaptation, which risks destabilizing pretrained capability the project is relying on (Section 0.2, point 1).

On top of that core objective, two **auxiliary objectives** are defined because they de-risk specific Phase 8 requirements rather than being generic pretraining hygiene:

| Auxiliary objective | Purpose | Phase 8 link |
|---|---|---|
| **Segment-type/tier embedding warm-up** | Train the representation to condition on synthetic segment-type/tier tags (title vs. body vs. comment vs. label vs. README-like text) so these embeddings carry signal before any task-specific gradient touches them | Phase 8 §2.B "segment- and tier-aware"; §1.1 relies on this distinction reaching every head |
| **NL–code alignment (contrastive)** | Encourage representations of a natural-language description and the code/technical text it refers to to be close in representation space, without ever training on issue→answer pairs | Phase 8 §2.D/§2.F eventually need technical entities and generated claims to be grounded in the same representation space as the source text they cite |

Both auxiliary objectives are self-supervised or use only synthetically constructed pairs (e.g., docstring↔function, README section↔code file) — never Phase 6/7 annotated data, preserving the Section 0/Scope boundary.

### 3.3 What this stage explicitly does not train

- No classification head for role/experience/complexity/task_type.
- No evidence-pointer supervision against annotator-marked spans.
- No claim-plan or realization decoder for `title`/`summary`/`objective`/etc.
- No calibration. Calibration (Phase 8 §2.G) is fit later, on Validation only, and requires a trained classifier to calibrate — it has no meaning yet.

---

## 4. Corpus Specification

### 4.1 Domain corpus requirements, mapped to the master prompt's understanding list

| Understanding target (master prompt) | Corpus source type |
|---|---|
| Programming concepts, code | Permissively licensed source code across the language distribution Phase 3 expects issues to reference |
| Software engineering terminology | Technical Q&A/forum text, engineering blog posts, changelogs, commit messages (not tied to any specific resolving PR — see 4.3) |
| Technical documentation | READMEs, API reference docs, framework/library documentation |
| APIs, frameworks | Framework documentation, API specs, SDK reference material |
| Architecture | Architecture decision records, design docs, technical wikis (public, appropriately licensed) |
| Databases | Database documentation, migration guides, query-language reference text |
| Authentication, networking | Security/networking documentation and technical explainer text |
| Testing, debugging | Test framework documentation, debugging guides, stack-trace-bearing technical text |
| Refactoring, performance, security, maintenance | Technical articles and documentation specifically covering these as engineering practices, not just incidental mentions |

This list is a **composition target for corpus assembly**, not a training curriculum with fixed labels — the pretraining objective (Section 3.2) remains self-supervised throughout; this table only ensures the corpus has enough surface area in each area for the representation to acquire the concepts Phase 8 assumes.

### 4.2 Corpus categories

1. **General code corpus** — broad, permissively licensed source code, multiple languages, weighted toward the languages Phase 3's data source matrix identifies as most represented in the issue population.
2. **Technical natural-language corpus** — documentation, technical Q&A, engineering writing, commit messages and PR *discussion text* stripped of any issue-resolving specificity (see 4.3).
3. **Structural/paired corpus** — docstring↔function, README-section↔file, doc↔API-signature pairs, used for the alignment auxiliary objective (Section 3.2).
4. **Multilingual technical text** — bounded by the same annotator-coverage constraint Phase 3 §8.2 already applies to the labeled data; this phase does not attempt broader multilingual coverage than the eventual annotated data can support, since an imbalance there would let the base representation "know" languages the task-specific layer can never evaluate.

### 4.3 Contamination boundary (extends Phase 3 §9 / Phase 7 §4 backward to this phase)

Phase 7 §2.1 assigns splits at the **repository** level, and Phase 3 CP-4/Phase 8 §2.A4 treat resolving PRs/commits as the highest-leverage leakage vector. Phase 9's corpus is upstream of all of that, so the same discipline applies here, earlier and more conservatively:

- **No repository assigned to Phase 7's Validation, Test, Hard-case, Adversarial, or Regression splits may contribute any text to the Phase 9 pretraining corpus.** This is checked against Phase 7's split manifest, not re-derived — Phase 9 consumes that manifest as an exclusion list, it does not make its own leakage judgment calls.
- Repos assigned to Phase 7 Training are permitted in the pretraining corpus in their **non-issue** form (source code, docs, general commit history) but never as issue text, since issue text is exactly what Phase 6 annotators later see and label — the representation should understand the *domain*, not have memorized the *specific issues* it will eventually be asked to classify.
- This exclusion is re-verified as a validation gate (Section 8), not assumed correct once applied, because corpus assembly and dataset-split assignment (Phase 7) may not always run in the same order across project iterations.

### 4.4 Licensing constraints on the corpus

- Every corpus source is tracked with a license tag at ingestion; sources with licenses incompatible with the base-model license chosen in Section 1.6, or with terms restricting derivative-model training, are excluded rather than adjudicated ad hoc during training.
- This mirrors Phase 3 §10's privacy/security posture applied to licensing: excluded-by-default for ambiguous cases, not included-until-challenged.
- As in Section 1.6, this document states the requirement; a licensing/legal review of the assembled manifest is a precondition of running any pretraining stage, not something this phase self-certifies.

---

## 5. Checkpoint Strategy

Model-artifact traceability is treated as an extension of Phase 1 §12's traceability principle — applied to weights, not just data.

- **Checkpoint identity record**, analogous in spirit to `task_identity` in the Phase 2 schema: `checkpoint_id`, `created_at`, `base_model_source` (name + version + license), `tokenizer_version`, `stage` (Section 6), `corpus_manifest_hash` (ties the checkpoint to the exact corpus snapshot, including the Section 4.3 exclusion list applied at that point), and `objective_config` (which of Section 3.2's objectives were active).
- **Retention policy:** keep the most recent checkpoint per stage plus the best-validation checkpoint per stage (Section 8); earlier intermediate checkpoints within a stage are disposable once the stage gate is passed.
- **Stage gating:** a checkpoint is only promoted to the next stage (Section 6) after passing that stage's Section 8 validation gate — mirrors Phase 8 §11.4's "advance rule" for context tiers.
- **Rollback:** any Section 10 failure during a stage rolls back to the last checkpoint that passed its gate, not to stage zero, unless the failure is traced to a corpus or tokenizer defect present from the start.
- **Corruption/format checks** run on every checkpoint write, independent of validation-metric checks, since a metrically-fine but structurally corrupted checkpoint is a distinct failure mode.

---

## 6. Training Schedule

Staged, additive, gated — the same discipline Phase 8 §11 uses for context tiers, applied to pretraining stages. No absolute step counts, learning-rate values, or compute budgets are fixed here; each stage's duration is determined empirically against its own gate (Section 8), consistent with this project's consistent refusal to assert thresholds before data exists (Phase 7 §6.3, Phase 8 "Open items").

| Stage | Content | Gate to advance |
|---|---|---|
| **Stage 0 — Tokenizer validation** | Extend/verify tokenizer (Section 2) against a corpus sample; no weight updates | Zero offset-reconstruction failures on the round-trip test (Section 2); domain-term fragmentation rate within an acceptable band |
| **Stage 1 — Broad continued pretraining** | Core self-supervised objective (Section 3.2) over the full Section 4 corpus mix | General NL and code held-out loss does not regress versus the unadapted base model (catastrophic-forgetting check, Section 8) |
| **Stage 2 — Domain-narrowing pretraining** | Same core objective, corpus mix reweighted toward the Section 4.1 domain-specific categories | Measurable improvement on the domain probes (Section 8) without regressing Stage 1's general-capability floor |
| **Stage 3 — Segment/tier and alignment warm-up** | Auxiliary objectives (Section 3.2) activated on synthetic segmented/paired data | Segment/tier embeddings are distinguishable (not degenerate — Section 10) and NL–code alignment probe shows separation between matched and mismatched pairs |

Each stage is a **precondition**, not a fallback: a later stage is not started to compensate for an earlier stage's gate failing. If a gate fails, the response is Section 10's failure-detection protocol, not silently proceeding.

---

## 7. Validation Strategy

Validation at this phase measures **representation quality**, not task accuracy — Phase 2/Phase 7 labels are out of scope (Section 0). Three validation families:

### 7.1 General-capability regression (catastrophic forgetting)
Held-out perplexity/loss on general NL and general code, measured against the unadapted base model, at every stage boundary. A representation that gets better at engineering text by getting worse at general language would undermine the multilingual and general-comprehension properties Phase 8 §2.B assumes are still present underneath the domain adaptation.

### 7.2 Domain representation probes
Lightweight, non-task-specific probes — nearest-neighbor and embedding-similarity checks confirming that engineering terms named in Section 4.1 (e.g., "race condition," "N+1 query," "hydration mismatch," per Phase 8 §2.B's own examples) cluster as concepts rather than behaving as unrelated rare tokens. These are diagnostic probes built for this phase, not the Phase 1 §8 acceptance criteria — those require a trained classifier and belong to the not-yet-authorized fine-tuning phase.

### 7.3 Architecture-readiness checks
- Segment/tier embedding non-degeneracy (Section 6, Stage 3 gate).
- NL–code alignment separation (Section 6, Stage 3 gate).
- Tokenizer offset-integrity re-check (Section 2) on a larger, held-out sample than Stage 0 used, since corpus composition shifts across stages.

### 7.4 Contamination re-audit
Before the checkpoint is considered final, the corpus manifest (Section 5) is re-diffed against the current Phase 7 split manifest, to catch any drift between when the corpus was assembled and when Phase 7's splits were most recently finalized (Section 4.3).

**Explicit non-goal:** no comparison to Phase 1 §8 criteria 1–6 (classification accuracy, calibration, source attribution, abstention, experience⊥complexity, output validity) happens in this phase — every one of those requires trained heads and labels this phase does not have.

---

## 8. Resource Requirements

Given as **cost drivers and decision criteria**, not fixed figures — consistent with Phase 8 Decision #15's exclusion of resource/parameter specifics from the architecture layer, applied here to the pretraining layer.

| Category | Driver | Decision rule |
|---|---|---|
| **Compute** | Base-model size class chosen in Section 1, corpus volume (Section 4), number of stages (Section 6) | Compute is sized to the minimum sufficient to clear every Section 7 gate, not to a pre-set target — an unmet gate is a reason to add a stage or corpus, not to lower the gate |
| **Storage** | Raw corpus, deduplicated corpus, tokenized corpus, and the checkpoint set (Section 5's retention policy) | Retention policy bounds storage growth; disposable intermediate checkpoints are not retained past their stage gate |
| **Corpus acquisition and licensing review** | Section 4 source diversity and Section 4.4's licensing discipline | Licensing review is a precondition per source, not a batch review after ingestion — this bounds risk but adds fixed per-source effort |
| **Tokenizer engineering** | Section 2's offset-preservation requirement, which is stricter than a typical pretraining tokenizer | Treated as a blocking-priority effort item (Stage 0), since a failure here invalidates downstream grounding regardless of how much compute follows |
| **Evaluation/probing infrastructure** | Section 7's probe suite | Reuses Phase 4–7 data tooling where the corpus and probe data overlap in format, rather than building a parallel pipeline |

Resourcing decisions are revisited at each Section 6 stage gate, not committed to up front for all four stages at once — the same incremental-commitment posture Phase 8 §11.4 applies to tier activation.

---

## 9. Failure Detection

| Failure mode | Signal | Response |
|---|---|---|
| Loss divergence / NaN | Training loss instability at any stage | Roll back to last gated checkpoint (Section 5); do not resume forward without diagnosing corpus/objective cause |
| Catastrophic forgetting | Section 7.1 regression versus unadapted base | Halt stage; rebalance corpus mix or reduce adaptation aggressiveness before resuming |
| Representation collapse | Domain probes (Section 7.2) show embeddings failing to separate distinct concepts | Halt stage; treated as a modeling failure, not a data-volume problem, unless corpus coverage for the collapsed concept is also found to be thin |
| Tokenizer offset failure | Any round-trip mismatch (Section 2) | **Hard blocker.** No pretraining compute is spent past Stage 0 until resolved — this failure mode silently breaks Phase 1 §11 three phases downstream if missed |
| Segment/tier embedding degeneracy | Stage 3 gate (Section 6/7.3) not met | Extend Stage 3's synthetic segmented data or revisit embedding-table initialization; does not block Stages 1–2's artifacts, only Stage 3 promotion |
| Corpus contamination | Section 7.4 re-audit finds excluded-repo text present | **Hard blocker.** Affected corpus shard is removed and the stage it touched is re-run from the last clean checkpoint, not patched forward |
| License violation | Section 4.4/1.6 review finds an incompatible source post-ingestion | Source removed from manifest; any checkpoint trained on it is not promoted, regardless of validation performance |
| Checkpoint corruption | Section 5 integrity check fails | Discard; regenerate from the preceding valid checkpoint |

Failures are logged against the checkpoint identity record (Section 5) so that, consistent with Phase 1 §12's traceability principle, it remains possible to answer "why does this checkpoint behave this way" down to the stage and corpus shard — the same audit standard Phase 8 §12 (Decision #12, `InferenceTrace`) sets for inference-time behavior, applied here to training-time behavior.

---

## 10. Decision Criteria (consolidated)

1. **Adopt vs. build from scratch** → Adopt (Section 0.2), re-opened only if no candidate clears the Section 1.2 hard gate (grounding/tokenizer compatibility).
2. **Base model selection** → Section 1.2 scorecard; grounding compatibility is a hard gate, not a weighted factor.
3. **Stage advancement** → Section 6/7 gates; a stage is never advanced to compensate for an earlier stage's shortfall.
4. **Corpus inclusion** → Section 4.3 (repo-level exclusion against Phase 7's split manifest) and Section 4.4 (license tag required at ingestion); default is exclude-unless-cleared, not include-unless-challenged.
5. **Resourcing** → Section 8; sized to the minimum that clears validation gates, revisited per stage rather than committed up front.
6. **Handoff to task-specific training** → Not triggered by this phase. Section 1.6 defines the path; authorization to attach Phase 8 heads and train against Phase 7 data is a separate decision this document does not make.

---

## 11. Phase-9 Decision Record

| # | Decision | Rationale |
|---|---|---|
| 1 | **Adopt an existing pretrained base model and continued-pretrain**, rather than training from scratch | Section 0.2: this project's differentiator is grounded task understanding, not general code/NL competence; from-scratch pretraining reintroduces the "understanding vs. resourcing" conflation Phase 1 §13–14 was written to avoid |
| 2 | **Grounding/tokenizer compatibility is a hard disqualifying gate** on base-model selection, not a weighted scorecard factor | Phase 1 §11's "never generate evidence that doesn't exist in the input" is structurally implemented in Phase 8 as offset-based span pointers; a tokenizer that cannot preserve exact offsets breaks this three phases downstream if not caught here |
| 3 | Pretraining objective stays **consistent with the base model's native objective family**; only two self-supervised auxiliary objectives (segment/tier warm-up, NL–code alignment) are added | Avoids destabilizing inherited capability; both additions exist specifically to de-risk Phase 8 §2.B/§2.E requirements, not as generic pretraining hygiene |
| 4 | **No Phase 6/7 labeled data, and no issue text from Validation/Test/Hard-case/Adversarial/Regression repos, enters the pretraining corpus** | Extends Phase 3 §9 and Phase 7 §4's contamination discipline backward to the earliest point text enters the system; unit of exclusion is the repository, matching Phase 7 §2.1's split unit |
| 5 | Corpus and license review are **exclude-by-default**, checked per source at ingestion | Mirrors Phase 3 §10's privacy/security posture; avoids ad hoc adjudication once training is already underway |
| 6 | **Staged, gated schedule** (tokenizer → broad CPT → domain-narrowing → segment/alignment warm-up), each stage a precondition for the next | Same additive/gated discipline as Phase 8 §11's tier scaling, applied to pretraining; a later stage never compensates for an earlier one's failed gate |
| 7 | **Checkpoints carry an identity record** (source, tokenizer version, stage, corpus manifest hash, objective config) | Extends Phase 1 §12 traceability from data/output to trained artifacts; supports the same "why did it conclude X" audit standard Phase 8 §12 sets for `InferenceTrace` |
| 8 | Validation in this phase is **representation-quality only** (general-capability regression, domain probes, architecture-readiness, contamination re-audit) — explicitly not Phase 1 §8's acceptance criteria | Those criteria require trained classification/generation heads and labels this phase does not have; conflating the two would let a good pretraining run masquerade as a validated task model |
| 9 | Resource requirements are stated as **cost drivers and per-stage decision rules**, not fixed compute/parameter figures | Preserves Phase 8 Decision #15's exclusion of resource/parameter specifics from documents at this level of the project; thresholds remain empirical (Phase 7 §6.3 precedent) |
| 10 | **Tokenizer offset failure and corpus contamination are hard blockers**; every other failure mode is a stage-local halt-and-diagnose | Reflects that these two failure modes corrupt guarantees (grounding, split integrity) that the rest of the project depends on, versus failure modes that are locally recoverable |
| 11 | This phase **produces one artifact** — an adapted base checkpoint — and explicitly does not attach Phase 8 heads or train on Phase 7 data | Matches the master prompt's instruction not to perform task-specific training yet; keeps "domain understanding" and "task performance" as separately gated concerns, per Phase 8 Decision #9's precedent |

### Open items (deliberately deferred, not forgotten)
- **Base-model candidate shortlist and final selection** against the Section 1.2 scorecard — requires an actual license/compatibility review, not assumed here.
- **Corpus size targets and mix ratios** — set once acquisition and licensing review (Section 4.4) determine what is actually available at each category.
- **Probe thresholds** (Section 7.2/7.3 pass/fail bands) — empirical, set once a baseline unadapted-model measurement exists, per this project's consistent practice (Phase 7 §6.3, Phase 8 "Open items").
- **Authorization to begin task-specific training** — a decision for a later, not-yet-issued phase; this document defines the handoff contract (Section 1.6) but does not trigger it.
