# Phase 1 — Formal Model Definition
## Specialized AI Software Engineering Model: Issue → Task Understanding

---

## 1. Formal Model Definition

**Name (working):** Issue-to-Task Understanding Model (ITU-1)

**Formal statement:**

> Given a GitHub Issue (and, in later phases, surrounding repository context), the model produces a structured, traceable representation of the underlying engineering work — classified along Role, Experience, Complexity, Task Type, Technical Area, Technology, and Component dimensions — together with an Expected Outcome, a Confidence Estimate per field, and an explicit accounting of what was stated, inferred, or unknown.

The model is a **structured extraction and classification system**, not a code-generation system, not a project-management system, and not an autonomous agent. Its output is consumed by downstream systems (task trackers, planning tools, or human engineers) — it does not act on the repository itself in Phase 1.

**Core design principle:** *Understanding before automation.* The model's job in Phase 1 is to correctly and honestly understand a single issue in isolation. Every future capability (subtasking, dependency mapping, impact analysis, implementation context) is built on the reliability of this initial understanding layer. If Phase 1 hallucinates or overclaims confidence, every downstream phase inherits that error.

---

## 2. Problem Definition

**Problem being solved:**

Engineering teams write GitHub Issues in inconsistent, often ambiguous natural language. Turning an issue into an actionable, assignable task today requires a human to:

- Read and interpret the issue
- Infer what type of work it is
- Judge who should do it and how experienced they need to be
- Estimate how complex/risky the change is
- Identify which parts of the system are affected
- Decide what "done" looks like

This is manual, inconsistent across triagers, and doesn't scale. The model automates the **understanding and structuring** step — converting unstructured issue text into a structured Task representation — while being explicit about what it actually knows versus what it's guessing.

**What this is NOT solving (Phase 1):**
- Not solving "how to implement the fix" (no code generation)
- Not solving "which developer should get this" (no assignment/routing)
- Not solving repository-wide impact analysis (no code/history access yet)
- Not solving project prioritization or sprint planning

**Why this problem, specifically, first:** Every downstream capability in the long-term vision (subtasks, dependencies, impact, implementation context) depends on having a *correct, calibrated* understanding of the issue itself. Building subtasking on top of unreliable issue understanding compounds error. Phase 1 is the foundation layer.

---

## 3. Target Users

