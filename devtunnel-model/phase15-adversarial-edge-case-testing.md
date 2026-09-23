# Phase 15 — Adversarial & Edge-Case Testing
## Specialized AI Software Engineering Model: The Adversarial Test Framework for ITU-1

Source of truth: Phase 1 (§7 hard boundaries, §9 failure criteria, §10 uncertainty policy), Phase 2 (`task-schema.v2.json`, `sourceType` vocabulary), Phase 6 (annotation process, reviewer pool, adjudication discipline), Phase 7 (§1 six-dataset architecture — specifically the **Adversarial** and **Hard-case** datasets, §4 leakage tests, §5.1 `DatasetRecord.inclusion_reason`, §7 D13's requirement for a "defined, documented set" of `failure_mode_targeted` values), Phase 8 (§10 H1–H5 deterministic validators), Phase 12 (§7 context-tier evaluation), Phase 14 (§1 L0–L3 evaluation layers, §10 reporting cube, §11 acceptance-threshold philosophy). This document does not redefine any of them.

**Scope boundary.** Phase 15 produces the **Adversarial Test Framework**: a taxonomy of adversarial/edge-case categories, the `failure_mode_targeted` vocabulary Phase 7 D13 left deferred, a formal test-case schema, generation rules for constructing new cases, an expected-behavior specification for the master prompt's eight test dimensions, a hard-confusable-pair matrix, an automated test suite, a human-review protocol, and failure thresholds. It does **not**:
- Create a seventh dataset. Every test case produced here is a `DatasetRecord` that lives in Phase 7's existing **Adversarial** or **Hard-case** dataset, tagged per this phase's vocabulary — Phase 15 populates and formally specifies what Phase 7 structurally reserved but did not enumerate.
- Redefine Phase 14's metrics, layers, or reporting cube. Phase 15's test cases are inputs to that framework — an additional, adversarially-constructed slice run through the same L0–L3 layers and reported on the same seven-axis cube, plus one new axis (Section 6) specific to this phase.
- Train or fine-tune anything. Like Phase 14, this phase is measurement-only; a case the model fails routes back to whichever training phase (10–13) owns the relevant capability.
- Decide release or serving (Phase 1 §14).

---

## 0. Position in the Pipeline

```
Phase 7 output: Adversarial + Hard-case datasets   (structurally reserved,
                                                     failure_mode_targeted
                                                     left as a deferred,
                                                     to-be-defined vocabulary)
Phase 14 output: Evaluation Framework               (L0–L3, seven-axis
                                                      reporting cube)
        │
        ▼
Phase 15 (this phase): defines the vocabulary Phase 7 deferred, and
   builds the actual adversarial/edge-case test content that framework
   is run against — not a new dataset, not a new metric layer
        │
        ▼
Phase 15 deliverable: taxonomy + failure_mode_targeted vocabulary +
   test-case schema + generation rules + automated/human test suites +
   thresholds, applied to populate Adversarial/Hard-case
        │
        ▼
[feeds] Phase 14 Evaluation Reports (Adversarial/Hard-case rows already
   exist in Phase 14 §10's cube; Section 6 adds one reporting axis)
```

**Why this phase, and why now.** Phase 7 could reserve *space* for adversarial data (§1's table) and require a `failure_mode_targeted` tag (§5.1), but had no mandate to define engineering test content — that is a testing-methodology problem, not a dataset-partitioning problem. Phase 14 could build the *measurement* machinery (L0–L3, the reporting cube) but explicitly treats datasets as inputs, not something it constructs. Phase 15 is the one place in the pipeline whose job is specifically to think adversarially about the model's own failure surface and turn that thinking into concrete, taggable, re-runnable test cases — closing Phase 7 D13's open gap and giving Phase 14 something harder to evaluate against than naturally-occurring Test-set issues.

---

## 1. Adversarial Test Taxonomy

The master prompt's nineteen named categories cluster into six mechanism groups. Each group is mapped to the Phase 1 §9 failure criterion it is designed to expose, and to a `failure_mode_targeted` value (Section 2) — the vocabulary Phase 7 D13 requires.

| Group | Master-prompt categories | Phase 1 §9 failure exposed | `failure_mode_targeted` |
|---|---|---|---|
| **A. Keyword / label misdirection** | Misleading keywords, incorrect labels, repository-specific terminology, irrelevant context, conflicting context | §9.1 fabricated grounding via surface pattern-matching; §9.5 inventing components/tech from a decoy term | `keyword_misdirection`, `label_authority_override` (Phase 1 §7.6 — model must evaluate content, not defer to an existing label) |
| **B. Requirement pathology** | Contradictory requirements, missing requirements, ambiguous language | §9.4 failing to flag genuine ambiguity | `unflagged_ambiguity`, `forced_resolution_of_contradiction` |
| **C. Structural complexity** | Multiple roles, multiple technologies, mixed frontend/backend work | §9.3 (adjacent) — collapsing a genuinely composite task into a single-axis label instead of the correct composite/`Fullstack` read | `role_collapse`, `technology_anchoring` (fixating on the first- or most-frequently-named technology) |
| **D. Depth/size mismatch** | Hidden complexity, superficially simple but technically deep, large but technically simple | §9.3 conflating task size/length with experience or complexity | `size_complexity_conflation`, `depth_underestimation` |
| **E. Domain-sensitive framing** | Security-sensitive issues, performance issues | §9.2 unwarranted confidence; tone-driven miscalibration | `tone_driven_confidence_shift` |
| **F. Malformation / length extremes** | Malformed issues, very short issues, very long issues | §9.6 unparseable output; §9.4 failure to abstain | `structural_non_robustness`, `underabstention` (short), `relevance_drift` (long) |

Every test case is tagged with exactly one **primary** group and may carry one or more secondary `failure_mode_targeted` values when a case deliberately compounds mechanisms (Section 3.5).

---

## 2. `failure_mode_targeted` Vocabulary (closes Phase 7 §7 D13)

Phase 7 D13 requires this set to be "defined, documented... not freeform per record." The registry:

| Value | Definition | Ground-truth signature that constitutes a **pass** |
|---|---|---|
| `keyword_misdirection` | A term strongly associated with one classification appears in the issue with no supporting engineering signal for that classification | Classification matches the *engineering* content, not the term; `provenance` for the affected field cites no evidence pointer to the decoy term |
| `label_authority_override` | Issue's existing GitHub label(s) conflict with what the issue text actually describes | Model's classification follows text content; if it disagrees with the label, disagreement is flagged (Phase 1 §7.6), not silently overridden or silently deferred to |
| `unflagged_ambiguity` | Issue text is genuinely indeterminate on a field | Field returns `Unknown`, `source: UNKNOWN`, non-null `flagged_ambiguities`/`missing_information` entry |
| `forced_resolution_of_contradiction` | Issue contains two mutually exclusive statements bearing on the same field | Field is not resolved by silent tie-breaking; `review.review_required: true` with a `review_reasons` entry naming the contradiction |
| `role_collapse` | Issue genuinely spans two roles (e.g., API contract change + the UI that consumes it) | `role: Fullstack` (or the correct composite), not the role of whichever half was mentioned first or most |
| `technology_anchoring` | Multiple technologies appear; one is incidental (e.g., named only in a stack trace) | `technologies`/`languages`/`frameworks` reflect actual involvement, not raw mention frequency; incidental mentions are not promoted to `components`/`systems` |
| `size_complexity_conflation` | Issue length/word count is a poor proxy for `complexity` or `experience_level` | Both fields independent of raw length (Phase 1 §8 criterion 5, reused verbatim) |
| `depth_underestimation` | Issue reads as simple but the underlying engineering work is not (e.g., "just add a column" that actually requires a migration strategy) | `complexity` reflects the actual work implied, with `evidence`/`objective` surfacing the non-obvious part — not the surface-level phrasing |
| `tone_driven_confidence_shift` | Issue is written with urgency/alarm (security) or flatly (performance) independent of actual severity | `task_type` and `confidence` track engineering content, not affect; a calmly-worded security issue is not under-classified, an urgently-worded minor one is not over-classified |
| `structural_non_robustness` | Issue text is truncated, has broken markdown/encoding, or is otherwise malformed | Output is still 100% schema-valid (H1); degrades via H5's lattice (repair → downgrade → abstain), never crashes or emits invalid JSON |
| `underabstention` | Issue is extremely short (a title-only stub, one sentence) | Most/all classification fields `Unknown`; `missing_information` is populated and specific, not a generic filler string |
| `relevance_drift` | Issue is very long, containing tangents unrelated to the actual task | Generated prose (title/summary/objective) reflects only the task-relevant portion; irrelevant tangents are not carried into `description`/`scope.in_scope` |

A case may target more than one value only when the compounding is itself the point (Section 3.5); the *primary* value is always the one used for `failure_mode_targeted` in reporting (Section 6), with secondaries logged in `inclusion_reason.detail`.

---

## 3. Test Case Schema and Generation Rules

### 3.1 `AdversarialTestCase` — extends Phase 7's `DatasetRecord`
No new top-level dataset; this is the `DatasetRecord` shape (Phase 7 §5.1) with its `inclusion_reason` fully populated and one addition needed for adversarial-specific grading:

```yaml
AdversarialTestCase:                       # a DatasetRecord living in Adversarial or Hard-case
  example_id: uuid
  input: { ... }                           # unchanged (Phase 3 shape)
  ground_truth: TaskUnderstandingRecord     # unchanged (Phase 2 shape)
  label_provenance: { labeling_method: "SYNTHETIC", ... }   # per Phase 3 ER-8, unchanged
  quality_status: { ... }                  # unchanged

  dataset_assignment:
    dataset_id: "adversarial" | "hard_case"
    inclusion_reason:
      type: "failure_mode_probe" | "contrast_pair"
      detail: string
      failure_mode_targeted: string        # Section 2 registry — exactly one primary value
      secondary_failure_modes: [string]    # optional, Section 3.5

  adversarial_metadata:                    # new — Phase 15-specific, additive, does not alter
                                            # Phase 7's DatasetRecord contract
    taxonomy_group: "A" | "B" | "C" | "D" | "E" | "F"
    construction_method: "real_issue_perturbation" | "synthetic_construction" | "contrast_pair_derivation"
    bait_element: string                   # the specific decoy keyword/label/tone/structure inserted
    contrast_pair_id: uuid | null          # links to the "easy" sibling case (Section 5)
    expected_behavior_refs: [string]       # which Section 4 dimension(s) this case tests
```

### 3.2 Construction methods
- **Real-issue perturbation** — take a genuine, already-annotated issue and edit exactly one axis (inject a decoy keyword, strip a sentence to create a missing requirement, append a contradictory clause). All other content is untouched, so the ground truth for every *other* field is inherited unchanged and only the perturbed field's ground truth is re-annotated.
- **Synthetic construction** — write a new issue from scratch to bait a specific `failure_mode_targeted` value cleanly, used where no real issue exposes the mechanism in isolation (e.g., a title-only stub for `underabstention`).
- **Contrast-pair derivation** — construct two issues differing in exactly the dimension under test (Section 5), holding everything else fixed, so a classification difference between the pair is attributable only to that dimension.

### 3.3 Group-specific generation rules
| Group | Rule |
|---|---|
| A | The bait term must have **zero** independent supporting signal elsewhere in the issue; if the term happens to also be genuinely supported by other content, the case tests nothing and is rejected at review (Section 8) |
| B | A contradiction case must contain **both** conflicting statements verbatim, not a single ambiguous one (that is Group B's "ambiguous language" sub-case instead) — the two failure sub-modes (`unflagged_ambiguity` vs. `forced_resolution_of_contradiction`) are never merged into one case |
| C | A multi-role/multi-tech case must have genuine, independently-verifiable engineering involvement on both sides (checked by a Phase 6-caliber reviewer, Section 8) — otherwise it degenerates into Group A's `technology_anchoring` |
| D | Depth must be established by an independent technical read (what would actually implementing this require), never by the issue author's own framing of difficulty |
| E | Tone and engineering content are varied **independently** — the taxonomy requires at least four cells per topic (security×urgent, security×flat, performance×urgent, performance×flat) so tone cannot correlate with the outcome by construction |
| F | Malformation cases are generated by mechanical corruption (truncation, encoding breakage, markdown injection) of a real issue, not by hand-authoring "weird" text, so the corruption is reproducible and graded against H1/H5 objectively |

### 3.4 What every case must NOT do
Per the master prompt's own worked example ("Update the frontend documentation for the backend API" — do not classify simply because "backend" appears): no test case's bait element may be the *only* signal in the issue. A case where the decoy term is also the only content is not a hard case, it is an underspecified one, and is routed to Group B (`unflagged_ambiguity`) instead, with ground truth `Unknown`.

### 3.5 Compounding
A small, explicitly-tagged subset of cases combine two mechanisms (e.g., a security-toned issue that is also very short) to probe interaction effects Phase 14's per-cell reporting (Section 6) would otherwise miss. Compounded cases are capped at a minority share of each dataset version (target ≤ 15%, empirical per Phase 14 §11's philosophy) so single-mechanism attribution remains possible for the bulk of the suite.

---

## 4. Expected Behavior Specification

The master prompt names eight things to test for. Each is given a measurable pass/fail criterion, binding it to an existing mechanism rather than inventing a new one.

| # | Test dimension | Bound to | Pass criterion |
|---|---|---|---|
| 1 | **Engineering intent** | Group A/C cases | Classification reflects the actual work implied by the issue's technical content, independent of surface labels or the most-repeated term (Phase 1 §7.6) |
| 2 | **Keyword independence** | Group A, `keyword_misdirection` | A metamorphic test (Section 7.1): inserting/removing an unsupported decoy term must not change any classification whose ground truth doesn't depend on it |
| 3 | **Uncertainty detection** | Group B, `unflagged_ambiguity` | `Unknown` + `flagged_ambiguities`/`missing_information` populated wherever the issue is genuinely indeterminate (Phase 1 §10) |
| 4 | **Unsupported-assumption prevention** | Groups A/D, H2 | No field's `evidence` cites a pointer that doesn't support the claimed value; no `EXPLICIT`/`SUPPORTED_BY_CONTEXT` source on content the issue doesn't contain (Phase 8 §10.2, reused) |
| 5 | **Schema validity** | Group F, H1 | 100% of outputs, including on malformed input, are valid `TaskUnderstandingRecord`s (Phase 1 §8 criterion 6, non-negotiable, reused from Phase 14 §11) |
| 6 | **Source faithfulness** | All groups, H2 + Phase 14 §2.2 | Generated prose (title/summary/objective/description) matches only what the issue text supports; on Group F "very long" cases, this specifically checks `relevance_drift` |
| 7 | **Context handling** | Groups A ("irrelevant/conflicting context") | Where richer context (Phase 12 tiers ≥2) is available, irrelevant context is not absorbed into a claim, and conflicting context (e.g., stale repo docs vs. current issue text) triggers `review_required`, not silent preference for one source |
| 8 | **Confidence calibration** | Group E + Hard-case pairs (Section 5) | Confidence tracks source-type strength (Phase 1 §10), not framing/tone; measured via Phase 14 §8's calibration machinery, reused, run specifically against this suite's cases |

---

## 5. Hard-Confusable-Pair Matrix

Each pair below is a **contrast-pair-derived** family (Section 3.2) targeting the exact boundary the master prompt names. The "collapse mode" column names which Phase 1 §9 failure occurs if the model can't hold the boundary.

| Pair | Discriminating signal the model must find | Collapse mode if missed | Construction rule |
|---|---|---|---|
| Beginner ↔ Intermediate | Whether the issue requires reasoning about *why* a fix works, not just *where* to apply it, independent of issue length | `size_complexity_conflation` | Hold task length fixed across the pair; vary only whether the fix requires understanding a mechanism vs. following a known pattern |
| Intermediate ↔ Advanced | Whether the task requires reasoning about system-wide consequences (concurrency, backward compatibility, cross-service contracts) vs. a well-scoped local change | `depth_underestimation` | Vary only the presence/absence of a stated or strongly-implied cross-cutting concern |
| Frontend ↔ Fullstack | Whether the issue requires a genuine, independently-verifiable backend-side change, or only *describes* backend behavior the frontend must consume | `role_collapse` | Hold the frontend-facing description near-identical; vary only whether a backend contract change is actually required |
| Backend ↔ Fullstack | Symmetric to the above, varying whether a UI-facing change is actually required vs. merely mentioned in passing | `role_collapse` | Same construction, mirrored |
| Feature ↔ Improvement | Whether new user-facing capability is added, vs. an existing capability made better along an existing dimension (speed, clarity, robustness) with no new capability | Task-type confusion (adjacent to §9.5's "invents...not implied") | Vary only whether the change adds a new capability or strengthens an existing one; keep scope/effort comparable |
| Bug ↔ Maintenance | Whether current behavior violates a stated/implied specification (bug) vs. behavior is correct but the implementation needs non-functional upkeep (maintenance) | Task-type confusion | Vary only whether user-visible behavior is wrong vs. merely the implementation being stale/deprecated-dependency-driven |
| Low ↔ Medium | Whether the change touches one well-isolated unit vs. requires coordinating more than one, independent of line-count | `size_complexity_conflation` | Hold estimated diff size roughly fixed; vary only the number of components/systems genuinely touched |
| Medium ↔ High | Whether the change has a knowable, bounded solution path vs. requires exploration/design decisions with real trade-offs | `depth_underestimation` | Vary only whether the issue leaves a design decision genuinely open |

Each pair produces a minimum of 20 constructed instances per release (empirical minimum, revisited per Section 9), stored in Hard-case with `inclusion_reason.type: "contrast_pair"` and cross-linked via `adversarial_metadata.contrast_pair_id`.

---

## 6. Relationship to Phase 7 Datasets and Phase 14 Reporting

No new dataset. Every case constructed under Sections 3–5 is inserted into Phase 7's **Adversarial** (`failure_mode_probe` cases) or **Hard-case** (`contrast_pair` cases) dataset, subject unchanged to Phase 7 §4's leakage tests (L1–L7, including exemption from the pairwise repo-disjointness check but not from L2–L7) and §7's validation tests (D1–D14, including D13's now-satisfied requirement).

Phase 14's seven-axis reporting cube (§10) gains one additional axis specific to this suite:

| Reporting axis | Source |
|---|---|
| Taxonomy group / `failure_mode_targeted` | Section 1/2 (this phase) |

A Phase 14 `EvaluationRun` against Adversarial/Hard-case must report every Section 4 dimension broken out by this axis — an aggregate adversarial pass rate, without a per-`failure_mode_targeted` breakdown, does not satisfy Phase 14 §10's "cube, not a scalar" rule any more than an aggregate accuracy number would.

---

## 7. Automated Tests

Deterministic, no human judgment required — run as part of every Phase 14 evaluation pass over Adversarial/Hard-case.

| # | Test | Mechanism | Pass criterion |
|---|---|---|---|
| AT1 | **Keyword-independence (metamorphic)** | For every Group A case, run the model on the original and on a version with the bait term masked/removed | Classification for any field not evidenced by the term is identical in both runs |
| AT2 | **Schema validity under malformation** | Run every Group F case through H1 | 100% pass; zero unparseable outputs |
| AT3 | **Structural degradation lattice** | Run every Group F case through H5 | Degradation follows repair → downgrade → abstain in order; reject only when the input is unrecoverable, never as a first response |
| AT4 | **Grounding ceiling on bait elements** | H2, restricted to the `evidence` pointer(s) touching the bait element (Groups A, E) | No field claims a source stronger than the segment's ceiling (Phase 8 §2.A) on the bait content specifically |
| AT5 | **Abstention rate on short-stub cases** | Count `Unknown` fields on `underabstention`-tagged cases | Fraction of fields returned `Unknown` exceeds an empirical floor (Section 9) — an all-guessed record on a title-only stub is a hard fail regardless of accuracy |
| AT6 | **Relevance on long cases** | Phase 14 §2.2 relevance metric, restricted to `relevance_drift`-tagged cases | No tangent segment (tagged at construction time) appears in generated prose |
| AT7 | **Contradiction non-resolution** | Check `review.review_required` and `review_reasons` on every `forced_resolution_of_contradiction` case | `review_required: true` with a reason naming the contradicted field; the contradicted field is not silently resolved to one side |
| AT8 | **Calibration delta on contrast pairs** | Phase 14 §8 calibration machinery, applied within each Section 5 pair | Confidence does not increase when the *harder* side of a pair is classified correctly by coincidence — checked via the pair's expected confidence ordering, not absolute value |
| AT9 | **Tone invariance** | Compare classification/confidence across the four tone×topic cells (Group E, Section 3.3) | `task_type` and `confidence` distributions do not differ by tone cell beyond noise (statistical test, threshold empirical) |

---

## 8. Human-Review Tests

Reuses Phase 6's reviewer pool and adjudication discipline (per Phase 14 decision #6's precedent — no new, differently-calibrated review process is introduced). Used where correctness depends on judgment AT1–AT9 cannot mechanically verify:

| # | Test | What reviewers judge |
|---|---|---|
| HT1 | Engineering-intent correctness on Group A cases | Does the classification reflect real engineering content, or a plausible-sounding but keyword-driven guess a domain expert would reject? |
| HT2 | Role-split correctness on Group C cases | Is the `Fullstack`/composite call actually correct, i.e. does independently-verifiable work exist on both named sides? (Also gates case *construction* quality, Section 3.3.) |
| HT3 | Depth-assessment correctness on Group D cases | Does the model's `complexity`/`objective` surface the non-obvious engineering work, or does it echo the issue's own (possibly misleading) framing of difficulty? |
| HT4 | Security/performance risk read on Group E cases | Independent of tone, is the actual risk/urgency correctly represented in `task_type`/`description`, not just in `confidence`? |
| HT5 | Case-construction quality gate | Before a newly-constructed case enters Adversarial/Hard-case, a reviewer confirms it satisfies Section 3.4 (bait is not the only signal) — this is a gate on the *test suite itself*, run once at authoring time, not per evaluation run |

Sample sizes for HT1–HT4 follow Phase 14 §5's stratified draw discipline (deferred to that section, not re-specified here); HT5 is exhaustive (every new case, once, at authoring time).

---

## 9. Failure Thresholds

Following Phase 14 §11's philosophy — thresholds are empirical and per-cell except where a Phase 1 criterion makes them non-negotiable:

- **AT1 (keyword independence), AT7 (contradiction non-resolution), AT2 (schema validity under malformation)** — hard, 100%-or-fail, no empirical tuning. These directly instantiate Phase 1 §9 criteria 1, 4, and 6; a partial pass rate here is not a quality gradient, it is the failure the criterion exists to catch (mirrors Phase 14 §11's treatment of L0 structural validity and hallucination ceilings).
- **AT3 (degradation lattice ordering)** — hard: a `reject` emitted where `repair` or `downgrade` was available is a fail, not a threshold.
- **AT5 (abstention floor on short stubs), AT6 (relevance on long cases), AT8 (calibration delta), AT9 (tone invariance)** — empirical, set per Phase 14 §11's per-cell practice once a baseline run exists against a populated Adversarial/Hard-case set.
- **Human-review tests (HT1–HT4)** — reported as agreement rates alongside, never merged into, the automated metrics (Phase 14 §10's labeled-column rule, reused); no numeric gate is fixed here, per that section's precedent of empirical, evidence-backed thresholds.
- **Hard-confusable-pair matrix (Section 5)** — per-pair accuracy and calibration-ordering thresholds are empirical, but a pair's *systematic* collapse (accuracy at or below the majority-class baseline for that pair) is treated as a hard fail regardless of the tuned threshold, since a pair failing at chance-or-worse means the boundary Section 5 targets does not exist in the model at all.

---

## 10. Phase-15 Decision Record

| # | Decision | Rationale |
|---|---|---|
| 1 | Phase 15 populates Phase 7's existing **Adversarial**/**Hard-case** datasets rather than defining a seventh dataset | Phase 7 §1 already reserved exactly this purpose; a new dataset would duplicate machinery (leakage tests, statistics, manifest) Phase 7 already owns |
| 2 | The `failure_mode_targeted` registry (Section 2) is defined here, closing Phase 7 §7 D13's deferred requirement | D13 required the set to be "defined, documented... not freeform," but Phase 7's own scope was dataset partitioning, not test-content design — this phase is the correct owner |
| 3 | Six taxonomy groups (Section 1), each mapped to a specific Phase 1 §9 failure criterion | Prevents the taxonomy from drifting into a generic "hard examples" bucket, which is what Hard-case's non-adversarial contrast pairs are already for (Phase 7 §1) — every adversarial category here traces to a named failure, not a vague notion of difficulty |
| 4 | Bait elements must carry **zero** independent supporting signal (Section 3.4), enforced as a construction rule, not just a grading rule | Directly executes the master prompt's own worked example — a case where the keyword is the only content tests abstention, not keyword-independence, and mislabeling it would corrupt AT1's meaning |
| 5 | Tone and engineering severity are varied **independently** in Group E (four-cell design) | The only way to prove `tone_driven_confidence_shift` isn't occurring is to break the correlation between tone and severity by construction — a correlational dataset could not distinguish "correctly detects real urgency" from "keys off alarming language" |
| 6 | Hard-confusable pairs (Section 5) hold one dimension fixed and vary only the discriminating signal | Isolates attribution — without holding length/scope fixed across a Beginner/Intermediate or Low/Medium pair, a boundary failure could not be distinguished from ordinary noise, defeating the pair's purpose |
| 7 | Automated tests (AT1–AT9) are graded mechanically wherever possible; human review (HT1–HT5) is reserved for judgment Section 7's tests structurally cannot verify | Matches Phase 14 §10's labeled-column discipline and avoids inflating the human-review burden for checks a metamorphic or rule-based test already settles definitively |
| 8 | Three test families (AT1, AT2, AT7) plus AT3's ordering rule are **hard gates**, not tuned thresholds | Each instantiates a non-negotiable Phase 1 §9 criterion (1, 4, 6) already treated as hard by Phase 1 §8/§14 §11 precedent; making them tunable would reopen a question Phase 1 already closed |
| 9 | A pair's systematic at-or-below-chance collapse (Section 9) is a hard fail independent of its tuned threshold | An empirically-set threshold can be cleared by a model that has simply learned the majority class for that pair; a chance-or-worse check catches the case the tuned threshold alone would miss |
| 10 | Case-construction quality (HT5) is itself a gated, reviewed step, run once at authoring time | An adversarial suite is only as good as its bait is clean (Section 3.4); without a construction-time gate, a poorly-built case could silently corrupt every metric it feeds into downstream, indefinitely |
| 11 | No new dataset, no new model architecture or training procedure, no release decision | Matches the explicit task boundary and this project's consistent practice of keeping phase ownership disjoint |

### Open items (deliberately deferred, not forgotten)
- **Numeric floors for AT5, AT6, AT8, AT9** and **per-pair (Section 5) accuracy/calibration thresholds** — set empirically once a baseline run exists against a populated suite, per Phase 14 §11's practice.
- **Minimum case counts per `failure_mode_targeted` value and per taxonomy group** — a coverage-adequacy question, revisited once real volume exists (parallels Phase 7 §3's balance-verdict treatment).
- **Statistical test and significance threshold for AT9's tone-invariance check** — a methodology detail appropriate to set once real tone-cell data exists, not fixed here.
- **HT1–HT4 sample sizes** — deferred to Phase 14 §5's stratified-draw process, unchanged.
- **Cadence for adding new taxonomy categories/failure modes as they're discovered** — reuses Phase 7 §1's "grows opportunistically" lifecycle for Adversarial, not a new process.
