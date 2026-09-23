# Phase 2 — Task & Output Schema
## Specialized AI Software Engineering Model: Understanding → Structured Engineering Task

Source of truth: Phase 1 Formal Model Definition (ITU-1). This document does not redefine the model; it defines what the model's output looks like once repository context (Section 13's Phase 2 step) becomes available. **No infrastructure, endpoints, or storage are defined here — schema only.**

```
GitHub Issue + Available Engineering Context  →  Structured Engineering Task
```

---

## 1. Canonical Task Schema

A **Task Understanding Record** (v2) has seven top-level sections:

```yaml
TaskUnderstandingRecord:
  schema_version: "2.0.0"          # semver — see Section 5

  task_identity:                    # who/when/from-what
    task_id: uuid
    created_at: datetime
    source_issue: { repo, issue_number, issue_url, snapshot_fetched_at, issue_title_raw }

  task:                             # the engineering work itself
    title: string
    summary: string
    objective: string
    description: string
    expected_outcome: string
    role: Frontend | Backend | Fullstack | Unknown
    experience_level: Beginner | Intermediate | Advanced | Unknown
    complexity: Low | Medium | High | Unknown
    task_type: Bug | Feature | Improvement | Refactor | Performance
             | Security | Maintenance | Documentation | Other | Unknown
    technologies: [string]
    languages: [string]
    frameworks: [string]
    technical_areas: [string]
    components: [string]
    systems: [string]
    affected_areas: [string]
    dependencies: [{ type, ref, description }]
    scope: { in_scope: [string], out_of_scope: [string] }
    acceptance_criteria: [string]
    constraints: [string]

  provenance:                       # REQUIRED per classifiable field — see Section 4
    <field_path>: { source: EXPLICIT|SUPPORTED_BY_CONTEXT|INFERRED|UNKNOWN, evidence, confidence }

  uncertainty:                      # rollups derived from provenance
    explicit_information: [{ field, evidence }]
    inferred_information: [{ field, evidence }]
    uncertain_information: [{ field, evidence, note? }]
    missing_information: [string]

  confidence:
    overall_confidence: float [0.0–1.0]
    method: "weighted_mean_v1"

  review:
    review_required: boolean
    review_reasons: [string]
```

This is the same design commitment Phase 1 made — **field-level provenance and confidence, never a single global score** — extended to a richer task shape. The machine-readable form is `task-schema.v2.json` (JSON Schema, Draft 2020-12).

**Why a `task` block that isn't the issue text.** The Task represents the *engineering work*, so `title`/`summary`/`description` are the model's own framing of the work (which may reword, narrow, or restructure the issue), while `task_identity.source_issue.issue_title_raw` preserves the original verbatim for audit. This mirrors Phase 1's grounding policy: reframing is allowed, but the original is never lost.

---

## 2. Field Specification

| Field (path under `task.`) | Type | Required | Provenance-tracked | Notes |
|---|---|---|---|---|
| `title` | string | ✅ | ✅ | Model's own framing, not necessarily the issue title |
| `summary` | string | ✅ | ✅ | 1–2 sentence rollup |
| `objective` | string | ✅ | ✅ | The "why" |
| `description` | string | ✅ | optional | Fuller narrative; provenance tracked only if a single field wouldn't cover it (see Section 3, provenance-completeness rule) |
| `expected_outcome` | string | ✅ | ✅ | Definition of done, in prose |
| `role` | enum | ✅ | ✅ | See Allowed Values |
| `experience_level` | enum | ✅ | ✅ | Independent of `complexity` — see Field Relationships |
| `complexity` | enum | ✅ | ✅ | Independent of `experience_level` |
| `task_type` | enum (extensible) | ✅ | ✅ | `Other` is a legitimate value, not a fallback for failure |
| `technologies` | string[] | optional | ✅ | Named/strongly-implied only (Phase 1 §6 boundary carried forward) |
| `languages` | string[] | optional | ✅ | Subset of technologies that are programming languages specifically |
| `frameworks` | string[] | optional | ✅ | Subset of technologies that are frameworks/libraries |
| `technical_areas` | string[] | optional | ✅ | e.g. "authentication", "checkout" |
| `components` | string[] | optional | ✅ | Named files/modules/services — text/context inference only, unverified against actual code until Phase 3 |
| `systems` | string[] | optional | ✅ | Broader boundary than `components` — see Field Relationships |
| `affected_areas` | string[] | optional | optional | User-facing or codebase surface impacted |
| `dependencies` | object[] | optional | ✅ (whole array) | See `dependency` shape below |
| `scope` | object | ✅ | ✅ | `in_scope`/`out_of_scope`, both arrays (may be empty) |
| `acceptance_criteria` | string[] | ✅ | ✅ | May be an empty array only when `role`, `experience_level`, `complexity`, and `task_type` are all `Unknown`/no non-Unknown classification exists |
| `constraints` | string[] | optional | optional (tracked when present) | Technical/business constraints stated or implied |

