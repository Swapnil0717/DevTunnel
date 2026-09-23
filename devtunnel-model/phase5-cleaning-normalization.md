# Phase 5 — Cleaning & Normalization
## Specialized AI Software Engineering Model: From Collected Candidates to Annotation-Ready Records

Source of truth: Phase 1 (ITU-1), Phase 2 (`task-schema.v2.json`), Phase 3 (Data Strategy), Phase 4 (Data Collection System). Phase 4 produced `CollectedRecord`s gated to `READY_FOR_LABELING`, `REDACTION_HELD`, or `EVAL_RESERVED`, with `ground_truth: null` throughout. Phase 5 takes that queue and improves its quality — fixing formatting, normalizing terminology, resolving redaction holds, and catching leakage/contamination/contradiction that only becomes visible once text is properly parsed — **without producing any ground truth**. Annotation remains a later phase's job.

---

## 0. Guiding Principle and Scope Boundary

**Guiding principle (per the task):** improve quality without destroying software-engineering meaning. Two corollaries drive every rule below:

1. **Nothing that carries technical signal is stripped for being noisy-looking.** Stack traces, logs, long code blocks, unusual identifiers, and non-English or non-standard phrasing are exactly the content Phase 3's capabilities 7–9 and 12 depend on. A cleaning pass that "tidies" an issue by shortening its stack trace has silently destroyed the evidence a future labeler (or the model itself) would need.
2. **Cleaning never overwrites the source text.** The raw, as-collected `input_core`/`context_bundle` from Phase 4 is immutable. Every cleaning operation produces a *derived* view or a *sidecar* field alongside it — never an in-place rewrite — because Phase 1 §11's grounding policy requires evidence to be traceable to actual input text, and a mutated body breaks that traceability before annotation ever begins.

**Scope boundary:** Phase 5 does not produce `ground_truth`, does not assign `role`/`experience_level`/`complexity`/`task_type`, and does not decide `task.technologies`/`components`/etc. It normalizes and validates the *substrate* those judgments will later be made from. Where this document says "normalize a technology name," it means making token forms consistent for extraction, not deciding which technologies belong in a record's eventual `task.technologies` list.

---

## 1. Cleaning Architecture

### 1.1 Structural model

Every `CollectedRecord` gains a derived companion, never replacing the original:

```
CollectedRecord (Phase 4, immutable)
        │
        ▼
CleaningPass (this phase)
        │
        ├── cleaned_view        — structurally repaired, segmented text (Section 1.2)
        ├── normalized_terms    — sidecar term-canonicalization index (Section 2)
        ├── transformation_log  — append-only record of every operation applied (Section 1.3)
        └── quality_status      — updated collection_stage + new cleaning-specific flags
```

`CleanedRecord = CollectedRecord + cleaning outputs`. The original `input_core`/`context_bundle` fields are never edited; `cleaned_view` is additive.

### 1.2 Pipeline stages (in order)

