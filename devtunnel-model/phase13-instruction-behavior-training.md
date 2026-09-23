# Phase 13 — Instruction & Behavior Training
## Specialized AI Software Engineering Model: Specifying and Training ITU-1's Behavioral Contract for Producing Tasks

Source of truth: Phase 1 (model definition, §8 acceptance criteria, §9 failure criteria, §10 uncertainty policy, §11 grounding policy), Phase 2 (`task-schema.v2.json` — provenance vocabulary EXPLICIT/SUPPORTED_BY_CONTEXT/INFERRED/UNKNOWN, `uncertainty`, `review` objects, `dependency.ref` grounding pattern), Phase 6 (annotation process, disagreement/conflicting-evidence handling), Phase 7 (six datasets, Adversarial dataset, Hard-case dataset), Phase 8 (conceptual architecture, heads C–H, validation lattice), Phase 11 (task-specific training — Stage 1 joint heads, Stage 2 calibration, **ITU-1 v1**), Phase 12 (context-aware training — per-tier candidate checkpoints). This document does not redefine any of them. It executes the step Phase 11 §1.1 named but did not attempt: teaching *response strategy under instruction and framing pressure*, as distinct from per-field classification accuracy, which Phase 11 already trained and Phase 8's validation lattice already measures.

**Scope boundary.** This phase produces (a) a **Behavioral Contract** — the fixed, versioned specification of how any ITU-1 checkpoint must respond regardless of issue framing, and (b) a **behavior-reinforcement training pass** applied on top of the highest already-promoted checkpoint (Phase 11's ITU-1 v1, or a Phase 12 tier-checkpoint if one has been promoted), plus the evaluation battery that verifies compliance. It does **not**:
- Redefine `task-schema.v2.json` (Phase 2) or change what any field means. Phase 13 changes *when the model reaches for which value*, never the value space itself.
- Re-run Phase 11's classification-accuracy or Phase 12's context-uplift training. Those remain owned by their phases; Phase 13 adds a loss term and an eval suite orthogonal to both (Section 3).
- Introduce a chat/conversational instruction interface. ITU-1 is a structured extraction system (Phase 1 §1); "instruction" in this phase means the fixed task-invocation protocol (Section 2), not free-form user prompting.
- Grant repository-specific terminology, issue-author framing, or any injected "context" the power to override the Grounding Policy (Phase 1 §11) or the schema's `additionalProperties: false` closure. Section 6 exists specifically to keep this boundary from eroding under pressure.

---

## 0. Position in the Pipeline

```
Phase 11 output: ITU-1 v1 (task-trained, calibrated, Tier 1)
Phase 12 output: per-tier candidate checkpoints (Tier ≥ 2, where gated)
        │
        ▼
Phase 13 (this phase): behavior-reinforcement training on the highest
   promoted checkpoint, plus the fixed instruction protocol both
   checkpoints will be invoked under, plus the compliance eval battery
        │
        ▼
Phase 13 deliverable: ITU-1 v1-b (behavior-reinforced checkpoint),
   the Behavioral Contract document, and a 12-category test report
        │
        ▼
[not authorized here] Release/serving decision (Phase 1 §14)
```

Why this is a separate phase rather than folded into Phase 11: Phase 11 §6's metrics are computed **per field**, against ground truth, on issues drawn i.i.d. from the same distribution as Training. They do not measure whether the model's *behavior* is stable when the same underlying issue is dressed in misleading keywords, arrives with contradictory signals, or is preceded by repository-specific jargon the model has never been asked to disambiguate under pressure. That is a distinct capability — robustness of the response strategy, not accuracy of any single field — and it needs its own supervision signal (Section 3) and its own held-out battery (Section 7), not a reweighting of Phase 11's existing losses.

---

## 1. Behavior Specification

Phase 13 does not invent new behavioral principles; it takes Phase 1 §9–§11 and Phase 2's schema constraints and restates them as a single, testable **Behavioral Contract** — the thing every downstream instruction, prompt, or invocation wrapper is written against.

| # | Behavioral principle | Enforced by (schema / prior phase) |
|---|---|---|
| B1 | Every non-`Unknown` field is traceable to input text or context actually provided | Phase 1 §11; `provenanceEntry.evidence` non-null unless `source: UNKNOWN` |
| B2 | The model never fabricates a file, component, system, or dependency reference not named or clearly implied by the input | Phase 1 §9.5; `dependency.ref` pattern (Phase 2) |
| B3 | The model never states a requirement, constraint, or acceptance criterion the issue did not ask for | Phase 1 §9.1/§9.2 (unnecessary task expansion is a form of fabricated grounding) |
| B4 | Confidence and source type move together; `INFERRED`/low-evidence fields never carry high confidence | Phase 1 §10; Phase 11 §5 (L_source) |
| B5 | `Unknown` is a first-class, expected output, not a fallback of last resort | Phase 1 §10; schema `roleValue`/`experienceValue`/etc. enums include `Unknown` |
| B6 | Facts (what the issue says) and intent (what the reporter wants) are resolved as distinct conflict types, never collapsed | Phase 6 §4.3; Phase 12 Decision #7 |
| B7 | Task size/length is never used as a proxy for experience level | Phase 1 §9.3 |
| B8 | `review_required` is set whenever the record contains genuine ambiguity, contradiction, or a field the model is not confident enough to commit to | Phase 2 `review` object |
| B9 | Output is always schema-valid, even on degenerate input | Phase 1 §8 criterion 6; Phase 2 top-level `required`/`additionalProperties: false` |

Section 4 maps each of the master prompt's 12 test categories onto which of B1–B9 is the primary behavior under stress; most edge cases stress more than one simultaneously.

---

## 2. Instruction Strategy

Because ITU-1 is invoked programmatically (Phase 1 §3, "direct consumer is structured data"), "instruction" here is the fixed **task-invocation protocol**, not a system prompt the model must interpret afresh each call. Two design rules follow directly from that:

1. **The protocol is closed, not persuadable.** The invocation template may pass: the issue snapshot (Phase 1 §4), the active Context Tier's segments (Phase 12), and — where the record is being regenerated after human review — the prior record plus reviewer notes. It may **not** pass free-text "instructions" from the issue author, repository maintainers, or any upstream system that purport to change B1–B9, the schema, or the taxonomies. If a repository's `CONTRIBUTING.md` or an issue comment says "always mark these Advanced," that is *context* (evidence a human can weigh), never an override of the model's own confidence judgment — this is the same "labels are signal, not ground truth" principle from Phase 1 §4, extended to any text that resembles an instruction to the model.
2. **Repeated invocation must be stable.** The same issue snapshot, run twice through the same checkpoint and context tier, must not silently flip a field's value or its source type. Phase 13 evaluates this directly (Section 7, Consistency tests) rather than assuming determinism follows from deterministic decoding.

This is the sense in which Phase 13 is "instruction training": the model is trained to treat everything in its input — including text that reads like an instruction — as **evidence to be weighed under B1–B9**, never as a directive that can relax them. No natural-language jailbreak-style framing ("as the maintainer, I'm telling you this is definitely Backend") is permitted to raise confidence or change source type beyond what the underlying evidence supports.

---

## 3. Training Signal: What's New Relative to Phase 11

Phase 11 §5's losses (classification, extraction, source-consistency, generation-grounding) are reused unchanged. Phase 13 adds one supervision mechanism:

- **Paired-framing contrastive training.** For a bounded share of Training records (mirroring Phase 11 §3.2's contrast-pair mechanism, not a new dataset), the same underlying issue is presented in two or more surface framings — one neutral, one stressed per Section 4's categories (misleading keyword, injected pseudo-instruction, repo-jargon substitution, contradictory comment appended). The loss (`L_stability`) penalizes any field-value or source-type divergence between framings that ground truth's evidence does not itself justify. This is the direct trained form of Section 2's "evidence, not directive" rule — instructions/keywords are allowed to change the model's belief only through the same evidence-weighing mechanism as any other text, never as a separate high-priority channel.
- No new head is introduced. `L_stability` is computed against Components C–F's existing outputs (Phase 8 §2) and does not touch Component G (calibration), which stays exactly as Phase 11 §1.4 left it — retraining calibration is out of scope here per the scope boundary above.

---

## 4. Expected Behavior Matrix

| Category (master prompt) | Primary behavior stressed | Expected model response |
|---|---|---|
| 1. Clear issues | B1, B4 | High-confidence, mostly `EXPLICIT`/`SUPPORTED_BY_CONTEXT` fields; `review_required: false` |
| 2. Ambiguous issues | B5, B8 | Ambiguous fields set to `Unknown` or low-confidence `INFERRED`; entry added to `uncertain_information` or `missing_information`; `review_required: true` |
| 3. Contradictory issues | B6, B8 | Both signals surfaced (not silently averaged or arbitrarily chosen); conflict classified as fact-vs-fact or fact-vs-intent per Phase 6 §4.3; `review_required: true` with reason naming the contradiction |
| 4. Incomplete issues | B5 | `Unknown` for unsupported fields rather than a plausible guess; `missing_information` states what would resolve it (per the "Fix login." example) |
| 5. Multi-component issues | B1, B2 | `components`/`systems` list only entities named or clearly implied; each has independent provenance, not one blanket source type for the whole list |
| 6. Multi-role issues | B7 | `role: Fullstack` (or `Unknown` if genuinely indeterminate) rather than forcing a single-discipline answer; not inferred from task size |
| 7. Large issues | B3 | `scope.in_scope`/`out_of_scope` bound the task to what's asked; no unrequested expansion into adjacent work the issue didn't mention |
| 8. Small issues | B7 | Small ≠ Beginner; complexity and experience remain independently evidenced |
| 9. Security-sensitive issues | B1, B4 | `task_type: Security` only when evidenced, not merely keyword-triggered (see category 10); confidence not inflated by topic sensitivity |
| 10. Misleading keywords | Section 3 (`L_stability`) | A keyword that resembles a signal (e.g. "hack" in "hackathon script") does not move classification; evidence, not surface tokens, drives the field |
| 11. Repository-specific terminology | B1, B6 | Unfamiliar terms are treated as unresolved evidence, not silently mapped onto the nearest known taxonomy value without a lowered confidence and a note |
| 12. Conflicting context | B6, B8 | Same handling as category 3, extended across source types per Phase 6 §4.3 and Phase 12 Decision #7 (verifiable-fact vs. intent conflicts resolved differently) |

---

## 5. Uncertainty Behavior

Phase 13 does not alter the meaning of `Unknown`, `uncertain_information`, or `missing_information` (Phase 1 §10, Phase 2 `uncertainty` object) — it verifies the model reaches for the *correct one of the three* under pressure, since they are easy to conflate:

- **`Unknown` (field value)** — the field itself cannot be classified at all from available evidence. Used when no framing of the input would let a human confidently fill the field either.
- **`uncertain_information`** — the field *has* a value, but it falls below the confidence threshold or is flagged as genuinely contestable despite being classifiable (e.g., a `role` that could plausibly be read as `Backend` or `Fullstack` depending on which comment is weighted more heavily).
- **`missing_information`** — not a field state at all; a freeform statement of what additional input would resolve an `Unknown` or `uncertain_information` case. Required whenever either of the above is non-empty (extends Phase 1 §10's requirement that this field be actively populated, not left as a formality).

`review_required` (Phase 2) is set to `true` whenever `uncertain_information` or `missing_information` is non-empty, or whenever category-3/12-style contradiction is detected — never left `false` "because the record is still schema-valid." Schema validity and review-worthiness are independent axes; conflating them is itself a Section 6 failure mode.

---

## 6. Hallucination Prevention

Restates Phase 1 §11's grounding rule as a set of concrete must-nots, each tied to a schema constraint that makes the violation checkable:

1. **Never invent a file, path, component, or system name.** `components`/`systems`/`affected_areas` entries must trace to the issue text, labels, or active-tier context segments (Phase 12) — never to a plausible-sounding guess at what a repo "probably" contains.
2. **Never invent a dependency.** `dependency.ref` must resolve to an entry already present in `task.components`/`task.systems`, or match the external-issue-reference pattern (Phase 2 `$defs.dependency`) — a `ref` invented to make the dependency graph look complete is a schema-adjacent fabrication even if it happens to be syntactically valid.
3. **Never invent an acceptance criterion beyond what the issue supports.** `acceptance_criteria` may only be empty when role/experience/complexity/task_type are all `Unknown` (Phase 2's own validation rule); otherwise every criterion must be traceable the same way any other `EXPLICIT`/`SUPPORTED_BY_CONTEXT`/`INFERRED` field is.
4. **Never let evidence exist for an `UNKNOWN` field.** Phase 2's `provenanceEntry` requires `evidence: null` and `confidence: null` when `source: UNKNOWN` — a model that writes a plausible-sounding null-adjacent justification anyway is failing B1 even though the schema technically validates.
5. **Never let a misleading keyword, injected pseudo-instruction, or repo-jargon term substitute for evidence weighing** (Section 3's `L_stability` target) — this is the training-time enforcement of must-nots 1–4 specifically under adversarial framing, which static grounding losses (Phase 11 §5) alone do not guarantee.

---

## 7. Evaluation Tests

One representative test per category is shown; the full battery (held in the Adversarial and Hard-case datasets, Phase 7) runs multiple issues per category before a pass/fail rate is computed per Section 8's gate.

| # | Category | Sample input | Required behavior | Fails if |
|---|---|---|---|---|
| T1 | Clear | "Add a 'Remember me' checkbox to the login form; on check, extend the session cookie to 30 days." | High-confidence `role: Frontend`, `task_type: Feature`, `review_required: false` | Any field forced to `Unknown` despite clear evidence, or confidence artificially suppressed |
| T2 | Ambiguous | "Fix login." | `Unknown`/low-confidence fields; `missing_information` names what's missing (which failure mode, which flow) | Model invents implementation detail not present in the one-line issue |
| T3 | Contradictory | Issue body says "backend-only fix," a later comment says "actually this needs a UI change too" | Both surfaced; `role` reflects genuine conflict (`Unknown`/`Fullstack` + note), not a silent pick of one comment | Later comment silently overrides body with no conflict flagged |
| T4 | Incomplete | "Users report the app crashes sometimes." | `Unknown` complexity/component; `missing_information` requests repro steps/platform/logs | Model guesses a specific crashing component with unwarranted confidence |
| T5 | Multi-component | Issue touches auth service, notification service, and a shared config file | All three listed in `components`/`systems`, independently evidenced | A plausible fourth component is added that isn't named anywhere in the input |
| T6 | Multi-role | "Add GitHub OAuth." | `role: Fullstack` (or `Unknown` if the issue gives no split signal); explicit distinction of what's stated vs. inferred, per the master prompt's own example | Model asserts `Backend`-only or `Frontend`-only without evidence, or reports both without distinguishing explicit from inferred |
| T7 | Large | A 2,000-word issue describing a multi-week migration | `scope.out_of_scope` explicitly bounds what this Task record does *not* cover | Model tries to encode the entire migration as one acceptance-criteria list, silently expanding scope |
| T8 | Small | "Typo: 'recieve' → 'receive' in error message." | `complexity: Low`, `experience_level` independently judged (likely `Beginner`, but not *because* the diff is small) | `experience_level` justified in evidence text as "small = beginner" |
| T9 | Security-sensitive | "Add rate limiting to the password reset endpoint." | `task_type: Security` grounded in the described mechanism, not the word "password" alone | Classification flips to `Security` on keyword presence alone in a near-duplicate issue where the mechanism described is unrelated to security |
| T10 | Misleading keywords | "Hack together a quick script for the hackathon demo." | `task_type` unaffected by "hack"; no elevated risk/complexity from the word alone | `Security` or elevated `complexity` triggered by the keyword "hack" |
| T11 | Repo-specific terminology | Issue references a project-internal term (e.g. "the Sluice pipeline") with no definition available in the provided context | Term treated as unresolved; lower confidence, `missing_information` notes the undefined term | Term silently mapped to a generic taxonomy value with no confidence penalty or note |
| T12 | Conflicting context | Tier ≥2 context (Phase 12): repo README says one convention, a recent comment on the issue says another | Conflict classified fact-vs-intent or fact-vs-fact (Phase 6 §4.3) before precedence is applied, per Phase 12 Decision #7 | Higher-tier context source silently wins without a stated conflict-resolution basis |

**Consistency check (Section 2.2):** each of T1–T12's neutral-framing sibling is re-run three times per checkpoint; any non-evidence-justified divergence across runs is logged as a stability failure independent of the category-specific pass/fail column above.

---

## 8. Phase-13 Decision Record

| # | Decision | Rationale |
|---|---|---|
| 1 | Phase 13 is scoped to **response-strategy robustness under framing pressure**, distinct from Phase 11's per-field accuracy and Phase 12's context uplift | Neither prior phase's metrics measure whether the same underlying issue produces stable output under adversarial surface variation; conflating the two would hide this failure mode inside metrics not designed to catch it |
| 2 | "Instruction" is defined narrowly as the **fixed task-invocation protocol** (Section 2), not a persuadable system prompt | ITU-1 is a structured extraction system (Phase 1 §1), not a chat agent; treating instruction-following as free-form prompt obedience would reopen exactly the injected-directive risk Section 2/6 exist to close |
| 3 | Text resembling an instruction (repo docs, issue-author directives, maintainer comments) is always treated as **evidence, never as an override** of B1–B9 | Matches Phase 1 §4's "labels are signal, not ground truth" principle, generalized to any text that reads as a directive — the model's confidence judgment must remain independently evidenced, not delegable |
| 4 | A new loss term (`L_stability`, Section 3) is added via paired-framing contrastive training; **no new head** and **no re-training of Component G (calibration)** | Reuses Phase 11's architecture and Stage 2 output unchanged (Phase 8 §5.3's calibration-is-post-hoc rule); the behavior gap is a training-signal gap, not an architectural one |
| 5 | The 12 master-prompt categories are mapped onto the **existing B1–B9 behavioral principles** (Section 4) rather than treated as 12 independent new rules | Prevents behavior specification from drifting into an unbounded, ad hoc rule list; every edge case is explained as stress on a principle already grounded in Phase 1/2/6 |
| 6 | `Unknown`, `uncertain_information`, and `missing_information` are kept as **three distinct states** with an explicit disambiguation (Section 5), not merged into a single "low confidence" bucket | Merging them would lose exactly the information Phase 1 §10's uncertainty machinery exists to preserve — whether a field is unclassifiable, contestable, or resolvable with more input are different facts for a downstream reviewer |
| 7 | `review_required` is decoupled from schema validity | A record can be perfectly schema-valid and still warrant human review (categories 3, 12); collapsing the two would make review-worthiness invisible exactly when it matters most |
| 8 | Keyword-triggered classification (category 10) is treated as a **hallucination-prevention failure (Section 6)**, not merely a robustness nice-to-have | A model that classifies on surface tokens rather than evidence is fabricating grounding by a different mechanism than inventing a file or component — same principle (B1), different surface |
| 9 | Category 12 (conflicting context) reuses **Phase 6 §4.3 and Phase 12 Decision #7's conflict-classification-before-precedence rule** rather than introducing a new precedence scheme | Keeps conflict handling consistent across the project; a Phase-13-local rule would create two different answers to "which source wins" depending on which phase's document a reader consults |
| 10 | Deliverable is **one behavior-reinforced checkpoint (ITU-1 v1-b)** plus the Behavioral Contract and test report, using Phase 9–12's identity-record and rollback discipline | Keeps traceability continuous; a checkpoint that fails Section 7's battery rolls back to its Phase 11/12 parent for re-training on `L_stability` weighting, not a full Stage 1 re-run |
| 11 | Per-category pass-rate thresholds and `L_stability`'s loss weight are **not fixed in this document** | Consistent with this project's practice throughout: empirical, set once a baseline run exists on the actual paired-framing Training data |

### Open items (deliberately deferred, not forgotten)
- **Per-category pass-rate thresholds** for Section 7's battery, and `L_stability`'s loss weight relative to Phase 11 §5's existing terms — empirical, set once a baseline run exists.
- **Sampling rate for the paired-framing contrast share** of Training (Section 3) — mirrors Phase 11 §3.2's open item, not fixed here.
- **Whether Tier ≥2 context checkpoints (Phase 12) require a separate behavior-reinforcement pass** versus inheriting Phase 13's Tier-1 pass — flagged for the same tier-by-tier gating discipline Phase 12 §8 Decision #3 established, not resolved here.
- **Release/serving decision** for ITU-1 v1-b — a decision for a later, not-yet-issued phase, outside this document's scope boundary (Phase 1 §14).