**`dependency` object:** `{ type: blocks\|blocked_by\|relates_to\|requires, ref: string, description: string }`. `ref` is either a value already present in `components`/`systems`, or an external issue reference (`#123`, `other-repo#45`).

**`task_identity` fields** (`task_id`, `created_at`, `source_issue.*`) are never provenance-tracked — they are record metadata, not extracted claims about the engineering work.

---

## 3. Validation Rules

1. **Provenance completeness.** Every field marked "✅" in the Provenance-tracked column of Section 2 must have a corresponding entry in `provenance`, keyed by its dotted path (`role`, `scope`, `dependencies`, …). A record missing a required provenance entry is invalid — this is what Phase 1 §9 calls a hard failure, not a quality issue.
2. **Unknown ⇒ null evidence/confidence.** If `provenance.<field>.source == "UNKNOWN"`, then `evidence` MUST be `null` and `confidence` MUST be `null`. The model must never fabricate evidence for a field it doesn't actually know (Phase 1 §11, carried forward verbatim as the single most important constraint).
3. **Non-unknown ⇒ non-empty evidence.** If `source != "UNKNOWN"`, `evidence` MUST be a non-empty string and `confidence` MUST be a number in `[0.0, 1.0]`.
4. **Calibration signal, not hard gate.** `EXPLICIT` entries are *expected* to carry confidence ≥ 0.75 in aggregate (Phase 1 §8, "calibration, not just accuracy"). This is evaluated statistically across a sample, not enforced per-record — a single low-confidence `EXPLICIT` entry is a calibration smell to flag in review, not a schema violation.
5. **Acceptance-criteria minimum.** `acceptance_criteria` must contain at least one item unless `role`, `experience_level`, `complexity`, and `task_type` are all `Unknown` (Example 3 pattern) — an empty criteria list on an otherwise well-classified task is invalid.
6. **Uncertainty/provenance consistency.** Every item in `uncertainty.explicit_information` must reference a field whose `provenance.<field>.source == "EXPLICIT"`, and likewise `inferred_information` ↔ `INFERRED`. `uncertain_information` references fields that are non-`UNKNOWN` but below the confidence threshold (default 0.6) — see Section 4.
7. **Experience/complexity independence check.** `provenance.experience_level.evidence` and `provenance.complexity.evidence` must not be identical strings. Identical evidence is a signal the two dimensions were collapsed into one judgment, which Phase 1 §9 lists as an explicit failure mode.
8. **Components/systems disjointness.** No string may appear in both `task.components` and `task.systems` — they are different granularities (see Section 4), and an item in both suggests a mis-classification, not a legitimate overlap.
9. **Dependency ref resolution.** Each `dependencies[].ref` must either equal an entry in `task.components` ∪ `task.systems`, or match `^(#\d+|[A-Za-z0-9_.-]+#\d+)$` (an issue reference). Anything else is invalid — dependencies must be traceable, not free-floating text.
10. **`overall_confidence` is derived, not authored.** It must equal the weighted-mean formula in Section 4 within ±0.01 of the values in `provenance`. A record where the stored value diverges from the recomputed value is invalid — this prevents `confidence` becoming a stale or hand-tuned number.
11. **`review_required` is derived, not authored.** It must equal the boolean OR of the trigger rules in Section 4. `review_reasons` must be non-empty iff `review_required` is `true`.
12. **`schema_version` gate.** Must match `^2\.\d+\.\d+$` for this schema generation. A consumer encountering `1.x.x` must run the v1→v2 migration (Section 5) before applying these rules.

