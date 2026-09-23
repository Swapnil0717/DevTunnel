# Phase 7 — Dataset Construction
## Specialized AI Software Engineering Model: From Annotated Records to ML-Ready Datasets

---

## 0. Scope Boundary

Phase 7 converts `ANNOTATION_READY` records that have completed Phase 6 (agreed, adjudicated, or QA-cleared Task Understanding Records) into the six concrete dataset artifacts the model will actually be trained and evaluated against. Phase 7 **assembles and partitions data that already exists** — it does not collect (Phase 4), clean (Phase 5), or label (Phase 6) anything new, and per the explicit instruction, it does **not** design the model, a loss function, a training loop, or any architecture. Every leakage-prevention rule here **executes** a control that Phase 3 already specified (CP-1 through CP-7) and Phase 4/5 already partially reserved — Phase 7 is where those reservations become actual, versioned, disjoint files.

---

## 1. Dataset Architecture

Six datasets, each with a distinct purpose, sourcing rule, and lifecycle. None of the six overlap in membership (Section 4 enforces this as a hard test).

| Dataset | Purpose | Sourced from | Synthetic allowed? | Lifecycle |
|---|---|---|---|---|
| **Training** | Teaches the model | `ANNOTATION_READY` records at `quality_status.tier ∈ {GOLD, SILVER}`, all context tiers | Yes, bounded per Phase 3 §8.4 (minority share, never fills a floor alone) | Grows with each corpus/annotation cycle; superseded, not edited, each version |
| **Validation** | Model selection / hyperparameter and prompt tuning during development | `GOLD`-tier only, held out at repo level from Training | No | Fixed per release; re-drawn only on a MAJOR dataset version bump |
| **Test** | Final, one-shot-per-release measurement of generalization | `GOLD`-tier only, repos **and** time window never present in Training or Validation | No | Frozen once a release ships; never iterated against during development (Section 6) |
| **Hard-case** | Stress-tests calibration and the `Unknown`/ambiguity machinery specifically (Phase 1 §8 criteria 2 and 4) | Deliberately curated: Phase 6 records with `agreement_status ∈ {disagreed, adjudicated}`, records with `uncertain_information` non-empty, deliberate contrast pairs (Phase 3 §8.1, capability 4/5) | Yes, curated contrast pairs are allowed here (unlike Test) since Hard-case measures targeted behavior, not raw generalization | Grows opportunistically as hard cases are identified; versioned |
| **Adversarial** | Probes the specific failure modes Phase 1 §9 names as *failures*, not just errors — fabricated grounding, overclaimed confidence, experience/complexity collapse, spurious keyword correlation | Purpose-built: real records edited/constructed to bait a specific failure mode, always `labeling_method: SYNTHETIC` (Phase 3 ER-8) plus a `failure_mode_targeted` tag (Section 5) | Yes — this is its defining characteristic | Grows as new failure modes are discovered (Section 8.4 loop, carried from Phase 6) |
| **Regression** | Prevents a previously-fixed failure from silently reappearing across model versions | Frozen snapshot of every record that **any** prior model version got wrong in a way judged a genuine failure (not just eval noise) — pulled from Test/Hard-case/Adversarial results, then permanently relocated here | No | Strictly append-only; a record, once added, is never removed, only possibly re-tagged if a later review determines the original failure judgment was itself wrong (logged, not silently corrected) |

**Structural rule governing all six:** a record's `example_id` may appear in **at most one** of {Training, Validation, Test, Hard-case, Adversarial, Regression} at any given dataset version. This is stricter than ordinary train/eval disjointness — Hard-case and Adversarial are also mutually exclusive with Training/Validation/Test, because a record used to *train* general capability cannot simultaneously be used to *measure* a targeted weakness without inflating that measurement.

