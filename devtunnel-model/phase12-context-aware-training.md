# Phase 12 — Context-Aware Training
## Specialized AI Software Engineering Model: Training ITU-1 to Use Progressively Richer Engineering Context

Source of truth: Phase 1 (model definition, §13 long-term evolution path, §7 hard boundaries), Phase 2 (`task-schema.v2.json`, Rules 1–12), Phase 3 (Context Tiers 1–7, source-capability matrix, leakage rules CP-1–CP-4), Phase 4 (data collection, the Stage-6 PR/commit **quarantine**), Phase 6 (annotation process, §4.3 conflicting-evidence rule), Phase 7 (six datasets, `context_tier`-conditioned `TrainingExample`s, L6 context-leakage check, tier-sibling split integrity), Phase 8 (Context Architecture §7, Scaling Path §11 — the tier-by-tier activation plan and its five-part advance rule), Phase 9 (base checkpoint), Phase 10 (domain checkpoint), Phase 11 (**ITU-1 v1** — task-trained, calibrated, Tier-1-only release candidate). This document does not redefine any of them. It **executes** the step Phase 8 §11.2 specified but marked not-active, and that Phase 9 Decision #11, Phase 10 Decision #7, and Phase 11 Decision #3 each deferred by name: activating Context Tier ≥ 2.

**Scope boundary.** This phase produces, for each Context Tier the advance rule (Phase 8 §11.2) actually clears, a **context-trained candidate checkpoint**, plus a decision record for every tier that does *not* clear it. It does **not**:
- Redefine `task-schema.v2.json` (Phase 2) or the conceptual architecture (Phase 8). Where activation implies a schema change (a new `provenance.*.source` grounding strength, Section 6.4), that change is flagged as a MINOR-version proposal for Phase 2 to enact, not enacted here.
- Declare every tier active because the master prompt lists all eight levels together. Section 1.3 and Section 8 explain why activation stays tier-by-tier and gated, per Phase 8 §11.2, not wholesale.
- Lift the Phase 4 §3 Stage-6 quarantine on resolving-PR/commit content. Section 3.5 and Decision #5 treat Tier 6 as **blocked pending a data-collection addendum**, not silently unblocked by this document.
- Touch release, serving, or API design (Phase 1 §14), or perform subtask decomposition, dependency mapping beyond issue level, impact analysis, or implementation context — these remain new top-level record sections for a future MAJOR schema version (Phase 8 §11.3), not something context alone unlocks.

---

## 0. Position in the Pipeline

```
Phase 11 output: ITU-1 v1
   (task-trained, calibrated, release-candidate checkpoint — Context Tier 1 only)
        │
        ▼
Phase 12 (this phase): activate Context Tier ≥ 2, tier by tier, cumulatively
        │  — per tier: attach new segment types (Phase 8 §7.2) + retriever source (§7.4)
        │  — train (oracle-context and retrieval-in-the-loop, Section 1.4/1.5)
        │  — evaluate against Phase 8 §11.2's five-part advance rule
        │  — advance only if the rule clears; otherwise the tier stays [DEFINED, NOT ACTIVE]
        ▼
Phase 12 deliverable: one candidate checkpoint per tier that clears the gate,
   each rooted in ITU-1 v1, plus a decision record for tiers that don't clear it
        │
        ▼
[not authorized here] Release/serving decision for any promoted checkpoint (Phase 1 §14)
```

### 0.1 Reconciling the master prompt's eight Levels with Phase 3/8's seven Context Tiers

Phase 3 §0 already warned that "Phase N" (project workflow step) and "Context Tier N" (inference-time context stage) are unrelated numbering tracks that must not be confused. The master prompt for this phase introduces a *third* numbering — Level 1–8 — which this document resolves onto the existing Tier 1–7 scheme rather than treating as a rival hierarchy:

| Master-prompt Level | Context Tier (Phase 3/8) | Segment types added | Status entering Phase 12 |
|---|---|---|---|
| 1. Issue only | 1 (partial — title/body/labels, no comments) | `ISSUE_TITLE`, `ISSUE_BODY`, `LABEL`, `MILESTONE` | Subset of Phase 11's active baseline |
| 2. Issue + comments | 1 (full, per Phase 1 §4) | + `COMMENT` | **Already active** — this is ITU-1 v1 exactly |
| 3. Issue + repository metadata | 2 (partial) | `REPO_META` | [DEFINED, NOT ACTIVE] → in scope |
| 4. Issue + repository structure | 2 (full) | + `README`, `FILE_TREE` | [DEFINED, NOT ACTIVE] → in scope |
| 5. Issue + relevant source code | 3 | `CODE`, `CONFIG` | [DEFINED, NOT ACTIVE] → in scope |
| 6. Issue + documentation + dependencies | 4–5 | `DOC`, `DEP_GRAPH` | [DEFINED, NOT ACTIVE] → in scope |
| 7. Issue + PRs + commits + project history | 6 | `PR`, `COMMIT` (precedent only) | [DEFINED, NOT ACTIVE] → **blocked**, Section 3.5 |
| 8. Complete relevant engineering context | 7 | `PROJECT_CONVENTION` (plus the accumulated set) | [DEFINED, NOT ACTIVE] → in scope, contingent on 1–6 |