---

## 4. Allowed Values, Confidence, Uncertainty, and Derived Fields

### Allowed values (closed enums)
- `role`: `Frontend`, `Backend`, `Fullstack`, `Unknown`
- `experience_level`: `Beginner`, `Intermediate`, `Advanced`, `Unknown`
- `complexity`: `Low`, `Medium`, `High`, `Unknown`
- `provenance.*.source`: `EXPLICIT`, `SUPPORTED_BY_CONTEXT`, `INFERRED`, `UNKNOWN`
- `dependencies[].type`: `blocks`, `blocked_by`, `relates_to`, `requires`

### Allowed values (extensible enum)
- `task_type`: `Bug`, `Feature`, `Improvement`, `Refactor`, `Performance`, `Security`, `Maintenance`, `Documentation`, `Other`, `Unknown` — new values are added to this registry via a **MINOR** version bump (Section 5), never by silently emitting an unlisted string.

### Allowed values (open, unconstrained string sets)
`technologies`, `languages`, `frameworks`, `technical_areas`, `components`, `systems`, `affected_areas` — free text, since Phase 2 still has no repository access to verify names against, per Phase 1 §7's hard boundary #1. (True repo-backed validation of `components` arrives in Phase 3.)

### `components` vs. `systems`
- **`components`**: a specific, addressable unit — a file, class, module, or single service named or clearly implied in the issue (e.g. `DiscountCodeInput.tsx`).
- **`systems`**: a broader boundary that a component lives inside, named at the level a team would recognize as "an owning system" (e.g. `notification-service`, `dashboard-frontend`). A `system` is never itself a `component`, and vice versa (Validation Rule 8).

