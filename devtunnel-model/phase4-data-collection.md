# Phase 4 — Data Collection System
## Specialized AI Software Engineering Model: Collection Pipeline for Issue → Task Understanding

Source of truth: Phase 1 (Formal Model Definition, ITU-1), Phase 2 (`task-schema.v2.json`), Phase 3 (Data Strategy). Phase 3 defined *what* data is required and under what rules (no infrastructure). This document defines the *system that acquires it* — the pipeline, record formats, and gates that turn Phase 3's rules into a running collection process. **Labeling, ground-truth generation, redaction execution, and data cleaning are explicitly out of scope for this phase** — this document collects and gates candidate raw material; it does not annotate it.

---

## 0. Scope Boundary

Phase 4 sits between Phase 3 (rules) and Phase 5 (assumed: labeling/cleaning/corpus assembly, not yet specified). Concretely, Phase 4 is responsible for:

- Discovering and fetching source content (issues + tiered context) under license.
- Assigning every candidate a stable identity and a full provenance/lineage trail.
- Running every quality gate that **does not require a human or model to read and judge the issue's meaning** (license, spam, PII/secret detection, duplication, language ID, context-tier integrity, contamination reservation, diversity accounting).
- Producing a `READY_FOR_LABELING` queue that Phase 5 consumes.

Phase 4 is explicitly **not** responsible for: producing `ground_truth` (any Task Understanding Record), executing redaction (only detecting and holding), resolving near-duplicate clusters down to a capped set (only clustering and flagging — capping is a corpus-composition decision made when a training split is assembled), or any synthetic data generation (Phase 3 §8.4 reserves that for a future data-strategy revision).

This means every `CollectedRecord` this pipeline produces (Section 2) has `ground_truth: null` by design, and the pipeline's job ends at a well-formed, well-provenanced, gated candidate — never a training example.

---

## 1. Collection Specification

### 1.1 What is collected

Per Phase 3 §1.2 and §2, an issue's usable context is layered by Context Tier (Phase 1 §13). Phase 4 collects the **maximal legitimately available context per issue**, tagged by tier, rather than committing each issue to a single tier at collection time — tier-bounded `TrainingExample`s (Phase 3 shape) are assembled later, potentially several per issue at different tiers, by trimming this bundle. Collecting the superset once and trimming per-example downstream avoids re-fetching the same repository seven times.

| Tier | Content collected | Notes |
|---|---|---|
| 1 | Issue title, body, labels, comments, author-role metadata | Always collected; the floor for any candidate |
| 2 | Repo metadata (stars, primary language, topics), README, file tree | |
| 3 | Source excerpts, config files | Scoped/retrieved relevantly, never a full repo dump (Phase 3 §2) |
| 4 | Documentation | |
| 5 | Dependency/package graph | Scoped to direct, relevant deps |
| 6 | Linked PRs, commit history | **Quarantined** — collected for labeler use only, never entered into any model-input path (Section 3, Stage 6) |
| 7 | Project convention context (contribution guides, prior task descriptions if available) | |

### 1.2 What is not collected

- Anything from a repository whose license/ToS does not clearly permit training use, or whose ownership cannot be confirmed (IR-1, ER-2, PS-4) — checked *before* any content fetch, not after.
- Live, unpatched security-vulnerability issues (ER-3) — screened at fetch time via a maintained disclosure-status check, not fetched-then-filtered.
- Private/internal repositories, unless the owning organization has explicitly authorized use (PS-4).

### 1.3 Collection unit

The primary collection unit is the **Issue Capture** (Section 2): one record per GitHub issue, holding every tier of context legitimately available for it. This is distinct from a `TrainingExample` (Phase 3), which is one record per (issue × context tier × label) once Phase 5 labels it. One Issue Capture can produce multiple `TrainingExample`s later.

---

## 2. Data Record Format

Two record types. Both are additive precursors to Phase 3's `TrainingExample` — neither ever contains `ground_truth`.

### 2.1 `CollectedRecord` (Issue Capture)