| User | How they use the model |
|---|---|
| **Engineering managers / tech leads** | Triage incoming issues faster; get consistent classification instead of ad hoc judgment |
| **Individual contributors** | Get a structured brief before picking up an issue (what kind of work, what's expected, how hard) |
| **Junior/new engineers** | Use experience-level and complexity signals to find issues matched to their skill level |
| **Engineering tooling / task trackers (downstream systems)** | Consume structured output programmatically to populate task boards, route work, or flag high-risk issues |
| **Project/program managers** | Get task-type and complexity aggregates across a backlog without reading every issue |

Note: In Phase 1, the *direct* consumer is structured data — a human or a downstream system reading the model's output, not an end-user chat interface. This shapes the output spec (Section 5): it must be **machine-parseable, not just human-readable**.

---

## 4. Input Specification

### Phase 1 (MVP) input — single source

```
Input := GitHub Issue
```

Composed of the fields realistically available from GitHub's issue object:

- `title` (string, required)
- `body` (string, may be empty or minimal — must be handled gracefully)
- `labels` (list, optional — existing labels are *context*, not ground truth to defer to blindly)
- `comments` (optional, if included — later discussion may clarify or contradict the original body)
- `author metadata` (optional — e.g. reporter vs maintainer, informational only)

**Explicitly excluded from Phase 1 input** (deferred to later phases per the long-term evolution path):
- Repository source code
- Documentation
- Dependency graphs
- Pull requests
- Git history
- Broader project context

This exclusion is a **hard boundary**, not an oversight — see Section 6. It has direct consequences for the Grounding Policy (Section 9): many fields (e.g., Component, Technology) can only be inferred from issue text, not confirmed against actual code.

### Input Assumptions
- Issue text may be incomplete, informal, poorly written, non-English, or duplicated/spam.
- Labels, if present, are **signal**, not **ground truth** — they may be wrong, stale, or missing.
- The model must produce a valid, well-formed output even for a degenerate input (e.g., a one-line issue with no body).

---

## 5. Output Specification

The output is a single structured **Task Understanding Record**, machine-parseable (e.g. JSON-shaped), with the following top-level fields:

```yaml
Task:
  role: [Frontend | Backend | Fullstack]
  experience_level: [Beginner | Intermediate | Advanced]
  complexity: [Low | Medium | High]
  task_type: [Bug | Feature | Improvement | Refactor | Performance | Security | Maintenance | Documentation | Other(extensible)]
  technical_area: string | list[string]      # e.g. "authentication", "state management"
  technologies: list[string]                  # e.g. "React", "PostgreSQL"
  components: list[string]                    # e.g. "checkout-service", "LoginForm.tsx" (if named in issue)
  expected_outcome: string                    # what "done" looks like, per the issue

Provenance:                                   # REQUIRED for every field above
  <field_name>:
    source: [stated | contextual | inferred | unknown]
    evidence: string | null                   # quote/paraphrase of what grounds this, or null
    confidence: float [0.0–1.0]

Uncertainty:
  flagged_ambiguities: list[string]            # things the model could not resolve
  missing_information: list[string]            # what would improve the classification if provided
```

**Key design decision:** every classified field carries its own **provenance + confidence**, not one global confidence score. A model may be highly confident about `task_type: Bug` (explicitly stated) while being low-confidence about `experience_level` (inferred from indirect signals). Collapsing these into one score would hide exactly the information the project's stated goals emphasize (stated vs. contextual vs. inferred vs. unknown).

**Why this shape:** It satisfies the project's explicit requirement to distinguish (1) explicitly stated, (2) context-supported, (3) inferred, and (4) unknown information — *per field*, not as an afterthought.

---

## 6. Capability Matrix

| Capability | Phase 1 (MVP) | Requires |
|---|---|---|
| Issue understanding | ✅ Full | Issue text only |
| Task extraction | ✅ Full | Issue text only |
| Role classification | ✅ Full (3-class) | Issue text; may be **Unknown** if genuinely ambiguous |
| Experience-level classification | ✅ Full, but explicitly **not conflated with complexity** | Issue text; inference-heavy, so confidence is often Medium |
| Complexity classification | ✅ Full | Issue text; also inference-heavy without code access |
| Task-type classification | ✅ Full, extensible taxonomy | Issue text |
| Technical-area identification | ✅ Full | Issue text |
| Technology identification | ✅ Full, but limited to what's named or strongly implied | Issue text |
| Component identification | ⚠️ Partial — only what's named/implied in text | No repo access yet → cannot verify against actual file/module names |
| Expected-outcome extraction | ✅ Full | Issue text |
| Confidence estimation | ✅ Full, per-field | — |
| Uncertainty detection | ✅ Full | — |
| Subtask decomposition | ❌ Out of scope | Repo + code context (later phase) |
| Dependency mapping | ❌ Out of scope | Repo + PR/git history (later phase) |
| Impact analysis | ❌ Out of scope | Repo + code + history (later phase) |
| Implementation context | ❌ Out of scope | Repo + code + docs (later phase) |
| Code generation / fix suggestion | ❌ Out of scope | Not part of this model's job, ever |
| Assignment / routing to a person | ❌ Out of scope | Organizational data, not modeling problem |

---

## 7. Model Boundaries

**Hard boundaries (Phase 1 will not do these, by design):**

1. **No repository access.** Component and technology identification are text-only inferences, explicitly weaker than what's possible once repo access is added. This limitation must be *visible* in output confidence, not hidden.
2. **No code understanding.** The model reasons about descriptions of code-related problems, not code itself.
3. **No multi-issue reasoning.** Each issue is understood independently in Phase 1 — no cross-issue deduplication, no backlog-level reasoning.
4. **No task execution.** The model never writes code, opens PRs, or modifies the repository.
5. **No silent defaulting.** If a classification cannot be supported by stated or contextual information, the model must return `Unknown` rather than guess-and-present-as-fact. (See Uncertainty Policy, Section 9.)
6. **No authority over existing labels.** The model does not assume GitHub labels are correct; it evaluates issues on their content and may disagree with existing labels (flagged, not silently overridden).

**Soft boundaries (explicitly deferred, not forgotten):**
- Repository, PR, and git-history integration → Phase 2+
- Dependency/impact modeling → later phase, sits on top of a working Phase 1
- Subtask generation → later phase, requires more context than a single issue provides

---

## 8. Success Criteria

Phase 1 is successful if:

1. **Classification accuracy** — On a held-out labeled evaluation set, the model's classifications (Role, Task Type, Complexity, Experience) agree with human-expert labels at a defined threshold (to be set empirically once eval data exists — not assumed here).
2. **Calibration, not just accuracy** — When the model reports high confidence, it is right more often than when it reports low confidence. A miscalibrated model that's "accurate but always says 100%" fails this criterion even if raw accuracy looks fine.
3. **Correct source attribution** — For a sample of outputs, human reviewers agree that fields marked `stated` really are stated in the issue text, and fields marked `inferred` really required inference (not verbatim in text presented as fact).
4. **Appropriate abstention** — On issues with genuinely insufficient information, the model outputs `Unknown` rather than fabricating a plausible-sounding answer. This is measured, not assumed.
5. **Experience ≠ Complexity independence** — On an evaluation set specifically designed with small-but-advanced and large-but-beginner-friendly issues, the model does not collapse the two dimensions.
6. **Output validity** — 100% of outputs are well-formed per the Output Specification (Section 5); malformed output is treated as a hard failure, not a quality issue.

---

## 9. Failure Criteria

The model has **failed** on a given issue if:

1. It asserts a field as `stated` when the issue text does not actually contain that information (fabricated grounding).
2. It presents an `inferred` field with unwarranted confidence (e.g., 0.95 confidence on a guess with no supporting text).
3. It conflates task size/length with experience level (explicit anti-goal per the project spec).
4. It fails to flag genuine ambiguity — i.e., picks a classification when the issue is truly indeterminate, instead of returning `Unknown` + `flagged_ambiguities`.
5. It invents a component, technology, or technical area not named or reasonably implied by the issue text.
6. It produces output that isn't parseable / doesn't conform to the Output Specification.

At a system level, Phase 1 has failed if downstream users (Section 3) **cannot trust the confidence and provenance fields** enough to act on them differently from raw classification — i.e., if the uncertainty machinery is decorative rather than load-bearing.

---

## 10. Uncertainty Policy

**Principle:** *Abstention is a valid, expected, and rewarded output — not a fallback of last resort.*

- Every field must be tagged with one of four source types:
  - `stated` — directly present in the issue text (e.g., issue explicitly says "this is a security bug")
  - `contextual` — not stated outright, but strongly supported by surrounding text/labels/comments
  - `inferred` — the model's own reasoning bridges a real gap (e.g., inferring "Backend" because the issue discusses a database migration, even though "Backend" is never said)
  - `unknown` — insufficient basis to classify; the field is returned as `Unknown`, not a best guess dressed as an answer

- **`unknown` must be a legitimate, first-class output value for every classification field** (Role, Experience, Complexity, Task Type where applicable) — not just an error state.
- Confidence scores must correlate with source type in expectation (stated ⇒ typically high confidence; inferred ⇒ typically medium; the model should not report high confidence for weakly-inferred fields).
- `flagged_ambiguities` and `missing_information` are required outputs, not optional extras — the model must actively surface what would resolve its own uncertainty (e.g., "Issue does not specify whether this affects the mobile app or only web").

---

## 11. Grounding Policy

**Principle:** *Every non-unknown field must be traceable to something in the input.*

- For `stated` fields: the `evidence` field should contain a close paraphrase or reference to the specific text supporting the classification (not a verbatim long quote — a pointer).
- For `contextual` fields: evidence should identify what surrounding signal (labels, phrasing, comment thread) supports the inference.
- For `inferred` fields: evidence should state the reasoning chain briefly (e.g., "issue discusses SQL query changes → inferred Backend").
- For `unknown` fields: no evidence is fabricated; the field is left empty/null, and the reason for unknown status is captured in `missing_information`.
- **The model must never generate evidence that does not exist in the input.** This is the single most important behavioral constraint in the entire system — it is what separates a trustworthy classifier from a plausible-sounding hallucination engine.
- Grounding is **required infrastructure for traceability**, not a nice-to-have: it's what allows a human reviewer to audit any individual classification back to its source in seconds.

---

## 12. Traceability Requirements

- Every Task Understanding Record must be traceable back to:
  1. The exact issue (ID/URL) it was generated from
  2. The specific input snapshot used (issue body/comments at time of processing — issues can be edited later)
  3. Per-field evidence (Section 11)
- This traceability is what allows the long-term evolution path (Section 13) to work: as repository, PR, and history context are added in later phases, each new piece of context must also be traceable, so it's always possible to answer "why did the model conclude X" at the field level, not just the record level.

---

## 13. Long-Term Evolution Path

Phase 1 is the **foundation layer** of the architecture described in the project vision. The evolution path is additive, not a rewrite:

```
Phase 1 (this phase):  Issue → Understanding → Task
Phase 2:                + Repository (file tree, structure) → better Component/Technology grounding
Phase 3:                + Relevant Code (actual source, not just structure) → real impact reasoning
Phase 4:                + Documentation → richer Technical Area / Expected Outcome grounding
Phase 5:                + Dependencies (package graph) → cross-component risk detection
Phase 6:                + Pull Requests + Git History → precedent-based complexity/experience calibration
Phase 7:                + Project Context (conventions, past decisions) → org-specific classification tuning
        ↓
Task → Subtasks → Dependencies → Impact → Implementation Context
```

**Design implication for Phase 1:** the Output Specification (Section 5) and Provenance/Uncertainty machinery must be designed so that adding a new context source in Phase 2+ means adding a new possible `source` type and `evidence` origin — not redesigning the schema. This is why provenance is field-level and typed, not a single free-text confidence note.

---

## 14. MVP Definition (Phase 1 Scope)

**In scope:**
- Single-issue input (title + body + optional labels/comments)
- All 12 initial capabilities listed in the project vision (Section: Initial Capabilities)
- Full Role / Experience / Complexity / Task Type taxonomies as specified
- Technical area, technology, and component identification (text-only, explicitly bounded per Section 6)
- Expected outcome extraction
- Per-field confidence + provenance (stated/contextual/inferred/unknown)
- Uncertainty surfacing (`flagged_ambiguities`, `missing_information`)
- Extensible task-type taxonomy (new categories can be added without breaking the schema)

**Out of scope (deferred per Section 13):**
- Any multi-source context (repo, code, docs, dependencies, PRs, git history, project context)
- Subtask generation, dependency mapping, impact analysis, implementation context
- Any deployment, API, or application-layer concerns (explicitly excluded from this task)
- Assignment/routing to specific individuals
- Cross-issue or backlog-level reasoning

---

## 15. Phase-1 Decision Record

| Decision | Rationale |
|---|---|
| Per-field provenance + confidence, not a single global score | Required to honor the stated/contextual/inferred/unknown distinction meaningfully; a global score hides exactly the information this project cares about |
| `Unknown` is a first-class value for every classification field | Prevents the model from being forced into a guess when information genuinely isn't present |
| Experience and Complexity are modeled as independent dimensions with separate evidence chains | Directly enforces the project's explicit "experience ≠ complexity" requirement at the architecture level, not just as a prompt instruction |
| Component/Technology identification explicitly marked as text-only-bounded in Phase 1 | Prevents false confidence — without repo access, these fields are inherently weaker and must say so |
| Labels are treated as signal, not ground truth | Existing labels can be wrong or stale; treating them as authoritative would let the model inherit human triage errors instead of doing independent understanding |
| No repo/code/doc/PR/history access in Phase 1 | Keeps Phase 1 scoped to *understanding a single issue correctly*, which is the dependency every later phase relies on; adding context sources prematurely would conflate "does the model understand issues" with "does the model have enough data" |
| Traceability required down to per-field evidence | Enables audit and trust now, and gives later phases a consistent place to plug in new evidence sources |
| No deployment/API/app-code design in this phase | Matches the explicit task boundary — this document defines the *model*, not the system around it |