| Stage | Name | What it does |
|---|---|---|
| C1 | Structural parsing | Segment issue/comment text into typed spans: prose, markdown, fenced code block (with language tag if present), stack trace, log excerpt, URL, mention, inline code. Segmentation is the foundation everything else operates on — later stages act on typed spans, not raw bytes. |
| C2 | Structural repair | Fix mechanically broken formatting (unclosed code fences, malformed markdown tables, truncated HTML entities) **only when the repair is unambiguous** (e.g., a fence opened but never closed is closed at the next blank line or end of text). Ambiguous cases are flagged, not guessed. |
| C3 | Redaction execution | Resolve `REDACTION_HELD` records from Phase 4: mask detected PII/secrets in place *within `cleaned_view` only*, using structure-preserving placeholders (Section 4.3). If confident redaction isn't possible, exclude per ER-4 — this is where that Phase-4-deferred decision is finally made. |
| C4 | Noise stripping (lossless only) | Strip content that is verifiably zero-signal and mechanically identifiable: issue-template HTML comments (`<!-- ... -->` template instructions), auto-generated CI-bot boilerplate footers, tracking pixels/badges. Never strips anything containing prose, code, stack traces, or logs, however messy-looking (Section 0). |
| C5 | Normalization | Populate `normalized_terms` — canonical forms for technology/framework/language names, terminology, and repository metadata (Section 2). Additive sidecar only. |
| C6 | Refined deduplication | Re-run Phase 4's dedup/near-dup logic against `cleaned_view` (post template-stripping) instead of raw text, correcting both false positives (two different issues sharing a template skeleton) and false negatives (same substantive issue text obscured by formatting noise) (Section 3). |
| C7 | Leakage / contamination / contradiction detection | Cross-reference against the Tier-6 quarantine store, the eval reservation, and known benchmark fingerprints, now on cleaned/segmented text where raw-text checks in Phase 4 could miss a leak hidden inside inconsistent formatting (Section 6). Contradictions are detected and flagged, never silently resolved. |
| C8 | Validation gate | Run every check in Section 5 as a hard pass/fail gate. Pass → `ANNOTATION_READY`. Fail → routed with a reason, same discipline as Phase 4's `EXCLUDED`/held states. |

### 1.3 Transformation log

Every stage C1–C8 appends an entry — `(collection_id, stage, action, before_span_ref, after_span_ref, provenance_tag, timestamp, tool_version)` — to a per-record log, extending Phase 4's collection lineage log rather than replacing it. This makes every cleaning action individually auditable and reversible: a later discovery that a normalization rule was wrong can be traced to exactly which records it touched, without re-deriving anything from scratch.

### 1.4 A third provenance layer

This phase introduces **cleaning provenance**, distinct from both provenance layers established earlier in the project:

- Phase 3's **field-level provenance** (`EXPLICIT`/`SUPPORTED_BY_CONTEXT`/`INFERRED`/`UNKNOWN`) describes the model's eventual *classification* fields — not produced here.
- Phase 4's **data provenance** describes *where a record came from and how it was fetched* — collection-time metadata.
- Phase 5's **cleaning provenance** describes *how confident the pipeline is about a specific cleaning or normalization action it took on the text itself*.

Every entry in `normalized_terms`, every dedup-cluster judgment, every leakage/contradiction flag carries one of four cleaning-provenance tags:

| Tag | Meaning |
|---|---|
| `EXPLICIT` | The canonical form is verbatim or a trivial case-fold of what's in the source text (e.g., source says "PostgreSQL" — no inference involved). |
| `MODEL_INFERRED` | An automated heuristic or pattern-match made the call (e.g., fuzzy-matching "psql" to "PostgreSQL", or a code-fence's inferred language from syntax when no language tag was present). |
| `HUMAN_REVIEWED` | A human reviewer confirmed or corrected the action during spot-audit QA (Section 5.3) — not full manual labeling, just a targeted quality check. |
| `UNKNOWN` | The pipeline could not confidently determine a canonical form; the raw token is retained unmodified in `normalized_terms` rather than forced into a guessed canonical bucket. |

This mirrors the discipline Phase 1 §10 established for the model's own output — abstention (`UNKNOWN`) is a legitimate, first-class outcome for a cleaning action too, not a defect to be papered over.

---

## 2. Normalization Rules

Normalization is always additive (`normalized_terms` sidecar), never a rewrite of source prose.

### 2.1 Sidecar shape

```yaml
normalized_terms:
  - raw: string                 # exact substring as it appears in the source text
    span_ref: string            # pointer back into the original text (offset or segment id)
    canonical: string           # normalized form
    category: technology | framework | language | terminology | repo_metadata
    method: exact_match | alias_table | fuzzy_match | syntax_inference
    confidence: float [0.0-1.0]
    provenance_tag: EXPLICIT | MODEL_INFERRED | HUMAN_REVIEWED | UNKNOWN
```

### 2.2 Technology / framework / language names

- A maintained alias table maps common variants to one canonical form per entity (e.g., `js`/`JS`/`ecmascript` → `JavaScript`; `psql`/`postgres`/`pg` → `PostgreSQL`; `node`/`nodejs` → `Node.js`; `k8s` → `Kubernetes`). Alias tables are versioned so a later correction doesn't silently reinterpret already-processed records without a re-run.
- Ambiguous short forms (`go` the language vs. "go" the common English verb; `R` the language vs. a single letter) are resolved only with strong local context (e.g., adjacent to a code fence tagged `r`, or inside a `package.json`-style config excerpt) and tagged `MODEL_INFERRED` with confidence reflecting the ambiguity; when context is insufficient, the term is left `UNKNOWN` rather than guessed.
- A raw token with **no** alias-table match is never dropped — it's retained as its own canonical form (`canonical == raw`) with `provenance_tag: UNKNOWN`, so a labeler later still sees it. This directly enforces "do not remove information merely because it appears unusual": an obscure or niche technology name that isn't in the alias table is exactly the kind of long-tail signal Phase 3 §8 wants represented, not filtered.
- Code-fence language tags (` ```python `) are trusted as `EXPLICIT` when present. When absent, syntax-based language inference is attempted and tagged `MODEL_INFERRED`; if inference confidence is low, the block is left untagged (`UNKNOWN`) rather than mislabeling a code block's language.

### 2.3 Engineering terminology

- A synonym table normalizes *index* terms only (e.g., "NPE" ↔ "null pointer exception", "race condition" ↔ "data race" where genuinely synonymous) for later searchability — this never rewrites the issue body, only adds sidecar entries a labeler or retrieval process can use.
- Terminology normalization explicitly does **not** attempt to normalize away genuine technical distinctions that look similar but aren't (e.g., "memory leak" vs. "memory corruption" stay separate canonical forms) — collapsing near-synonyms that aren't actually synonymous would destroy exactly the technical precision Phase 3 §3 capability 6 needs to distinguish confusable task types.

### 2.4 Classification-value vocabulary (schema-adjacent, not schema-populating)

Where issue text or labels use non-canonical spellings of concepts that *overlap* with Phase 2's enums (e.g., a label reading `bugfix` vs. the schema's `Bug`), Phase 5 normalizes the **label token itself** in the sidecar (`bugfix → Bug` as a terminology mapping) for labeler convenience. This is not populating `task.task_type` — labels remain signal, never ground truth (Phase 3 §2), and no sidecar entry here is permitted to be copied into a `TrainingExample` field without going through actual labeling.

### 2.5 Repository metadata

- `primary_language` (as reported by the platform's linguist-style detection) is cross-checked against the file-tree extensions captured in Tier 2 context; a mismatch is flagged (`quality_flags: "primary_language_mismatch"`), not silently corrected, since the *file tree* is closer to ground truth than a platform heuristic but Phase 5 doesn't adjudicate — it surfaces the discrepancy for whoever assembles context at labeling time.
- Repository topic tags are canonicalized the same way as technology names (Section 2.2), same alias-table discipline.

### 2.6 Mentions, URLs, logs, stack traces

| Content type | Rule |
|---|---|
| `@mentions` | Preserved structurally (a mention indicates a real conversational relationship relevant to capability 9 — "who said what") but the underlying identity is **pseudonymized** in `cleaned_view` to a stable per-record token (`@user_1`, `@user_2`, consistent within one record so multi-turn reference is preserved) — addresses PS-1 without deleting the structural signal that multiple people, or a specific person referenced twice, are part of the thread. |
| URLs | Preserved verbatim, since a URL to another issue/PR is exactly what `dependencies[].ref` resolution (Phase 2 Validation Rule 9) needs. Query parameters matching known token/secret patterns are stripped (PS-2) while the base URL and path remain intact. |
| Stack traces | Preserved verbatim, always. Segmented (C1) and tagged as a `stack_trace` span so downstream tooling can treat it distinctly, but never shortened, deduplicated-within-itself, or summarized — a stack trace's exact frames are the technical content capabilities 7/8/11 depend on. |
| Logs | Same as stack traces — preserved verbatim and typed, not truncated. If a log excerpt is implausibly large (multi-megabyte paste), it is flagged for review, not silently truncated; truncation is a judgment call left to a human reviewer, never automatic. |
| Labels array | Case/whitespace-normalized only (`Bug ` → `Bug`) for consistent downstream indexing; content and set membership untouched. |

---

## 3. Deduplication Rules

Phase 5 refines, but does not replace, Phase 4's dedup/near-dup mechanism (Q-DUP, Q-NEARDUP) — the same cap-deferral principle from the Phase 4 decision record still holds: **capping a near-dup cluster to a representative subset remains a corpus-composition decision made later, never a Phase-5 deletion.**

| Refinement | Why it's needed now, not in Phase 4 |
|---|---|
| **Template-skeleton exclusion before comparison.** Issue-template boilerplate (headers like "Steps to reproduce", checkbox scaffolding) is excluded from the hashing/fingerprinting input, comparing only user-authored content. | Phase 4's raw-text hashing would otherwise treat two unrelated issues that both filled out the same repo's bug template as artificially similar (false near-dup) or, conversely, treat two genuinely identical reports with slightly different template formatting as distinct (false negative). Only after C1's structural parsing can template scaffolding be reliably identified and excluded. |
| **Stack-trace/log normalization before fingerprinting.** Volatile substrings (timestamps, memory addresses, line numbers that shift release-to-release) inside a stack trace are masked *only for the purposes of the similarity fingerprint* — never in `cleaned_view` itself (Section 2.6 still preserves them verbatim). | Two reports of the literal same bug against different releases can otherwise fingerprint as dissimilar purely because of a changed line number, defeating Q-NEARDUP's purpose. |
| **Re-clustering against the full existing index, cleaned-text basis.** Extends Phase 4's re-verification requirement (CP-7) using higher-fidelity cleaned fingerprints. | A pair that looked dissimilar on raw text (e.g., one pasted the trace as an image-derived OCR dump, the other typed it cleanly) may cluster correctly once both are normalized through C1–C2. |
| **Cluster provenance tagging.** Every cluster assignment/merge/split gets a cleaning-provenance tag (Section 1.4) — exact-hash matches are `EXPLICIT`, fingerprint-threshold matches are `MODEL_INFERRED`. | Lets a later reviewer distinguish "these are definitely the same" from "these are probably the same" when deciding which cluster member to keep at split-assembly time. |

Repository-level split reservation (CP-1) and eval-set isolation (CP-5) set in Phase 4 are never altered by Phase 5 — refined dedup can move a record between `dedup_cluster_id`s but never across the train/eval repository partition already reserved.

---

## 4. Filtering Rules

### 4.1 Invalid vs. empty — kept distinct

Phase 3's Inclusion Rules are explicit that minimal/empty issues are **included**, not filtered (IR-2, Q-MISS). Phase 5 must not quietly re-introduce a cleanliness filter under the banner of "quality." The distinction enforced here:

| Category | Definition | Disposition |
|---|---|---|
| **Empty-but-labelable** | One-line title, no/near-empty body, but the issue is a real, retrievable, human-authored artifact | **Kept.** Passes through with `quality_flags: "minimal_content"` for downstream awareness — this is exactly the Phase 2 Example-3 pattern Phase 3 requires the corpus to contain. |
| **Invalid** | The issue is not actually retrievable content at all — e.g., the API returned a tombstone/deleted-issue placeholder, the body is purely auto-generated bot noise with zero human-authored text, or structural parsing (C1) finds no recoverable prose/code/comment content whatsoever after template-stripping | **Excluded**, reason-coded distinctly from spam (ER-1 was already applied in Phase 4; this catches artifacts that only reveal themselves as contentless once properly parsed). |

### 4.2 Broken formatting

Repaired when unambiguous (Section 1.2, C2). When not unambiguous, the record is **not** excluded outright — it's flagged (`quality_flags: "unrepaired_formatting"`) and passed through with the ambiguity visible, since malformed markdown is still evidence of something (and per Section 0, unusual != worthless).

### 4.3 Redaction resolution (finalizing Phase 4's `REDACTION_HELD`)

- Detected PII/secrets are replaced in `cleaned_view` with typed placeholders that preserve structure: an API key becomes `<REDACTED_SECRET>`, a personal email becomes `<REDACTED_EMAIL>`, a real name becomes `<REDACTED_NAME>` — chosen so that surrounding technical context (e.g., "the request fails when `apiKey=<REDACTED_SECRET>` is set") remains legible and informative without exposing the underlying value.
- If the detector's confidence in either the *detection* or the *redaction boundary* (where exactly the secret starts/ends) is low, the record stays excluded (ER-4) rather than shipping a partially-redacted guess — this is the "excluded then, not now" decision Phase 4 deferred to this stage.
- Redaction actions are logged with cleaning provenance (`MODEL_INFERRED` for automated detection, `HUMAN_REVIEWED` if caught in spot-audit) so a later takedown/audit (PS-5, PS-6) can identify exactly what was masked and why.

### 4.4 What Phase 5 never filters on

Per Section 0: issue quality/terseness (Q-LOWQ), non-English content quality (handled by coverage, not exclusion, per Phase 3 §8.2), unusual/obscure technology names, contradictory internal statements (Q-CONTRA — preserved and flagged, see Section 6), and closed/wontfix/duplicate-resolution status (Q-STATUS). None of these are cleaning-stage exclusion criteria.

---

## 5. Quality Gates

A `CleanedRecord` reaches `ANNOTATION_READY` only after passing every gate below. Each is a hard pass/fail with a logged reason on failure, consistent with the discipline established in Phase 4.

| Gate | Checks | Failure routing |
|---|---|---|
| **Structural validity** | `cleaned_view` parses into well-formed typed spans (Section 1.2, C1); no unresolved fatal parse errors | `EXCLUDED: unparseable_structure` |
| **Redaction resolution** | No unresolved `REDACTION_HELD` state remains — either successfully redacted or excluded (Section 4.3) | Resolved before this gate is reached; nothing passes through still holding a PII/secret flag |
| **Invalidity check** | Not an "Invalid" record per Section 4.1 | `EXCLUDED: invalid_content` |
| **Dedup resolution** | Record's cluster status is current against the refined fingerprint index (Section 3); exact-dup non-representatives held | `DEDUP_HELD` (unchanged disposition, refined membership) |
| **Leakage clearance** | No Tier-6-quarantine content, or fragment thereof, detected inside any context the record would expose at its `max_tier_available` (Section 6) | `EXCLUDED: leakage_detected` |
| **Contamination clearance** | No unresolved match against the eval reservation or known public-benchmark fingerprints (Section 6) | `EVAL_RESERVED` or `EXCLUDED: benchmark_overlap`, never silently kept in the training-eligible pool |
| **Sidecar integrity** | Every `normalized_terms` entry has a valid `span_ref` resolvable back into the source text (no orphaned normalization claiming to reference text that isn't there) | `EXCLUDED: sidecar_integrity_failure` (a pipeline bug, not a content problem — routed for engineering review, not content review) |
| **Immutability check** | `input_core`/`context_bundle` byte-for-byte identical to the Phase-4 original (Section 0, corollary 2) | `EXCLUDED: source_mutation_detected` (should never trigger; a hard invariant, checked anyway) |

### 5.3 Spot-audit QA (human-reviewed subset, not full annotation)

A sampled subset (not the full corpus) of records passing all gates is spot-checked by a human reviewer against the *cleaning* actions taken — confirming normalization mappings, redaction boundaries, and dedup-cluster calls are correct — and upgrading their cleaning-provenance tags to `HUMAN_REVIEWED` where confirmed, or correcting them where wrong (with the correction logged). This is **not** ground-truth labeling — the reviewer is auditing the cleaning pipeline's judgment calls, not producing a Task Understanding Record.

---

## 6. Leakage Detection

Extends Phase 4 Stage 12/13's raw-text checks with cleaned/segmented text, which surfaces leak vectors raw-text comparison misses.

| Check | Mechanism | New relative to Phase 4? |
|---|---|---|
| **Quoted-PR/commit content in comments** | Cross-reference the Tier-6 quarantine store (Section 3, Phase 4) against every comment span in Tiers 1–5 using the same near-dup fingerprinting used for dedup (Section 3), now catching a maintainer who *pasted* the resolving PR's diff or commit message directly into an issue comment — content that never touched the quarantine store's fetch path but carries the same leakage risk (CP-4, ER-5) | **Yes** — Phase 4's quarantine only isolates content fetched *as* PR/commit data; it can't catch resolution content re-entering through a comment. This is a genuinely new detection surface only visible once comments are properly segmented. |
| **Context-tier boundary re-check** | Re-run Q-CTX/IR-3 against `cleaned_view`, since structural repair (C2) or template-stripping (C4) could theoretically alter what's reachable from a given tier's bundle | Refinement of Phase 4 Stage 12, now on cleaned text |
| **Contradiction detection** | Identify passages where title and body, or body and a later comment, assert incompatible claims (Q-CONTRA) via straightforward lexical/structural contradiction signals (explicit reversal language, directly conflicting stated values for the same attribute) | **Flagged, never resolved.** A detected contradiction is recorded as `quality_flags: "contradiction_detected"` with both conflicting spans referenced — resolution (deciding which side is authoritative, or that both are legitimately uncertain) is a labeling-time judgment (capability 9/12), explicitly not made here. |
| **Eval-set / benchmark contamination** | Fingerprint `cleaned_view` against the eval-reservation index and known public-benchmark corpora, extending CP-6 to catch near-matches raw-text comparison would miss (e.g., a benchmark's issue text reformatted or lightly edited) | Refinement of Phase 4 Stage 13, higher recall on cleaned text |
| **Corrupt-record detection** | Records where structural parsing (C1) fails catastrophically, where `normalized_terms` span references don't resolve, or where the transformation log shows a stage exited abnormally | New — a pipeline-integrity check, not a content-quality check; routed for engineering review (Section 5) |

Any positive leakage/contamination finding routes the record out of the training-eligible pool immediately — leakage clearance is a hard gate (Section 5), not a soft flag that a later stage might override.

---

## 7. Validation Tests

Representative fixtures, same discipline as Phase 2 §8 — each states the input shape, expected result, and the rule it exercises.

| # | Case | Input shape | Expected result | Rule exercised |
|---|---|---|---|---|
| V1 | Code block with explicit language tag | ` ```python\ndef f(): ...\n``` ` | `normalized_terms` gets `Python`, `provenance_tag: EXPLICIT`; `cleaned_view` byte-identical to source in that span | Section 2.2 |
| V2 | Code block with no language tag, clear syntax | Unlabeled fence containing idiomatic Go | `normalized_terms` gets `Go`, `provenance_tag: MODEL_INFERRED`, confidence reflects syntax-inference strength | Section 2.2 |
| V3 | Ambiguous short technology token | Body contains bare `"go get started"` (English, not the language) | No `Go` entry forced; left unnormalized or `UNKNOWN` | Section 2.2 (ambiguity handling) |
| V4 | Long stack trace | Multi-frame Java stack trace pasted verbatim | `cleaned_view` retains every frame verbatim; segmented as `stack_trace` type; **not** shortened | Section 0, Section 2.6 |
| V5 | Template-boilerplate near-dup false positive | Two distinct issues, same repo bug template, different user content | Not clustered together after C1 template exclusion (Section 3) | Section 3 |
| V6 | Genuine near-dup obscured by formatting | Same bug, one plain text, one OCR-dump-style paste | Clustered together post-normalization | Section 3 |
| V7 | Empty-but-labelable issue | One-line title, empty body | Passes all gates; `quality_flags: "minimal_content"`; **not excluded** | Section 4.1 |
| V8 | Bot-only tombstone content | Deleted-issue placeholder returned by the API | `EXCLUDED: invalid_content` | Section 4.1 |
| V9 | Unresolved secret in config paste | Pasted `.env` snippet with a live-looking token, detector confidence below threshold | Stays excluded (`ER-4`), not shipped with a partial redaction | Section 4.3 |
| V10 | High-confidence secret redaction | Clearly-formatted API key in a config block | `cleaned_view` shows `<REDACTED_SECRET>` in place, surrounding structure intact; original `input_core` unchanged | Section 4.3, Section 0 corollary 2 |
| V11 | Quoted PR diff in a comment | A maintainer comment pastes the resolving PR's diff verbatim | Flagged `EXCLUDED: leakage_detected`, even though Tier-6 quarantine fetch never touched this content directly | Section 6 |
| V12 | Title/body contradiction | Title says "crashes on save", body says "does not crash, just slow" | `quality_flags: "contradiction_detected"` with both spans referenced; record otherwise proceeds — **not** resolved to one side | Section 6 |
| V13 | Source-mutation invariant | (Adversarial/engineering test) Attempted in-place edit of `input_core` during cleaning | Immutability gate fails the build/pipeline run, not just the record | Section 5, invariant check |
| V14 | Malformed markdown table, unambiguous fix | Table missing a closing pipe on the last row | Repaired in `cleaned_view`; repair logged in transformation log | Section 1.2 (C2) |
| V15 | Malformed markdown, ambiguous | Nested, inconsistently-fenced code blocks with no clear resolution | `quality_flags: "unrepaired_formatting"`, record passes through unrepaired, not excluded | Section 4.2 |

---

## 8. Before/After Examples

### 8.1 Stack trace and technology normalization (preserved, not stripped)

**Before (`input_core.body`, as collected, unchanged forever):**
```
Getting this on save in the editor, using pg with node 18:

  TypeError: Cannot read properties of undefined (reading 'query')
      at Database.save (/app/src/db/repository.js:42:19)
      at async POST /api/documents (/app/src/routes/documents.js:88:5)

psql version 14.2. Started after I upgraded @octokit/rest last week.
```

**After (`cleaned_view` — same text, structurally typed; `normalized_terms` sidecar added):**
```
Getting this on save in the editor, using pg with node 18:

  [stack_trace, preserved verbatim — 2 frames, unchanged]

psql version 14.2. Started after I upgraded @octokit/rest last week.
```
```yaml
normalized_terms:
  - {raw: "pg", canonical: "PostgreSQL", category: technology, method: alias_table, confidence: 0.9, provenance_tag: MODEL_INFERRED}
  - {raw: "node 18", canonical: "Node.js 18", category: technology, method: alias_table, confidence: 0.95, provenance_tag: MODEL_INFERRED}
  - {raw: "psql", canonical: "PostgreSQL", category: technology, method: alias_table, confidence: 0.9, provenance_tag: MODEL_INFERRED}
  - {raw: "@octokit/rest", canonical: "@octokit/rest", category: framework, method: exact_match, confidence: 1.0, provenance_tag: EXPLICIT}
```
Note: the stack trace's exact file paths, line numbers, and frame order are untouched — that specificity is what later grounds `components: ["repository.js", "documents.js"]` at labeling time.

### 8.2 Mention pseudonymization (structure preserved, identity masked)

**Before:**
```
@sara-eng confirmed this also happens on staging. @sara-eng, can you check if it's the same root cause as #482?
```

**After:**
```
@user_1 confirmed this also happens on staging. @user_1, can you check if it's the same root cause as #482?
```
The repeated reference to the same person across two mentions is preserved (both become `@user_1`, not two different tokens) — the conversational structure survives; the identity does not. The issue reference (`#482`) is untouched, since it's load-bearing for `dependencies[].ref` resolution.

### 8.3 Secret redaction (structure-preserving)

**Before:**
```
My config:
  apiKey: sk_live_51Hn3k29fJ2mXaB9q...
  dbHost: internal-db-3.corp.example.com
Nothing works with this key set.
```

**After (`cleaned_view`):**
```
My config:
  apiKey: <REDACTED_SECRET>
  dbHost: internal-db-3.corp.example.com
Nothing works with this key set.
```
`input_core` (the original) is untouched in storage; only `cleaned_view` carries the redaction. The surrounding technical claim — "the key, whatever it is, doesn't work" — remains fully legible without exposing the live credential.

---

## 9. Phase-5 Decision Record

| Decision | Rationale |
|---|---|
| Cleaning is strictly additive (`cleaned_view` + `normalized_terms` sidecars); `input_core`/`context_bundle` are never mutated | Preserves Phase 1 §11's grounding-policy requirement that evidence trace to actual input text; an in-place rewrite would sever that traceability before annotation even starts |
| A third provenance layer (cleaning provenance: `EXPLICIT`/`MODEL_INFERRED`/`HUMAN_REVIEWED`/`UNKNOWN`) is introduced, distinct from Phase 3's field-level provenance and Phase 4's data provenance | Every cleaning/normalization action is itself a judgment call of varying confidence; conflating that judgment with either the model's future classification provenance or the record's collection metadata would corrupt the audit trail each layer is meant to provide |
| Stack traces, logs, and unusual/obscure identifiers are never shortened, summarized, or dropped for being noisy | Directly enforces the task's "do not remove information merely because it appears unusual" instruction — this content is exactly what capabilities 7, 8, 11, and 12 need intact |
| An unmatched technology/terminology token is retained as its own canonical form with `provenance_tag: UNKNOWN`, never dropped or forced into the nearest alias-table entry | A niche or novel technology name is long-tail diversity signal (Phase 3 §8), not noise; forcing a bad match would be a worse outcome than admitting the cleaner doesn't know |
| Redaction execution (deferred by Phase 4) happens here, with a confidence floor below which the record stays excluded rather than shipping a partial redaction | Matches Phase 3 §10 PS-2's "excluded rather than partially redacted-and-kept" rule — a low-confidence redaction boundary risks leaving a live secret in the corpus, which is worse than losing the example |
| `@mentions` are pseudonymized to stable per-record tokens rather than removed | Removing mentions entirely would destroy real conversational-structure signal (capability 9 — who said what, whether the same person is speaking twice); pseudonymizing keeps the structure while addressing PS-1 |
| Deduplication is refined (template-exclusion, trace-normalized fingerprinting) but the cap-deferral principle from Phase 4 is unchanged — clusters are still resolved to a capped subset only at corpus-composition/labeling time | Capping requires knowing which cluster member has the richest labelable content, a judgment better made with more context than Phase 5 has; re-litigating that decision here would duplicate work done properly later |
| Contradictions are detected and flagged, never resolved, at this stage | Resolving a contradiction requires the same engineering judgment ground-truth labeling exists to provide (capability 9/12); silently picking a side here would be exactly the "silently resolved" failure Phase 3 Q-CONTRA rules out |
| Leakage detection is extended to catch quoted PR/commit content pasted into comments, not just content fetched through the Tier-6 quarantine path | Phase 4's quarantine isolates a *fetch path*, not a *content pattern* — a maintainer pasting a diff into a comment bypasses the quarantine store entirely while carrying the identical leakage risk (CP-4) |
| Spot-audit QA reviews cleaning-pipeline judgment calls on a sample, and is explicitly distinguished from full ground-truth annotation | Keeps the Phase 5/Phase 6 boundary intact — auditing whether a redaction boundary or a dedup cluster call was correct is a narrower, different task than producing a Task Understanding Record, and conflating them would blur the "do not annotate yet" instruction |
| No labeling, no `ground_truth` population, no classification-field decisions occur anywhere in this pipeline | Matches the explicit task boundary given for this phase |