```yaml
CollectedRecord:
  collection_id: uuid                     # stable identity for this capture, distinct from any future task_id/example_id

  identity:
    source_repo: string                   # owner/repo
    source_issue_url: string
    issue_number: integer

  input_core:                             # Tier 1 — mirrors Phase 3 TrainingExample.input.issue
    title: string
    body: string
    labels: [string]
    comments: [ { author_role: string, body: string, created_at: datetime } ]
    snapshot_fetched_at: datetime

  context_bundle:                         # superset across tiers; per-tier availability flagged
    tier_2: { repo_structure, readme, repo_metadata, fetched_at } | null
    tier_3: { source_excerpts, config, fetched_at } | null
    tier_4: { docs, fetched_at } | null
    tier_5: { dependency_graph, fetched_at } | null
    tier_6: { related_prs, commit_history, fetched_at } | null   # QUARANTINED — see Section 3, Stage 6
    tier_7: { project_conventions, fetched_at } | null
    max_tier_available: 1-7               # highest tier for which context was successfully and legitimately fetched

  ground_truth: null                      # never populated in Phase 4 — see Section 0

  data_provenance:                        # see Section 5
    license: string
    collection_method: string             # e.g. "github_rest_v3", "gh_archive_batch"
    collector_version: string
    fetch_run_id: string
    lineage_log_ref: string               # pointer into the append-only provenance log (Section 5.2)

  quality_status:                         # see Section 8
    collection_stage: RAW | CONTEXT_FETCHED | GATED | READY_FOR_LABELING
                       | DEDUP_HELD | REDACTION_HELD | EVAL_RESERVED | EXCLUDED
    quality_flags: [string]               # e.g. "near_dup_cluster:<id>", "unidentified_language", "pii_suspected"
    dedup_cluster_id: string | null
    exclusion_reason: string | null       # populated only if collection_stage = EXCLUDED
```

A `CollectedRecord` missing `identity`, `input_core`, `data_provenance`, or `quality_status` is not usable — same hard-failure stance Phase 3 §1.3 applies one level up.

### 2.2 `CollectionMetadataRecord`

A separate, lighter record (Section 4) capturing pipeline-operational metadata that does not belong on the content record itself (batch/run bookkeeping, rate-limit and retry history, hash indices). Kept separate so the content record stays stable even as operational metadata schemas evolve.

---

## 3. Collection Stages

Ordered, each stage idempotent and independently re-runnable (required by CP-7 — re-verification is not a one-time event). A record advances through `collection_stage` only on success; failure at any stage routes to `EXCLUDED` with a logged reason, never silently dropped.

| Stage | Name | Action | Gate applied |
|---|---|---|---|
| 0 | Source qualification | Check repo license/ToS/authorization before any fetch | IR-1, ER-2, PS-4 |
| 1 | Issue fetch | Fetch title/body/labels/comments/author metadata (Tier 1) | — |
| 2 | Repo-context fetch | Fetch repo structure/README/metadata (Tier 2) | — |
| 3 | Source/config fetch | Fetch scoped source excerpts + config (Tier 3) | — |
| 4 | Documentation fetch | Fetch docs (Tier 4) | — |
| 5 | Dependency-graph fetch | Fetch direct dependency graph (Tier 5) | — |
| 6 | PR/commit fetch (quarantined) | Fetch linked PRs/commits into a **separate, access-restricted store**, never the same store `input`/`context_bundle` are read from for model-input assembly | CP-4, ER-5 |
| 7 | Convention-context fetch | Fetch contribution guides / prior task descriptions (Tier 7) | — |
| 8 | Snapshot normalization | Normalize whitespace/markdown for hashing; pin per-artifact `fetched_at` timestamps | Traceability (Phase 1 §12) |
| 9 | Spam/vulnerability/PII screen | Spam filter; active-vulnerability screen; PII/secret detection (flag + hold, not redact) | ER-1, ER-3, PS-1, PS-2 |
| 10 | Language identification | Tag language; unidentifiable → excluded | IR-4, Q-LANG |
| 11 | Deduplication | Exact-hash dedup; near-dup clustering | Q-DUP, Q-NEARDUP |
| 12 | Context-tier integrity check | Verify no tier's content is reachable from a lower tier's declared bundle | IR-3, Q-CTX |
| 13 | Contamination reservation | Repository-level eval reservation; public-benchmark overlap check | CP-1, CP-5, CP-6 |
| 14 | Diversity accounting | Update corpus-composition counters against Section 7 targets; throttle further ingestion from over-cap sources | Section 7 |
| 15 | Routing | Final `collection_stage` assignment: `READY_FOR_LABELING`, `DEDUP_HELD`, `REDACTION_HELD`, `EVAL_RESERVED`, or `EXCLUDED` | All of the above |

Stage 6's output is never read by Stages 8–15 as model-facing content — it exists solely so a future labeler can consult it when writing ground truth (Phase 3 §2, PR row), and its store is access-controlled separately from the `context_bundle` fields that eventually reach `TrainingExample.input`.

---

## 4. Metadata Specification

