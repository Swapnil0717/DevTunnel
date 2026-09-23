# Phase 3 — Data Strategy
## Specialized AI Software Engineering Model: Data Required to Train Issue → Task Understanding

Source of truth: Phase 1 (Formal Model Definition, ITU-1) and Phase 2 (Task & Output Schema, `task-schema.v2.json`). This document does not redefine the model or its output shape — it defines the **data required to teach the model to produce Phase 2-conformant records honestly**, i.e. with correct classifications, correct field-level provenance (`EXPLICIT` / `SUPPORTED_BY_CONTEXT` / `INFERRED` / `UNKNOWN`), and calibrated confidence. **No collection infrastructure, pipelines, storage, or training runs are specified here — strategy and rules only**, per the task boundary.

### 0. A note on "Phase," and on two different kinds of provenance

Two terms are overloaded across this project's documents and this one takes care to keep them apart:

- **"Phase"** in Phase 1 §13 names *context tiers the model consumes at inference time* (Tier 1 = issue only, Tier 2 = + repo structure, Tier 3 = + source code, … Tier 7 = + project conventions). **"Phase 3" in this document's title** names the *project workflow step* (Model Definition → Schema → Data Strategy). These are unrelated numbering tracks. To avoid confusion, this document refers to the model's context stages as **Context Tier 1–7** and reserves "Phase 3" for itself.
- **Field-level provenance** (Phase 1 §11, Phase 2 §3–4) is a *label the model must learn to produce* — for each output field, was it `EXPLICIT`/`SUPPORTED_BY_CONTEXT`/`INFERRED`/`UNKNOWN`, with what evidence and confidence. This is ground truth, not metadata about the training pipeline.
- **Data provenance** (this document, Section 7) is *metadata about a training example itself* — which repository it came from, when it was fetched, who or what produced its ground-truth labels, and how trustworthy that labeling process is. It is never shown to the model as input and never confused with field-level provenance in the schema.

This distinction is load-bearing for Section 7 and Section 4 below.

---

## 1. Complete Data Strategy

### 1.1 Guiding principle

The model must learn **software-engineering semantics**, not keyword correlations (e.g. "the word 'crash' → Bug", "issue is long → Advanced experience"). Two structural choices follow directly from this:

1. **Training examples must carry the same grounding discipline the model is required to output.** A model cannot be taught to say `INFERRED` honestly if a meaningful fraction of its training labels were themselves guessed without evidence. Ground-truth generation (however it is eventually done — human labeling, adjudicated multi-annotator labeling, or human-corrected model-assisted labeling) must itself produce evidence spans/paraphrases per field, not just final enum values. A label with no evidence is not usable ground truth for this model, regardless of how confident the labeler was.
2. **Training data must include genuine negative space** — issues where the correct answer to a field is `Unknown`, where `acceptance_criteria` is legitimately empty, where two similar-looking issues have different correct classifications. A dataset built only from clean, fully-resolvable issues teaches the model that abstention is never necessary, which is the exact failure mode Phase 1 §9 rules out.

### 1.2 What "the data" must jointly support

Per Phase 1/2, a single training example does not need to be sourced from a single artifact. It is built from three layers, matching the Input Specification's context tiers:

| Layer | Content | Always present? |
|---|---|---|
| **Core input** | Issue title, body, labels (as signal, not ground truth), comments | Yes |
| **Available engineering context** | Whatever of {repo structure, README, docs, source code, config, dependency graph, PRs, commit history, existing task descriptions} was actually available *at the context tier being trained for* | Varies by context tier — a Tier 1 example must not silently include Tier 3 information |
| **Ground truth + provenance** | The Task Understanding Record (Phase 2 shape) a qualified human (or adjudicated process) would produce from *exactly* that input + context, including field-level provenance | Yes |

The critical rule this table encodes: **an example is defined by what context was available when it was labeled, and that boundary must be enforced strictly.** Training the model with README content present in the input while labeling `technologies: []` as `INFERRED` (because the human labeler happened to also glance at the source code) silently teaches over-claiming. See Section 6 (Quality Rules, rule Q-CTX) and Section 9.

### 1.3 The training example schema (Input + Context + Ground Truth + Provenance + Quality Status)

Every training example is a single record of this shape. This is a **data specification**, distinct from and upstream of the model's own output schema (`task-schema.v2.json`) — though the `ground_truth` block below **is** a Task Understanding Record, because that is literally what the model must learn to produce.

