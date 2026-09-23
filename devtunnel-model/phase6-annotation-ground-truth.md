# Phase 6 — Annotation & Ground Truth
## Specialized AI Software Engineering Model: Ground-Truth Annotation System

---

## 0. Framing

Phase 6 does not define a new representation. It defines the **human process that produces trustworthy labels** for the Task Understanding Record schema already fixed in Phase 2 (`task-schema.v2.json`, `schema_version: 2.x.x`). Every annotation this system produces must be a valid instance of that schema — same `role` / `experience_level` / `complexity` / `task_type` enums, same `EXPLICIT / SUPPORTED_BY_CONTEXT / INFERRED / UNKNOWN` provenance vocabulary, same `review_required` machinery.

**Why annotation quality is the actual bottleneck:** Phase 1 §8 defines model success as agreement with human-expert labels at a defined threshold, plus calibration. Neither number means anything if the "human-expert labels" themselves are inconsistent. Phase 6's job is to make ground truth **reproducible** — two qualified annotators looking at the same issue, independently, should converge — before that ground truth is used to train or evaluate anything.

**Non-goals:** Phase 6 does not design the model, the schema, the data pipeline, or any infrastructure (queues, UI tooling, storage). It designs the *process and rules* a human or human+tool system must follow. Where a tool is implied (e.g., an annotation UI), it is referenced only as a requirement on that tool, never built here.

---

## 1. Annotation Guidelines

### 1.1 What an annotator is doing
An annotator reads a GitHub Issue (title, body, labels, comments — the same input bound Phase 1 §4 fixed) and produces a Task Understanding Record: the classifications, the free-text fields, and — critically — the **provenance** for every field. Annotators are not summarizing the issue. They are answering: *"What would a competent engineer, reading only this issue and nothing else, correctly conclude — and how would they know it?"*

### 1.2 Core annotation principles