Captured per `CollectedRecord` via the paired `CollectionMetadataRecord`, distinct from data provenance (Section 5, which answers "where did this come from and can we use it") and distinct from field-level provenance (Phase 3, populated only once labeled):

| Field | Purpose |
|---|---|
| `fetch_run_id` | Groups all records ingested in one pipeline run, for batch-level rollback/audit |
| `collector_version` | Pipeline code version that produced the record, so a later bug fix's blast radius is known |
| `per_artifact_fetched_at` | Independent timestamp per context artifact (issue snapshot, README snapshot, source-excerpt snapshot may all differ) — a single `snapshot_fetched_at` is insufficient once context spans multiple tiers |
| `content_hashes` | Normalized-text hash (Tier 1) plus a similarity fingerprint (e.g. simhash/minhash) for near-dup clustering |
| `rate_limit_events` / `retry_history` | Operational record of API throttling/retries, so gaps in a batch are explainable rather than mistaken for missing data |
| `max_tier_available` | What context *could* legitimately be fetched, distinct from what any downstream `TrainingExample` actually uses (Section 1.1) |
| `size_metrics` | Byte/token counts per artifact, to support later context-window planning without re-reading content |
| `language_tag` | ISO code, or `unidentified` |

---

## 5. Provenance System

Two provenance layers carried forward from Phase 3 §0/§7, plus one new layer this phase introduces.

### 5.1 Data provenance (per Phase 3 §7)

Populated as far as Phase 4 can populate it: `source_repo`, `source_issue_url`, `snapshot_fetched_at`, `license`. The labeling-specific fields (`labeling_method`, `annotator_ids`, `inter_annotator_agreement`, `labeled_at`, `labeling_tool_version`) remain unset until Phase 5 — a `CollectedRecord` is not required to guess them.

### 5.2 Collection lineage log (new)

An append-only log, one entry per `(collection_id, stage)` pair, recording: stage name, timestamp, collector/tool version, action taken, and result (pass/fail/hold + reason). This is **more granular than `label_provenance`** and serves two purposes Phase 3 didn't need to solve:

1. **Pipeline audit** — answers "why is this record in `EXCLUDED`/`DEDUP_HELD`" at the stage level, not just a final flag.
2. **Chain of custody for takedown (PS-5)** — a mapping `source_issue_url → [collection_id, ...] → [example_id, ...]` (the last leg populated once Phase 5 derives examples) so a single source issue's edit/deletion can cascade a removal request through every derived artifact, not just the first hop.

### 5.3 Field-level provenance

Not produced in Phase 4. `CollectedRecord.ground_truth` is `null`; there is nothing yet for field-level provenance to attach to. This boundary is deliberate (Section 0) and mirrors Phase 3 §0's insistence on keeping the two provenance concepts from being conflated — Phase 4 only ever populates the data-provenance and lineage layers.

---

## 6. Deduplication Requirements