```yaml
TrainingExample:
  example_id: uuid                        # internal to the dataset, not task_id

  input:                                    # exactly what the model would receive
    issue:
      title: string
      body: string
      labels: [string]                      # as-is, including if wrong/stale
      comments: [ { author_role: string, body: string, created_at: datetime } ]
    context_tier: 1-7                       # which Context Tier this example trains
    available_context:                      # only what the stated tier permits; empty for Tier 1
      repo_structure: object | null
      readme: string | null
      docs: [string] | null
      source_excerpts: [string] | null
      config: [string] | null
      dependency_graph: object | null
      related_prs: [object] | null
      commit_history: [object] | null

  ground_truth: TaskUnderstandingRecord     # Phase 2 shape, in full, including per-field provenance

  label_provenance:                         # DATA provenance — see Section 7. Not shown to the model.
    labeling_method: HUMAN_EXPERT | ADJUDICATED_MULTI_ANNOTATOR | MODEL_ASSISTED_HUMAN_CORRECTED | SYNTHETIC
    annotator_ids: [string] | null
    inter_annotator_agreement: float | null
    source_repo: string
    source_issue_url: string
    snapshot_fetched_at: datetime
    license: string
    labeled_at: datetime
    labeling_tool_version: string

  quality_status:
    tier: GOLD | SILVER | BRONZE | REJECTED  # see Section 6.5
    quality_flags: [string]                  # e.g. "near_duplicate_of:<id>", "low_agreement", "non_english_body"
    reviewed_by: string | null
    review_notes: string | null
```

A training example missing any of `input`, `ground_truth`, `label_provenance`, or `quality_status` is not usable — this mirrors Phase 1/2's own "missing required section is a hard failure, not a quality issue" stance, applied one level down to the data itself.

### 1.4 Non-goals of this document

Per the task boundary: no scraping infrastructure, no annotation tooling design, no storage/database schema, no model architecture, no training run, no labeling headcount/cost plan. This document defines *what data is needed, in what shape, under what rules* — the "what," not the "how it gets built."

---

## 2. Data Source Matrix

Each row states what the source is good for, what provenance category it can honestly support, which Context Tier it belongs to, and its principal risk.

| Source | Primary capabilities fed (§3 numbering) | Provenance category it can support | Context Tier introduced | Principal risk |
|---|---|---|---|---|
| Issue title | 1 Issue understanding, 4 Role, 6 Task-type | `EXPLICIT` | 1 | Titles are often uninformative or clickbait-y ("it's broken") |
| Issue body | 1, 2 Task extraction, 4–7, 13 Grounded generation | `EXPLICIT`, `SUPPORTED_BY_CONTEXT` | 1 | Wildly inconsistent quality; templated boilerplate can look like signal but isn't |
| Issue comments | 1, 9 Context understanding, 12 Uncertainty detection | `SUPPORTED_BY_CONTEXT` (rarely `EXPLICIT` unless comment is from the reporter clarifying) | 1 | Threads drift off-topic; a maintainer's *proposed* fix is not the same as the *agreed* scope |
| Labels | 4, 6, 9 | Signal only — **never** a direct source of `EXPLICIT`; at most supports `SUPPORTED_BY_CONTEXT` | 1 | Stale, inconsistent across repos, sometimes applied by bots with no semantic care (Phase 1 §4) |
| Milestones | 9, 11 Impact analysis (release scoping) | `SUPPORTED_BY_CONTEXT` | 1–2 | Reflects project planning, not technical scope |
| Repository metadata (stars, primary language, topics) | 7 Technical understanding, 9 | `SUPPORTED_BY_CONTEXT` | 2 | Primary-language metadata can be wrong for polyglot repos |
| README | 7, 8 Component understanding, 9 | `SUPPORTED_BY_CONTEXT` | 2 | Often stale relative to actual code |
| Documentation | 7, 9, 13 | `SUPPORTED_BY_CONTEXT` | 4 (per Phase 1 §13) | Same staleness risk, worse in under-maintained repos |
| Repository structure (file tree) | 8, 9 | `SUPPORTED_BY_CONTEXT` | 2 | Directory naming conventions vary enormously across ecosystems (Section 6) |
| Source code | 7, 8, 10 Dependency identification, 11 | `EXPLICIT` (only once Tier 3 verification exists — Phase 2 §2 notes `components` remain *unverified against code* through Tier 2), `SUPPORTED_BY_CONTEXT` before that | 3 | Large volume; must be excerpted/retrieved relevantly, not dumped wholesale |
| Configuration files | 7, 10 | `SUPPORTED_BY_CONTEXT` | 3 | Config often encodes environment-specific detail irrelevant to the issue |
| Dependencies / package graph | 10, 11 | `SUPPORTED_BY_CONTEXT` | 5 | Transitive dependency noise; must be scoped to direct, relevant deps |
| Pull requests | 11, 5 Complexity, 4 Role (precedent-based) | `SUPPORTED_BY_CONTEXT` for *training-time* ground-truth construction; **must never be given to the model as inference-time input for the issue it resolves** — see Section 9 (target leakage) | 6 | **High leakage risk** — the PR that closes an issue frequently states the answer outright |
| Commit history | 5, 11 | `SUPPORTED_BY_CONTEXT` | 6 | Same leakage risk as PRs when commits reference the issue |
| Existing task descriptions (from task trackers, if available) | 2, 13 | `SUPPORTED_BY_CONTEXT` | 2+ | May encode organization-specific conventions that don't generalize |
| Human corrections (post-hoc edits to model or human-drafted records) | All — used as high-value ground truth and as calibration signal | `EXPLICIT` (the correction itself is a stated fact) | N/A — training-time only | Corrections must be tied to a specific prior record version to avoid ambiguity about what was corrected |
| Human-generated engineering interpretations (expert write-ups of "what this issue actually means") | 1, 2, 13, 12 | `EXPLICIT`/`SUPPORTED_BY_CONTEXT` depending on how the interpretation cites the issue | N/A — training-time only | The single highest-value and highest-cost source; must itself carry evidence citations to be usable per §1.1 |