### Field relationships
- **`experience_level` ⊥ `complexity`.** These are separately evidenced dimensions by design (Phase 1's explicit anti-goal: task size ≠ experience required). A short, high-complexity task and a long, beginner-friendly task must both be representable.
- **`scope.in_scope`/`affected_areas`/`components`** are expected to overlap conceptually (scope items typically name the same units as `affected_areas`/`components`) but are not required to match verbatim — `scope` is prose-level, `components`/`affected_areas` are structured tags over the same reality.
- **`dependencies`** point *into* `components`/`systems` or *out* to other issues — never to a `technical_area` or `technology`, which are descriptive tags, not addressable units.
- **`review.review_required`** and **`confidence.overall_confidence`** are both *computed from* `provenance`, `task`, and `uncertainty` — they summarize the record, they don't add new facts to it.

### Confidence representation
- Per-field: `provenance.<field>.confidence`, float in `[0.0, 1.0]` or `null` (iff `source == UNKNOWN`).
- Aggregate: `confidence.overall_confidence`, computed as a required-field-weighted mean:
  ```
  weight(field) = 2 if field is required in `task`, else 1
  known(field)  = provenance[field].source != "UNKNOWN"

  overall_confidence =
      Σ over known fields of ( confidence[field] * weight[field] )
      ────────────────────────────────────────────────────────────
      Σ over known fields of weight[field]

  overall_confidence = 0.0  if no field is known
  ```
- `confidence.method` records which formula produced the number (`"weighted_mean_v1"`), so a future **MINOR**-version change to the formula doesn't silently reinterpret old records.

### Uncertainty representation
- **`explicit_information`** / **`inferred_information`**: rollups of every field whose provenance source is `EXPLICIT` / `INFERRED`, respectively — convenience views for consumers who don't want to walk the full `provenance` map.
- **`uncertain_information`**: fields that are *not* `UNKNOWN` (they have a value) but whose confidence is below a threshold (default **0.6**), or that the model judges genuinely ambiguous even with a value present. This is the Phase 2 equivalent of Phase 1's `flagged_ambiguities`, generalized to be field-addressable rather than a flat string list.
- **`missing_information`**: freeform strings naming what additional input would resolve a gap (unchanged from Phase 1 §5/§10 — required output, may be an empty array, never omitted).

### Missing-information representation
Always an array (possibly empty) of human-readable strings. Not field-addressed like `uncertain_information`, because missing information often doesn't map to one field (e.g. "no repro steps" affects `complexity`, `acceptance_criteria`, and `expected_outcome` simultaneously).

### Review requirement — trigger rules
`review.review_required` is `true` if **any** of the following hold, and `review.review_reasons` lists every rule that fired:
1. Any of `role`, `experience_level`, `complexity` is `Unknown`.
2. `task.acceptance_criteria` is empty.
3. `confidence.overall_confidence < 0.5`.
4. `task_type == "Security"` (security classifications always get a human look, regardless of confidence).
5. `complexity == "High"` and `experience_level == "Unknown"` (a high-stakes task with no assignable skill signal).
6. Any `uncertain_information` entry exists whose referenced field is one of `role`, `complexity`, `task_type`.

---

## 5. Versioning Strategy

- **Format:** `MAJOR.MINOR.PATCH`, carried on every record as `schema_version`. Phase 2 begins at **`2.0.0`**.
- **MAJOR** — breaking change: a required field is added/removed/renamed, an existing field's type or semantics changes, or a closed enum's *meaning* changes. Consumers built for `N.x.x` are not guaranteed to parse `N+1.x.x`.
- **MINOR** — additive, backward-compatible: a new optional field, a new value added to an *extensible* enum (`task_type`) or to the open string-set fields, a new `dependencies[].type`. Existing consumers keep working; new consumers can use the addition.
- **PATCH** — no consumer-visible shape change: documentation clarifications, tightened but non-breaking regex (e.g. a `ref` pattern that only *narrows* what was already invalid), typo fixes in field descriptions.
- **Every record is self-describing.** Storage may hold a mix of schema versions simultaneously; a consumer must branch on `schema_version` before parsing rather than assuming the latest shape.

### Backward compatibility with Phase 1 (`v1` → `v2`)
Phase 1's output (Section 5 of the Phase 1 document) is a strict subset of Phase 2's `task`/`provenance`/`uncertainty` shape. The mapping is mechanical:

| Phase 1 (v1) | Phase 2 (v2) |
|---|---|
| `Task.role/experience_level/complexity/task_type/technical_area/technologies/components/expected_outcome` | Same-named fields under `task.*` (v1's `technical_area` singular/list becomes `task.technical_areas`, always an array) |
| `Provenance.<field>.source: stated` | `provenance.<field>.source: EXPLICIT` |
| `Provenance.<field>.source: contextual` | `provenance.<field>.source: SUPPORTED_BY_CONTEXT` |
| `Provenance.<field>.source: inferred` | `provenance.<field>.source: INFERRED` |
| `Provenance.<field>.source: unknown` | `provenance.<field>.source: UNKNOWN` |
| `Uncertainty.flagged_ambiguities` | Distributed into `uncertainty.uncertain_information` (field-addressed) plus any residual free-text into `uncertainty.missing_information` |
| `Uncertainty.missing_information` | `uncertainty.missing_information` (unchanged) |
| *(none)* | New in v2: `task_identity`, `task.title/summary/objective/description/languages/frameworks/systems/affected_areas/dependencies/scope/acceptance_criteria/constraints`, `confidence`, `review` |

This is a **MAJOR** bump (`1.x` → `2.0.0`) because the top-level shape changed (new required sections `task_identity`, `confidence`, `review`), even though every v1 fact is losslessly representable in v2. A v1→v2 adapter is a defined *mapping*, not infrastructure — implementing it is a downstream engineering task, out of scope here per the "no infrastructure" instruction.

### Extensibility for later phases
Per Phase 1 §13, Phases 3–7 add context sources (code, docs, dependency graphs, PRs/history, project conventions). Under this versioning strategy, each new context source is absorbed as a **MINOR** change:
- A new `provenance.*.source` value (e.g. `VERIFIED_AGAINST_CODE` once Phase 3 lands) is additive — existing `EXPLICIT/SUPPORTED_BY_CONTEXT/INFERRED/UNKNOWN` consumers still parse it as an unrecognized-but-valid enum member if the schema documents forward-compatible enum handling, or it ships as a MINOR bump that consumers opt into.
- `components` gaining real repo-verification (Phase 3) doesn't change the field's type or path — only the *evidence* a `SUPPORTED_BY_CONTEXT`/`EXPLICIT` entry can cite gets stronger. No schema change required at all.
- Subtasking/dependency-mapping/impact-analysis (Phases 3–6 capabilities) attach as **new top-level sections** in a future MAJOR version once they're specified, never by overloading existing fields like `dependencies` (which is scoped to *issue-level* references only in v2).

---

## 6. Example Records

Full JSON for all five required scenarios is in `task-schema-examples.json`. Summary of what each demonstrates:

1. **Normal task** — well-written bug report; all fields resolvable, `EXPLICIT`/`INFERRED` mix, `overall_confidence 0.81`, no review required.
2. **Ambiguous task** — `role` and `experience_level` correctly return `Unknown` rather than guessing; `complexity` is present but placed in `uncertain_information` with a note explaining the unresolved ambiguity; `review_required: true`.
3. **Insufficient-information task** — a two-word issue title with no body. Almost every field is `Unknown`, `acceptance_criteria` is empty (permitted per Validation Rule 5, since every classification field is `Unknown`), `overall_confidence 0.07`.
4. **Context-aware task** — issue body alone is thin, but a maintainer comment thread supplies the real signal; several fields are `SUPPORTED_BY_CONTEXT` rather than `EXPLICIT`, illustrating that labels/comments are *signal*, not *ground truth* (Phase 1 §4).
5. **Multi-component task** — a feature spanning a frontend component, a backend controller, and a shared query service; exercises `systems` vs. `components` disjointness and both `dependencies[].type` values (`requires`, `relates_to`).

---

## 7. JSON Schema

See `task-schema.v2.json` (JSON Schema, Draft 2020-12) — the machine-readable, authoritative version of Sections 1–4. The prose in this document and the JSON Schema are kept in sync by design; where they conflict, the JSON Schema governs structural validity and this document governs the rules that require cross-field computation (Section 3, rules 4, 6, 7, 9–11) that JSON Schema alone can't express.

---

## 8. Schema Tests

Representative test cases (structural + cross-field). "Valid" means: conforms to `task-schema.v2.json` **and** satisfies every rule in Section 3.

| # | Case | Input shape | Expected result | Rule exercised |
|---|---|---|---|---|
| T1 | Well-formed normal record | Example 1 verbatim | **Valid** | Baseline |
| T2 | Missing `provenance` entry for a tracked field | Example 1 with `provenance.role` deleted | **Invalid** | Rule 1 (provenance completeness) |
| T3 | `UNKNOWN` with non-null evidence | `provenance.role = {source: UNKNOWN, evidence: "guessed frontend", confidence: 0.3}` | **Invalid** | Rule 2 |
| T4 | `EXPLICIT` with null evidence | `provenance.task_type = {source: EXPLICIT, evidence: null, confidence: 0.9}` | **Invalid** | Rule 3 |
| T5 | Empty `acceptance_criteria` on a fully-classified task | Example 1 with `acceptance_criteria: []`, role/experience/complexity/task_type unchanged (non-Unknown) | **Invalid** | Rule 5 |
| T6 | Empty `acceptance_criteria` on a fully-Unknown task | Example 3 verbatim | **Valid** | Rule 5 (exception path) |
| T7 | Identical evidence for `experience_level` and `complexity` | Both set to `"issue is long"` | **Invalid** | Rule 7 |
| T8 | Same string in both `components` and `systems` | `components: ["auth-gateway"]`, `systems: ["auth-gateway"]` | **Invalid** | Rule 8 |
| T9 | Dependency `ref` not resolvable | `dependencies: [{type: requires, ref: "some-random-string", description: "..."}]` where `"some-random-string"` is in neither `components`/`systems` nor matches the issue-ref pattern | **Invalid** | Rule 9 |
| T10 | Dependency `ref` as valid issue reference | `ref: "checkout-service#12"` | **Valid** (given Rule 9 pattern) | Rule 9 |
| T11 | `overall_confidence` doesn't match recomputed value | Example 1 with `confidence.overall_confidence` hand-edited to `0.99` | **Invalid** | Rule 10 |
| T12 | `review_required: false` with a trigger condition present | Example 2's `task` fields with `review.review_required` forced to `false` | **Invalid** | Rule 11 |
| T13 | `review_reasons` non-empty while `review_required: false` | — | **Invalid** | Rule 11 |
| T14 | `schema_version: "1.4.0"` submitted to a v2-only consumer without migration | Raw Phase 1 output, unmapped | **Invalid** (must migrate first) | Rule 12 |
| T15 | `task_type` value outside the current registry (`"Migration"`) | New, unlisted enum value | **Invalid** under `2.0.0`; **valid** once a `2.1.0` registry update adds it | Section 5 (MINOR extensibility) |
| T16 | All five example records | `task-schema-examples.json` | **Valid** | Structural regression check |

These are specified as fixtures/expected outcomes (data), not a test runner — per the "do not build infrastructure" boundary, wiring them into an actual CI job is a downstream task.

---

## 9. Phase-2 Decision Record

| Decision | Rationale |
|---|---|
| Kept field-level provenance as a separate `provenance` map rather than inlining `{value, source, evidence, confidence}` per field | Preserves Phase 1's core architectural bet (provenance is infrastructure, not decoration) and keeps `task` itself clean/typed for direct consumption by tools that don't care about evidence |
| Added `explicit_information`/`inferred_information`/`uncertain_information` as **derived** rollups, not independently authored | The prompt asked for these as first-class fields; making them derived-and-validated (Rule 6) instead of separately authored prevents drift between the rollups and the source-of-truth `provenance` map |
| Renamed `stated/contextual` → `EXPLICIT/SUPPORTED_BY_CONTEXT` per the Master-Prompt-02 taxonomy, kept `inferred/unknown` names | Matches the task's explicit vocabulary (`EXPLICIT / INFERRED / SUPPORTED BY CONTEXT / UNKNOWN`) while the underlying four-way distinction and its semantics are unchanged from Phase 1 — a rename, not a redesign |
| Split `components` and `systems` into two fields instead of one `components` list of mixed granularity | The prompt lists both `Components` and `Systems` separately; conflating them would re-introduce the kind of granularity-collapse Phase 1 explicitly warned against for Experience/Complexity |
| `review_required`/`review_reasons` and `overall_confidence` are computed, not authored, fields | Prevents the record from asserting an unsupported confidence/review posture — the same grounding discipline Phase 1 §11 requires for evidence is applied here to the record's own meta-claims |
| `dependencies[].ref` constrained to resolve against `components`/`systems`/issue-references | Keeps `dependencies` traceable and machine-actionable rather than a free-text list, consistent with Phase 1 §12's traceability requirement |
| `task_type` is an **extensible enum** (schema-registry controlled via MINOR bumps), not an open string | Prevents type-taxonomy drift/typos while still allowing new categories (per Phase-1 §14's "extensible task-type taxonomy" requirement) without a MAJOR/structural change |
| `technologies`/`languages`/`frameworks`/`technical_areas`/`components`/`systems`/`affected_areas` remain open string sets | No repository access yet (Phase 1 §7 hard boundary #1 still applies in Phase 2 — repo *structure* per Phase 1 §13's Phase-2 line is about grounding quality, not schema shape); constraining these to a closed vocabulary now would either be arbitrary or block on data this document doesn't have |
| v1→v2 is a MAJOR version bump with a defined, mechanical field mapping | Every v1 fact is representable losslessly in v2, but v2 adds required top-level sections (`task_identity`, `confidence`, `review`) that v1 consumers can't expect — meets semver's own definition of "breaking" even though no information is lost |
| No infrastructure, storage, or API surface defined | Matches the task's explicit "Do NOT build infrastructure" instruction — this document specifies data shape and validation rules only |
