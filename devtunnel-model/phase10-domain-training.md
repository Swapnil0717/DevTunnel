# Phase 10 — Software Engineering Domain Training
## Specialized AI Software Engineering Model: Domain Specialization for ITU-1

Source of truth: Phase 1 (grounding/traceability, scope boundary), Phase 3 (data source matrix, contamination/licensing discipline), Phase 7 (`DatasetRecord`, split methodology, leakage tests), Phase 8 (`task-schema.v2.json`-conformant architecture, Component B representation requirements), Phase 9 (base-model adoption, tokenizer/offset contract, staged CPT pipeline, checkpoint identity record, Stages 0–3). This document does not redefine any of them. It defines the next stage in the representation pipeline: **broad software-engineering domain specialization, with explicit teaching of relationships between concepts**, narrowing at the end toward the shape of text Phase 2 will eventually classify.

**Scope boundary.** This phase produces a **domain-specialized checkpoint** — still a representation-quality artifact, not a task-performance one. It does **not**:
- Train any of Phase 8's heads (C–H) or attach them to the checkpoint.
- Consume Phase 2 schema labels, Phase 6 annotations, or Phase 7 `ground_truth` as training targets.
- Perform classification, extraction, or task generation.
- Fix parameter counts, schedules, or compute budgets (same exclusion as Phase 8 Decision #15, carried forward by Phase 9 Section 8).

---

## 0. Relationship to Phase 9 and Position in the Pipeline

```
Phase 9 output: adapted base checkpoint (Stage 3: general engineering representation
                 + segment/tier warm-up + NL–code alignment)
        │
        ▼
Phase 10 (this phase): domain-specialized checkpoint
        │  — broadens concept coverage beyond Phase 9 §4.1's composition table
        │  — adds explicit relational/structural training signal, not just corpus breadth
        │  — narrows, as a final stage, toward GitHub-Issue/Task-shaped text
        ▼
[not authorized yet] Attach Phase 8 heads to the checkpoint
        │
        ▼
[not authorized yet] Multi-task supervised training on Phase 7 DatasetRecords
        │
        ▼
[not authorized yet] Phase 8 validation lattice, Phase 1 §8 acceptance criteria
```

Phase 9 Stage 2 ("domain-narrowing") already performed a first, coarse corpus reweighting toward engineering text, and Phase 9 §4.1 maps master-prompt concepts to corpus source types. Two gaps remain that this phase's master prompt requires and Phase 9 did not cover:

1. **Concept coverage.** Phase 9 §4.1's table covers programming, terminology, documentation, APIs/frameworks, architecture, databases, auth/networking, testing/debugging, and refactoring/performance/security/maintenance. It does not cover **repository structures, Git, Pull Requests, code changes, dependency management, DevOps concepts, distributed systems, authorization (as distinct from authentication), or Frontend/Backend/Fullstack as organizing concepts** — all named explicitly in this phase's master prompt.
2. **Relational learning.** Phase 9's core objective is self-supervised next-token/denoising prediction plus one contrastive objective (NL–code alignment). Concept relationships are acquired only implicitly, through co-occurrence in a broadened corpus. This phase's master prompt requires the model to **not simply memorize terminology** — that requires a training signal aimed at relations, not corpus breadth alone.

Phase 10 therefore consumes Phase 9's Stage-3 checkpoint, tokenizer, and checkpoint-identity lineage as its starting point (no re-selection of base model, no re-verification of the tokenizer round-trip test beyond the re-audit Section 5 already requires at every stage boundary), and extends the same staged, gated discipline Phase 9 §6 established.

---

## 1. Domain-Training Strategy

### 1.1 Two-part strategy

| Part | Purpose |
|---|---|
| **A. Broad concept specialization** | Cover the full master-prompt concept list (Section 2.1) with corpus breadth *and* explicit relational training signal, so the representation organizes engineering concepts by how they relate, not only by where they co-occur. |
| **B. GitHub-Task-shaped narrowing** | A final, separately gated stage that shifts corpus weighting toward the shape of text Phase 2 will eventually see (issue title/body/comment structure), without introducing any Phase 2 label or Phase 8 head. |

Part B is deliberately last and deliberately the easiest stage to roll back (Section 7): narrowing toward task-shaped text is useful preparation but carries the highest risk of trading general engineering competence for issue-specific style, which Section 5.6's regression check exists to catch.

### 1.2 Principle: relationships over memorization

Operationalized as three concrete mechanisms, not a slogan:

1. **Corpus construction favors naturally relational text** (Section 2.2) — text where a relationship between concepts is present in the source (an incident postmortem's root-cause chain, an ADR's tradeoff discussion, a code review thread's reasoning) rather than text that merely defines terms in isolation (a glossary entry).
2. **Dedicated self-supervised relational objectives** (Section 3.2) that require the representation to model connections between concept mentions, not just predict the next token in isolation.
3. **Evaluation that specifically tests relation and analogy, not term recognition** (Section 4/5) — a probe suite designed so that a model which has merely memorized definitions, without learning structure, measurably fails it.

### 1.3 Carried forward unchanged from Phase 9

- Tokenizer and offset contract (Phase 9 §2) — reused, not re-derived; re-audited at each Phase 10 stage boundary (Section 5.6/7.3-equivalent).
- Core pretraining objective family (Phase 9 §3.2) — no objective-family change, for the same destabilization-risk reason Phase 9 §0.2/§3.2 gives.
- Checkpoint identity record, retention policy, rollback discipline (Phase 9 §5) — extended with Phase 10's stage names, not replaced.
- Contamination boundary (Phase 9 §4.3) — inherited exactly; re-applied, not redefined (Section 2.4).

---

## 2. Domain Corpus

### 2.1 Concept coverage, extending Phase 9 §4.1

Only categories **not already covered** by Phase 9's composition table are specified here; Phase 9 §4.1's existing categories (programming, terminology, documentation, APIs/frameworks, architecture, databases, auth/networking, testing/debugging, refactoring/performance/security/maintenance) continue to receive corpus weight in Part A and are not restated.

| Concept (from master prompt) | Corpus source type |
|---|---|
| Frontend / Backend / Fullstack (as organizing concepts, not just tech lists) | Technical writing that discusses the *boundary and interaction* between client and server concerns (rendering vs. data-fetching, API contracts, state ownership) — chosen over tech-stack lists because the goal is the relationship, not the label |
| Authorization (distinct from authentication) | Access-control documentation, RBAC/permissions design docs, security explainer text that treats authn/authz as related but distinct concepts |
| Networking, distributed systems | Distributed-systems documentation and technical writing covering consistency, latency, partitioning, retries, and failure modes as concepts with causal relationships to each other |
| DevOps concepts | CI/CD documentation, container/orchestration reference material, infrastructure-as-code documentation |
| Dependency management | Package-manifest formats and their accompanying documentation, dependency-resolution and version-constraint explainer text |
| Repository structures | Monorepo/polyrepo convention documentation, directory-layout conventions, README/CONTRIBUTING-style text that explains *why* a repository is organized a given way |
| Git | Git documentation and workflow guides (branching, merging, rebasing, reverting) as conceptual/procedural text, not repository-specific history |
| Pull Requests | PR process and review-convention documentation, and PR review **discussion text about process and tradeoffs** — general mechanics only; see Section 2.4 for the boundary against issue-resolving PR content |
| Code changes | Changelog text and commit-message↔diff-summary pairs (Section 3.2), used to ground change-type vocabulary ("refactor," "fix," "revert," "hotfix") in actual deltas rather than treating them as free-floating labels |

This table is, like Phase 9 §4.1, a **composition target for corpus assembly**, not a label taxonomy — the objectives in Section 3 remain self-supervised.

### 2.2 Relational sub-corpus

A distinguished slice of the corpus is selected specifically because the relationship between concepts is intrinsic to the text, rather than requiring synthetic construction:

- **Incident postmortems** — root-cause chains ("the N+1 query caused connection-pool exhaustion, which caused the timeout") are naturally-occurring relation-bearing text.
- **Architecture decision records** — explicit tradeoff and dependency reasoning between components/technologies.
- **Code review discussion threads** — reasoning about why one change relates to, blocks, or is required by another.
- **Commit-message↔diff-summary pairs** — the change-level analogue of Phase 9 §4.2's docstring↔function structural pairs.

This sub-corpus is what the auxiliary objectives in Section 3.2 are trained against; it is chosen over template-generated "X relates to Y" sentences because templated relation text risks teaching the *phrasing* of relation rather than the *concept*, a risk named explicitly in Section 7.

### 2.3 GitHub-Task-shaped narrowing corpus (Part B)

Reuses, rather than re-collects, the same **Training-split-only** issue/task text already permitted under Phase 9 §4.3 — this stage does not expand what text is eligible, only how heavily it is weighted once eligibility is established. As in Phase 9, this text contributes to a self-supervised objective only; no Phase 2 field or Phase 6 annotation is touched.

### 2.4 Contamination boundary

Inherited from Phase 9 §4.3 without modification:

- No repository assigned to Phase 7's Validation, Test, Hard-case, Adversarial, or Regression splits contributes text at any stage of Phase 10, checked against Phase 7's split manifest, not re-derived.
- The Section 2.1 "Pull Requests" category is bounded to **process and review-discussion text**, never to the specific PR that resolves a specific issue in the labeled data — the same issue-text/non-issue-text distinction Phase 9 §4.3 draws for repos in the Training split.
- Re-verified as a validation gate at every stage boundary (Section 5), not assumed to still hold from Phase 9's own re-audit, since corpus assembly for Section 2.1's new categories is a new ingestion event.

### 2.5 Licensing

Same exclude-by-default discipline as Phase 9 §4.4, applied to the newly added categories in Section 2.1 (repository-convention text, Git documentation, PR-process text, package-manifest/dependency documentation): license tag required at ingestion, incompatible or undocumented-provenance sources excluded rather than adjudicated ad hoc.

---

## 3. Training Objectives

### 3.1 Core objective — unchanged

Kept consistent with the base model's native objective family, per Phase 9 §3.2 and §0.2's rationale. No new core objective is introduced in Phase 10.

### 3.2 Auxiliary relational objectives — new to this phase

| Objective | Purpose | Corpus source |
|---|---|---|
| **Concept-relation modeling** | Requires the representation to model the connection between two concept mentions appearing in the same relation-bearing passage (Section 2.2), rather than treating each mention independently | Postmortems, ADRs, review threads |
| **Repository-structure alignment** | Pairs a file/directory path with the text explaining its purpose or convention, extending Phase 9 §4.2's structural-pairing idea from function-level to repository-level | READMEs, CONTRIBUTING docs, directory-convention text |
| **Commit-change alignment** | Pairs a commit message or changelog entry with a summary of the corresponding change, grounding change-type vocabulary in actual deltas | Commit-message↔diff-summary pairs |

All three remain **self-supervised or lightly-structured-pair contrastive objectives** over naturally occurring or minimally-processed text — none introduces a manual label, a classification target, or a Phase 2 field, preserving the Phase 9 §0/§3.1 scope boundary.

### 3.3 What this phase explicitly does not train

Unchanged from Phase 9 §3.3: no classification head, no evidence-pointer supervision, no claim-plan/realization decoder, no calibration. This phase adds relational and structural *representation* signal, not task performance.

---

## 4. Curriculum

Staged and gated, in the same additive discipline as Phase 9 §6 — a later stage is never started to compensate for an earlier stage's gate failing (Section 7). Each stage builds on the previous stage's promoted checkpoint; Phase 10 Stage A begins from Phase 9's Stage-3 checkpoint.

| Stage | Content | Gate to advance |
|---|---|---|
| **Stage A — Concept-coverage broadening** | Core objective (3.1) over the Section 2.1 corpus additions, alongside continued exposure to Phase 9 §4.1's existing categories so earlier coverage is not diluted | Domain probes (Section 5.1) show measurable coverage on the previously-uncovered categories, without regressing Phase 9 §7.1's general-capability floor |
| **Stage B — Relational specialization** | Auxiliary objectives (3.2, concept-relation modeling) activated on the Section 2.2 relational sub-corpus | Relation probes (Section 5.2) show separation between related and unrelated concept pairs, exceeding the Stage-A/Phase-9 baseline that had no explicit relational signal |
| **Stage C — Repository-level integration** | Repository-structure and commit-change alignment objectives (3.2) activated on Section 2.1's repo-structure/Git/PR-process/dependency-management text | Repository and code-understanding probes (Section 5.3/5.5) show non-trivial retrieval accuracy above a chance/lexical-overlap baseline |
| **Stage D — GitHub-Task-shaped narrowing** | Core objective reweighted toward the Section 2.3 corpus | Held-out perplexity/fit improves on Training-split issue-shaped text without regressing the Section 5.6 general-capability and contamination checks |

Stage D is the only stage whose promoted checkpoint is not automatically treated as strictly superior to its predecessor for all purposes: if Section 5.6's regression check fails at Stage D but the Stage C checkpoint is clean, Stage C is retained as the phase's deliverable and Stage D is deferred (Section 7) rather than forced through.

---

## 5. Evaluation Suite

Validation at this phase measures **representation quality with an explicit relational/structural component** — the family of checks Phase 9 §7 named out of scope for itself. Still not Phase 1 §8's acceptance criteria (Section 5.7).

### 5.1 Terminology-vs-concept discrimination probe
Nearest-neighbor and embedding-similarity checks confirming that domain terms cluster with true synonyms/paraphrases and separate from superficially similar but unrelated terms — the direct test of "not simply memorized terminology" the master prompt requires, extended from Phase 9 §7.2's single-term clustering to include this discrimination check.

### 5.2 Relation probes
Given two concept mentions in held-out relational text (Section 2.2), does the representation encode the correct relation type (causes / requires / blocks / part-of) with better-than-chance and better-than-Phase-9-baseline separation. Includes a **held-out relation-phrasing split** — relation instances phrased differently from anything in the training sub-corpus — specifically to catch the overfitting-to-phrasing risk named in Section 7.

### 5.3 Code and code-change understanding probes
Function↔docstring retrieval (carried forward from Phase 9), plus new diff-summary↔commit-message retrieval and a code-comprehension cloze task.

### 5.4 Architecture understanding probes
Consistency checks between an ADR's stated tradeoff/dependency and a held-out paraphrase of the same relationship — tests whether Stage B's relational signal transfers to architecture-specific text, not just the postmortem/review text it was partly trained on.

### 5.5 Repository understanding probes
File-path↔purpose retrieval, directory-convention discrimination, and Git-operation semantic proximity (branch/merge/rebase/revert should cluster by operation-relationship, not just co-occur as tokens).

### 5.6 Regression and contamination re-audit
Phase 9 §7.1 (general-capability regression) and §7.4 (contamination re-audit) are re-run at every Phase 10 stage boundary, not only once — each new corpus category (Section 2.1) and each new stage is a fresh opportunity for drift.

### 5.7 Explicit non-goal
No comparison to Phase 1 §8 criteria (classification accuracy, calibration, source attribution, abstention, experience⊥complexity, output validity) happens here — those require trained heads and labels this phase still does not have, per Phase 9 Decision #8's separation, preserved unchanged.

---

## 6. Expected Improvements

| Change | Expected, measurable effect | Measured by |
|---|---|---|
| Section 2.1 corpus broadening | Higher domain-probe pass rate on previously-uncovered categories (repo structure, Git, PR process, dependency management, DevOps, distributed systems, authorization) | Section 5.1, per-category |
| Section 3.2 concept-relation objective | Relation probes outperform the Phase 9 checkpoint, which had no explicit relational training signal | Section 5.2 |
| Section 3.2 repository-structure alignment | Improved file-path/purpose retrieval versus the Phase 9 baseline | Section 5.5 |
| Section 3.2 commit-change alignment | Improved diff-summary/commit-message retrieval; change-type vocabulary ("refactor," "revert," "hotfix") shows tighter clustering with corresponding code-delta patterns | Section 5.3 |
| Section 2.3 GitHub-task-shaped narrowing | Improved held-out fit on issue-shaped Training-split text, without regressing Section 5.6's general floor | Section 5.6 |
| Cumulative (not measured in this phase) | A richer starting representation for Phase 8 Component B's entity/relation grounding, should head-attachment later be authorized — this is an anticipated downstream benefit, not a claim this phase can itself validate | N/A — deferred to the not-yet-authorized fine-tuning phase |

---

## 7. Failure Risks

| Failure mode | Signal | Response |
|---|---|---|
| Relational objective overfits to templated/synthetic relation phrasing rather than generalizing | Section 5.2's held-out relation-phrasing split shows a gap versus in-distribution phrasing | Reduce reliance on any templated relation text; diversify the Section 2.2 naturally-occurring relational corpus rather than synthesizing more examples |
| Repository-structure corpus is thin or skewed toward particular ecosystems/conventions | Section 5.5 probes show strong performance on over-represented conventions and near-chance on others | Diversify source repositories across ecosystems; if diversification isn't feasible in this pass, document the skew as a known, bounded limitation, per the precedent of Phase 8 §2.B's documented byte-fallback limitation |
| Stage D (GitHub-task-shaped narrowing) regresses general code/NL competence | Section 5.6 regression check fails at the Stage D gate | Roll back to the Stage C checkpoint per Section 4; treat Stage C's checkpoint as the phase deliverable and defer Stage D rather than forcing promotion |
| Corpus/split drift | Section 5.6 contamination re-audit finds Phase 7 split-manifest changes since a stage's corpus was frozen | **Hard blocker**, same as Phase 9 §4.3/§9: affected corpus shard removed, stage re-run from the last clean checkpoint |
| License violation in a newly added corpus category (Section 2.1) | Section 2.5 review finds an incompatible or undocumented-provenance source post-ingestion | **Hard blocker**, same as Phase 9 §4.4/§9: source removed from manifest; any checkpoint trained on it is not promoted |
| Domain fluency mistaken for grounded correctness | Not directly measurable in this phase | Named explicitly as a limitation, not a failure this phase can detect: a representation that discusses "N+1 query" or "race condition" fluently can still, once Phase 8 heads are attached, generate ungrounded evidence. Phase 10 improves representation quality only; grounding behavior (Phase 1 §11) remains untested until the not-yet-authorized fine-tuning phase |
| Tokenizer/offset integrity drift from newly added corpus categories | Round-trip mismatch on a sample drawn from Section 2.1's new sources | **Hard blocker**, inherited from Phase 9 §2/§9: no further Phase 10 compute spent until resolved |

---

## 8. Phase-10 Decision Record

| # | Decision | Rationale |
|---|---|---|
| 1 | Phase 10 is an **additive continuation of Phase 9's pipeline**, consuming Phase 9's Stage-3 checkpoint, tokenizer, and objective family as-is, rather than a parallel or independent pretraining run | Avoids re-litigating Phase 9's base-model selection and tokenizer decisions (Phase 9 Decisions #1–2); preserves the checkpoint lineage Section 5's identity record depends on |
| 2 | Corpus coverage is **broadened** to include repository structure, Git, Pull Requests (process-only), code changes, dependency management, DevOps, distributed systems, authorization, and Frontend/Backend/Fullstack as relational concepts | These are named explicitly in this phase's master prompt and were not covered by Phase 9 §4.1's composition table |
| 3 | Explicit **self-supervised relational objectives** (concept-relation, repository-structure alignment, commit-change alignment) are added rather than relying on corpus breadth alone | The master prompt's requirement that the model "not simply memorize terminology" needs a training signal aimed at structure, not just more text |
| 4 | Curriculum is **staged and gated (A–D)**, matching Phase 9 §6's discipline, with Stage D (task-shaped narrowing) placed last and treated as the most reversible stage | Task-shaped narrowing carries the highest risk of trading generality for narrowness (Section 7); placing it last and making it independently rollback-able protects the earlier stages' gains |
| 5 | Evaluation suite adds explicit **relation, architecture, and repository probes** that Phase 9 §7 declared out of scope for itself, while still **not** adopting Phase 1 §8's acceptance criteria | Fulfills this phase's evaluation requirement (technical/architecture/repository/code understanding) while preserving Phase 9 Decision #8's separation between representation quality and task performance |
| 6 | The GitHub-Task-shaped narrowing corpus (Section 2.3) reuses **Phase 9 §4.3's contamination boundary unchanged**, rather than defining a new exclusion policy | Avoids drift between phases' leakage definitions; Phase 7's split manifest remains the single source of truth for what text is eligible |
| 7 | No Phase 8 heads, no Phase 2/6/7 labels, and no calibration are introduced | Carried forward unchanged from Phase 9 §0/§3.3; this phase's job is still representation, not task performance |
| 8 | Concept coverage (Section 2.1) remains a **composition target**, not a label taxonomy; all training objectives stay self-supervised or lightly-structured-pair contrastive | Matches Phase 9 §4.1's closing principle, so "concept coverage" never quietly becomes a disguised classification task |
| 9 | Failure risks specific to the relational and narrowing stages are given **their own entries**, not folded into Phase 9 §9's table | These risks (relation-phrasing overfitting, ecosystem skew, task-shaped narrowing regression) concern objectives Phase 9 never had and needed their own detection/response pairing |
| 10 | Deliverable is **one artifact** — a domain-specialized checkpoint, successor to Phase 9's — using the same identity-record, retention, and rollback discipline as Phase 9 §5, extended with Phase 10's stage names | Keeps traceability continuous across phases (Phase 1 §12's principle, already extended once by Phase 9 Decision #7) rather than starting a parallel bookkeeping scheme |

### Open items (deliberately deferred, not forgotten)
- **Repository/Git/PR-process/dependency-manifest source shortlist** — requires an actual licensing and provenance review (Section 2.5), not assumed here.
- **Relational sub-corpus size and mix ratios** (Section 2.2) — set once acquisition determines what naturally-relational text (postmortems, ADRs, review threads) is actually available at sufficient volume.
- **Probe thresholds** (Section 5, all subsections) — empirical, set once a Phase-9-baseline measurement exists on the same probes, per this project's consistent practice (Phase 7 §6.3, Phase 8 "Open items," Phase 9 "Open items").
- **Authorization to begin task-specific training** — unchanged from Phase 9 §1.6/§10: a decision for a later, not-yet-issued phase; this document extends the handoff contract one stage further but does not trigger it.