**Why Regression is separate from Test:** Test must stay representative of unseen, naturally-distributed engineering work (per the master prompt's explicit requirement) and is redrawn/refreshed on a cadence (Section 6). Regression is the opposite by design — a fixed, deliberately curated, un-representative set of known-hard cases that must never be fixed by accidentally training on them and never allowed to drift, since its entire value is being a stable trip-wire across model versions.

---

## 2. Split Methodology

### 2.1 Unit of assignment is the repository, not the issue
Per Phase 3 CP-1, restated as an execution rule: **every split-assignment decision is made once per repository**, and every `TrainingExample` (at every context tier) whose `source_repo` matches inherits that assignment. No repository is ever split across Training/Validation/Test.

### 2.2 Near-duplicate cluster integrity carried through
Per Phase 3 CP-2 / Phase 4's `dedup_cluster_id` / Phase 5 §3's refined clustering: every member of a `dedup_cluster_id` is assigned to the same split as the rest of its cluster, **even if cluster members happen to originate from different repositories** (a forked repo is the canonical case — Phase 3 CP-7 names this explicitly). Repository-level assignment (2.1) is the primary key; cluster-membership is a hard override that can force an otherwise-Training repo's specific issue into whichever split its cluster was assigned to, logged as an exception.

### 2.3 Context-tier sibling integrity (new at Phase 7 — this is where it must be enforced)
A single source issue may back multiple `TrainingExample`s at different `context_tier` values (1–7, per Phase 3 §1.3). **All context-tier variants of the same source issue are assigned to the same split.** Splitting tier 1 of an issue into Training and tier 4 of the same issue into Test would let the model implicitly learn a higher-tier grounding for a specific issue it would later be "tested" on at a lower tier — a leakage vector distinct from, and not covered by, repository- or cluster-level leakage. This is the **context leakage** control named in the master prompt's PREVENT list.

### 2.4 Temporal boundary
Per Phase 3 CP-3 and Phase 4 Batch 4's eval-window reservation: Test is drawn only from the reserved later time window (`snapshot_fetched_at` beyond the training cutoff). Validation is drawn from a middle window — after the bulk of Training's time range, before Test's — so that validation performance during development is not itself an accidental preview of Test-window issues. Hard-case, Adversarial, and Regression are exempt from the temporal ordering constraint (their value is targeted difficulty, not recency-realism), but individual records placed in them are still checked against Section 4's leakage tests.

### 2.5 Stratified assignment within the repo-level constraint
Repository-level assignment (2.1) is not simple random repo sampling — it is **stratified** against the diversity axes fixed in Phase 3 §8.1 (language/ecosystem, framework, domain, repo size/maturity, task-type mix present in that repo's issues) so that Training, Validation, and Test each independently satisfy the floors/ceilings in Section 3, not just the corpus as a whole. Concretely: repositories are bucketed by their dominant stratification axes, and assignment proportions (Section 2.6) are applied *within* each bucket before pooling, preventing an outcome where, say, all embedded/IoT repos land in Training and none in Test.

### 2.6 Target proportions and reproducible assignment
- Default target split (repo-count-weighted, adjusted to hit example-count targets after context-tier fan-out): **80% Training / 10% Validation / 10% Test**, before Hard-case/Adversarial/Regression carve-outs (Section 2.7).
- Assignment is **deterministic and reproducible**: each repository's split is computed as `bucket(hash(repo_id, split_salt) mod 100)` against the stratum's target thresholds, where `split_salt` is a fixed, versioned constant (Section 6). Given the same corpus snapshot and the same `split_salt`, re-running assignment produces byte-identical split membership — this satisfies the "create reproducible splits" requirement without needing to persist a giant explicit repo→split lookup table as the source of truth (the table is still materialized and shipped in the manifest, Section 8, but it's a derived artifact, not the mechanism).
- Changing `split_salt` is a MAJOR dataset version event (Section 6), because it reshuffles which repos land where.

### 2.7 Carve-out order
Hard-case and Adversarial are **not** carved out of the 80/10/10 pool — they are built from records that were already excluded from Training/Validation/Test eligibility by Section 1's sourcing rule (disagreement history, synthetic construction) or that are curated independently. Regression is carved out *after* the fact, by removing a record from wherever it previously lived (commonly Test) the moment it's confirmed as a genuine prior-version failure, and relocating it — this is the one case where a record's dataset membership changes over time, and it is always logged as a `relocation` event (Section 6).

---

## 3. Dataset Statistics

Every dataset ships a statistics block (populated per Section 5's schema) covering, at minimum:

**Volume**
- Total example count; count by `context_tier`; count by source repository (top-N and long-tail summary, to make Phase 3 §8.3's single-repo ceiling auditable post hoc).

**Label distribution** (each cross-tabulated against `quality_status.tier` and `context_tier`)
- `role`, `experience_level`, `complexity`, `task_type` — full category counts and percentages, checked against Phase 3 §8.1 floors.
- `technologies`, `languages`, `frameworks` — top-N and coverage-breadth (distinct count), since these are open string sets and a floor/ceiling on any one value is less meaningful than overall spread.
- Repository type/maturity bucket, application domain bucket (Phase 3 §8.1 axes) — counts and percentages.
- Context-level (`context_tier` 1–7) — distribution, since higher tiers are structurally rarer (richer context is more expensive to assemble) and this scarcity must be visible, not hidden inside an aggregate.

**Provenance / quality**
- `label_provenance.labeling_method` distribution (`HUMAN_EXPERT` / `ADJUDICATED_MULTI_ANNOTATOR` / `MODEL_ASSISTED_HUMAN_CORRECTED` / `SYNTHETIC`), with the Section 1 constraint (no `SYNTHETIC` in Validation/Test) verified as a statistic, not just a rule.
- `quality_status.tier` distribution (GOLD/SILVER/BRONZE — `REJECTED` records never reach dataset assembly at all).
- Mean and distribution of `inter_annotator_agreement` (Phase 6 §6 κ/Jaccard scores) per field-category, surfaced per dataset so a consumer can see, e.g., that Test skews toward higher-agreement records than Hard-case by design.
- `provenance.*.source` distribution (`EXPLICIT`/`SUPPORTED_BY_CONTEXT`/`INFERRED`/`UNKNOWN`) aggregated across records — a dataset that is suspiciously `EXPLICIT`-heavy is itself a diversity/difficulty signal worth surfacing.

**Balance verdict**
- For every axis above, the statistics block states the Phase 3 §8.1 floor/ceiling (where one exists) and whether this dataset, at this version, satisfies it — `pass` / `fail` / `no_target_defined`. A `fail` does not block dataset publication automatically (some axes are aspirational, not hard gates) but is never silently omitted (Section 7 makes the presence of this verdict a validation test in itself).

---

## 4. Leakage Tests

One test per item in the master prompt's PREVENT list, each executed against the **final assembled split membership** — this is deliberately redundant with Phase 3/4/5 controls, because a bug in split assembly (Section 2) could reintroduce a leak those upstream controls already guarded against, and Phase 3 CP-7 explicitly requires re-verification rather than one-time trust.

| # | Leakage type | Test |
|---|---|---|
| L1 | **Repository leakage** | For every pair of datasets among {Training, Validation, Test}, the set of `source_repo` values must be disjoint. (Hard-case/Adversarial/Regression are exempt from this specific pairwise check per Section 1's separate sourcing, but are still checked by L2–L7.) |
| L2 | **Issue leakage** | No `source_issue_url` appears in more than one of the six datasets. |
| L3 | **Duplicate leakage** | No two records across different datasets share an exact-hash match (Phase 4/5's exact-dup fingerprint) on `input.issue` content. |
| L4 | **Near-duplicate leakage** | No two records across different datasets share a `dedup_cluster_id`. Violates Section 2.2 if found — this test exists precisely to catch a Section 2.2 implementation bug, not to re-derive clustering. |
| L5 | **Temporal leakage** | Every Test-set record's `snapshot_fetched_at` is later than every Training-set record's, at the repository-pair level actually realized in the split (not just "on average") — i.e., no individual Test record predates the latest Training record from any repository. Validation is checked against the same rule relative to Training. |
| L6 | **Context leakage** | For every `source_issue_url` with more than one `context_tier` variant present anywhere across the six datasets, all variants resolve to the same dataset (Section 2.3). Also checks the Phase 5 §6 tier-boundary check still holds post-assembly: no dataset record's `available_context` contains content whose fetch tier exceeds its declared `context_tier`. |
| L7 | **Benchmark contamination** | Every record's `cleaned_view` fingerprint (Phase 5 §6) is re-checked against the current known-public-benchmark index at assembly time (not just at cleaning time — the benchmark index itself can grow between Phase 5 and Phase 7 running). Any new match routes the record out of Test/Validation immediately and re-flags `quality_flags: "benchmark_overlap"`; Training may retain it only if the original benchmark's own license/split conventions permit that use (checked against Phase 3 PS-4). |

**Cross-cutting rule:** L1–L7 additionally run pairwise against **Regression**, since Regression records are relocated *from* Test/Hard-case/Adversarial (Section 2.7) — a relocation must remove the record from its origin dataset in the same operation, and L1–L7 catch a relocation that copied instead of moved.

Any L1–L7 failure blocks dataset publication (Section 6) outright — these are hard gates, mirroring the discipline Phase 4 §8 and Phase 5 §5 already established for their respective stages.

---

## 5. Dataset Schemas

### 5.1 `DatasetRecord` — the unit stored in every dataset file
Extends Phase 3's `TrainingExample` (Section 1.3 of Phase 3) with split/dataset-specific metadata. The `TrainingExample` fields (`example_id`, `input`, `ground_truth`, `label_provenance`, `quality_status`) are carried through unchanged.

```yaml
DatasetRecord:
  example_id: uuid                          # unchanged from TrainingExample

  input: { ... }                            # unchanged
  ground_truth: TaskUnderstandingRecord      # unchanged (Phase 2 shape, schema_version: 2.x.x)
  label_provenance: { ... }                  # unchanged (Phase 3 §1.3), now the authority for the L-series temporal/repo checks
  quality_status: { ... }                    # unchanged

  dataset_assignment:
    dataset_id: string                       # which of the six datasets this record currently lives in
    dataset_version: string                  # version of that dataset at which this record was assigned (Section 6)
    split_assignment_method: "hash_bucket" | "curated" | "relocated"
    inclusion_reason:                        # required for Hard-case, Adversarial, Regression; null for Training/Validation/Test
      type: "disagreement" | "contrast_pair" | "low_confidence" | "failure_mode_probe" | "prior_model_failure" | null
      detail: string | null
      failure_mode_targeted: string | null   # Adversarial only — e.g. "experience_complexity_collapse", "fabricated_grounding_bait"
      source_model_version: string | null    # Regression only — which model version first failed this record
    relocation_history:                      # empty unless the record has moved datasets (Regression carve-outs, Section 2.7)
      - from_dataset_id: string
        to_dataset_id: string
        relocated_at: datetime
        reason: string
```

### 5.2 `DatasetStatistics` block
```yaml
DatasetStatistics:
  volume: { total: int, by_context_tier: {...}, by_repo: {top_n: [...], long_tail_summary: {...}} }
  label_distribution:
    role: {...}
    experience_level: {...}
    complexity: {...}
    task_type: {...}
    technologies: { top_n: [...], distinct_count: int }
    languages: { top_n: [...], distinct_count: int }
    frameworks: { top_n: [...], distinct_count: int }
    repo_type: {...}
    domain: {...}
    context_tier: {...}
  provenance:
    labeling_method: {...}
    quality_tier: {...}
    inter_annotator_agreement: { mean: float, by_field_category: {...} }
    provenance_source: {...}
  balance_verdict:
    - axis: string
      floor: float | null
      ceiling: float | null
      observed: float
      status: "pass" | "fail" | "no_target_defined"
```

### 5.3 `DatasetQualityMetrics` block
```yaml
DatasetQualityMetrics:
  leakage_tests: { L1: pass|fail, L2: pass|fail, ..., L7: pass|fail, checked_at: datetime }
  schema_validity_rate: float          # % of records passing Phase 2 schema validation
  duplicate_rate: float                # within-dataset, distinct from cross-dataset L3/L4
  mean_confidence: float               # from ground_truth.confidence.overall_confidence
  review_required_rate: float          # % of records with review.review_required == true
```

---

## 6. Versioning System

### 6.1 Identity fields — required on every dataset
Per the master prompt's explicit list, every dataset (not every record — the dataset as a whole) carries:

```yaml
DatasetManifestEntry:
  dataset_id: string                   # stable identifier, e.g. "training", "validation", "test", "hard_case", "adversarial", "regression"
  version: string                      # this dataset's own semver, e.g. "3.2.0"
  source_version: string               # Phase 4/5 corpus snapshot version this was built from
  annotation_version: string           # Phase 6 guideline version (Section 8.4 of Phase 6) in force when included records were labeled
  schema_version: string               # task-schema.v2.json version, e.g. "2.1.0" — must match every ground_truth.schema_version inside
  split_salt: string                   # Section 2.6 — the deterministic-assignment constant used, so re-derivation is possible
  record_count: int
  statistics: DatasetStatistics
  quality_metrics: DatasetQualityMetrics
  provenance:
    built_at: datetime
    built_by: string                   # pipeline run identifier, not a person
    upstream_snapshots:
      collection_snapshot_id: string   # Phase 4
      cleaning_snapshot_id: string     # Phase 5
      annotation_snapshot_id: string   # Phase 6
    change_summary: string             # human-readable, required on every version bump
```

### 6.2 Semver rules for dataset versions
- **MAJOR** — any change that could shift model behavior in a way a consumer must not silently absorb: `split_salt` change (Section 2.6), a change to which repositories are eligible at all, a `schema_version` bump that isn't backward-compatible (Phase 2 §5's own MAJOR rule propagating here), or removing records from Training/Validation/Test.
- **MINOR** — additive and backward-compatible: new records added to Training via a new annotation batch, new Hard-case/Adversarial records added, a Regression relocation (Section 2.7) that adds to Regression without altering existing membership elsewhere in a way not already covered by MAJOR.
- **PATCH** — no membership change: corrected statistics, corrected `quality_metrics`, documentation/manifest metadata fixes.
- Every one of the six datasets versions **independently** — adding new Adversarial records bumps Adversarial's MINOR version only, not Training's, since Training's actual example set didn't change. A release (Section 8) pins one version of each of the six together.

### 6.3 Test-set freeze discipline
Test is versioned like the others, but with an added rule specific to its purpose: once a Test version is published and used for any reported evaluation number, it is **never modified in place**, even for a PATCH-level statistics fix (those go out as a new PATCH version with the old version's numbers preserved in history) — a Test set that silently changed under a fixed version string would invalidate every prior comparison against it. This directly operationalizes the master-prompt requirement that "the test set must represent unseen engineering work": unseen-ness is a property that can only be trusted if the set is provably stable once frozen.

### 6.4 Reproducibility guarantee
Given `{source_version, annotation_version, split_salt}`, Section 2's deterministic hash-bucket assignment plus Section 1's rule-based sourcing (not manual curation, except where §5.1's `split_assignment_method: curated` is explicitly logged) means the entire Training/Validation/Test partition — and the eligibility pool for Hard-case/Adversarial — can be **mechanically re-derived** from those three inputs, not just replayed from a stored file. The stored files remain the source of truth for actual use (re-deriving is a verification step, not the primary access path), but this guarantee is what makes the split auditable rather than a black box.

---

## 7. Dataset Validation Tests

Same fixture discipline as Phase 2 §8 and Phase 5 §7 — each states input shape, expected result, and the rule exercised.

| # | Case | Input shape | Expected result | Rule exercised |
|---|---|---|---|---|
| D1 | Record schema conformance | A `DatasetRecord` sampled from each of the six datasets | `ground_truth` validates against Phase 2 schema; `dataset_assignment` present and internally consistent (e.g. `inclusion_reason` non-null iff dataset is Hard-case/Adversarial/Regression) | Section 5.1 |
| D2 | Repo disjointness | Full `source_repo` sets for Training, Validation, Test | Pairwise empty intersection | L1 |
| D3 | Issue disjointness | Full `source_issue_url` sets, all six datasets | No URL appears twice | L2 |
| D4 | Cluster integrity | A known multi-member `dedup_cluster_id` spanning two repos (forked-repo case) | All members land in the same dataset | L4, Section 2.2 |
| D5 | Context-tier sibling integrity | An issue with Tier 1 and Tier 4 `TrainingExample`s both present in the corpus | Both variants assigned to the same dataset | L6, Section 2.3 |
| D6 | Temporal ordering | Latest Training `snapshot_fetched_at` vs. earliest Test `snapshot_fetched_at` for any shared-adjacent repo pairing | Test strictly later | L5 |
| D7 | No synthetic in eval sets | Full `label_provenance.labeling_method` set for Validation and Test | Zero `SYNTHETIC` entries | Section 1 |
| D8 | Reproducible assignment | Re-run hash-bucket assignment (Section 2.6) against a fixed `split_salt` and a frozen corpus snapshot, twice | Byte-identical repo→split mapping both runs | Section 6.4 |
| D9 | Regression relocation integrity | A record flagged for Regression carve-out from Test | Present in Regression with populated `relocation_history`; absent from Test; L1–L7 re-pass for the affected pair | Section 2.7, cross-cutting rule (Section 4) |
| D10 | Balance-verdict completeness | `DatasetStatistics.balance_verdict` for a published dataset | Every Phase 3 §8.1 axis with a defined floor/ceiling has a corresponding entry — none silently omitted | Section 3 |
| D11 | Version identity completeness | Any published `DatasetManifestEntry` | All required identity fields (Section 6.1) present and non-null; `schema_version` matches every contained record's `ground_truth.schema_version` | Section 6.1 |
| D12 | Frozen-test immutability | Attempted in-place edit to a previously-published Test version's record membership | Build/publish pipeline rejects the operation; a new version string is required | Section 6.3 |
| D13 | Adversarial tagging completeness | Every record in Adversarial | `inclusion_reason.failure_mode_targeted` is non-null and drawn from a defined, documented set of failure modes (not freeform per record) | Section 5.1 |
| D14 | Cross-dataset leakage after relocation | Full corpus scan post-relocation event | L1–L7 all re-pass, specifically re-checking the relocated record's new and old dataset | Section 4 cross-cutting rule |

---

## 8. Dataset Manifest

A single manifest file accompanies every **release** (a pinned set of all six dataset versions published together). Shape:

```yaml
DatasetRelease:
  release_id: string                     # e.g. "release-2026-09"
  released_at: datetime
  datasets:
    training: DatasetManifestEntry
    validation: DatasetManifestEntry
    test: DatasetManifestEntry
    hard_case: DatasetManifestEntry
    adversarial: DatasetManifestEntry
    regression: DatasetManifestEntry
  cross_dataset_checks:
    leakage_tests: { L1: pass, L2: pass, ..., L7: pass }
    validation_tests: { D1: pass, D2: pass, ..., D14: pass }
  file_hashes:
    training: sha256
    validation: sha256
    test: sha256
    hard_case: sha256
    adversarial: sha256
    regression: sha256
  known_issues: [string]                 # any documented, accepted gap (e.g. a balance_verdict "fail" the team consciously accepted for this release) — never silently absent if one exists
```

**Publication gate:** a release cannot be published unless every entry under `cross_dataset_checks` is `pass`. This is the Phase 7 equivalent of Phase 4/5's hard quality gates — a release with any failing leakage or validation test is not a "degraded but usable" release, it is not a release at all.

---

## 9. Phase-7 Decision Record

| Decision | Rationale |
|---|---|
| Six datasets, mutually exclusive by `example_id`, rather than overlapping "views" over one pool | Overlap between, say, Training and Hard-case would let a targeted-difficulty measurement be inflated by memorization; disjointness is what makes each dataset's number mean what it claims to mean |
| Repository is the unit of split assignment, with near-dup clusters and context-tier siblings as override rules | Directly executes Phase 3 CP-1/CP-2 and closes the one gap Phase 3/5 left unaddressed — that a single issue backs multiple context-tier examples which must not be split from each other (Section 2.3, the "context leakage" control) |
| Deterministic hash-bucket assignment (`split_salt`) as the split mechanism, with the manifest table as a derived artifact | Satisfies "create reproducible splits" as a structural guarantee rather than a promise about a stored file; also makes a `split_salt` change auditable as an explicit MAJOR version event instead of a silent reshuffle |
| Test set is frozen and versioned separately from a continuously-growing Training set | The master prompt's "must represent unseen engineering work" requirement only holds if Test is provably stable once numbers are reported against it — mutable eval sets invalidate their own history |
| Regression is append-only and built by relocation, never by copy | A copied-not-moved record would silently reintroduce it into whatever dataset it came from, defeating Regression's purpose and creating exactly the kind of leakage L1–L7 are designed to catch; relocation is logged so the "why is this here" question always has an answer |
| Adversarial records require a `failure_mode_targeted` tag drawn from a defined set, not freeform text | Makes the dataset queryable by failure mode (so "are we covering fabricated-grounding bait adequately" is answerable directly) and keeps it anchored to Phase 1 §9's actual named failure criteria rather than drifting into generic "hard examples," which is what Hard-case is already for |
| Leakage tests (Section 4) re-run at assembly time even though Phase 3/4/5 already specify the same controls upstream | Per Phase 3 CP-7's own re-verification principle, a bug in split-assembly logic itself is a distinct risk from a bug in upstream collection/cleaning; trusting upstream reservation without re-checking the final artifact would be exactly the "verified once, assumed stable" failure Phase 3 warns against |
| Balance is measured and reported (`balance_verdict`), not silently enforced to a hard pass/fail for every axis | Some Phase 3 §8.1 floors are aspirational and may not be reachable in early releases without over-relying on synthetic data (itself bounded, Section 1); making the gap visible is more honest than either quietly failing to meet it or forcing it through excessive synthetic augmentation |
| No model architecture, training procedure, or loss design introduced | Matches the explicit task boundary; Phase 7 defines what data exists, in what shape, under what guarantees — not how anything downstream consumes it |