Levels 1 and 2 split Tier 1 (already resolved by Phase 11) and Levels 3 and 4 split Tier 2 into finer ablation points for Section 7's uplift measurement — the schema's tier field stays 1–7 (Phase 3 §1.3, Phase 7's `context_tier`); the Level numbering is an evaluation-granularity convenience layered on top, not a new data field. "Level 8 = complete context" is *not* a single new segment type; per Phase 8 §11.1 ("additive, not a rewrite"), it is Tier 7 with every lower tier's segments still present and budgeted, not a separate all-context mode that bypasses ranking.

---

## 1. Context-Training Strategy

### 1.1 What changes relative to Phase 11

Phase 11 trained Component C–G to reproduce ground truth from issue-plus-comments alone. Every field's evidence pointer, therefore, resolved to a Tier-1 segment. Phase 12 does not re-derive those heads or retrain them from a blank slate — per Phase 8 §11.1, scaling is **additive**: the same heads (value/pointer/source per field, Section 8.2 of Phase 8), the same consistency coupling, the same deterministic validator (H) and calibrator (G) *mechanism*, now conditioned on a larger, tier-gated segment set. What is new is not head architecture but three things the heads have never had to do:

1. **Select among many candidate segments**, most of which are irrelevant to the issue at hand (a repository's file tree or dependency graph is large; the issue names a small fraction of it).
2. **Resolve disagreement** between segments that Tier 1 never produced two of (a README claim vs. a code fact; a stale doc vs. current config).
3. **Recompute what "correctly cautious" means** when better grounding becomes available. A field that was honestly `Unknown` at Tier 1 (Phase 11) may have a real, groundable answer at Tier 3 — and the model must learn that the *ceiling* moved, not just memorize a higher hit rate.

### 1.2 Starting point

Each tier's training run starts from the **highest-tier checkpoint already promoted** in this phase, not always from ITU-1 v1 — Tier 3 training starts from the promoted Tier-2 checkpoint if Tier 2 cleared its gate, per the cumulative curriculum in 1.3. If a tier fails to clear its gate, the *next* tier (if independently trainable) still starts from the last checkpoint that *did* clear, not from the failed one — a failed tier does not block downstream tiers unless the downstream tier's segments structurally depend on it (Tier 4–5 depend on Tier 2/3's retriever infrastructure existing, not on Tier 3 having cleared its accuracy gate).

### 1.3 Cumulative, gated curriculum — not one training run over all context

The master prompt lists all eight levels as a single training-and-evaluation program. This document treats that as the **scope of investigation**, not as license to declare every tier active at once. Phase 8 §11.2's advance rule exists precisely because a tier can be *available* without being *worth activating* — added context that doesn't measurably help, or that erodes calibration, is exactly the "blindly consume the entire repository" failure mode the master prompt itself names. Each tier is therefore trained and evaluated **in tier order**, and only advances to being a candidate for promotion if Section 8's gate clears; tiers are never bundled into one accept/reject decision.

### 1.4 Two training modes per tier, not one

Training exclusively on **oracle context** — the gold `available_context` Phase 7 attached to each `TrainingExample` at that `context_tier` — would teach the heads what to do *with* good context, but nothing about *finding* it, since oracle context is pre-filtered to what's relevant. That produces a model that performs well in evaluation (where retrieval is also oracle) and poorly in any setting where the real Retriever (A3, Phase 8 §7.4) returns noise. Both modes are therefore required at every tier ≥ 2:

| Mode | Segment source | Teaches |
|---|---|---|
| **Oracle-context** | Phase 7's gold `available_context` for that `context_tier` | Correct use of relevant context: which fields it should move, by how much, with what evidence pointer |
| **Retrieval-in-the-loop** | Phase 8's A3 Retriever running against the full Phase 4 per-issue context bundle (the collected superset, Phase 4 §2), then gated by A2/A4 exactly as at inference | Relevance judgment, robustness to irrelevant/partial retrieval, and — critically — correct abstention when the retriever legitimately finds nothing (Section 6.5) |

Retrieval-in-the-loop batches are built by running the *current* Retriever configuration (light retriever at Tier 2, code-aware at Tier 3, per Phase 8 §11.2's per-tier retriever column) over Phase 4's collected bundle, not by re-fetching live repositories during training — this keeps training reproducible and keeps the Leakage Guard (A4) auditable against a fixed snapshot, consistent with Phase 8's determinism requirement (§6).

### 1.5 The heads are not retrained from scratch when a tier is added

Consistent with Phase 8 Decision #9 ("scaling by addition"), each tier's training run **continues** training on the previous tier's checkpoint with a lower learning rate on the encoder (mirroring Phase 11 §1.4's Stage-1 protection of Phase 9/10's representation gains), rather than re-running Phase 11's full joint Stage 1. Component G (calibration) is **always** re-fit per tier as a separate frozen-encoder stage (Phase 11 §1.4's Stage 2 pattern), because a new segment type changes the confidence/correctness relationship for every field that can now draw on it — reusing a Tier-1 calibrator at Tier 3 would silently violate Phase 1 §8 criterion 2.

---

## 2. Context Hierarchy

The hierarchy is Phase 3's source-capability matrix and Phase 8's segment-type table, combined here as the single reference this phase trains and evaluates against. Priority order (leftmost = consulted/budgeted first) follows Phase 8 §7.3.

| Tier | Segment types | Provenance ceiling this tier can support | Relevance signal available | Introduced |
|---|---|---|---|---|
| 1 | `ISSUE_TITLE`, `ISSUE_BODY`, `LABEL`, `MILESTONE`, `COMMENT` | `EXPLICIT` (title/body), `SUPPORTED_BY_CONTEXT` (labels, per Phase 3 §2 — labels never reach `EXPLICIT`), `SUPPORTED_BY_CONTEXT`/`INFERRED` (comments, weighted by author role) | Always fully in scope — no retrieval, budgeted only (Phase 8 §7.3) | Phase 11 (active) |
| 2 | `REPO_META`, `README`, `FILE_TREE` | `SUPPORTED_BY_CONTEXT` (Phase 1 §6, Phase 2 §2 — `components`/`systems` remain unverified against code through Tier 2) | Light retriever; entity-overlap query against repo metadata | This phase |
| 3 | `CODE`, `CONFIG` | `SUPPORTED_BY_CONTEXT`, and — only once verified-against-code exists (Section 6.4) — a new higher grounding strength | Code-aware retriever; chunking/ranking by symbol and path match to issue-named entities | This phase |
| 4–5 | `DOC`, `DEP_GRAPH` | `SUPPORTED_BY_CONTEXT`/`INFERRED` (docs may be stale relative to code — Section 5.2); `DEP_GRAPH` supports `dependencies` candidates | Retriever extended to doc index and dependency graph traversal | This phase |
| 6 | `PR`, `COMMIT` (precedent only — never the resolving item) | `SUPPORTED_BY_CONTEXT`/`INFERRED`, precedent-based, under the strictest A4 rule in the project | Retriever over historical PRs/commits, hard-excluding anything that resolves the issue under evaluation | This phase, **blocked** (Section 3.5) |
| 7 | `PROJECT_CONVENTION` | `SUPPORTED_BY_CONTEXT` | Per-project conditioning profile, not per-project retraining (Phase 8 §11.4) | This phase, contingent on Tiers 2–6 |

A field's *actual* provenance on any given record is never higher than what its winning evidence pointer's segment type supports at the tier ceiling in force for that inference — this is Phase 8's source-ceiling mechanism (§7.3, Decision #3), unchanged by this phase, just exercised across more segment types.

---

## 3. Retrieval Requirements

Extends Phase 8 §7.4 ("defined, not active") into an active, per-tier specification.

### 3.1 Query formation — resolving the bootstrapping order

Phase 8 §7.4 requires the retrieval query to be "formed from the issue's extracted technical entities and segment states, not raw text alone" — but full segment states come from the Shared Representation (B), which itself consumes the retrieved set. Phase 12 resolves this with an explicit two-pass flow:

- **Pass 0 (cheap, Tier-1-only):** a lightweight entity-extraction pass over the Tier-1 segment set alone (title, body, comments) — the same technical-entity surface the Component D/C heads already learned to identify at Tier 1 — produces the retrieval query. This pass reuses the Tier-1 model's own extraction, not a separate model.
- **Pass 1 (full):** the retrieved segments, gated through A2/A4, join the Tier-1 set; the full encoder (B) runs once over the combined set to produce the states every head consumes.

This keeps "determine required context" a real step (per the master prompt's flow diagram) rather than a circular dependency, and keeps it cheap — Pass 0 never invokes retrieval or the full encoder twice.

### 3.2 Per-tier retrieval requirements

| Tier | What the retriever must do | What it must not do |
|---|---|---|
| 2 | Match Pass-0 entities against repo metadata/README/file-tree paths; return top-K candidates with origin IDs | Return the entire file tree unfiltered — violates Phase 3 §2's "excerpted/retrieved relevantly, not dumped wholesale" |
| 3 | Chunk source by symbol/function/file; rank by path and identifier overlap with Pass-0 entities; return excerpts, not whole files | Return a file merely because it is large or central to the repo — relevance to *this issue*, not repo importance, is the ranking basis (Section 4) |
| 4–5 | Retrieve doc sections by semantic/keyword match; traverse the dependency graph outward from components already surfaced at Tier 2–3, capped at a bounded hop count | Traverse the full dependency graph unbounded — cost and irrelevance both grow combinatorially |
| 6 | Search precedent PRs/commits by entity/component overlap; **hard-exclude** any PR/commit that closes or references the issue under evaluation | Ever retrieve the resolving PR/commit, regardless of relevance score (Section 3.5, Phase 8 Decision #10) |
| 7 | Attach the project's convention profile (naming, structure, review norms) as a fixed per-project context, not retrieved per issue | Vary per-issue in a way that amounts to per-project retraining (Phase 8 §11.4) |

### 3.3 Empty results are legitimate

If a tier's retriever genuinely finds nothing relevant, that is a valid outcome, not a failure to fill budget — the Context Manager must not pad the segment set with low-relevance filler to "use" the tier's allowance. This is required for Section 6.5's omission-handling rule to be trainable at all: the model has to see real empty-retrieval cases in training, not only cases where *something*, however weak, was returned.

### 3.4 Retrieval passes through A4 unconditionally

Unchanged from Phase 8 §7.4: every retrieved segment set — oracle or retrieval-in-the-loop — passes through the Leakage Guard before reaching the encoder. This phase does not weaken that requirement at any tier.

### 3.5 Tier 6 is blocked, not silently worked around

Phase 4 §3 Stage 6 collected linked PRs and commit history into a **separate, access-restricted store**, explicitly "never entered into any model-input path," reserved for labeler use in producing ground truth. That quarantine covers *all* PR/commit content for a given issue — including precedent from other PRs/commits in the same repository, because Phase 4 did not distinguish "the resolving PR" from "any PR" at collection time. Tier 6 as specified in Phase 8 (§11.2) requires only **precedent** PR/commit segments, with the resolving item hard-excluded by A4 — a narrower thing than what Phase 4 quarantined wholesale. Phase 12 does not reinterpret the existing quarantine to permit this: **Tier 6 training and activation are blocked** until a Phase 4 addendum collects a legitimate precedent-PR/commit corpus into the model-input-eligible store, with the resolving-item exclusion enforced at collection, not only at retrieval time. This is recorded as Decision #5, not worked around here.

---

## 4. Context Ranking Requirements

Ranking determines what a bounded budget (Phase 8 §7.3) keeps when more relevant segments exist than fit. Every retained segment is assigned a rank, and the rank is logged in `InferenceTrace` (Phase 8 §12 Decision #12) so a reviewer can see *why* a segment was kept or dropped — ranking that isn't auditable would reintroduce exactly the opacity Phase 1 §12's traceability requirement exists to prevent.

**Ranking signals, in the order applied:**

1. **Entity overlap** with the Pass-0 query (Section 3.1) — the primary signal at every tier ≥ 2; a segment that shares no technical entity with the issue is deprioritized regardless of source quality.
2. **Directness** — does the segment explicitly reference a file/module/dependency already named or strongly implied in the issue, versus one merely topically nearby.
3. **Segment-type prior** — Phase 3's source-capability matrix already ranks how strong a grounding each source type can support; a `CODE` segment that verifies a claim outranks a `DOC` segment that merely describes it, when both are otherwise equally relevant.
4. **Authority**, extended from Phase 6 §4.3's comment-authority concept to non-comment sources: canonical/maintained artifacts (current README, actively-referenced config) outrank ephemeral or tangential ones (a stale doc branch, a rarely-touched file).
5. **Recency**, among otherwise-tied segments — but recency never overrides the temporal gate (A2) or Leakage Guard (A4); it only breaks ties among segments that already passed those.

**Budget allocation.** Per Phase 8 §7.3, budget is allocated per segment type so that a large low-relevance retrieval (e.g., a big dependency graph) cannot crowd out the issue text itself; within a type's allocation, rank order (above) determines which candidates are kept. A segment that ranks below the cutoff is dropped silently from the model's input — but *not* silently from the record: if dropping changes what a field can claim relative to what oracle context would have supported, that gap is visible in Section 6.5/7.7's retrieval-quality measurement, kept separate from classification quality exactly as Phase 8 §7.4 requires.

---

## 5. Conflict-Resolution Rules

Phase 6 §4.3 already defines conflict resolution for Tier 1 (issue body vs. comment): prefer the more authoritative/recent source, record both, cap confidence and log to `missing_information` when authority itself is ambiguous. Phase 12 extends this to conflicts that only exist once Tier ≥ 2 segments are present — cross-source and cross-tier disagreement — rather than replacing it.

### 5.1 Classify the conflict before resolving it

Not every disagreement resolves the same way. A conflict between segments is first classified as:

- **Verifiable-fact conflict** (does this file/module exist, does this dependency version match, is this the component that raised the error) — resolvable by the most *current and authoritative* source for that fact, which is often, but not always, the higher tier (Section 5.2).
- **Intent/subjective conflict** (how urgent this is, why the reporter thinks it's important, what the user actually wants) — the issue/comment text remains authoritative regardless of tier, because higher-tier sources (code, docs, PR history) don't speak to reporter intent at all. A README or code comment can never outrank the issue body on a question of *intent*.

This classification step exists specifically so "higher tier wins" is never applied as a blanket rule — a common and specific failure mode this phase must guard against, since it would let code-derived confidence quietly override what the issue actually says the problem is.

### 5.2 Resolving verifiable-fact conflicts

- **Cross-tier:** for a verifiable fact, a directly-checkable higher-tier source (code, config) generally outranks a descriptive lower-tier source (issue text, README) — code that shows a function no longer exists outranks an issue that assumes it does. The winning source's segment is the evidence pointer; the losing source's claim is recorded per Section 5.4, not discarded.
- **Same-tier:** apply Phase 6 §4.3's authority/recency rule, extended with **canonicality**: a maintained, actively-referenced artifact outranks a stale or tangential one of the same type (a current config file over a long-untouched one; an actively-linked doc over an orphaned one).
- **Never majority vote.** If three segments say X and one authoritative segment says Y, the authoritative segment wins. Ranking by source count is exactly the "keyword/volume shortcut" Phase 8 §8.4's anti-shortcut table already guards against in a different form; this rule extends that discipline to context aggregation.

### 5.3 Resolving intent/subjective conflicts

The issue/comment thread's own Phase 6 §4.3 procedure applies unchanged — later, more authoritative *human* statements (a maintainer's comment) can still revise an earlier one, but no non-text-based segment type is eligible to participate in this kind of conflict at all.

### 5.4 Unresolvable conflicts

If authority/recency/canonicality all leave the conflict genuinely ambiguous, Phase 6 §4.3 step 3 applies unchanged: the field drops to `INFERRED` at best, confidence is capped, both sources are recorded, and the conflict is logged to `uncertain_information` with a note — never silently resolved by picking a side (Phase 3's Q-CONTRA discipline). This is unchanged by the number of tiers involved; more sources create more opportunities for genuine ambiguity, not license to resolve it more casually.

---

## 6. Context-Grounding Rules

Phase 8 §0's grounding thesis — evidence is a pointer, never invented, bounded by a source ceiling — is unchanged by this phase. What follows is what adding tiers requires *of* that thesis, not a replacement for it.

### 6.1 Same auditability at every tier
A `SUPPORTED_BY_CONTEXT` claim grounded in a `CODE` segment is auditable exactly like one grounded in a `COMMENT` segment (Phase 8 §7.5) — same pointer-to-segment-ID-and-origin mechanism, just a different segment type. No tier gets a grounding shortcut.

### 6.2 Graceful degradation when the tier ceiling is lowered
A claim grounded only via a Tier-3 segment must not survive evaluation at a Tier-1 ceiling — when the ceiling drops, any evidence pointer resolving to a now-out-of-scope segment must be dropped, and the field must fall back to whatever Tier-1-legitimate grounding exists, or to `Unknown`. This operationalizes Phase 8 §11.2's backward-consistency gate (criterion 5) as a grounding rule the model is trained against, not only a check applied after the fact: training batches include the same record rendered at multiple tier ceilings, with the lower-tier target never permitted to inherit the higher tier's confidence or pointer.

### 6.3 Omissions are not evidence of absence
If the retriever legitimately returns nothing for a query (Section 3.3), that silence must not be read as "this component/dependency doesn't exist." The correct response is the same one Phase 1 §10 already requires for missing information generally: `Unknown` or reduced confidence, logged to `uncertain_information`/`missing_information`, never an asserted negative claim. This is trained explicitly using the retrieval-in-the-loop empty-result cases required by Section 3.3 — without real empty-result examples in training, the model has no way to learn this distinction rather than default to treating sparse retrieval as sparse reality.

### 6.4 New grounding strength requires a schema proposal, not a silent upgrade
Once code-verification is real (Tier 3 active), a claim can be stronger than anything Tier 1–2 could ever support — Phase 8 §11.3 names this a new value in `provenance.*.source`'s ceiling, a MINOR schema change. Phase 12 **proposes** this (a `VERIFIED` or similarly-named grounding strength, scoped to fields whose evidence pointer resolves to a `CODE`/`CONFIG` segment that the deterministic validator can re-check against the retrieved segment directly) but does not enact it — Phase 2 owns schema versioning, and enacting it here would bypass that authority the same way earlier phases were careful not to.

### 6.5 The PR/commit exclusion is enforced upstream, at the segment level
Per Phase 8 Decision #10 and restated here as a grounding rule rather than only a retrieval rule: a segment that resolves the issue under evaluation must never enter the segment set, full stop — this is enforced by A4 before the encoder ever sees it, and no amount of model confidence in a downstream prediction can substitute for a segment that was correctly never presented. Grounding rules operate on what's *in* the segment set; they cannot manufacture safety that A4's exclusion is responsible for providing in the first place.

---

## 7. Evaluation Methodology

This section is the direct answer to the master prompt's "test the same issue at multiple context levels" and "measure whether context actually improves [role, experience, complexity, task generation, technical identification, component identification, dependency understanding]."

### 7.1 The tier-sibling set already exists
Phase 7 §2.3/L6 guarantees that every `context_tier` variant of a given source issue lands in the same dataset split. The Test dataset's tier-sibling issues — those with variants at more than one tier — are exactly the evaluation set this phase needs; no new data-collection step is required to assemble it, only a query over dataset variant metadata already tracked (Phase 7's `by_context_tier` volume reporting).

### 7.2 Ground truth is tier-invariant; the *correct behavior* is not
Ground truth (Phase 6) records the fully-informed correct classification for an issue. At a lower tier, however, the honestly correct model behavior may be `Unknown` or lower-confidence, even where ground truth resolved confidently using context that tier doesn't have. Scoring lower-tier predictions against the raw ground truth value would penalize correct caution as if it were error — directly undermining the abstention behavior this entire project is built to reward (Phase 1 §10). Phase 12 therefore evaluates against a **tier-appropriate reference**, derived mechanically rather than re-annotated: for each field, check whether ground truth's own evidence pointer resolves to a segment whose tier is ≤ the tier ceiling being evaluated.
- If yes, the tier-appropriate reference equals ground truth (the tier legitimately supports the answer).
- If no, the tier-appropriate reference is `Unknown` at that tier, and a confident non-`Unknown` prediction is scored as *overclaiming*, not as a lucky correct guess, even if it happens to match ground truth's final value.

This reuses the same source-ceiling mechanism (Phase 8 §7.3) already applied to inputs, applied here to the label side once, deterministically, at eval-set construction time — not a new annotation pass.

### 7.3 Per-field, per-tier, per-source-type metrics
Extending Phase 11 §6.6's calibration cells with a tier dimension: accuracy/F1 against the tier-appropriate reference, and calibration (confidence vs. correctness) computed per (field, source type, tier). Reported for: `role`, `experience_level`, `complexity`, `task_type` (Component C); `technologies`/`components`/`systems`/`technical_areas` (Component D); `dependencies`; and task-generation grounding rate (claim-support failures per Phase 8 §9–10, evaluated per tier since generation can now draw on more segment types).

### 7.4 Uplift measurement (Phase 8 §11.2 criterion 2)
For each tier-sibling issue, compare the tier-N checkpoint's tier-appropriate-reference accuracy at tier N against the same issue's accuracy at tier N−1 (using the tier-(N−1)-promoted checkpoint, held fixed). A tier clears this criterion only if the aggregate gain is measurable and does not come from a subset of fields improving while others silently degrade.

### 7.5 Calibration-preservation check (criterion 3)
The tier-N checkpoint's calibration at tier N−1 inputs (ceiling artificially lowered) must not be worse than the tier-(N−1) checkpoint's own calibration at tier N−1 — training on richer context must not make the model *less* honest when richer context isn't available.

### 7.6 Leakage re-test (criterion 4)
Phase 7's L1–L7, with L6 (context leakage) specifically re-run post-training, since training itself — not just data assembly — is where a tier's segments could leak tier-N-only information into a tier-(N−1)-labeled batch if the two-mode training (Section 1.4) is misconfigured.

### 7.7 Backward-consistency check (criterion 5)
With the tier-N checkpoint's ceiling lowered to Tier 1, its behavior must not regress relative to ITU-1 v1 on the original Phase 11 Test pass. This is the direct trained-and-measured form of Section 6.2's grounding rule.

### 7.8 Retrieval quality measured separately from classification quality
Per Phase 8 §7.4: precision/recall of the Retriever (A3) against each record's gold `available_context` (the oracle set) is reported independently of field-level accuracy, so a tier that fails its gate can be diagnosed as "the model doesn't use good context well" versus "the retriever didn't find good context" — the same separation Phase 1 §14 names as the reason context was deferred in the first place.

### 7.9 One-shot Test discipline, per tier
Per Phase 7 §6.3 and Phase 11 §6.7/§6.8: Test is consumed exactly once per tier's promotion decision (not once for the whole phase — each tier is a separate gate), and that tier's Regression subset is run immediately after. A tier whose Test pass is spent without clearing the gate does not get a second Test pass; it is logged as not-promoted for this cycle, per Section 8's failure handling.

---

## 8. Phase-12 Decision Record

| # | Decision | Rationale |
|---|---|---|
| 1 | Phase 12 **executes** the step Phase 8 §11.2 specified but left [DEFINED, NOT ACTIVE], deferred by name in Phase 9 Decision #11, Phase 10 Decision #7, and Phase 11 Decision #3 | Keeps the same traceable handoff discipline every prior phase used rather than treating Tier ≥2 activation as a fresh, unaccountable design |
| 2 | The master prompt's **Level 1–8** is mapped onto the existing **Context Tier 1–7** (Section 0.1), not introduced as a parallel scheme | Phase 3 §0 already flagged the risk of confusing unrelated numbering tracks; a third scheme would compound exactly that confusion |
| 3 | Activation is decided **tier by tier, cumulatively**, against Phase 8 §11.2's five-part advance rule — never declared for all eight levels at once | The master prompt's own requirement ("must not blindly consume the entire repository," "determine context priority/relevance/conflicts") is a per-decision discipline, not satisfied by training on everything and calling it done |
| 4 | Training at each tier ≥2 uses **both oracle-context and retrieval-in-the-loop modes** | Oracle-only training cannot teach relevance judgment or robustness to retrieval noise/omission — exactly the capability the master prompt asks for by name |
| 5 | **Tier 6 (PR/commit) is blocked**, pending a Phase 4 data-collection addendum that separates precedent PR/commit content from the existing labeler-only quarantine | Phase 4 §3 Stage 6 quarantined *all* PR/commit content as never-model-input; Tier 6 as specified needs a narrower, legitimately model-input-eligible precedent corpus that does not yet exist — proceeding without it would either violate the quarantine or silently redefine it |
| 6 | Context ranking uses an explicit, logged signal order (entity overlap, directness, segment-type prior, authority, recency), never source count | Majority-vote-by-segment-count is a volume shortcut of the same kind Phase 8 §8.4 already guards against for keywords; ranking must stay auditable per Phase 1 §12 |
| 7 | Conflict resolution **classifies the conflict (verifiable-fact vs. intent) before applying precedence**, extending rather than replacing Phase 6 §4.3 | A blanket "higher tier always wins" rule would let code-derived confidence override what the issue actually says the reporter wants or means — a distinct failure mode from the factual conflicts higher-tier grounding is good at resolving |
| 8 | Grounding must **degrade gracefully when the tier ceiling is lowered**, trained explicitly via multi-ceiling rendering of the same record, not only checked post hoc | Operationalizes Phase 8 §11.2 criterion 5 as something the model is trained against, since a check applied only at evaluation time gives the model no signal to avoid the failure during training |
| 9 | Evaluation scores predictions against a **tier-appropriate reference**, mechanically derived from ground truth's own evidence-pointer tier, not the raw fully-informed ground truth value | Scoring legitimate lower-tier abstention as error would directly penalize the honesty behavior this entire project exists to produce (Phase 1 §10); the reference must respect what each tier can honestly support |
| 10 | A new grounding strength for verified-against-code (Section 6.4) is **proposed, not enacted** | Schema versioning is Phase 2's exclusive authority (Phase 2 §5/§9); enacting a MINOR bump inside a training-strategy document would bypass that ownership |
| 11 | Deliverable is **one candidate checkpoint per tier that clears its gate**, each rooted in the highest already-promoted tier, plus a decision record (not a checkpoint) for tiers that don't clear | Mirrors Phase 9–11's identity-record and rollback discipline, extended because Phase 12, unlike Phase 11, has multiple independent reversible junctures (one per tier) rather than one |
| 12 | Retrieval quality is measured **separately** from classification quality at every tier | Preserves Phase 8 §7.4's stated reason for the separation: keeping "the model doesn't understand" distinguishable from "the retriever didn't find it," per Phase 1 §14 |
| 13 | Per-tier promotion thresholds, ranking-signal weights, and the Section 3.1 Pass-0 extraction confidence floor are **not fixed in this document** | Consistent with this project's practice throughout (Phase 7 §6.3, Phase 8/9/10/11 "Open items"): empirical, set once a baseline run exists on real Training/Validation data at each tier |

### Open items (deliberately deferred, not forgotten)
- **Phase 4 addendum for a Tier 6 precedent-PR/commit corpus** — a data-collection task, not something this document can authorize on its own; Tier 6 stays [DEFINED, NOT ACTIVE] until it lands.
- **Schema MINOR-version proposal** for a verified-against-code grounding strength (Section 6.4) — owned by Phase 2, not enacted here.
- **Per-tier promotion thresholds, ranking-signal weights, budget splits per segment type** — empirical, per Section 3–4, to be set once each tier's baseline run exists.
- **Tier 7 per-project convention profile format** — contingent on Tiers 2–6 clearing their gates first; not designed in detail here since Phase 8 §11.4 treats it as per-project conditioning, not per-project retraining, and the conditioning mechanism itself is an implementation detail within that contract.
- **Release/serving decision** for any tier's promoted checkpoint — a decision for a later, not-yet-issued phase, outside this document's scope boundary (Phase 1 §14), same as Phase 11 §9's equivalent open item.