| Rule | Applied at | Behavior |
|---|---|---|
| **Exact dedup (Q-DUP)** | Stage 11, against the full existing corpus index (not just the current batch) | Byte-identical or near-byte-identical (normalized title+body) issues are hashed; all but one representative per hash are routed to `DEDUP_HELD`, not silently discarded — held records remain traceable via the lineage log in case a hash collision needs review. |
| **Near-dup clustering (Q-NEARDUP)** | Stage 11 | Similarity fingerprinting clusters issues above a similarity threshold (threshold to be set empirically once pilot data exists, per Phase 1 §8's own precedent). **All cluster members are retained at collection time** and tagged `dedup_cluster_id` — capping a cluster to the recommended 3 representatives is a corpus-composition decision made at labeling/split-assembly time (Phase 5+), not a collection-time deletion, so the option to pick *which* 3 remains open to whoever assembles a split. |
| **Repository-level split reservation** | Stage 13 | Repository identity is recorded at collection time specifically so a later train/val/test split can be drawn at the repository level (CP-1) without re-deriving repo membership from scratch. |
| **Cross-repo / fork awareness** | Stage 11 | Near-dup fingerprinting runs across repositories, not only within one, so a forked repository's near-identical issues are still clustered together (closes the CP-7 gap named explicitly in Phase 3). |
| **Re-verification cadence** | Every ingestion run | Stage 11 always dedups the new batch against the *entire* existing index, not only against itself — a later batch can reveal that an already-`READY_FOR_LABELING` record is a near-duplicate of a new arrival; such cases are flagged for Phase 5 review rather than auto-resolved, since capping is a labeling-time decision (see above). |

---

## 7. Diversity Requirements

Phase 3 §8 sets diversity as *stratification targets for corpus composition*, not raw-availability claims. Phase 4's job is to make those targets **actionable at acquisition time** rather than discovered too late:

| Axis | Collection-time mechanism |
|---|---|
| Language/ecosystem, framework | Repository sourcing lists are pre-stratified by ecosystem bucket (web frontend, backend/server, mobile, data/ML, infra/DevOps, embedded); Stage 14 tracks running share per bucket and throttles further ingestion once a bucket nears its cap. |
| Application domain | Explicit domain-bucketed sourcing lists (consumer web, dev tooling, data infra, games, scientific/research, embedded/IoT), each with a *floor* tracked alongside the ceiling — Stage 14 flags under-floor buckets for active sourcing, not just over-cap ones. |
| Repository size/maturity | Sourcing lists deliberately include small/solo-maintainer and early-stage repositories, not only high-star projects; repo star count and contributor count are captured as Tier 2 metadata so this can be verified post hoc. |
| Repository conventions | No filtering toward "clean" labeling schemes — repos with sparse/no labels are sourced on purpose (Q-CONVENTION). |
| Task-type / role / experience / complexity signal | Labels/keywords may be used only as a **sourcing heuristic** to route candidates toward under-filled active-sourcing queues (e.g., a repo's `security` label makes it a candidate for the Security floor) — never as ground truth, consistent with Phase 3 §2's labels-as-signal-only rule. Actual classification still happens only at labeling (Phase 5). |
| Contrast pairs (experience × complexity) | Candidates whose issue length and apparent technical depth diverge (short+technical-looking vs. long+mechanical-looking, via the same sourcing-heuristic caveat above) are queued into a dedicated contrast-candidate pool for labeler prioritization — collection surfaces candidates, it does not construct them. |
| Non-English content | Sourced normally, but held at `collection_stage = READY_FOR_LABELING` only once a fluent-annotator-availability check (external to this pipeline) confirms coverage for that language; otherwise held pending coverage, per Phase 3 §8.2 — never auto-translated to force it through. |
| Per-repository ceiling | Stage 14 enforces the "no repo exceeds a low single-digit percentage" ceiling (Phase 3 §8.3) as an ingestion throttle, not a post-hoc filter — once a repo's share hits its cap, further issues from it are held rather than fetched. |
| Issue-quality spectrum | No filtering by terseness/quality at collection time (Q-LOWQ) — collection does not judge issue quality at all; that floor is preserved automatically by not screening for it. |

---

## 8. Quality Gates

Only gates answerable **without reading and judging the issue's engineering meaning** belong in Phase 4; anything requiring that judgment (Q-AGREE, GOLD/SILVER/BRONZE tiering, Q-CONTRA resolution, Q-MISS handling) is Phase 5's, because it needs `ground_truth` to exist.

| Gate | Stage | Failure behavior |
|---|---|---|
| License/access (IR-1, ER-2, PS-4) | 0 | Hard exclude before fetch; nothing is stored |
| Spam / non-engineering content (ER-1) | 9 | Hard exclude |
| Active unpatched vulnerability (ER-3) | 9 | Hard exclude until disclosed/patched (re-checked on re-ingestion, per CP-7) |
| PII/secret detection (PS-1, PS-2) | 9 | **Flag and hold** (`REDACTION_HELD`) — detection only; redaction execution is Phase 5's. If automated + eventual human redaction proves impossible, the record is excluded then, not now. |
| Language identification (IR-4, Q-LANG) | 10 | Unidentifiable → exclude; identified-but-uncovered → hold pending annotator coverage (Section 7) |
| Exact/near duplication (Q-DUP, Q-NEARDUP) | 11 | Exact dup → hold one representative; near-dup → cluster and tag, retain all members |
| Context-tier integrity (IR-3, Q-CTX) | 12 | Any leak of higher-tier content into a lower tier's declared bundle → hard exclude that tier's bundle (record may still proceed at a lower `max_tier_available`) |
| Contamination reservation (CP-1, CP-5, CP-6) | 13 | Repository designated for eval reservation → `EVAL_RESERVED`, walled off from the labeling queue entirely; known public-benchmark overlap → flagged and routed to at most one of {train-eligible, eval-eligible} |
| Diversity/ceiling (Section 7) | 14 | Over-cap source → held, not excluded (may be released later if corpus composition shifts) |

A record reaches `READY_FOR_LABELING` only after passing every applicable gate. Held/excluded states are always reason-coded via the lineage log (Section 5.2), never left ambiguous.

---

## 9. Dataset Acquisition Plan

A phased, budget-aware plan for filling the queue Section 8 gates:

1. **Batch 1 — Diversity anchors.** Seed from the pre-stratified sourcing lists (Section 7): a deliberately small, broad set of repositories chosen to cover every ecosystem/domain/size bucket at least once, before any volume push. Purpose: surface early diversity-target violations while the corpus is still cheap to rebalance.
2. **Batch 2 — Volume fill.** Broader ingestion within the Batch-1 buckets, throttled continuously by the Stage 14 per-bucket and per-repository ceilings, so volume growth cannot silently re-introduce the skew Phase 3 §8 warns against.
3. **Batch 3 — Active sourcing for gaps.** Once Batch 1–2 diversity accounting (Section 7) shows under-floor categories (task-type distribution — Security/Documentation/Maintenance in particular; contrast-pair candidates; non-English content with confirmed annotator coverage), sourcing is targeted deliberately at those gaps rather than left to organic sampling, per Phase 3 §8.1's explicit call for active curation.
4. **Batch 4 — Eval-window reservation.** A later time-slice of repositories/issues is reserved at acquisition time (not carved out after the fact) to support time-boundary evaluation splitting (CP-3) and to keep eval-set construction (CP-5) clean from the start.
5. **Operational constraints.** API rate limits and fetch budgets are tracked per `fetch_run_id` (Section 4); re-ingestion is incremental and idempotent (a repository already captured is only re-fetched for genuinely new/updated issues, re-running Stages 9–14 against the full existing index each time, per CP-7).
6. **Reporting.** Each batch closes with a diversity-target reconciliation against Section 7's floors/ceilings and a gate-outcome summary (counts by `collection_stage`), so acquisition decisions for the next batch are evidence-based rather than assumed. This is a reporting requirement on the plan, not a claim that dashboarding infrastructure is being built here.

---

## 10. Phase-4 Decision Record

| Decision | Rationale |
|---|---|
| `CollectedRecord.ground_truth` is always `null`, and no labeling/redaction-execution/cleaning logic exists in this pipeline | Matches the explicit task boundary — Phase 4 collects and gates, Phase 5 (or later) labels and cleans; conflating them would re-introduce the same risk Phase 3 §0 warned about for provenance layers |
| Collection unit is the Issue Capture (multi-tier bundle, one per issue), not the tier-bound `TrainingExample` | Avoids re-fetching the same repository once per tier; tier-bounded examples are trimmed from one bundle downstream, keeping Stage 6's quarantine and Stage 12's integrity check single points of enforcement |
| PR/commit content (Tier 6) is fetched into a separately access-controlled store, never the same store model-input context is read from | Makes CP-4/ER-5 (the highest-leverage leakage vector named in Phase 3) an architectural property of the pipeline, not a downstream filtering convention that could be forgotten |
| PII/secrets are detected and held, not redacted, in this phase | Redaction is a cleaning operation; detecting-and-holding keeps the record inert and excluded from any labeling/training path without performing the "clean" step this phase is scoped to avoid |
| Near-duplicate clusters retain every member at collection time; cap enforcement happens at split/labeling assembly | Capping which specific 2–3 cluster members to keep is a corpus-composition judgment call best made with full labeling context available, not foreclosed permanently by an early collection-time deletion |
| A new, more granular collection lineage log is introduced alongside (not instead of) Phase 3's `label_provenance` | Phase 3's provenance block is populated at labeling time and is example-level; Phase 4 needs stage-level audit and a takedown cascade path (PS-5) before any labeling has occurred, which `label_provenance` alone can't provide |
| Diversity targets are enforced as ingestion-time throttles (Stage 14) plus an active-sourcing batch (Section 9, Batch 3), not post-hoc corpus filtering | Filtering after the fact can only subtract from an already-skewed pool; throttling and active sourcing let the corpus approach its floors/ceilings as it's built, which is cheaper and more reliable than correcting skew later |
| Eval-window and repository-level split reservation happen at acquisition time (Batch 4), not after labeling | Reserving the repository/time boundary early keeps CP-1/CP-5 (repo-level splitting, eval isolation) structurally guaranteed rather than dependent on a later, error-prone manual carve-out |
| Labels/keywords are usable only as a sourcing heuristic to route candidates toward active-sourcing queues, never as classification signal | Preserves Phase 3 §2's labels-are-signal-not-ground-truth rule at the collection layer too — a sourcing heuristic can be wrong without corrupting any ground truth, since no ground truth exists yet |
| No annotation tooling, storage schema for labeled data, or model-training concerns are specified here | Matches the explicit task boundary given for this phase — data collection only |