**Reading the matrix:** the further right (higher Context Tier) a source sits, the more the model's *ceiling* provenance category shifts from `INFERRED`/`SUPPORTED_BY_CONTEXT` toward `EXPLICIT`/verified — but only for the tier the example is actually built for. A Tier 1 training example must never borrow a higher tier's grounding strength.

---

## 3. Data Requirements (per capability)

For each capability: the learning objective, the minimum data needed, what ground truth must capture, and any capability-specific caveat.

| # | Capability | Learning objective | Minimum data | Ground truth must capture | Caveat |
|---|---|---|---|---|---|
| 1 | Issue understanding | Parse noisy, incomplete natural language into a coherent read of "what is this issue about" | Issues spanning the full quality spectrum (Section 6) across many repos/domains/languages | A human paraphrase of "what the issue is asking for," independent of the structured fields, used to sanity-check extraction | Must include issues where even a human needs the comment thread to understand the title |
| 2 | Task extraction | Convert an issue into `title`/`summary`/`objective`/`description`/`expected_outcome`, which may reword or narrow the original (Phase 2 §1) | Paired (issue, human-authored task framing) examples, deliberately including cases where the task framing narrows scope from a sprawling issue | Explicit note of what was narrowed/reworded and why, so the model learns *principled* narrowing, not arbitrary shortening | Original issue title must always be retrievable via `task_identity.source_issue.issue_title_raw` so reframing is auditable |
| 3 | Role classification | Frontend / Backend / Fullstack / Unknown, grounded in technical content, not surface keywords | Issues where role is stated outright, issues where it must be inferred from described symptoms, and issues where it is genuinely indeterminate | Evidence text the role decision rests on; explicit `Unknown` examples with no forced guess | Must include cross-cutting issues (e.g., an API contract change) correctly labeled `Fullstack`, not force-picked |
| 4 | Experience classification | Beginner / Intermediate / Advanced / Unknown, **independent of task length** | Deliberately-constructed contrast pairs: short-but-advanced issues (e.g., a subtle race condition) and long-but-beginner-friendly issues (e.g., a large but mechanical rename) | Evidence must reference *technical difficulty signals* (domain knowledge required, blast radius, subtlety), never issue length | This is the single most important axis to get contrastive data for — Phase 1 §8 names collapsing this as a named failure criterion |
| 5 | Complexity classification | Low / Medium / High / Unknown, independent of experience level | Same contrast-pair strategy as #4, cross-tabulated against experience so both 2×2 extremes exist in the training set | Evidence distinct from the `experience_level` evidence string on the same record (enforced later by Phase 2 Validation Rule 7) | Labelers must be instructed never to write identical evidence for both fields |
| 6 | Task-type classification | Bug / Feature / Improvement / Refactor / Performance / Security / Maintenance / Documentation / Other / Unknown | Balanced coverage across all nine substantive categories (not just Bug/Feature, which dominate raw GitHub data — see Section 8) | Evidence distinguishing near-confusable pairs (Bug vs. Performance; Improvement vs. Refactor; Maintenance vs. Documentation) | `Security` issues require careful sourcing — see Section 10 (do not scrape live unpatched vulnerability reports) |
| 7 | Technical understanding | `technologies`/`languages`/`frameworks`/`technical_areas`, named or strongly implied only | Issues across a wide technology spread (Section 8), including polyglot repos | Evidence tying each named technology to specific issue text — never populated from repo metadata alone unless the issue itself references it | Must include negative examples: issues that *mention* a technology in passing without it being relevant (to prevent false-positive extraction) |
| 8 | Component understanding | `components`/`systems`, correctly kept disjoint (Phase 2 Validation Rule 8) | Issues that name specific files/modules, issues that only imply a broader system, and issues spanning both | Explicit component-vs-system labeling rationale per Phase 2 §4's definitions | At Tier 1–2 these remain *unverified against code* (Phase 1 §6) — ground truth must not claim `EXPLICIT` certainty a verify-free process can't support |
| 9 | Context understanding | Correctly treat labels/comments/milestones as signal, not ground truth | Issues where labels are wrong or stale, issues where a comment thread reverses the original body's framing | Cases explicitly annotated "label X is present but contradicted by body text; correct classification follows body/comments" | This capability is specifically about *not* trusting metadata blindly — the dataset must contain adversarial-to-metadata examples on purpose |
| 10 | Dependency identification | `dependencies[].{type, ref, description}`, `ref` resolvable per Phase 2 Validation Rule 9 | Issues with explicit "blocked by #123" style references, and issues where a dependency is implied by discussion but not stated with `#` syntax | Ground truth respecting the same `ref`-resolution constraint the model must output under | Cross-repo references (`other-repo#45`) need multi-repo context available at label time |
| 11 | Impact analysis | Identify what parts of the system/user experience are affected (`affected_areas`) | Issues with narrow, well-scoped impact and issues with broad, cascading impact | Evidence chain from issue text to affected surface, not inferred from commit/PR diff size (leakage risk, Section 9) | Full impact analysis (Phase 1 §13 Tier 6/7 capability) requires PR/history data — must respect the leakage boundary in Section 9 |
| 12 | Uncertainty detection | Populate `uncertainty.*` correctly — knowing what's missing, not just what's present | Issues with genuine, labelable gaps ("no repro steps," "doesn't say which platform") | `missing_information` strings a human reviewer agrees are the *actual* blockers to full classification, not generic boilerplate | Must penalize (in labeling QA) generic/templated missing-information text that doesn't reflect the specific issue |
| 13 | Grounded task generation | Produce prose (`summary`/`objective`/`description`/`expected_outcome`) that never states anything not supported by evidence | Every example in the dataset, since this capability is evaluated on top of all the others | Reviewer sign-off that no generated sentence asserts an unstated fact | This is the target of Phase 1 §11's grounding policy and is the hardest capability to get right; treat it as the dataset's highest-scrutiny field, not a byproduct |