1. **Read the issue, not your assumptions about the project.** Annotators frequently have outside knowledge of the codebase (if they're engineers on the team). That knowledge must not leak into `EXPLICIT` or `SUPPORTED_BY_CONTEXT` labels. If a fact is true only because the annotator happens to know the repo, and the issue text doesn't support it, it belongs at most in `INFERRED`, with evidence stating the inference is from general engineering reasoning, not from the issue.
2. **Never upgrade a guess into a stated fact.** The single most important discipline in this system, carried down from Phase 1 §11: *the model must never generate evidence that does not exist in the input*, and the annotation process must never train it to. An annotator who marks something `EXPLICIT` without a locatable quote/paraphrase is committing the exact failure Phase 1 §9 calls out.
3. **`Unknown` is a correct answer, not a cop-out.** Annotators are evaluated in part on appropriate use of `Unknown` (Section 6.3). An issue with no code samples, no error message, and no described repro is often *genuinely* `complexity: Unknown` — annotators should not feel pressure to fill every field.
4. **Experience ⊥ Complexity, always.** This is re-stated per-field in Section 3, but it is a guideline-level rule first: a one-line issue can be `complexity: High` (e.g., "sessions are shared across users under load") and a 40-line issue can be `experience_level: Beginner` (e.g., a long but mechanical rename). Annotators must independently justify each dimension with independent evidence — Validation Rule 7 (Phase 2 §3) mechanically checks this by rejecting identical evidence strings.
5. **Evidence is a pointer, not a copy.** Evidence fields should paraphrase or locate the supporting text ("issue body, paragraph 2, describes a race condition on double-submit"), not reproduce large verbatim spans. This mirrors Phase 1 §11's grounding policy and keeps annotation records auditable without becoming a copyright/verbatim-reproduction problem in tooling downstream.
6. **One issue, one record, one sitting.** Annotators complete a full record in one session against one fixed input snapshot (`snapshot_fetched_at`, per Phase 1 §12) — they do not revisit and drift a record as an issue is edited later. If the issue changes after annotation, that's a new snapshot and, if re-annotated, a new record version, not an edit-in-place.
7. **Silence about a role is not evidence for the other role.** If an issue never mentions UI at all, that does not make it `Backend` by default — role must be earned by what the text actually implicates (files, symptoms, user-facing vs. server-facing language), not by absence.

### 1.3 Annotator qualification
Annotators must have working professional experience reading and triaging real GitHub issues (not necessarily in the specific repo under annotation). Guidelines training (this document) plus a calibration set (Section 8.2) are mandatory before an annotator's labels count toward ground truth.

---

## 2. Annotation Schema

The annotation schema is the Phase 2 `task-schema.v2.json` **unchanged**, with one addition specific to the annotation process: an `annotation_meta` block that is stripped before the record is used as training/eval ground truth, but is required during annotation for traceability of *who* produced *what*, under *what disagreement history*.

```json
{
  "schema_version": "2.x.x",
  "task_identity": { "...": "as defined in Phase 2 §1" },
  "task": { "...": "as defined in Phase 2 §1" },
  "provenance": { "...": "as defined in Phase 2 §1" },
  "uncertainty": { "...": "as defined in Phase 2 §1" },
  "confidence": { "...": "as defined in Phase 2 §1" },
  "review": { "...": "as defined in Phase 2 §1" },

  "annotation_meta": {
    "annotator_id": "string",
    "annotation_round": "integer (1 = initial, 2+ = adjudication/re-annotation)",
    "second_annotator_id": "string | null",
    "agreement_status": "enum [agreed | disagreed | adjudicated | single_annotated]",
    "adjudicator_id": "string | null",
    "time_spent_seconds": "integer",
    "annotator_notes": "string | null",
    "disagreement_log": [
      {
        "field": "string (dotted path)",
        "annotator_1_value": "any",
        "annotator_2_value": "any",
        "resolution": "string",
        "resolved_by": "string (annotator_id or adjudicator_id)"
      }
    ]
  }
}
```

**Rules specific to `annotation_meta`:**
- `agreement_status = single_annotated` is only valid for records routed through the single-annotator tier (Section 6.1) — every other status requires two independent `task` submissions to have existed at some point, even if one is superseded.
- `disagreement_log` is append-only. It is never cleared, even after adjudication resolves the field — the record of *what two competent annotators disagreed on* is itself training signal for calibration (Section 8.4) and for tightening these guidelines over time.
- `annotation_meta` is dropped (not merely ignored) when a record is exported as ground truth for training/eval, because it is process metadata, not a fact about the task.

---

## 3. Label Definitions

This section is the operational definition each annotator applies. It restates the Phase 2 enums but defines them **behaviorally** — what evidence justifies each value — since the schema alone (an enum list) is not enough to get two annotators to agree.

### 3.1 Role

| Value | Justified when the issue implicates... |
|---|---|
| `Frontend` | UI components, client-side rendering, styling, browser behavior, client-side state, user-visible interaction bugs with no server-side cause named |
| `Backend` | APIs, databases, server logic, background jobs, infrastructure, data processing, auth/session logic on the server side |
| `Fullstack` | The issue explicitly or implicitly requires coordinated client+server change (e.g., a new field must be added to an API *and* rendered in the UI) — not merely "could touch either" |
| `Unknown` | The issue gives no implicating signal for any of the above (e.g., "the export is broken" with zero detail on which layer) |

**Rule:** `Fullstack` requires evidence of coupling, not just evidence that both areas exist somewhere in the product. An issue about a UI bug in a full-stack app is still `Frontend` unless the fix is described/implied as spanning both layers.

### 3.2 Experience Level

Defined **only** by engineering knowledge required to correctly complete the work — never by how much code the fix touches (Phase 1 §9 anti-goal #3, restated as a hard annotation rule).

| Value | Justified when the work requires... |
|---|---|
| `Beginner` | Following an established pattern already visible elsewhere in the codebase/issue; low risk of subtle side effects; a junior engineer with basic framework familiarity could reasonably complete it correctly |
| `Intermediate` | Judgment calls with no single obvious pattern to copy; moderate understanding of surrounding system behavior; some risk of introducing subtle bugs if done carelessly |
| `Advanced` | Deep understanding of a subsystem, correctness-sensitive logic (concurrency, security, data integrity), architectural judgment, or diagnosing a root cause that isn't visible from the surface symptom |
| `Unknown` | The issue provides no signal about *what kind of engineering judgment* the fix requires — common on very short issues |

### 3.3 Complexity

Defined by **engineering risk and effort**, independent of experience required.

| Value | Justified when... |
|---|---|
| `Low` | Small, contained, low blast-radius change; low chance of regression |
| `Medium` | Touches multiple files/components, or has moderate regression risk, or requires non-trivial testing |
| `High` | Wide blast radius, high regression risk, touches shared/critical infrastructure, or the issue itself signals systemic uncertainty (race conditions, data corruption, security) |
| `Unknown` | No basis to estimate scope or risk |

**Explicit reminder:** a `Low`-effort, one-line change to a shared authentication check can be `complexity: High`. A large mechanical find-and-replace across 40 files can be `complexity: Low`. Annotators justify complexity from *risk*, not *line count*.

### 3.4 Task Type
Enum unchanged from Phase 2 §4 (`Bug, Feature, Improvement, Refactor, Performance, Security, Maintenance, Documentation, Other, Unknown`). Operational tie-breakers for the common confusions:

- **Bug vs. Improvement:** if the issue describes behavior that contradicts a stated or reasonably implied spec/expectation → `Bug`. If it describes behavior that works as designed but could be better → `Improvement`.
- **Performance vs. Bug:** if the described problem is "wrong result" → `Bug`. If it's "correct result, too slow / too much resource use" → `Performance`.
- **Security vs. Bug:** any issue describing unauthorized access, data exposure, injection, or auth bypass → `Security`, even if it's also technically a correctness bug. Security takes precedence — this feeds the Phase 2 §4 `review_required` trigger #4, so a mislabel here silently removes a mandatory human review.
- **Refactor vs. Improvement:** `Refactor` = no external behavior change intended. `Improvement` = behavior does change, just not because it was "wrong."
- **`Other`** requires a one-line justification in `annotator_notes` — it is not a default for uncertainty (that's what `Unknown` is for). `Other` means "I can confidently say it's none of the above," not "I'm not sure."

### 3.5 Provenance source types
Unchanged from Phase 2 (`EXPLICIT`, `SUPPORTED_BY_CONTEXT`, `INFERRED`, `UNKNOWN`), operationalized:

- **`EXPLICIT`** — the issue states this directly ("this is a security vulnerability"). Annotator can point at a specific sentence.
- **`SUPPORTED_BY_CONTEXT`** — not stated outright, but a label, a linked issue, a comment, or strong surrounding phrasing supports it without requiring the annotator's own reasoning chain.
- **`INFERRED`** — the annotator's own domain reasoning bridges a real gap that the text doesn't close on its own ("issue discusses SQL query timeouts → inferred Backend"). Evidence must state the reasoning chain, not just the conclusion.
- **`UNKNOWN`** — no defensible basis. `evidence` and `confidence` are `null` (Phase 2 Validation Rule 2) — annotators must never fill these with a placeholder string.

### 3.6 Free-text fields (title, summary, objective, description, expected_outcome, scope, acceptance_criteria)
These are not classifications but they still carry provenance and are still subject to the grounding policy: an annotator may *rephrase* the issue into a well-formed title/summary, but may not *add facts* not supported by the issue. `acceptance_criteria` must be testable statements — "the bug is fixed" is not acceptable; "submitting the form twice within 500ms results in exactly one record created" is.

---

## 4. Edge-Case Rules

These rules resolve the situations named in the master prompt (ambiguous issues, multiple valid interpretations, missing information, conflicting evidence, multiple roles, multiple technologies, multi-component tasks) with a **deterministic procedure**, not annotator judgment alone — because judgment alone is exactly what produces low inter-annotator agreement.

### 4.1 Ambiguous issues / multiple valid interpretations
If an issue genuinely supports two different, non-overlapping classifications for the same field (e.g., could reasonably be `Bug` or `Improvement` depending on unstated intent):
1. The annotator selects the interpretation that requires the **fewest assumptions** beyond the text.
2. The rejected interpretation is recorded as a `missing_information` entry ("Issue could also be read as an Improvement if X was the intended behavior all along — not stated").
3. The field's provenance confidence is capped at **0.6** (this feeds `uncertain_information`, Phase 2 §4) regardless of how confident the annotator personally feels — genuine ambiguity is a property of the input, not of the annotator's certainty.

### 4.2 Missing information
Every gap that would change a classification if filled must produce a `missing_information` string, even if the annotator still produced a value for the field. This is a required output (Phase 1 §10), not optional — an empty `missing_information` array on an `Unknown`-heavy record is itself a red flag caught in QA (Section 8.3).

### 4.3 Conflicting evidence
If the issue body says one thing and a comment/label contradicts it (e.g., body says "frontend bug," a maintainer comment says "actually this is a backend caching issue"):
1. **Most recent, most authoritative source wins for the value.** A maintainer/triager comment outranks the original reporter's initial guess.
2. **Both are recorded.** The provenance `evidence` for the winning value notes the conflict and why the other source was not used ("original report suggested Frontend; maintainer comment clarified root cause is server-side caching — using latter").
3. If authority/recency is itself ambiguous (two commenters disagree, neither clearly senior), the field drops to `INFERRED` at best, confidence capped at 0.5, and the conflict is logged in `missing_information`.

### 4.4 Multiple roles implicated (not quite `Fullstack`)
If an issue touches both layers but the *coupling* is unclear (e.g., "the export button is broken" could be a frontend event-handler bug or a backend export-generation bug):
- Do not default to `Fullstack` — `Fullstack` means both layers are known to need change, not "could be either."
- Default to `Unknown` for `role`, with `missing_information` stating the two competing hypotheses.

### 4.5 Multiple technologies / multi-component tasks
`technologies`, `components`, `systems`, `technical_areas` are array fields (Phase 2 §4) precisely so multiplicity is not an edge case at the schema level — it's a first-class outcome. The annotation-specific rule:
- Every array entry gets included only if independently groundable — do not pad the list with plausible-but-unstated technologies because the "kind of app" typically uses them (this is the same fabrication risk as Section 3, applied to arrays).
- If more than ~5 components are named, the annotator should ask whether the issue is actually describing **multiple tasks** miswritten as one issue. If so, this is flagged in `annotator_notes` and escalated (Section 7) rather than force-fit into a single record — Phase 6 annotates tasks, not backlogs, and a single record shouldn't silently absorb what should be several.

### 4.6 Empty or near-empty issues
Per Phase 1 §4 input assumptions, degenerate input (one-line issue, no body) must still produce a valid record. The rule: every classification field is `Unknown` unless the title alone is genuinely sufficient (rare — "Fix typo in README" is enough for `task_type: Documentation`, `complexity: Low`, but not enough for `role` if README location isn't obvious). `acceptance_criteria` may be empty only under the Phase 2 §3 Validation Rule 5 condition (role/experience/complexity/task_type all `Unknown`).

---

## 5. Annotator Examples

Three worked examples, chosen to each exercise a different edge case above.

### Example A — Clean, mostly `EXPLICIT`
**Issue:** "Login form shows no error message when password is wrong. `LoginForm.tsx` just clears the password field silently. Expected: show 'Invalid credentials' message like we do on the signup form."

- `role`: `Frontend` — `EXPLICIT`, evidence: "names `LoginForm.tsx`, describes client-visible message behavior," confidence 0.95
- `task_type`: `Bug` — `EXPLICIT`, evidence: "describes behavior that contradicts expected behavior stated in the same issue," confidence 0.9
- `experience_level`: `Beginner` — `INFERRED`, evidence: "pattern already exists on signup form per issue text; this is a copy-the-pattern fix," confidence 0.7
- `complexity`: `Low` — `INFERRED`, evidence: "single component, existing pattern to follow, low regression risk," confidence 0.75
- `acceptance_criteria`: `["Submitting the login form with an incorrect password displays an 'Invalid credentials' message, matching the signup form's error pattern"]`
- `review.review_required`: `false` (no trigger rule fires)

### Example B — Ambiguous complexity, conflicting evidence (Section 4.1, 4.3)
**Issue:** "Users report the app 'sometimes' logs them out randomly." Comment from a maintainer: "Could be the token refresh race condition we saw in `AuthProvider` last quarter, or could be unrelated — haven't confirmed."

- `role`: `Backend` — `SUPPORTED_BY_CONTEXT`, evidence: "maintainer comment names `AuthProvider`/token refresh, a session-management concern," confidence 0.6 (capped per 4.1 — maintainer themselves is uncertain)
- `task_type`: `Bug` — `EXPLICIT`, confidence 0.85
- `complexity`: `High` — `SUPPORTED_BY_CONTEXT`, evidence: "maintainer's own hypothesis is a race condition, a High-risk category per Section 3.3, even though unconfirmed," confidence 0.55
- `experience_level`: `Advanced` — `INFERRED`, evidence: "diagnosing an intermittent, possibly-race-condition auth bug requires deep system understanding," confidence 0.6
- `missing_information`: `["Root cause not confirmed by maintainer — could be the suspected token-refresh race condition or an unrelated cause; reproduction steps not provided"]`
- `review.review_required`: `true` — reasons: `["complexity == High and evidence confidence below threshold"]` per Phase 2 §4 trigger interacting with `uncertain_information`

### Example C — Degenerate input (Section 4.6)
**Issue:** Title only: "Fix the thing on the dashboard." No body.

- `role`: `Unknown`, `experience_level`: `Unknown`, `complexity`: `Unknown`, `task_type`: `Unknown` — all `UNKNOWN` source, `evidence: null`, `confidence: null`
- `acceptance_criteria`: `[]` (valid per Phase 2 §3 Validation Rule 5, since all four gating fields are `Unknown`)
- `missing_information`: `["No description of what 'the thing' is, what dashboard, or what the correct behavior should be — issue is not actionable as written"]`
- `review.review_required`: `true` — reasons: `["role is Unknown", "experience_level is Unknown", "complexity is Unknown", "acceptance_criteria is empty"]`

---

## 6. Agreement Methodology (Inter-Annotator Agreement)

### 6.1 Annotation tiers
- **Tier 1 (dual-annotated):** every issue is annotated independently by two annotators with no visibility into each other's submission (enforced by the annotation tool — a Phase-6 requirement on tooling, not a build here). This is the default for all newly-onboarded repos/projects and for any issue whose title/body length or label set matches a historically high-disagreement profile (Section 8.4).
- **Tier 2 (single-annotated with spot audit):** once a repo/domain has demonstrated stable agreement (Section 6.2 threshold met over a rolling window), routine issues may move to single-annotation with a random **15%** audit sample dual-annotated retroactively to detect drift.
- Security-flagged issues (`task_type: Security`, or any field where an annotator's own notes raise a security concern) are **always** Tier 1, regardless of domain maturity — mirroring the Phase 2 §4 mandatory-review trigger.

### 6.2 Agreement metrics, per field type
- **Closed-enum fields** (`role`, `experience_level`, `complexity`, `task_type`): **Cohen's κ** between the two annotators' raw pre-adjudication values. Target: **κ ≥ 0.7** ("substantial agreement") for a field to be considered stable enough for Tier 2 eligibility; κ ≥ 0.85 to be considered a "solved" field requiring lighter QC.
- **Provenance source type** (`EXPLICIT`/`SUPPORTED_BY_CONTEXT`/`INFERRED`/`UNKNOWN`), per field: Cohen's κ, tracked *separately* from the value agreement above — two annotators can agree on `role: Backend` while disagreeing on whether that was `EXPLICIT` or `INFERRED`, and that's a real, trackable disagreement about grounding discipline (Section 1.2 rule 2).
- **Array fields** (`technologies`, `components`, `technical_areas`, etc.): **Jaccard similarity** between the two annotators' sets, averaged across the batch. No fixed κ-style target (arrays are inherently softer), but tracked over time; a sustained drop signals guideline drift or a genuinely harder domain.
- **Free-text fields** (`summary`, `objective`, `expected_outcome`, `acceptance_criteria`): not scored for exact agreement (free text will never match verbatim by design). Instead, a **semantic equivalence check** during adjudication (Section 7) — did both annotators capture the same substantive claims — logged as agree/disagree at the record level, not scored numerically.
- **`Unknown` usage rate**: tracked per annotator, not just agreement between annotators. An annotator whose `Unknown` rate is a statistical outlier (too low → probably fabricating; too high → probably under-engaging) is flagged for guideline re-training (Section 8.2), independent of whether their partner happened to agree.

### 6.3 What counts as "solid ground truth"
A record is promoted to the training/eval ground-truth pool only when:
1. Both Tier 1 annotators' closed-enum values either agreed outright, or were adjudicated (Section 7) to a single resolved value, **and**
2. The resolved record passes schema validation (Phase 2 §3) as a hard gate, **and**
3. No unresolved disagreement remains in `disagreement_log` for any field feeding `review.review_required`'s trigger rules (a resolved-vs-unresolved review flag is not allowed to silently drop into the pool).

---

## 7. Adjudication Procedure

Triggered whenever two independent annotations disagree on any field that affects a closed-enum value, `task_type`, provenance `source`, or `review_required`.

1. **Auto-detection.** The annotation tool (a requirement on tooling, not built here) diffs the two submissions field-by-field and generates the `disagreement_log` entries automatically — annotators do not manually report disagreement.
2. **Severity triage.** Disagreements are bucketed:
   - **Minor** (e.g., `Intermediate` vs. `Advanced`, adjacent enum values, or array-set differences with high overlap) → resolved by a **third annotator** ("tie-breaker") who sees both submissions' *values* but not their identities, and picks one, or a blended value where the schema allows arrays.
   - **Major** (e.g., `Frontend` vs. `Backend`, any disagreement touching `task_type: Security` in either direction, or any disagreement on `Unknown` vs. a concrete value) → escalated directly to a **named adjudicator** (a senior annotator or domain lead), never resolved by simple tie-break, because these are exactly the disagreements Phase 1 §9's failure criteria treat as high-cost if silently averaged away.
3. **Adjudicator process.** The adjudicator reviews the issue text fresh (not just the two submitted records), reads both annotators' evidence strings, and either:
   - confirms one submission's value with its evidence, or
   - writes a new value with new evidence (this can happen — the adjudicator is not limited to picking between the two options), or
   - determines the issue is genuinely `Unknown`/ambiguous and resolves it that way, converting the disagreement itself into a `missing_information` entry.
4. **Resolution is logged, not silent.** `disagreement_log[].resolution` records the final call and rationale in one sentence; `resolved_by` records the adjudicator's ID. `agreement_status` moves to `adjudicated`.
5. **No re-litigation by the original annotators.** Once adjudicated, the record is final for ground-truth purposes. Systemic patterns (the same disagreement type recurring) feed Section 8.4's guideline-revision loop instead of case-by-case appeals.
6. **Adjudicator independence.** An adjudicator may not adjudicate their own annotation. Where only two annotators exist for a niche domain, a rotating cross-domain adjudicator pool is used rather than compromising this rule.

---

## 8. Annotation QA System

### 8.1 Pre-annotation gate (calibration)
Before any annotator's labels count toward ground truth, they complete a **calibration batch**: a fixed set of ~20 issues with adjudicator-established gold labels (not revealed to the annotator). Qualification requires:
- κ ≥ 0.7 against gold on closed-enum fields, **and**
- Zero instances of fabricated evidence (an `EXPLICIT`/`SUPPORTED_BY_CONTEXT` claim with no locatable support) — this is a hard fail regardless of κ, mirroring Phase 1 §9's treatment of fabrication as categorically worse than ordinary misclassification.

Annotators who fail are re-trained on the specific guideline sections implicated by their errors and re-take a fresh calibration batch (different issues, same difficulty profile).

### 8.2 Ongoing spot checks
Independent of the Tier 1/Tier 2 routing (Section 6.1), a continuous **5% random sample** of all submitted records (dual- or single-annotated) is pulled for adjudicator review, regardless of whether the two annotators agreed — because agreement between two annotators does not rule out *shared* misunderstanding of a guideline.

### 8.3 Consistency checks (automated, schema-adjacent but annotation-specific)
These run on every submitted record before it's eligible for adjudication or promotion, catching annotator error distinct from Phase 2's structural validation:
1. **Fabrication check:** every `EXPLICIT`/`SUPPORTED_BY_CONTEXT` evidence string must contain at least one token overlapping the issue text (a cheap automatable proxy — genuine semantic grounding is confirmed in review, but a zero-overlap evidence string is an immediate flag).
2. **Empty-uncertainty check:** any record with ≥2 `Unknown` fields but an empty `missing_information` array is flagged (Section 4.2 violation).
3. **Experience/complexity collapse check:** identical (or near-identical, string-similarity-scored) evidence for `experience_level` and `complexity` is flagged — this is the annotation-time enforcement of Phase 2 Validation Rule 7, catching it before it ever reaches schema validation.
4. **Confidence/source mismatch check:** an `EXPLICIT` entry with confidence < 0.6, or an `INFERRED` entry with confidence > 0.9, is flagged for a second look — not auto-rejected, since real exceptions exist, but surfaced (this operationalizes Phase 1 §8's calibration criterion at annotation time rather than only at model-eval time).

### 8.4 Guideline drift feedback loop
Every adjudication (Section 7) and every QA flag (Section 8.3) is logged with the field and the nature of the disagreement/error. Monthly (or every N-record batch, whichever is more frequent for the given volume), these logs are reviewed for **recurring patterns** — e.g., if `Improvement` vs. `Bug` is consistently mis-adjudicated on issues with a certain phrasing, that's a guideline gap, not an annotator failure. Section 3.4's tie-breaker rules exist because this loop already ran once, conceptually, in producing this document; the same loop continues indefinitely as new edge cases surface. Guideline revisions are versioned alongside the annotation system (Section 9) and re-triggers calibration (Section 8.1) for active annotators on the affected fields only, not a full re-qualification.

### 8.5 Annotator performance tracking
Per-annotator, tracked over rolling windows: agreement-with-gold rate, agreement-with-partner rate, `Unknown` usage rate (Section 6.2), fabrication-check flag rate, and average time per record (an outlier-low time correlates with rubber-stamping, an outlier-high time may indicate the guidelines are unclear for that annotator specifically — both are QA signals, not just efficiency metrics).

---

## 9. Phase-6 Decision Record

| Decision | Rationale |
|---|---|
| Annotation schema is the Phase 2 schema plus a stripped `annotation_meta` block, not a parallel schema | Ground truth must be structurally identical to what the model produces, or evaluation is comparing apples to oranges; process metadata is real but doesn't belong in the fact-bearing record |
| Dual-annotation (Tier 1) is the default, with earned downgrade to single+audit (Tier 2) | Mirrors Phase 1's "abstention over false confidence" philosophy applied to process design — assume disagreement is possible until a domain proves otherwise, not the reverse |
| Security-flagged issues are always Tier 1, never downgraded | Matches Phase 2 §4's mandatory-review trigger for `task_type: Security`; a process shortcut here would silently undo a safety guarantee already established one phase earlier |
| Experience/complexity independence is enforced *and checked* at annotation time (8.3.3), not left to downstream schema validation alone | Catching the collapse at the source is cheaper and prevents propagating a systematically confused signal into thousands of records before anyone notices |
| Fabrication (unsupported `EXPLICIT`/`SUPPORTED_BY_CONTEXT`) is a hard qualification failure, not a scored error | Directly inherits Phase 1 §9's framing that fabricated grounding is a categorically worse failure than ordinary misclassification — the annotation process should not tolerate in humans what the model is explicitly forbidden from doing |
| Adjudication severity is triaged (minor → tie-break, major → named adjudicator) rather than one uniform resolution path | Not all disagreements carry equal cost; role/task-type/security disagreements are exactly the high-stakes cases Phase 1's failure criteria care about most, so they get a real domain expert, not a coin-flip |
| Disagreement and QA logs feed a standing guideline-revision loop (8.4) rather than being archived as closed cases | Annotation guidelines are a living artifact — treating disagreements as pure noise instead of signal would mean the same ambiguity gets mis-annotated forever |
| No annotation tooling, UI, or infrastructure specified | Out of scope per the same "no infrastructure" boundary Phase 1–5 held to; this document defines the process and the requirements it places on tooling, not the tooling itself |