---

## 4. Inclusion Rules

An issue (and its available context) is eligible for the training corpus only if **all** of the following hold:

- **IR-1 — License and access.** The source repository's license permits use of its content for model training, or the repository is explicitly authorized by its owner for this purpose (Section 10).
- **IR-2 — Resolvable ground truth.** At least one qualified labeler (or an adjudicated multi-annotator process) can produce a complete, evidence-backed Task Understanding Record for it — including the legitimate case where most fields resolve to `Unknown` (Phase 2 Example 3 pattern). "Resolvable" does not mean "fully classified"; it means the labeling *process itself* can be completed honestly.
- **IR-3 — Context-tier integrity.** The available context actually matches the declared `context_tier` in the training example (Section 1.2) — no higher-tier information leaked into a lower-tier example.
- **IR-4 — Human-readable language identified.** The issue's natural-language content has a determined language tag, even if that language is not English (Section 8 covers how non-English content is handled, not whether it's included).
- **IR-5 — Not a duplicate beyond corpus dedup caps.** See Quality Rule Q-DUP.
- **IR-6 — Free of the Exclusion Rules in Section 5.**

Explicit inclusions, stated to prevent over-filtering toward only "clean" data (which would defeat Section 1.1's negative-space requirement):

- Minimal issues (one-line title, empty body) are **included**, not filtered out, provided IR-2 holds (i.e., a labeler can honestly produce Phase 2 Example-3-style near-all-`Unknown` ground truth for them).
- Issues with contradictory internal statements (title says one thing, body says another) are **included** specifically to train capability 9 and 12, provided the contradiction is labelable (the labeler can note the contradiction as `missing_information` or `uncertain_information`, not required to silently resolve it).
- Closed issues, including closed-as-wontfix and closed-as-duplicate, are **included** — they are valid natural issue text regardless of resolution status; resolution status is metadata, not a quality signal about the issue text itself.

---

## 5. Exclusion Rules

Excluded outright, regardless of other quality:

- **ER-1 — Spam / non-engineering content.** Issues that are not engineering work items at all (off-topic promotional content, template-only submissions with no filled fields, bot-generated noise with no human-authored signal).
- **ER-2 — Unresolvable licensing.** Any repository whose license or terms of service prohibit training use, or where ownership/authorization cannot be confirmed.
- **ER-3 — Active unpatched security disclosures.** Issues describing a live, unpatched vulnerability are excluded until the vulnerability is disclosed/patched upstream, to avoid the dataset becoming an exploit index and to avoid training the model on advice that may become unsafe (Section 10).
- **ER-4 — PII- or secret-bearing content that cannot be redacted.** If an issue or its context contains credentials, tokens, private personal data, or similar, and automated + human redaction cannot bring it to an acceptable state, the example is excluded rather than partially redacted-and-kept (Section 10).
- **ER-5 — Leakage-tainted context.** Any example where the *only* way to produce ground truth required looking at the linked PR/commit that resolves the issue, **and** that PR/commit content would need to appear in the model's training input for the issue to remain solvable at the declared context tier. (The PR may be used *by labelers* to write ground truth — see Section 2's PR row — but the PR text itself is excluded from `input`/`available_context`.)
- **ER-6 — Reserved evaluation material.** Any issue, or near-duplicate of an issue, held out for the evaluation set (Phase 1 §8's held-out labeled evaluation set) is excluded from training data — see Section 9.
- **ER-7 — Adjudication failures.** Examples where multi-annotator labeling could not reach agreement above the minimum threshold (Quality Rule Q-AGREE) and a tie-breaking senior reviewer was not available are excluded rather than force-resolved by majority vote alone on load-bearing fields (`role`, `experience_level`, `complexity`, `task_type`).
- **ER-8 — Synthetic examples presented as real.** Any synthetically generated or augmented example (Section 8.4) that is not clearly tagged `SYNTHETIC` in `label_provenance.labeling_method` is excluded — synthetic data is permitted but must never be indistinguishable from real-world data in the corpus metadata.

---

## 6. Quality Rules

| Rule | Issue addressed | Rule |
|---|---|---|
| **Q-MISS** | Missing information | An issue with missing information is not excluded; it is labeled with `Unknown` fields and populated `missing_information` strings (Phase 1 §10). Missingness is signal for capability 12, not a defect to filter out. |
| **Q-DUP** | Exact duplicates | Byte-identical or near-byte-identical (title+body) issues across the corpus are deduplicated to at most one representative per cluster, keyed by a normalized-text hash, before any train/val/test split is drawn. |
| **Q-NEARDUP** | Near duplicates | Issues with high textual similarity (e.g., templated bug reports differing only in a version number or stack trace) are clustered; the corpus retains a capped number per cluster (recommended cap: 3) so the model doesn't over-learn one phrasing at the expense of diversity, and **all members of a cluster are assigned to the same split** (train, val, or test — never split across) to prevent leakage (Section 9). |
| **Q-SPAM** | Spam | Filtered per Exclusion Rule ER-1; spam detection is a pre-filter, not a labeling-time judgment call. |
| **Q-LOWQ** | Low-quality issues | Low quality (terse, poorly written, no repro) is **not** an exclusion criterion by itself — see IR-2/Inclusion Rules. It is instead recorded as a `quality_flags` entry and factored into the Section 6.5 tiering, because low-quality-but-labelable issues are exactly what teaches capability 12 (uncertainty detection) and appropriate abstention (Phase 1 §8 criterion 4). |
| **Q-CONTRA** | Contradictory issues | Included per Inclusion Rules; the contradiction itself must be captured in `uncertain_information` or `missing_information` by the labeler, never silently resolved by picking one side. |
| **Q-STATUS** | Open vs. closed | Both included (Inclusion Rules). `review_required` and confidence computations must not treat "closed" as a proxy for "was correctly and completely specified" — many issues close without ever being fully specified (closed as duplicate, stale, wontfix). |
| **Q-CONVENTION** | Repository conventions | Component/system naming, labeling schemes, and issue templates vary by repository. Ground truth must be evaluated against *that repository's* conventions, not a universal standard — a labeler unfamiliar with a repo's structure must consult its available context (README, file tree) before asserting `components`/`systems`, consistent with Phase 2 §4. |
| **Q-LANG** | Different (natural) languages | See Section 8.2 for the diversity/handling policy; the quality rule here is narrower: an issue whose language cannot be reliably identified is flagged `unidentified_language` and excluded from training (not silently forced through an English-only pipeline that would mislabel it). |
| **Q-FRAMEWORK / Q-DOMAIN / Q-TERM** | Different frameworks, domains, terminology | No single framework, application domain (web/mobile/infra/data/embedded/etc.), or terminology convention may exceed the corpus caps defined in Section 8's diversity targets. This is enforced at corpus-composition time, not per-example. |
| **Q-CTX** | Context-tier integrity | Restates Inclusion Rule IR-3 as a quality gate applied at every pipeline stage, not just at ingestion — automated checks must re-verify that no higher-tier artifact (source code snippet, PR text) is reachable from a lower-tier example's `available_context` before that example ships to a training split. |
| **Q-AGREE** | Label reliability | For `ADJUDICATED_MULTI_ANNOTATOR` examples, inter-annotator agreement on load-bearing fields (`role`, `experience_level`, `complexity`, `task_type`) must meet a defined minimum (to be set empirically once pilot labeling exists, per Phase 1 §8's own "threshold set empirically, not assumed here" precedent) or the example is routed to senior adjudication (ER-7) rather than resolved by simple majority. |

### 6.5 Quality tiers

Every retained example is assigned a `quality_status.tier`:

- **GOLD** — `HUMAN_EXPERT` or high-agreement `ADJUDICATED_MULTI_ANNOTATOR` labeling, full evidence citations on every field, no unresolved quality flags. Used in evaluation sets and as the highest-weighted training examples.
- **SILVER** — `MODEL_ASSISTED_HUMAN_CORRECTED` labeling where a human reviewed and could correct every field, or single-annotator `HUMAN_EXPERT` labeling without a second reviewer. Used in training, not in evaluation.
- **BRONZE** — Examples with open, non-blocking quality flags (e.g. mild near-duplicate concerns already handled by Q-NEARDUP, low-quality-but-labelable source issues per Q-LOWQ). Used in training, downweighted or capped in corpus composition.
- **REJECTED** — Failed an Inclusion Rule, hit an Exclusion Rule, or failed Q-AGREE without successful adjudication. Not used anywhere; retained only in a rejection log for audit (Section 7), not in any training or eval split.

---

## 7. Provenance Specification (data-level)

As established in Section 0, this is metadata *about a training example*, never shown to the model. Required for every retained example (GOLD/SILVER/BRONZE) and every rejection (REJECTED) alike, so the pipeline itself remains auditable:

| Field | Purpose |
|---|---|
| `source_repo`, `source_issue_url` | Exact origin, matching the same traceability discipline Phase 1 §12 requires of the model's own output — the dataset must be able to answer "where did this example come from" as confidently as the model must answer "why did I conclude X" |
| `snapshot_fetched_at` | Pins the exact issue/comment state used, since issues are editable (mirrors Phase 1 §12's `snapshot_fetched_at` on the model's own records) |
| `license` | Supports Inclusion Rule IR-1 audit after the fact |
| `labeling_method` | One of `HUMAN_EXPERT`, `ADJUDICATED_MULTI_ANNOTATOR`, `MODEL_ASSISTED_HUMAN_CORRECTED`, `SYNTHETIC` — determines eligible quality tier (Section 6.5) |
| `annotator_ids` | Who produced/reviewed the label, for agreement calculation and error-pattern analysis (e.g., if one annotator systematically over-uses `Advanced`) |
| `inter_annotator_agreement` | Required for `ADJUDICATED_MULTI_ANNOTATOR` examples (Q-AGREE) |
| `labeled_at`, `labeling_tool_version` | Supports reproducibility and lets later audits distinguish labels produced under an older labeling guideline revision from newer ones |

**Why this is separate from the model's field-level provenance:** conflating the two would mean the dataset's own labeling confidence gets mistaken for the model's evidence for a classification, or vice versa. A `GOLD`-tier training example can still correctly contain a field whose *model-facing* provenance is `Unknown` (the labeler correctly determined nothing resolves that field) — data-quality tier and field-level provenance are orthogonal axes, and both must be present.

---

## 8. Data Diversity Strategy

Raw GitHub issue data is naturally skewed (popular repos, JavaScript/Python-heavy, Bug/Feature-heavy, English-heavy, well-maintained-repo-heavy). Left uncorrected, this skew becomes the model's learned prior, which directly undermines the "semantics, not keyword correlation" goal. Diversity targets are stratification goals for corpus composition, not claims about raw availability.

### 8.1 Diversity axes and stratification targets

| Axis | Risk if unaddressed | Strategy |
|---|---|---|
| Programming language / ecosystem | Overfit to a handful of popular stacks | Stratified sampling across a defined spread of ecosystems (e.g., web frontend, backend/server, mobile, data/ML tooling, infra/DevOps, embedded/systems), capped per-ecosystem share of the corpus |
| Framework | Same, at finer grain | Cap per-framework share within each ecosystem bucket |
| Application domain | Model learns "SaaS CRUD app" patterns as universal | Explicit domain buckets (consumer web, dev tooling, data infrastructure, games, scientific/research software, embedded/IoT, etc.), each with a minimum floor, not just a ceiling |
| Repository size/maturity | Only well-triaged large-org repos represented | Include small/solo-maintainer repos and early-stage repos, not only high-star projects — these are exactly where issues are terser and provenance/uncertainty labeling matters most |
| Repository conventions | Model learns one org's labeling/naming style as "the" convention | Multiple distinct convention styles represented per Q-CONVENTION, deliberately including repos with sparse/no labels |
| Task-type distribution | Bug/Feature dominate; Security/Documentation/Maintenance underrepresented | Explicit floor per `task_type` category, with active sourcing (not passive scraping) to fill underrepresented categories |
| Role / experience / complexity distribution | Skew toward "average" issues; contrast pairs (Section 3, capabilities 4–5) are rare in raw data | Deliberate, actively-curated contrast-pair sourcing, not left to organic sampling |
| Issue-quality spectrum | Curated datasets trend toward clean issues | Explicit floor of BRONZE-eligible low-quality-but-labelable issues (Q-LOWQ), not just GOLD-tier clean ones |
| Natural language | English-dominant | See 8.2 |

### 8.2 Non-English content

Per Phase 1 §4, issue text may be non-English. Policy:

- Non-English issues are **included**, language-tagged (Q-LANG), and labeled by annotators fluent in that language wherever `HUMAN_EXPERT`/`ADJUDICATED_MULTI_ANNOTATOR` labeling is used.
- Where fluent-annotator coverage is unavailable for a given language, examples in that language are held out of the initial training corpus rather than labeled through unverified machine translation passed off as ground truth — mislabeled-but-confident ground truth is worse than a smaller corpus (Section 1.1).
- This is a coverage-expansion item for future data-strategy revisions, not a permanent exclusion; the corpus composition should record language distribution explicitly so gaps are visible.

### 8.3 Avoiding single-repository dominance

No single repository may exceed a defined ceiling share of the total corpus (recommended: no repo contributes more than a low single-digit percentage), regardless of how many well-formed issues it has — a large, well-triaged repo (e.g., a popular framework) could otherwise dominate the training signal and implicitly teach that repo's specific conventions as universal.

### 8.4 Synthetic augmentation

Synthetic or template-perturbed examples (e.g., programmatically varying a real issue's stated version number, or constructing a deliberate contrast pair for capability 4/5 where organic data is sparse) are permitted **only** to fill diversity floors that organic sourcing cannot reasonably reach, and only under these constraints:

- Always tagged `labeling_method: SYNTHETIC` in `label_provenance` (Exclusion Rule ER-8 enforces this).
- Never used to construct evaluation sets (Section 9) — synthetic data trains, real held-out data evaluates.
- Reviewed by a human for realism before inclusion, to avoid teaching the model patterns that don't occur in real issue text.
- Capped as a minority share of any given `task_type`/role/complexity bucket, so the model's primary signal remains organic.

---

## 9. Contamination Prevention Strategy

Contamination here means any pathway by which evaluation-set answers, or information equivalent to them, reach the model during training — directly or indirectly.

- **CP-1 — Repository-level splitting.** Train/validation/test splits are drawn **at the repository level, not the issue level.** Issues from the same repository share conventions, terminology, and often near-duplicate content (Q-NEARDUP); splitting individual issues from the same repo across train and test leaks repo-specific style into the "held-out" evaluation.
- **CP-2 — Near-duplicate cluster integrity.** As stated in Q-NEARDUP, every member of a near-duplicate cluster is assigned to the same split. A near-duplicate of a test-set issue appearing in training is functional contamination even if the exact bytes differ.
- **CP-3 — Time-boundary splitting for realism.** Where feasible, test-set issues are drawn from a later time window than training issues, to approximate real deployment (the model will always be asked about issues newer than its training cutoff). This also naturally reduces the odds that a training-time labeler used a test issue's own eventual resolution as background knowledge.
- **CP-4 — No leakage through PRs/commits/history (restates ER-5 as a contamination control, not just an exclusion rule).** The resolving PR, commit(s), or post-hoc discussion that reveals "what actually happened" may inform how a **labeler** writes ground truth, but that resolving content must never appear in `input`/`available_context` for the example, at any context tier. This is the single highest-leverage leakage vector in this domain, because GitHub linked PRs frequently restate the issue's role/complexity/task-type outright (e.g., PR titled "fix(auth): patch null check in login flow" trivially reveals `role: Backend`, `task_type: Bug`, `technical_areas: ["authentication"]`).
- **CP-5 — Evaluation set isolation.** The held-out labeled evaluation set referenced in Phase 1 §8 is constructed once, its exact member IDs/hashes are recorded, and it is never reintroduced into any training, synthetic-augmentation seed, or model-assisted-labeling pass. Any process that touches the evaluation set (even read-only, e.g. using it to sanity-check a labeling guideline) is logged, because guideline changes informed by eval-set inspection are a subtler form of contamination.
- **CP-6 — Public benchmark awareness.** If any portion of the sourced data overlaps with known public NLP/software-engineering benchmarks (e.g., existing issue-classification datasets), those overlapping records are identified and routed to at most one of {train, eval}, never both, and flagged in `quality_status.quality_flags`.
- **CP-7 — Re-verification, not one-time checance.** CP-1 through CP-6 are re-checked whenever the corpus is updated (new repos added, new time window ingested), not verified once and assumed stable — a later ingestion pass can silently reintroduce a near-duplicate of an existing test-set issue from a different repo (e.g., a forked repository).

---

## 10. Privacy and Security Considerations

- **PS-1 — PII in issue text.** Issue bodies, comments, and stack traces frequently contain incidental PII (real names, email addresses, internal hostnames, file paths revealing a reporter's local username). A redaction pass is required before any example proceeds past ingestion; examples where redaction cannot be done reliably are excluded (ER-4), not partially kept.
- **PS-2 — Secrets and credentials.** Pasted API keys, tokens, connection strings, or credentials (common in "here's my config and it's not working" issues) must be detected and redacted or the example excluded (ER-4). Raw scraped content containing secrets must not persist even transiently in any non-access-controlled staging location.
- **PS-3 — Active vulnerability content.** Per ER-3, live unpatched security disclosures are excluded from sourcing until disclosed/patched, both to avoid building an exploit index and because advice grounded in an unpatched vulnerability's issue thread can become actively unsafe if reused out of context later.
- **PS-4 — License and authorization boundaries.** Only content whose license or explicit owner authorization permits training use is sourced (IR-1). Private/internal repositories are excluded unless the owning organization has explicitly authorized their use for this purpose.
- **PS-5 — Right to erasure / takedown.** Public GitHub content can be edited or deleted by its author after collection. The pipeline must be able to identify and remove a specific source issue's derived training examples on request, which is why `label_provenance.source_issue_url` and `snapshot_fetched_at` (Section 7) are mandatory, not optional, fields.
- **PS-6 — Access control on the raw corpus.** Raw (pre-redaction) scraped content is treated as sensitive by default until redaction and quality review complete; access to it is restricted to the data pipeline and reviewers, not broadly available alongside the finished training corpus.

---

## 11. Phase-3 Decision Record

| Decision | Rationale |
|---|---|
| Training examples explicitly separate "data provenance" (Section 7) from the model's field-level provenance (which is ground truth to be learned) | Prevents the two from being conflated in tooling or in this document, which would corrupt both the dataset's own audit trail and the model's grounding discipline it's meant to learn |
| Context-tier integrity (IR-3 / Q-CTX) enforced as a repeatable pipeline check, not a one-time filter | A single ingestion-time check can't catch leakage introduced by later corpus updates (e.g. adding richer repo context that retroactively over-informs an existing Tier 1 example) |
| Low-quality, terse, and contradictory issues are explicitly *included* rather than filtered for cleanliness | The model's core differentiator (Phase 1 §9/§10) is honest abstention and uncertainty detection; a corpus curated only for clean, resolvable issues cannot teach that behavior |
| Contrast-pair sourcing is called out as an active curation task (Section 8.1) rather than left to organic sampling | Phase 1 §8 names collapsing experience and complexity as a specific, measured failure criterion; the pairs needed to train against it are rare in raw data and won't appear reliably without deliberate sourcing |
| PR/commit content is usable *by labelers* but excluded from model-facing input at every context tier (CP-4) | This is the highest-leverage leakage vector in this problem domain — resolving PRs routinely restate the answer to `role`/`task_type`/`technical_areas` outright |
| Splits are drawn at the repository level, with near-duplicate clusters kept intact within a split | Issue-level random splitting inside the same repo leaks repo-specific convention and phrasing into "held-out" evaluation, overstating real generalization |
| Synthetic data permitted only to fill diversity floors, always tagged, never used in evaluation | Keeps the evaluation set's signal honestly organic while still allowing targeted correction of known corpus skew (Section 8) |
| Quality tiering (GOLD/SILVER/BRONZE/REJECTED) kept orthogonal to inclusion/exclusion | Lets the corpus retain useful-but-imperfect (BRONZE) examples for training breadth while still reserving only the highest-confidence (GOLD) examples for evaluation, without needing a second parallel classification scheme |
| Active security-vulnerability issues excluded from sourcing until disclosed/patched | Avoids building an exploit index and avoids training on advice that may be unsafe once decontextualized from its original, time-bound disclosure |
| No collection infrastructure, storage schema, or annotation tooling specified | Matches the explicit task boundary — this document defines the data requirements and rules, not the system that will implement them |
