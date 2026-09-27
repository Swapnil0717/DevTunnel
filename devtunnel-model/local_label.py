#!/usr/bin/env python3
"""
ITU-1 -- Step 4, free/local variant of claude_label.py.

Same grounding verification, same architecture.assemble() call, same
TrainingExample shape as claude_label.py -- but the model-facing contract
here is deliberately DIFFERENT from claude_label.py's, because a 3-8B local
model and Claude are not equally capable of the same task.

Setup (one-time)
-----------------
1. Install Ollama: https://ollama.com/download
2. ollama pull qwen2.5:3b-instruct
   If your 8GB-RAM box has headroom, prefer the q8 build of the SAME
   parameter count over stepping up to a bigger model:
       ollama pull qwen2.5:3b-instruct-q8_0
   Same 3B reasoning ceiling, but q8 keeps far more precision than the
   default q4_K_M quantization -- a free accuracy bump, no prompt/code
   changes, still ~3GB. This is a genuinely different lever from going to
   7B (which this hardware can't safely run -- see the conversation this
   script came out of).
3. `ollama --version` should be >= 0.5 so the JSON-schema-constrained
   output actually engages (auto-falls-back to plain format="json" with a
   warning on older Ollama).

Usage
-----
    python local_label.py \
        --collected data/collected.jsonl \
        --weak-labels data/weak_labels.jsonl \
        --batches data/labeling_batches.jsonl \
        --out data/training_examples.jsonl \
        --spot-check-out data/spot_check_needed.jsonl \
        --rejects-out data/rejected.jsonl \
        --spot-check-rate 0.175 \
        --model qwen2.5:3b-instruct \
        --limit 10

Then drop --limit to run the rest. --resume skips issues already
dispositioned and appends instead of overwriting -- use it for any run long
enough to risk being interrupted.

Design, v0.1 -> v0.6
--------------------
v0.1 asked the model for a JSON array of per-field {value, source,
pointers, evidence_text, confidence} envelopes -- reasonable for Claude,
not for a 3B model, which answers correctly but can't hold that nested
shape in its head.

v0.2 moved grounding out of the model into Python: the model is asked only
for flat field values (schema-constrained so classification fields
literally cannot come back outside their enum), and grounding is computed
deterministically -- locking any classification field the repo's own
GitHub label already answers, keyword-matching literal evidence for
everything else, falling back to an honest INFERRED judgment call only
when nothing literal supports the value.

v0.3 added a few-shot example (in the flat shape actually used), per-field
decision criteria, and an optional scratch "reasoning" field ahead of the
classification fields.

v0.4 added reasoning/answer consistency checking, stratified (risk-
weighted) spot-checking, segment budgeting, and num_predict headroom, plus
opt-in self-consistency voting.

v0.5 added num_ctx (Ollama silently truncates at 2048 tokens otherwise),
dropped unused list fields from the prompt, model-supplied VERIFIED
evidence phrases, surgical re-ask on flagged fields only, opt-in
self-critique, and cluster-based dynamic few-shot + majority check.

v0.6 -- one real bug fix, found from a live 3-issue test run
on qwen2.5:3b-instruct:

  EXEMPLAR CONTAMINATION. The v0.5 dynamic few-shot (a real, already-
  labeled issue from the same embedding cluster, shown for calibration)
  is topically very close to the issue actually being labeled -- that's
  the whole point of using embedding-cluster similarity to pick it. But a
  live run surfaced a 3B-model failure mode nobody had tested for: on the
  third of three same-cluster prettier/markdown issues, qwen2.5:3b did not
  use the exemplar for calibration -- it COPIED it. The output for issue
  #3 ("[3.9 regression] Markdown: $...$ parsed as inline math...") came
  back with task_type=Feature, role=Fullstack, experience_level=
  Intermediate, complexity=Medium, and a summary/objective that were
  VERBATIM the exemplar's own values (issue #1, "Support directives in MDX
  parser") -- not the actual issue's content at all. Only `title` survived
  correctly, because title is hardcoded from the real segment and never
  trusted from the model (see build_proposals_from_flat). The "for
  calibration only -- this is NOT the issue you're labeling" instruction
  in build_dynamic_worked_example was not enough to stop a 3B model from
  pattern-matching "similar topic -> same answer" once the exemplar pool
  had real entries in it. This is systemic, not a one-off: it gets WORSE
  as more same-cluster examples accumulate, and it was silent -- nothing
  in v0.5 detected or flagged it. That single bad record would have gone
  straight into training_examples.jsonl with only an 18% base spot-check
  chance of ever being looked at by a human.

  Fix, entirely in Python, no extra model calls:
    1. _looks_copied_from_exemplar() compares the model's flat response
       against the dynamic exemplar's task fields after every propose()
       call that used one: near-identical summary/objective/
       expected_outcome text (normalized, high overlap), OR all four
       classification fields matching the exemplar exactly while an
       evidence phrase quotes exemplar-flavored text not present in the
       real segments, counts as a match.
    2. On a match, the call is redone ONCE, immediately, with the dynamic
       few-shot block removed entirely (falling back to only the generic
       static example) -- and a hardened instruction line inserted that
       explicitly names the exemplar's own field values and says not to
       reuse them. This costs one extra model call, but ONLY on an issue
       that actually tripped the check, not on every issue that happens
       to have a cluster exemplar available.
    3. If the retry still matches the exemplar, the issue is written to
       rejected.jsonl instead of training_examples.jsonl (rather than
       silently accepted with a flag) -- a record whose content mirrors
       a different issue is not safe to keep as SILVER-tier training
       data, self-consistency-vote or not.
    4. Every occurrence (matched-on-first-try, fixed-by-retry, or
       rejected) is logged to data/exemplar_contamination_log/
       <collection_id>.json with both the original and (if any) retried
       response, so this can be audited across a full run rather than
       trusted blind.

  This does not change any behavior when no dynamic exemplar was shown
  (cold start, or --no-cluster-few-shot) -- the check is a no-op there,
  same graceful-degradation posture as the rest of the cluster feature.

v0.7 -- a smaller, related fix, spotted in the SAME live 3-issue run that
found the v0.6 bug (that run happened to start with an empty --out, so no
dynamic cluster exemplar was available -- but the ALWAYS-PRESENT static
worked example in build_few_shot_example still leaked). On issue #2 (the
CJK-newline issue, nothing to do with settings pages), the model cited
evidence_role="settings page" and evidence_complexity="small,
self-contained change to the settings page" -- neither phrase is
anywhere in that issue's real text. Both phrases are lifted from the
static "dark mode toggle" worked example that's baked into every single
prompt (verbatim: "settings page", "quick, self-contained change to the
settings component"). This was already being CAUGHT (verify_grounding /
_find_verbatim_phrase correctly flagged it as
evidence_phrase_hallucinated and dropped confidence to 0.15, same safety
net as v0.5), so no bad data got through -- but it's the same underlying
failure mode as v0.6 (borrowing an example's specific wording instead of
the real text), just from the generic example instead of a cluster one,
and worth closing the same way: build_few_shot_example now ends with an
explicit warning naming its own specific phrases ("settings page",
"settings component", "UI toggle in Settings", "quick, self-contained
change") and telling the model not to reuse them for a different issue.
No new code path, no new model calls -- purely a stronger prompt, so
there's nothing to unit-test beyond confirming the prompt still builds
(see the module's own smoke check). Whether this reduces the
evidence_phrase_hallucinated rate on role/experience_level/complexity is
an empirical question the next real run will answer -- those three
fields still have no deterministic grounding available (see v0.1's
reality check below), so some hallucination-and-catch is expected to
persist regardless; this just removes one avoidable, identified source
of it.

v0.8 -- two grounding bugs, both found from a fresh 3-issue comparison run
against v0.7 (same 3 prettier/markdown issues, different sample -- no
dynamic cluster exemplar was available yet, so this is unrelated to the
v0.6/v0.7 exemplar-copying fixes):

  1. TITLE-AS-EVIDENCE LOOPHOLE. The issue title is always present
     verbatim in the segments, so a model that cites the entire title as
     its evidence_<field> phrase trivially passes _find_verbatim_phrase
     for ANY field -- including complexity, experience_level, and role,
     none of which a bare title actually demonstrates. On a live run the
     model did exactly this for both complexity and task_type on the same
     issue, earning EXPLICIT/high-confidence status on complexity for
     free, with no real targeted justification -- quietly inflating
     confidence on a field that's really just as ungrounded as the ones
     honestly marked INFERRED. _is_full_title_quote() now detects a
     cited phrase that IS (or is >=80% word-overlap with) the whole
     title, and _ground_classification() treats that the same as "no
     usable evidence phrase" -- falling through to keyword matching, then
     an honest INFERRED call -- rather than granting it EXPLICIT status.
  2. MARKDOWN-DECORATED QUOTES FALSELY FLAGGED HALLUCINATED. A real
     issue's text contained "regression introduced in **3.9.0**", and the
     model quoted it back as "regression introduced in 3.9.0, last good
     version 3.8.5" (dropping the markdown, as a model naturally does
     when it paraphrase-quotes prose). _normalize() didn't strip the `**`
     before the substring comparison, so a legitimate, substantively
     correct citation was marked evidence_phrase_hallucinated and its
     confidence dropped to 0.15 -- punishing the model for something that
     wasn't actually a hallucination. _normalize() now strips `*`, `_`,
     and `` ` `` markdown decoration before comparing.

  Both fixes are pure Python, no prompt or schema changes, no new model
  calls -- see _is_full_title_quote() and _normalize() respectively.
  A third finding from the same run -- task_type flipping between Bug and
  Feature across two otherwise-identical runs of the same issue at
  temperature=0.0 -- is model judgment instability, not a grounding bug,
  and is deliberately NOT addressed here; it's a candidate for
  --self-consistency, to be evaluated separately with real data rather
  than guessed at.

v0.9 -- wires --self-consistency's own vote data into confidence, instead
of just using it to pick a majority value and discarding how strong the
agreement was. Previously, a field that won 3/3 votes and a field that
won 2/3 (with a self_consistency_split risk flag) ended up going through
_ground_classification exactly the same way -- the vote outcome only
decided WHICH value was used, never how much to trust it. That's a real,
free confidence signal being thrown away, and it was flagged as the
single most honest lever for hitting real confidence (as opposed to
inflating the number) when this was discussed: unlike blindly raising
every field to some floor, unanimous agreement across independently
re-sampled calls (temperature > 0) is actual evidence the answer is
stable, and a split vote is actual evidence it's not.

Mechanics: propose() now records, per classification field, the vote
tally from self-consistency (n_agreeing_with_winner, n_total_votes) and
passes it through build_proposals_from_flat -> _ground_classification as
consistency_agreement. _ground_classification applies it as a bonus on
top of whatever grounding tier the field already earned (verbatim quote,
keyword match, or bare INFERRED) -- it never invents grounding that
wasn't there, it only adjusts how much to trust grounding that was:
  - Unanimous (all votes agree, >=3 total): the strongest signal
    available. Confidence is floored at 0.75 regardless of grounding
    tier -- this is the concrete lever for the "at least 75% confidence"
    ask, achieved by requiring the model to actually demonstrate
    stability rather than by clamping the number. An INFERRED field that
    was unanimous across 3 independent re-samples is genuinely more
    trustworthy than a single-pass INFERRED guess, so this floor is
    earned, not asserted. Source is upgraded from INFERRED to
    SUPPORTED_BY_CONTEXT in this case specifically (repeated independent
    agreement is itself a form of context support), never to EXPLICIT
    (unanimous agreement is not the same thing as a literal quote).
  - Majority but not unanimous (already flagged self_consistency_split
    elsewhere): no bonus, no penalty beyond what grounding already gave
    it -- a split vote is exactly as uncertain as it looks, and burying
    that under an artificial floor would defeat the entire point of
    voting in the first place.
  - No self-consistency data (self_consistency_n == 1, the default, or
    this field had no votes for some reason): behaves identically to
    v0.8, no change.
This only ever RAISES confidence, and only when the model has
independently demonstrated the same answer multiple times -- it cannot
push a field toward 0.75 on a single pass, and a hallucinated-evidence or
reasoning-mismatch field can still end up low even after a unanimous
vote if grounding itself was bad (the floor is applied to whatever
_ground_classification already computed, not a replacement for it), so
verify_grounding()'s existing safety nets are untouched. Since this only
activates with --self-consistency N (N>=2) explicitly passed, and that
flag defaults to off (1 = off) because it multiplies model calls per
issue, this is opt-in extra compute for real confidence, not a free
default-on change to every run.

Reality check on quality
-------------------------
None of this closes the hard ceiling noted from v0.1 onward: complexity
and experience_level have no reliable generic cross-repo signal (see
bootstrap_and_cluster.py's own reasoning for never locking complexity),
so accuracy on those two is bounded by "however good this model's
judgment is," full stop -- these changes raise that ceiling and catch more
of the cases where the model is wrong, they don't remove the ceiling.
verify_grounding() remains the real safety net, and --spot-check-rate
(risk-weighted) is still what tells you your actual error rate on the
unreviewed majority. Two levers deliberately left as non-code
recommendations rather than built here: the q8-quantization swap (just
change --model, see step 2 above) and a LoRA fine-tune on accumulated
spot-check corrections once you have enough of them (train_lora.py
already exists in this repo for that, separately from this script).
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
import uuid
from collections import Counter, defaultdict
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent / "itu1"))
import architecture  # noqa: E402
import example as example_mod  # noqa: E402
import schema as schema_mod  # noqa: E402
from derived import finalize, validate_all  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect_issues import is_labelable  # noqa: E402

TOOL_VERSION = "local-label-0.9"

CLASSIFICATION_FIELDS = ("role", "experience_level", "complexity", "task_type")
LIST_FIELDS = ("technologies", "languages", "frameworks", "technical_areas",
               "components", "systems", "affected_areas")

# The enums the model's classification answers are checked against here --
# imported from itu1/schema.py (the actual source of truth) rather than
# copy-pasted, so this can never silently drift out of sync with it.
_ALLOWED_VALUES = {
    "task_type": schema_mod.TASK_TYPE_REGISTRY,
    "role": schema_mod.ROLE,
    "experience_level": schema_mod.EXPERIENCE_LEVEL,
    "complexity": schema_mod.COMPLEXITY,
}

# --------------------------------------------------- decision criteria

_TASK_TYPE_CRITERIA = """  Bug: something that currently works incorrectly or crashes -- an error, \
regression, or broken behavior relative to what was intended.
  Feature: a wholly new capability that does not exist yet ("add support \
for X", "new X").
  Improvement: an existing capability works, but should behave better \
(faster UX, better defaults, nicer output) -- NOT a new capability and NOT \
broken.
  Refactor: internal code-structure/cleanup change with NO user-visible \
behavior change at all -- if a user would notice the difference, it's not \
a Refactor.
  Performance: specifically about speed/latency/resource use, even if it \
could also be called an Improvement -- prefer Performance when speed is \
the explicit complaint.
  Security: a vulnerability, exploit, or unsafe default -- prefer this \
over Bug when the issue is security-flavored.
  Maintenance: dependency bumps, chores, tooling/CI upkeep -- not a \
behavior change of the product itself.
  Documentation: the docs/README/comments are wrong, missing, or unclear \
-- the code itself is not what's being changed.
  Other: doesn't fit any category above and isn't from ambiguity -- use \
sparingly.
  Unknown: the text truly gives no clue, not even indirectly."""

_ROLE_CRITERIA = """  Frontend: UI, styling, components, client-side behavior -- what a user \
sees or clicks.
  Backend: server, API, database, data processing, infrastructure -- \
nothing about what's rendered on screen.
  Fullstack: the issue clearly spans both a UI change and a server/API/data \
change together.
  Unknown: the issue is about something else entirely (docs, CI, a CLI \
tool with no client/server split) or truly gives no clue."""

_EXPERIENCE_LEVEL_CRITERIA = """  Beginner: small, localized, well-specified change; a newcomer to the \
codebase could plausibly complete it without deep system knowledge \
(matches typical "good first issue" scope).
  Intermediate: requires understanding how a few parts of the codebase fit \
together, or non-trivial but well-trodden work.
  Advanced: requires deep familiarity with the codebase's internals, \
touches core/shared systems, or requires design judgment about trade-offs.
  Unknown: the text gives no real signal about how hard this actually is \
-- do not guess from task_type alone (e.g. a Bug is not automatically \
Beginner)."""

_COMPLEXITY_CRITERIA = """  Low: a small, contained change -- one file/area, little or no design \
decision required.
  Medium: touches multiple parts of the system, or requires a real (but \
not deep) design decision.
  High: touches many parts of the system, requires significant design \
work, or has wide-reaching consequences if done wrong.
  Unknown: the text gives no real signal -- do not guess from task_type \
alone (e.g. a Feature is not automatically High)."""

_FIELD_CRITERIA = {
    "task_type": _TASK_TYPE_CRITERIA,
    "role": _ROLE_CRITERIA,
    "experience_level": _EXPERIENCE_LEVEL_CRITERIA,
    "complexity": _COMPLEXITY_CRITERIA,
}

_DECISION_CRITERIA_BLOCK = f"""DECISION CRITERIA -- use these to break ties; they are the actual \
grounds for a call, not just the enum names:

task_type:
{_TASK_TYPE_CRITERIA}

role:
{_ROLE_CRITERIA}

experience_level:
{_EXPERIENCE_LEVEL_CRITERIA}

complexity:
{_COMPLEXITY_CRITERIA}"""

# Condensed one-line versions of the criteria above, folded into the JSON
# schema itself as per-property "description" -- a second reinforcement
# channel for models whose constrained decoding attends to schema
# descriptions even when it doesn't re-read the system prompt closely.
_SCHEMA_FIELD_DESCRIPTIONS = {
    "task_type": ("Bug=currently broken; Feature=brand-new capability; Improvement=existing "
                  "capability works better; Refactor=code-only, zero user-visible change; "
                  "Performance=speed/latency explicitly; Security=vulnerability/exploit; "
                  "Maintenance=deps/chores/CI; Documentation=docs-only; Other=none of these; "
                  "Unknown=no clue at all."),
    "role": ("Frontend=UI/client-visible; Backend=server/API/data; Fullstack=clearly both; "
             "Unknown=neither applies or no clue."),
    "experience_level": ("How hard for a newcomer. Beginner=small well-specified good-first-issue "
                          "scope; Intermediate=spans a few parts, well-trodden; Advanced=deep "
                          "internals/design judgment; Unknown=no real signal -- do not infer from "
                          "task_type."),
    "complexity": ("Low=one contained area, no design decision; Medium=multiple parts or a real "
                   "design decision; High=wide-reaching or significant design work; Unknown=no "
                   "real signal -- do not infer from task_type."),
}
_EVIDENCE_DESCRIPTIONS = {
    "task_type": "Short phrase copied VERBATIM from the text supporting task_type, or \"\" if none.",
    "role": "Short phrase copied VERBATIM from the text supporting role, or \"\" if none.",
    "experience_level": "Short phrase copied VERBATIM from the text supporting experience_level, or \"\" if none.",
    "complexity": "Short phrase copied VERBATIM from the text supporting complexity, or \"\" if none.",
}

# --------------------------------------------------------- few-shot example
#
# Shown in the FLAT shape this version actually asks for, evidence_<field>
# phrases included (each is a real verbatim substring of the example body
# below, matching what the model is asked to do). A contrastive
# (wrong-then-right) second example is included for the two closest-call
# categories (Improvement vs Refactor) since a single positive example
# doesn't teach a small model what NOT to do.

def build_few_shot_example(use_reasoning: bool) -> str:
    r1_line = (
        '  "reasoning_type_role": "Title/body ask for a brand-new UI toggle that doesn\'t '
        "exist yet, so Feature not Improvement. Only UI/settings-component work is mentioned "
        'and body explicitly says no backend changes, so Frontend.",\n'
        if use_reasoning else ""
    )
    r2_line = (
        '  "reasoning_experience_complexity": "Body says \'quick, self-contained change to the '
        "settings component' -- one component, no design decision -- so Low complexity. No "
        'wording about who should attempt it, so experience_level stays Unknown rather than '
        'guessing.",\n'
        if use_reasoning else ""
    )
    positive = f"""WORKED EXAMPLE -- follow this shape exactly. Given:
  [S1] (ISSUE_TITLE) Add dark mode toggle to settings page
  [S2] (ISSUE_BODY) Users want a dark mode option, a simple UI toggle in \
Settings that switches the app theme. No backend changes needed. Should be \
a quick, self-contained change to the settings component.

Correct output:
{{
{r1_line}  "task_type": "Feature",
  "evidence_task_type": "dark mode option",
  "role": "Frontend",
  "evidence_role": "UI toggle in Settings",
{r2_line}  "experience_level": "Unknown",
  "evidence_experience_level": "",
  "complexity": "Low",
  "evidence_complexity": "quick, self-contained change to the settings component",
  "title": "Add dark mode toggle to settings page",
  "summary": "Add a UI toggle in Settings that lets users switch the app to a dark theme.",
  "objective": "Implement a dark mode toggle in the settings component.",
  "expected_outcome": "Users can switch the app theme to dark mode from Settings.",
  "acceptance_criteria": ["A toggle control appears in the settings page", "Toggling it switches the app's visual theme"],
  "scope": {{"in_scope": ["settings UI", "theme switching"], "out_of_scope": ["backend changes"]}}
}}
Notice each evidence_<field> is copied EXACTLY from [S2] above -- not paraphrased.

This dark-mode example is a DIFFERENT issue from the one you are about to label. Its specific \
wording -- "settings page", "settings component", "UI toggle in Settings", "quick, \
self-contained change" -- belongs to THIS example only. Do not reuse any of those exact phrases \
as an evidence_<field> quote or in your summary/objective for the real issue below unless its \
own TEXT SEGMENTS actually contain that wording."""

    contrastive = """

A CLOSE CALL, done WRONG then RIGHT -- Given:
  [S1] (ISSUE_TITLE) Simplify the internal retry logic in the upload client
  [S2] (ISSUE_BODY) The retry code has three near-duplicate code paths that \
do the same thing. No behavior change intended -- just consolidate them \
into one function for maintainability.

WRONG: task_type: "Improvement" -- tempting because "simplify" sounds like \
an improvement, but the body explicitly says "no behavior change intended" \
-- nothing a user would ever notice changes, which is exactly the Refactor \
definition, not Improvement (Improvement requires the capability to behave \
differently from the user's point of view).
RIGHT: task_type: "Refactor", evidence_task_type: "No behavior change intended" \
-- code-structure-only change, zero user-visible behavior change, matches \
the Refactor criterion exactly, and the evidence phrase is a real quote \
from [S2]."""

    return positive + contrastive


def build_dynamic_worked_example(task: dict, suppress_reuse_warning: bool = False) -> str:
    """A real, already-labeled issue from the SAME embedding cluster
    (see ClusterExampleIndex), shown as an additional, corpus-specific
    calibration anchor alongside the generic static example above --
    never a replacement for it, since we don't have that example's
    original reasoning trace to show honestly.

    v0.6: made the anti-copying warning explicit and concrete (naming the
    exemplar's own values) rather than a generic "for calibration only"
    line -- a live run showed a 3B model copying this block's field
    values wholesale onto an unrelated issue in the same cluster (see
    module docstring, v0.6). suppress_reuse_warning is used on the
    contamination-retry path when the dynamic block has already been
    dropped entirely -- kept as a parameter rather than deleting the
    warning path so a future caller can still opt out explicitly."""
    warning = "" if suppress_reuse_warning else (
        "\nDO NOT reuse any of the values below for the issue you are about to label, even if "
        "the topic looks similar. In particular, do not output "
        f"task_type={task.get('task_type', 'Unknown')!r}, role={task.get('role', 'Unknown')!r}, "
        f"experience_level={task.get('experience_level', 'Unknown')!r}, "
        f"complexity={task.get('complexity', 'Unknown')!r}, or this exact summary/objective text, "
        "unless the TEXT SEGMENTS below (not this example) actually say so. This example is a "
        "DIFFERENT issue with different content."
    )
    return (
        "REAL EXAMPLE FROM THIS CORPUS -- a different, already-labeled issue that fell into "
        "the SAME topic cluster as the one you're about to label below (for calibration only -- "
        "this is NOT the issue you're labeling):\n"
        f"  title: {task.get('title', '')!r}\n"
        f"  task_type: {task.get('task_type', 'Unknown')!r}\n"
        f"  role: {task.get('role', 'Unknown')!r}\n"
        f"  experience_level: {task.get('experience_level', 'Unknown')!r}\n"
        f"  complexity: {task.get('complexity', 'Unknown')!r}\n"
        f"  summary: {task.get('summary', '')!r}"
        f"{warning}"
    )


# Flat-only contract -- grounding for every field is computed in Python
# (see build_proposals_from_flat), never asked of the model as a full
# envelope. The model DOES supply a short evidence phrase per
# classification field (v0.5), which Python then verifies rather than
# trusting blindly -- see _find_verbatim_phrase / _ground_classification.

def build_system_prompt(use_reasoning: bool) -> str:
    if use_reasoning:
        reasoning_keys_line = (
            '  "reasoning_type_role": short string -- 1-2 sentences on what in the text supports '
            "your task_type and role answers, written BEFORE you commit to them,\n"
        )
        reasoning_keys_line2 = (
            '  "reasoning_experience_complexity": short string -- 1-2 sentences on what in the '
            "text (if anything) supports experience_level and complexity, written BEFORE you "
            "commit to them; if there's no real signal, say so explicitly rather than reaching "
            "for one,\n"
        )
        reasoning_rule = (
            "- Fill reasoning_type_role before task_type/role, and reasoning_experience_complexity "
            "before experience_level/complexity -- then make sure each pair of fields actually "
            "agrees with what you just reasoned. Don't contradict your own reasoning.\n"
        )
    else:
        reasoning_keys_line = reasoning_keys_line2 = reasoning_rule = ""

    return f"""You are labeling a single GitHub issue for a training dataset.

You will be given numbered TEXT SEGMENTS (the issue's title, body, labels, \
and comments -- verbatim, and possibly trimmed for length), sometimes a \
REAL EXAMPLE FROM THIS CORPUS for calibration, and sometimes a PRE-FILL \
HINT for one or more fields. A hint marked LOCKED was already determined \
with certainty from the repo's own GitHub label -- just repeat that exact \
value back unchanged. A hint marked "suggestion only" is a rough guess \
from a cheap heuristic -- verify it against the actual text and override \
it if the text says otherwise.

Your answer must be based ONLY on the TEXT SEGMENTS for THIS issue. A REAL \
EXAMPLE FROM THIS CORPUS, if shown, is a DIFFERENT issue shown only so you \
can see the expected output shape and this corpus's labeling style -- its \
field values belong to that other issue, never to this one, even when the \
two issues look similar or come from the same project area.

{_DECISION_CRITERIA_BLOCK}

Reply with ONLY one JSON object -- no markdown fences, no commentary, no \
text before or after it. Every key listed below must be present:

{{
{reasoning_keys_line}  "task_type": one of "Bug", "Feature", "Improvement", "Refactor", "Performance", "Security", "Maintenance", "Documentation", "Other", "Unknown",
  "evidence_task_type": {_EVIDENCE_DESCRIPTIONS["task_type"]}
  "role": one of "Frontend", "Backend", "Fullstack", "Unknown",
  "evidence_role": {_EVIDENCE_DESCRIPTIONS["role"]}
{reasoning_keys_line2}  "experience_level": one of "Beginner", "Intermediate", "Advanced", "Unknown",
  "evidence_experience_level": {_EVIDENCE_DESCRIPTIONS["experience_level"]}
  "complexity": one of "Low", "Medium", "High", "Unknown",
  "evidence_complexity": {_EVIDENCE_DESCRIPTIONS["complexity"]}
  "title": short string (can just restate the issue title),
  "summary": 1-3 plain-English sentences on what the issue is asking for,
  "objective": string -- what needs to be done,
  "expected_outcome": string -- what "done" looks like,
  "acceptance_criteria": list of short strings (give a real, specific list -- avoid leaving this empty if you classified the issue at all),
  "scope": {{"in_scope": [list of strings], "out_of_scope": [list of strings]}}  (empty lists are fine)
}}

{build_few_shot_example(use_reasoning)}

Rules:
- Base every answer only on the TEXT SEGMENTS given. Never invent facts.
- Each evidence_<field> must be an EXACT substring of the TEXT SEGMENTS -- copy it, don't \
paraphrase or summarize. If you can't find real supporting text, use "" -- an empty string is \
honest and expected when your answer comes from reading the issue as a whole rather than one \
specific sentence. A made-up quote is worse than an honest "".
{reasoning_rule}- Use "Unknown" for a classification field ONLY when the text truly gives \
no clue at all -- if the issue's own words, its labels, or a LOCKED hint \
point to an answer, use that answer. Do not default to Unknown out of \
excess caution, and do not guess a field's value just because another \
field was easy to determine (see the "Unknown" line in each field's \
decision criteria above).
- If a REAL EXAMPLE FROM THIS CORPUS is shown above, it is a different issue. Do not copy its \
task_type, role, experience_level, complexity, summary, objective, or expected_outcome unless \
the TEXT SEGMENTS below independently support the same answer.
- Output the JSON object and nothing else -- no explanation, no markdown fences."""


def build_corrective_nudge(use_reasoning: bool) -> str:
    if use_reasoning:
        keys = ("reasoning_type_role, task_type, evidence_task_type, role, evidence_role, "
                "reasoning_experience_complexity, experience_level, evidence_experience_level, "
                "complexity, evidence_complexity")
    else:
        keys = ("task_type, evidence_task_type, role, evidence_role, experience_level, "
                "evidence_experience_level, complexity, evidence_complexity")
    return f"""

Your previous answer did not follow the required format. Redo it now as \
ONE flat JSON object with exactly these top-level keys: {keys}, title, \
summary, objective, expected_outcome, acceptance_criteria, scope. No array \
of field objects, no nested source/pointers/evidence envelopes, no \
markdown fences, no extra commentary -- just the JSON object itself."""


def build_flat_json_schema(use_reasoning: bool) -> dict:
    properties: dict = {}
    if use_reasoning:
        properties["reasoning_type_role"] = {
            "type": "string",
            "description": "1-2 sentences justifying task_type and role, written before those fields.",
        }
    properties["task_type"] = {"type": "string", "enum": sorted(schema_mod.TASK_TYPE_REGISTRY),
                                "description": _SCHEMA_FIELD_DESCRIPTIONS["task_type"]}
    properties["evidence_task_type"] = {"type": "string", "description": _EVIDENCE_DESCRIPTIONS["task_type"]}
    properties["role"] = {"type": "string", "enum": sorted(schema_mod.ROLE),
                           "description": _SCHEMA_FIELD_DESCRIPTIONS["role"]}
    properties["evidence_role"] = {"type": "string", "description": _EVIDENCE_DESCRIPTIONS["role"]}
    if use_reasoning:
        properties["reasoning_experience_complexity"] = {
            "type": "string",
            "description": "1-2 sentences justifying experience_level and complexity, or noting there's no real signal.",
        }
    properties["experience_level"] = {"type": "string", "enum": sorted(schema_mod.EXPERIENCE_LEVEL),
                                       "description": _SCHEMA_FIELD_DESCRIPTIONS["experience_level"]}
    properties["evidence_experience_level"] = {"type": "string",
                                                "description": _EVIDENCE_DESCRIPTIONS["experience_level"]}
    properties["complexity"] = {"type": "string", "enum": sorted(schema_mod.COMPLEXITY),
                                 "description": _SCHEMA_FIELD_DESCRIPTIONS["complexity"]}
    properties["evidence_complexity"] = {"type": "string", "description": _EVIDENCE_DESCRIPTIONS["complexity"]}
    properties["title"] = {"type": "string"}
    properties["summary"] = {"type": "string"}
    properties["objective"] = {"type": "string"}
    properties["expected_outcome"] = {"type": "string"}
    properties["acceptance_criteria"] = {"type": "array", "items": {"type": "string"}}
    properties["scope"] = {
        "type": "object",
        "properties": {
            "in_scope": {"type": "array", "items": {"type": "string"}},
            "out_of_scope": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["in_scope", "out_of_scope"],
    }
    return {"type": "object", "properties": properties, "required": list(properties.keys())}


def build_surgical_schema(field: str) -> dict:
    return {"type": "object",
            "properties": {field: {"type": "string", "enum": sorted(_ALLOWED_VALUES[field])}},
            "required": [field]}


def build_surgical_messages(field: str, segments: list["architecture.Segment"]) -> tuple[str, str]:
    text = render_segments(segments, max_body_chars=2500, max_comment_chars=350, max_comments=6)
    system = (f"You are re-checking ONE classification field, {field}, for a GitHub issue, from "
              f"scratch. Decide independently from the text below -- you have not been told any "
              f"prior answer and should not assume one exists.\n\n"
              f"DECISION CRITERIA:\n{_FIELD_CRITERIA[field]}\n\n"
              f"Reply with ONLY a JSON object of the form {{\"{field}\": \"<value>\"}}. No other text.")
    user = f"TEXT SEGMENTS:\n{text}"
    return system, user


# ------------------------------------------------------- Ollama API client

def call_ollama(system: str, user: str, model: str, base_url: str, response_format,
                 max_retries: int = 3, timeout: int = 180, num_predict: int = 900,
                 num_ctx: int = 6144, temperature: float = 0.0, on_schema_rejected=None) -> str:
    url = base_url.rstrip("/") + "/api/chat"
    fmt = response_format
    for attempt in range(max_retries):
        started = time.time()
        try:
            resp = requests.post(
                url,
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "stream": False,
                    "format": fmt,
                    "options": {"temperature": temperature, "num_predict": num_predict, "num_ctx": num_ctx},
                },
                timeout=timeout,
            )
        except requests.exceptions.ReadTimeout:
            elapsed = time.time() - started
            print(f"  timed out after {elapsed:.0f}s (limit {timeout}s) on attempt {attempt + 1}/{max_retries}",
                  file=sys.stderr)
            if attempt == max_retries - 1:
                raise
            continue
        except requests.ConnectionError:
            sys.exit(
                f"Could not reach Ollama at {base_url}. Is it running? "
                "Try `ollama list` in a terminal, or install from https://ollama.com/download"
            )
        if resp.status_code == 400 and fmt != "json" and on_schema_rejected is not None:
            on_schema_rejected()
            fmt = "json"
            continue
        if resp.status_code == 404 and attempt == 0:
            sys.exit(
                f"Ollama returned 404 for model '{model}'. Did you `ollama pull {model}` first?"
            )
        if resp.status_code >= 500:
            wait = min(30, 2 ** attempt)
            print(f"  Ollama {resp.status_code}, retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        data = resp.json()
        return data.get("message", {}).get("content", "")
    raise RuntimeError("Ollama: exhausted retries")


# ---------------------------------------------------------- prompt building

def render_segments(segments: list["architecture.Segment"], max_body_chars: int = 3000,
                     max_comment_chars: int = 400, max_comments: int = 8) -> str:
    """Caps what the MODEL sees (dense prompts are what pushed a 3B model
    into sparse/malformed output before). Grounding still searches the
    FULL original Segment.text for keyword/phrase evidence regardless of
    this -- only the rendered prompt is trimmed, never the Segment objects
    themselves (see build_proposals_from_flat / _find_keyword_evidence /
    _find_verbatim_phrase)."""
    lines = []
    n_comments_included = 0
    n_comments_dropped = 0
    for s in segments:
        if s.type in ("ISSUE_TITLE", "ISSUE_BODY"):
            text = s.text[:max_body_chars]
        elif s.type == "LABEL":
            text = s.text
        elif s.type == "COMMENT":
            if n_comments_included >= max_comments:
                n_comments_dropped += 1
                continue
            text = s.text[:max_comment_chars]
            n_comments_included += 1
        else:
            text = s.text[:max_comment_chars]
        lines.append(f"[{s.segment_id}] ({s.type}) {text}")
    if n_comments_dropped:
        lines.append(f"[... {n_comments_dropped} additional comment(s) omitted for length ...]")
    return "\n".join(lines)


def render_hint(weak: dict | None) -> str:
    if not weak:
        return "(no pre-fill hint available)"
    parts = []
    for field, val in weak.items():
        if not val:
            continue
        locked = str(val.get("source", "")).startswith("github_label:")
        tag = "LOCKED -- use exactly this value" if locked else "suggestion only, verify"
        parts.append(f"{field}: {val['value']} ({tag}, heuristic confidence {val['confidence']})")
    return "\n".join(parts) if parts else "(no pre-fill hint available)"


# --------------------------------------------------- response parsing

def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _extract_json_span(text: str) -> str:
    candidates = []
    for open_c, close_c in (("{", "}"), ("[", "]")):
        start, end = text.find(open_c), text.rfind(close_c)
        if start != -1 and end != -1 and end > start:
            candidates.append((start, text[start:end + 1]))
    if not candidates:
        return text
    candidates.sort(key=lambda t: t[0])
    return candidates[0][1]


def _parse_raw_json(text: str) -> dict | list:
    text = _strip_fences(text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return json.loads(_extract_json_span(text))


def _is_single_proposal(data) -> bool:
    return isinstance(data, dict) and "field" in data and "value" in data


def _to_flat_dict(data) -> dict:
    if isinstance(data, list):
        flat = {}
        for item in data:
            if isinstance(item, dict) and "field" in item:
                v = item.get("value")
                if isinstance(v, dict) and "value" in v:
                    v = v["value"]
                flat[item["field"]] = v
        if not flat:
            raise ValueError("list response contained no recognizable field/value items")
        return flat
    if isinstance(data, dict):
        if _is_single_proposal(data):
            return {data["field"]: data.get("value")}
        if len(data) == 1:
            (only_val,) = data.values()
            if isinstance(only_val, (dict, list)):
                return _to_flat_dict(only_val)
        return data
    raise ValueError("response was not a JSON object or array")


REQUIRED_FIELD_NAMES = {
    "task_type", "role", "experience_level", "complexity", "title",
    "summary", "objective", "expected_outcome", "acceptance_criteria", "scope",
}
# reasoning_* and evidence_* keys are deliberately NOT in REQUIRED_FIELD_NAMES
# -- they're scratch/evidentiary space, not TrainingExample fields, and are
# popped out before coverage/parsing logic ever sees them (see _safe_parse).
MIN_REQUIRED_FIELDS_TO_ACCEPT = 5


def _covered_required_fields(flat: dict | None) -> set:
    if not isinstance(flat, dict):
        return set()
    return set(flat.keys()) & REQUIRED_FIELD_NAMES


def _normalize(s: str) -> str:
    # v0.8: strip markdown decoration (bold/italic/code markers) before
    # comparing. A model quoting prose naturally drops the ** / ` / _
    # around it, and without this a genuine, correctly-quoted citation
    # of text like "regression introduced in **3.9.0**" was being
    # flagged evidence_phrase_hallucinated just because the real segment
    # had markdown around the same words the plain-text quote lacked.
    s = re.sub(r"[*_`]+", "", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def verify_grounding(items: list[dict], segments: list["architecture.Segment"]
                      ) -> list["architecture.FieldProposal"]:
    by_id = {s.segment_id: s for s in segments}
    proposals = []
    for item in items:
        if not isinstance(item, dict):
            continue
        field = item.get("field")
        if not isinstance(field, str):
            continue
        value = item.get("value")
        source = item.get("source", "UNKNOWN")
        pointers = [p for p in (item.get("pointers") or []) if p in by_id]
        evidence = item.get("evidence_text")
        confidence = item.get("confidence")

        if source != "UNKNOWN" and evidence:
            pointed_text = " ".join(by_id[p].text for p in pointers)
            if _normalize(evidence) not in _normalize(pointed_text):
                source = "INFERRED" if pointers else "UNKNOWN"
                confidence = min(confidence, 0.4) if isinstance(confidence, (int, float)) else 0.3
                if source == "UNKNOWN":
                    pointers, evidence, confidence = [], None, None

        proposals.append(architecture.FieldProposal(
            field=field, value=value, source=source, pointers=pointers,
            evidence_text=evidence, confidence=confidence, note=item.get("note"),
        ))
    return proposals


def default_fill_proposals(proposals: list["architecture.FieldProposal"]
                            ) -> list["architecture.FieldProposal"]:
    have = {p.field for p in proposals}
    filled = list(proposals)
    for f in LIST_FIELDS:
        if f not in have:
            filled.append(architecture.FieldProposal(f, [], "UNKNOWN"))
    if "dependencies" not in have:
        filled.append(architecture.FieldProposal("dependencies", [], "UNKNOWN"))
    if "scope" not in have:
        filled.append(architecture.FieldProposal("scope", {"in_scope": [], "out_of_scope": []}, "UNKNOWN"))
    if "acceptance_criteria" not in have:
        filled.append(architecture.FieldProposal("acceptance_criteria", [], "UNKNOWN"))
    for f in CLASSIFICATION_FIELDS:
        if f not in have:
            filled.append(architecture.FieldProposal(f, "Unknown", "UNKNOWN"))
    return filled


# --------------------------------------------- deterministic grounding

_TASK_TYPE_KEYWORDS = {
    "Bug": re.compile(r"\b(bugs?|crash\w*|errors?|exceptions?|broken|fails?|failing|failure|regression\w*)\b", re.I),
    "Performance": re.compile(r"\b(slow\w*|latency|performant?|timeouts?|perf\b)\b", re.I),
    "Security": re.compile(r"\b(security|vulnerab\w*|exploit\w*|CVE)\b", re.I),
    "Documentation": re.compile(r"\b(docs?|documentation|readme)\b", re.I),
    "Refactor": re.compile(r"\b(refactor\w*|clean-?up|tech(?:nical)? debt)\b", re.I),
    "Maintenance": re.compile(r"\b(chore|maintenance|upgrade\w*|bump\w*|dependenc\w*)\b", re.I),
    "Improvement": re.compile(r"\b(improve\w*|enhance\w*|enhancement)\b", re.I),
    "Feature": re.compile(r"\b(add\w*|feature\w*|support for|new\b)\b", re.I),
}
_ROLE_KEYWORDS = {
    "Frontend": re.compile(r"\b(UI|frontend|front-end|React|CSS|HTML|button\w*|pages?|components?|styles?|styling)\b", re.I),
    "Backend": re.compile(r"\b(backend|back-end|APIs?|database|servers?|endpoints?|schema|migrations?)\b", re.I),
}
_KEYWORD_PATTERNS_BY_FIELD = {"task_type": _TASK_TYPE_KEYWORDS, "role": _ROLE_KEYWORDS}
_EVIDENCE_SEGMENT_TYPES = ("ISSUE_TITLE", "ISSUE_BODY", "LABEL", "COMMENT")

# Word-boundary regex per enum value, used ONLY for the reasoning/answer
# consistency check below -- not for grounding evidence (that's the
# keyword tables above and the verbatim-phrase check below, which are
# different, narrower purposes).
_FIELD_VALUE_WORD_PATTERNS = {
    field: {v: re.compile(r"\b" + re.escape(v) + r"\b", re.I) for v in vals if v != "Unknown"}
    for field, vals in _ALLOWED_VALUES.items()
}


# A literal word match isn't enough to count as a positive mention -- "not
# an Improvement" contains the word "Improvement" but asserts the
# opposite. Treat a match as positive only if no negation cue appears in
# the short span immediately before it.
_NEGATION_RE = re.compile(r"\b(not|n't|never|isn't|doesn't|instead of|rather than)\b", re.I)
_NEGATION_WINDOW = 25


def _mentions_value_positively(text: str, pattern: re.Pattern) -> bool:
    for m in pattern.finditer(text):
        window_start = max(0, m.start() - _NEGATION_WINDOW)
        if not _NEGATION_RE.search(text[window_start:m.start()]):
            return True
    return False


def _reasoning_disagrees(field: str, chosen_value, reasoning_text: str | None) -> bool:
    """True when the model's own stated reasoning positively names a
    DIFFERENT enum value for this field than the one it actually chose,
    and never positively names the chosen value itself -- a clear
    self-contradiction, not just an absence of restated terminology (the
    model isn't required to repeat the label name to be consistent, so
    this only fires on the clear case)."""
    if not reasoning_text or not isinstance(chosen_value, str) or chosen_value == "Unknown":
        return False
    patterns = _FIELD_VALUE_WORD_PATTERNS.get(field, {})
    chosen_pat = patterns.get(chosen_value)
    if not chosen_pat:
        return False
    mentions_chosen = _mentions_value_positively(reasoning_text, chosen_pat)
    mentions_other = any(_mentions_value_positively(reasoning_text, p)
                          for v, p in patterns.items() if v != chosen_value)
    return mentions_other and not mentions_chosen


def _find_keyword_evidence(value: str, segments: list["architecture.Segment"],
                            pattern_map: dict) -> tuple | None:
    pattern = pattern_map.get(value)
    if not pattern:
        return None
    for seg in segments:
        if seg.type in _EVIDENCE_SEGMENT_TYPES:
            m = pattern.search(seg.text)
            if m:
                return seg, m.group(0)
    return None


def _find_verbatim_phrase(phrase: str, segments: list["architecture.Segment"]) -> tuple | None:
    """Checks whether the model's self-cited evidence_<field> phrase
    actually appears (whitespace/case-insensitive) in one of the real
    segments -- the whole point of asking for it instead of trusting a
    bare classification. A phrase too short to be meaningful (a stray
    word) is treated as no citation at all, not as a match."""
    norm_phrase = _normalize(phrase)
    if len(norm_phrase) < 6:
        return None
    for seg in segments:
        if seg.type in _EVIDENCE_SEGMENT_TYPES and norm_phrase in _normalize(seg.text):
            return seg, phrase
    return None


def _is_full_title_quote(quote: str, segments: list["architecture.Segment"]) -> bool:
    """True when a model-cited evidence_<field> phrase is (near) the
    ENTIRE issue title rather than a targeted quote. The title is always
    present verbatim in the segments, so citing "the whole title" back
    trivially passes _find_verbatim_phrase for ANY field -- including
    complexity/experience_level/role, which a bare title almost never
    actually supports on its own. v0.8: treat this the same as "no real
    targeted evidence" (fall through to keyword/INFERRED tiers) instead
    of granting it the same EXPLICIT/high-confidence status as a genuine
    citation -- a live run showed the model using this as a free way to
    look grounded on fields it hadn't really justified."""
    title_seg = next((s for s in segments if s.type == "ISSUE_TITLE"), None)
    if title_seg is None:
        return False
    title_norm, quote_norm = _normalize(title_seg.text), _normalize(quote)
    if not title_norm or not quote_norm:
        return False
    if quote_norm == title_norm:
        return True
    return _text_overlap_ratio(quote, title_seg.text) >= 0.8


def _locked_weak_label_item(field: str, entry: dict,
                             segments: list["architecture.Segment"]) -> dict | None:
    raw_label = entry["source"].split(":", 1)[1]
    seg = next((s for s in segments
                if s.type == "LABEL" and s.text.strip().lower() == raw_label.strip().lower()), None)
    if seg is None:
        return None
    return {
        "field": field, "value": entry["value"], "source": "SUPPORTED_BY_CONTEXT",
        "pointers": [seg.segment_id], "evidence_text": seg.text, "confidence": entry["confidence"],
        "note": "locked from the repo's own GitHub label -- model not asked to (re-)classify this field",
    }


def _ground_classification(field: str, value, segments: list["architecture.Segment"],
                            anchor_pointers: list[str], reasoning_text: str | None,
                            evidence_phrase: str | None, risk_flags: list[str],
                            consistency_agreement: tuple[int, int] | None = None) -> dict:
    if not isinstance(value, str) or value not in _ALLOWED_VALUES.get(field, set()) or value == "Unknown":
        return {"field": field, "value": "Unknown", "source": "UNKNOWN",
                "pointers": [], "evidence_text": None, "confidence": None}

    mismatch = _reasoning_disagrees(field, value, reasoning_text)
    if mismatch:
        risk_flags.append(f"reasoning_mismatch:{field}")

    def _apply_consistency_floor(result: dict) -> dict:
        """v0.9: unanimous agreement across independently re-sampled
        self-consistency votes (>=3 total, all agreeing) is real,
        earned evidence of stability -- floor confidence at 0.75 and,
        if the field only made it to INFERRED on grounding alone,
        upgrade it to SUPPORTED_BY_CONTEXT (repeated independent
        agreement is a form of context support; it is deliberately
        never upgraded to EXPLICIT, which is reserved for an actual
        literal quote). A non-unanimous (split) vote is left exactly
        as grounding already computed it -- see the v0.9 note in the
        module docstring for why a split vote must NOT be floored."""
        if not consistency_agreement:
            return result
        n_agree, n_total = consistency_agreement
        if n_total >= 3 and n_agree == n_total and isinstance(result.get("confidence"), (int, float)):
            if result["confidence"] < 0.75:
                result["confidence"] = 0.75
                if result["source"] == "INFERRED":
                    result["source"] = "SUPPORTED_BY_CONTEXT"
                result["note"] = (str(result.get("note") or "").rstrip(" -")
                                   + f" -- confidence floored to 0.75: unanimous across all "
                                     f"{n_total} independent self-consistency votes")
        return result

    # 1) model-supplied, VERIFIED evidence phrase -- the highest-trust
    #    grounding available, since it's the model's own targeted
    #    citation rather than a blind enum-name string search.
    if isinstance(evidence_phrase, str) and evidence_phrase.strip():
        hit = _find_verbatim_phrase(evidence_phrase, segments)
        if hit:
            seg, quote = hit
            if _is_full_title_quote(quote, segments):
                # v0.8: quoting the whole title back is not a targeted
                # citation -- don't return here, fall through to the
                # keyword/INFERRED tiers below as if no usable evidence
                # phrase had been given.
                risk_flags.append(f"title_only_evidence:{field}")
            else:
                source = "EXPLICIT" if seg.type == "ISSUE_TITLE" else "SUPPORTED_BY_CONTEXT"
                confidence = 0.85 if seg.type == "ISSUE_TITLE" else 0.75
                note = "grounded by the model's own cited phrase, verified present in the issue text"
                if mismatch:
                    confidence = min(confidence, 0.35)
                    note += " -- but the model's own stated reasoning named a different value; treat with caution"
                return _apply_consistency_floor({"field": field, "value": value, "source": source,
                                                  "pointers": [seg.segment_id], "evidence_text": quote,
                                                  "confidence": confidence, "note": note})
        else:
            risk_flags.append(f"evidence_phrase_hallucinated:{field}")
            return _apply_consistency_floor({
                "field": field, "value": value, "source": "INFERRED", "pointers": list(anchor_pointers),
                "evidence_text": f"model claimed support: {evidence_phrase!r} (not found verbatim in the text)",
                "confidence": 0.15,
                "note": "model cited an evidence phrase that could not be found verbatim in the issue "
                        "text -- likely a hallucinated citation, treat with extra caution"})

    # 2) fall back to deterministic keyword matching (unchanged from v0.4)
    hit = _find_keyword_evidence(value, segments, _KEYWORD_PATTERNS_BY_FIELD.get(field, {}))
    if hit:
        seg, quote = hit
        source = "EXPLICIT" if seg.type == "ISSUE_TITLE" else "SUPPORTED_BY_CONTEXT"
        confidence = 0.8 if seg.type == "ISSUE_TITLE" else 0.6
        note = "grounded by a literal keyword match, not a model-supplied quote"
        if mismatch:
            confidence = min(confidence, 0.35)
            note += " -- but the model's own stated reasoning named a different value; treat with caution"
        return _apply_consistency_floor({"field": field, "value": value, "source": source,
                                          "pointers": [seg.segment_id], "evidence_text": quote,
                                          "confidence": confidence, "note": note})

    # 3) no grounding at all -- honest INFERRED judgment call
    if field in ("experience_level", "complexity"):
        risk_flags.append(f"no_deterministic_grounding:{field}")
    confidence = 0.25 if mismatch else 0.4
    note = "model-inferred classification, no literal keyword grounding found"
    if mismatch:
        note += " -- and the model's own stated reasoning named a different value; treat with caution"
    return _apply_consistency_floor({"field": field, "value": value, "source": "INFERRED",
                                      "pointers": list(anchor_pointers),
                                      "evidence_text": f"model judgment: classified {field.replace('_', ' ')} as "
                                                        f"{value!r} from reading the issue as a whole; no literal "
                                                        "keyword match found to cite as a quote",
                                      "confidence": confidence, "note": note})


def build_proposals_from_flat(flat: dict, weak: dict | None,
                               segments: list["architecture.Segment"],
                               anchor_pointers: list[str],
                               reasoning_by_field: dict | None = None,
                               evidence_by_field: dict | None = None,
                               consistency_agreement_by_field: dict | None = None,
                               ) -> tuple[list[dict], list[str]]:
    """Turn one flat {field: value} response into the field/source/
    pointers/evidence_text/confidence item shape verify_grounding()
    expects, plus a list of risk-flag strings (reasoning/answer mismatches,
    hallucinated evidence citations, model-vs-heuristic disagreements, and
    "this field never has deterministic grounding") used for stratified
    spot-check sampling.

    consistency_agreement_by_field, if given, maps a classification field
    to (n_agreeing_with_winner, n_total_votes) from --self-consistency
    voting (see v0.9 in the module docstring) -- passed straight through
    to _ground_classification's confidence floor."""
    items: list[dict] = []
    risk_flags: list[str] = []
    reasoning_by_field = reasoning_by_field or {}
    evidence_by_field = evidence_by_field or {}
    consistency_agreement_by_field = consistency_agreement_by_field or {}
    title_seg = next((s for s in segments if s.type == "ISSUE_TITLE"), None)
    body_seg = next((s for s in segments if s.type == "ISSUE_BODY"), None)
    anchor_seg = body_seg or title_seg

    if title_seg:
        items.append({"field": "title", "value": title_seg.text, "source": "EXPLICIT",
                      "pointers": [title_seg.segment_id], "evidence_text": title_seg.text,
                      "confidence": 0.95})

    for field in CLASSIFICATION_FIELDS:
        entry = weak.get(field) if weak else None
        locked = None
        if entry and str(entry.get("source", "")).startswith("github_label:"):
            locked = _locked_weak_label_item(field, entry, segments)
        if locked:
            items.append(locked)
            continue
        model_value = flat.get(field)
        item = _ground_classification(field, model_value, segments, anchor_pointers,
                                       reasoning_by_field.get(field), evidence_by_field.get(field),
                                       risk_flags, consistency_agreement_by_field.get(field))
        items.append(item)
        # Model-vs-heuristic disagreement: only meaningful for an UNLOCKED
        # hint (a locked one was never shown to the model as optional).
        if (entry and isinstance(model_value, str) and model_value != "Unknown"
                and model_value != entry.get("value")):
            risk_flags.append(f"model_heuristic_disagreement:{field}")

    anchor_evidence = anchor_seg.text[:300] if anchor_seg else None
    if anchor_seg:
        for field in ("summary", "objective", "expected_outcome"):
            value = flat.get(field)
            if isinstance(value, str) and value.strip():
                items.append({"field": field, "value": value, "source": "SUPPORTED_BY_CONTEXT",
                              "pointers": [anchor_seg.segment_id], "evidence_text": anchor_evidence,
                              "confidence": 0.55})

        ac = flat.get("acceptance_criteria")
        if isinstance(ac, str):
            ac = [ac]
        if isinstance(ac, list) and ac and all(isinstance(i, str) for i in ac):
            items.append({"field": "acceptance_criteria", "value": ac, "source": "SUPPORTED_BY_CONTEXT",
                          "pointers": [anchor_seg.segment_id], "evidence_text": anchor_evidence,
                          "confidence": 0.5})

        scope = flat.get("scope")
        if isinstance(scope, dict):
            in_scope = [s for s in (scope.get("in_scope") or []) if isinstance(s, str)]
            out_scope = [s for s in (scope.get("out_of_scope") or []) if isinstance(s, str)]
            if in_scope or out_scope:
                items.append({"field": "scope", "value": {"in_scope": in_scope, "out_of_scope": out_scope},
                              "source": "SUPPORTED_BY_CONTEXT", "pointers": [anchor_seg.segment_id],
                              "evidence_text": anchor_evidence, "confidence": 0.45})

        # v0.5: LIST_FIELDS are no longer asked of the model (see module
        # docstring point 2) -- they're populated as empty/UNKNOWN by
        # default_fill_proposals() below instead. This loop is kept as a
        # harmless no-op in case a future prompt variant re-adds them.
        for field in LIST_FIELDS:
            value = flat.get(field)
            if isinstance(value, list) and value and all(isinstance(i, str) for i in value):
                items.append({"field": field, "value": value, "source": "INFERRED",
                              "pointers": [anchor_seg.segment_id], "evidence_text": anchor_evidence,
                              "confidence": 0.4})

    return items, risk_flags


# --------------------------------------------- v0.6 exemplar contamination

def _text_overlap_ratio(a: str, b: str) -> float:
    """Cheap word-overlap ratio (Jaccard-ish, dependency-free) between two
    normalized strings, used only to detect suspiciously exemplar-like
    text -- not a general similarity metric."""
    wa, wb = set(_normalize(a).split()), set(_normalize(b).split())
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def _looks_copied_from_exemplar(flat: dict, exemplar_task: dict) -> list[str]:
    """Returns a list of human-readable reasons the flat response looks
    like it was copied from the dynamic few-shot exemplar rather than
    independently derived from the real issue -- empty list means no
    contamination detected. See v0.6 in the module docstring for the live
    failure this was written to catch."""
    if not isinstance(flat, dict) or not exemplar_task:
        return []
    reasons = []

    n_classification_matches = 0
    for field in CLASSIFICATION_FIELDS:
        ev = exemplar_task.get(field)
        mv = flat.get(field)
        if isinstance(ev, str) and isinstance(mv, str) and ev != "Unknown" and ev == mv:
            n_classification_matches += 1
    if n_classification_matches == len(CLASSIFICATION_FIELDS):
        reasons.append("all_classification_fields_match_exemplar")

    for field in ("summary", "objective", "expected_outcome"):
        ev = exemplar_task.get(field)
        mv = flat.get(field)
        if isinstance(ev, str) and isinstance(mv, str) and len(ev) > 20:
            if _normalize(ev) == _normalize(mv) or _text_overlap_ratio(ev, mv) >= 0.7:
                reasons.append(f"{field}_matches_exemplar")

    return reasons


class ClusterExampleIndex:
    """Joins weak_labels.jsonl's cluster_id (from Step 3's embedding
    clustering) against whatever's already labeled in --out, so a new
    issue can be shown a REAL example from its own cluster as a dynamic
    few-shot, and its classification can be checked against that
    cluster's existing majority. Degrades gracefully to "nothing
    available" -- there is no cold-start failure, just no benefit until
    some labeling has already accumulated."""

    def __init__(self, weak_labels_path: Path, examples_path: Path):
        self.cluster_by_id: dict[str, int] = {}
        if weak_labels_path.exists():
            with weak_labels_path.open(encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    cid = row.get("cluster_id")
                    if cid is not None and "collection_id" in row:
                        self.cluster_by_id[row["collection_id"]] = cid

        self.examples_by_cluster: dict[int, list[dict]] = defaultdict(list)
        if examples_path.exists():
            with examples_path.open(encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        ex = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    cluster_id = self.cluster_by_id.get(ex.get("collection_id"))
                    if cluster_id is None:
                        continue
                    task = (ex.get("ground_truth") or {}).get("task") or {}
                    if task:
                        self.examples_by_cluster[cluster_id].append(task)

    def cluster_for(self, collection_id: str) -> int | None:
        return self.cluster_by_id.get(collection_id)

    def example_for(self, cluster_id: int | None) -> dict | None:
        if cluster_id is None:
            return None
        pool = self.examples_by_cluster.get(cluster_id)
        return pool[0] if pool else None

    def majority(self, cluster_id: int | None, field: str) -> tuple[str, int] | None:
        if cluster_id is None:
            return None
        pool = self.examples_by_cluster.get(cluster_id, [])
        votes = [t.get(field) for t in pool if isinstance(t.get(field), str) and t.get(field) != "Unknown"]
        if len(votes) < 2:
            return None
        value, n = Counter(votes).most_common(1)[0]
        return value, n


class OllamaEngine:
    """Satisfies the same engine.propose(segments) -> list[FieldProposal]
    contract as claude_label.py's ClaudeEngine, backed by a local model."""

    def __init__(self, model: str, base_url: str, timeout: int = 180, num_predict: int = 900,
                 num_ctx: int = 6144, use_reasoning: bool = True, max_body_chars: int = 3000,
                 max_comment_chars: int = 400, max_comments: int = 8,
                 self_consistency_n: int = 1, self_consistency_temperature: float = 0.7,
                 enable_surgical_reask: bool = True, enable_self_critique: bool = False,
                 cluster_index: "ClusterExampleIndex | None" = None,
                 use_cluster_few_shot: bool = True):
        self.model = model
        self.base_url = base_url
        self.timeout = timeout
        self.num_predict = num_predict
        self.num_ctx = num_ctx
        self.use_reasoning = use_reasoning
        self.max_body_chars = max_body_chars
        self.max_comment_chars = max_comment_chars
        self.max_comments = max_comments
        self.self_consistency_n = max(1, self_consistency_n)
        self.self_consistency_temperature = self_consistency_temperature
        self.enable_surgical_reask = enable_surgical_reask
        self.enable_self_critique = enable_self_critique
        self.cluster_index = cluster_index
        self.use_cluster_few_shot = use_cluster_few_shot
        self._system_prompt = build_system_prompt(use_reasoning)
        self._corrective_nudge = build_corrective_nudge(use_reasoning)
        self._response_format = build_flat_json_schema(use_reasoning)
        self.last_raw: str = ""
        self.last_flat: dict | None = None
        self.last_reasoning: dict | None = None
        self.last_shape: str = ""
        self.last_n_items: int = 0
        self.last_risk_flags: list[str] = []
        # v0.6: set when the final accepted response for the most recent
        # propose() call is judged un-salvageable (contamination survived
        # the retry) -- main() checks this and routes straight to
        # rejected.jsonl instead of writing a training example.
        self.last_reject_reason: str | None = None

    def _disable_schema(self) -> None:
        if self._response_format != "json":
            print("  Ollama rejected the JSON-schema output format (needs Ollama >= 0.5) -- "
                  "falling back to plain json mode for the rest of this run. Consider "
                  "`ollama --version` / upgrading Ollama for stricter, more reliable output.",
                  file=sys.stderr)
            self._response_format = "json"

    def _call(self, user: str, temperature: float = 0.0, system: str | None = None) -> str:
        return call_ollama(system or self._system_prompt, user, self.model, self.base_url,
                            self._response_format, timeout=self.timeout, num_predict=self.num_predict,
                            num_ctx=self.num_ctx, temperature=temperature,
                            on_schema_rejected=self._disable_schema)

    def _safe_parse(self, raw: str) -> tuple[dict | None, tuple[str | None, str | None], dict]:
        """Returns (flat_dict_without_scratch_keys,
        (reasoning_type_role, reasoning_experience_complexity),
        {field: evidence_phrase})."""
        try:
            data = _parse_raw_json(raw)
        except (ValueError, json.JSONDecodeError):
            return None, (None, None), {}
        try:
            flat = _to_flat_dict(data)
        except ValueError:
            return None, (None, None), {}
        r1 = flat.pop("reasoning_type_role", None) if isinstance(flat, dict) else None
        r2 = flat.pop("reasoning_experience_complexity", None) if isinstance(flat, dict) else None
        legacy = flat.pop("reasoning", None) if isinstance(flat, dict) else None
        if legacy and not r1 and not r2:
            r1 = r2 = legacy
        r1 = r1 if isinstance(r1, str) else None
        r2 = r2 if isinstance(r2, str) else None

        evidence: dict = {}
        if isinstance(flat, dict):
            for field, key in (("task_type", "evidence_task_type"), ("role", "evidence_role"),
                                ("experience_level", "evidence_experience_level"),
                                ("complexity", "evidence_complexity")):
                v = flat.pop(key, None)
                if isinstance(v, str) and v.strip():
                    evidence[field] = v
        return flat, (r1, r2), evidence

    def _surgical_reask(self, field: str, segments: list["architecture.Segment"]) -> str | None:
        system, user = build_surgical_messages(field, segments)
        schema = build_surgical_schema(field)
        try:
            raw = call_ollama(system, user, self.model, self.base_url, schema,
                               timeout=self.timeout, num_predict=60, num_ctx=self.num_ctx,
                               temperature=0.0, on_schema_rejected=self._disable_schema)
        except Exception:
            return None
        try:
            data = _parse_raw_json(raw)
        except (ValueError, json.JSONDecodeError):
            return None
        if isinstance(data, dict):
            v = data.get(field)
            if isinstance(v, str) and v in _ALLOWED_VALUES.get(field, set()):
                return v
        return None

    def _self_critique(self, segments: list["architecture.Segment"], flat: dict):
        text = render_segments(segments, self.max_body_chars, self.max_comment_chars, self.max_comments)
        current = {k: v for k, v in flat.items() if k in REQUIRED_FIELD_NAMES}
        user = (f"TEXT SEGMENTS:\n{text}\n\n"
                f"YOUR PRIOR ANSWER (for the same TEXT SEGMENTS above):\n"
                f"{json.dumps(current, ensure_ascii=False)}\n\n"
                "Re-check this answer carefully against the text above. If everything holds up, "
                "return the exact same JSON object (full shape, including the reasoning/evidence "
                "keys, re-derived if needed). If something is wrong, correct it. Reply with ONLY "
                "the JSON object, same shape as originally specified.")
        try:
            raw = self._call(user)
        except Exception:
            return None
        critique_flat, (cr1, cr2), critique_evidence = self._safe_parse(raw)
        if not critique_flat or len(_covered_required_fields(critique_flat)) < MIN_REQUIRED_FIELDS_TO_ACCEPT:
            return None
        changed = [f for f in CLASSIFICATION_FIELDS if critique_flat.get(f) != flat.get(f)]
        return critique_flat, cr1, cr2, critique_evidence, changed

    def propose(self, segments: list["architecture.Segment"], weak: dict | None = None,
                 collection_id: str = "unknown", cluster_id: int | None = None
                 ) -> list["architecture.FieldProposal"]:
        self.last_reject_reason = None
        dynamic_example_task = None
        if self.cluster_index is not None and self.use_cluster_few_shot:
            dynamic_example_task = self.cluster_index.example_for(cluster_id)
        dynamic_block = (build_dynamic_worked_example(dynamic_example_task) + "\n\n"
                          if dynamic_example_task else "")

        def build_user(block: str) -> str:
            return (f"{block}"
                    f"TEXT SEGMENTS:\n"
                    f"{render_segments(segments, self.max_body_chars, self.max_comment_chars, self.max_comments)}\n\n"
                    f"PRE-FILL HINT:\n{render_hint(weak)}")

        user = build_user(dynamic_block)
        anchor_pointers = [s.segment_id for s in segments if s.type in ("ISSUE_TITLE", "ISSUE_BODY")]

        t0 = time.time()
        raw = self._call(user)
        elapsed = time.time() - t0

        flat, (r1, r2), evidence = self._safe_parse(raw)
        coverage = _covered_required_fields(flat)

        if len(coverage) < MIN_REQUIRED_FIELDS_TO_ACCEPT:
            reason = ("unparseable response" if flat is None else
                      f"sparse response ({len(coverage)}/{len(REQUIRED_FIELD_NAMES)} required fields present)")
            print(f"  {reason} on attempt 1 -- retrying with corrective nudge", file=sys.stderr)

            t1 = time.time()
            raw_retry = self._call(user + self._corrective_nudge)
            elapsed += time.time() - t1
            flat_retry, (r1_retry, r2_retry), evidence_retry = self._safe_parse(raw_retry)
            coverage_retry = _covered_required_fields(flat_retry)

            if len(coverage_retry) > len(coverage):
                raw, flat, r1, r2, evidence, coverage = (raw_retry, flat_retry, r1_retry, r2_retry,
                                                           evidence_retry, coverage_retry)
                print(f"  retry recovered {len(coverage)}/{len(REQUIRED_FIELD_NAMES)} "
                      "required fields -- using it instead", file=sys.stderr)
            else:
                print(f"  retry did not improve on the original ({len(coverage)}/"
                      f"{len(REQUIRED_FIELD_NAMES)} required fields) -- keeping it", file=sys.stderr)

        print(f"  ({elapsed:.1f}s)", file=sys.stderr)

        if flat is None:
            debug_dir = Path("data/debug_failed_responses")
            debug_dir.mkdir(parents=True, exist_ok=True)
            debug_path = debug_dir / f"{collection_id}.txt"
            debug_path.write_text(raw, encoding="utf-8")
            raise ValueError(f"could not parse a usable response (raw saved to {debug_path})")

        risk_flags: list[str] = []

        # --------------------------------------------- v0.6: exemplar
        # contamination check + one-shot retry without the dynamic block.
        contamination_log: dict | None = None
        if dynamic_example_task is not None:
            reasons = _looks_copied_from_exemplar(flat, dynamic_example_task)
            if reasons:
                risk_flags.append("exemplar_contamination_detected:" + ",".join(reasons))
                print(f"  looks copied from the cluster exemplar ({', '.join(reasons)}) -- "
                      f"retrying once without it", file=sys.stderr)
                retry_user = build_user("")
                t2 = time.time()
                raw2 = self._call(retry_user)
                elapsed2 = time.time() - t2
                flat2, (r1b, r2b), evidence2 = self._safe_parse(raw2)
                coverage2 = _covered_required_fields(flat2)
                print(f"  (contamination-retry, {elapsed2:.1f}s)", file=sys.stderr)
                still_bad = (len(coverage2) < MIN_REQUIRED_FIELDS_TO_ACCEPT
                             or _looks_copied_from_exemplar(flat2, dynamic_example_task))
                contamination_log = {
                    "collection_id": collection_id,
                    "exemplar_task": dynamic_example_task,
                    "original_flat": flat,
                    "original_reasons": reasons,
                    "retry_flat": flat2,
                    "retry_still_contaminated": still_bad,
                }
                if not still_bad:
                    flat, r1, r2, evidence, coverage = flat2, r1b, r2b, evidence2, coverage2
                    risk_flags.append("exemplar_contamination_fixed_by_retry")
                else:
                    risk_flags.append("exemplar_contamination_unresolved")
                    self.last_reject_reason = (
                        "exemplar_contamination_unresolved: model's response still matched the "
                        f"cluster exemplar after a from-scratch retry ({', '.join(reasons)})")

        # Self-consistency voting on the four classification fields only
        # (opt-in, off by default -- multiplies model calls per issue).
        # v0.9: the per-field vote tally (n_agreeing_with_winner, n_total)
        # is now kept, not just the winning value -- see
        # consistency_agreement_by_field below and the v0.9 note in the
        # module docstring for how it's used.
        consistency_agreement_by_field: dict[str, tuple[int, int]] = {}
        if self.self_consistency_n > 1:
            all_flats = [flat]
            for k in range(self.self_consistency_n - 1):
                t3 = time.time()
                raw_k = self._call(user, temperature=self.self_consistency_temperature)
                elapsed_k = time.time() - t3
                flat_k, _, _ = self._safe_parse(raw_k)
                if flat_k and len(_covered_required_fields(flat_k)) >= MIN_REQUIRED_FIELDS_TO_ACCEPT:
                    all_flats.append(flat_k)
                    print(f"  self-consistency call {k + 2}/{self.self_consistency_n} ({elapsed_k:.1f}s)",
                          file=sys.stderr)
                else:
                    print(f"  self-consistency call {k + 2}/{self.self_consistency_n} sparse/unparseable "
                          f"-- skipped from vote ({elapsed_k:.1f}s)", file=sys.stderr)
            for field in CLASSIFICATION_FIELDS:
                votes = [f.get(field) for f in all_flats if isinstance(f.get(field), str)]
                if not votes:
                    continue
                counter = Counter(votes)
                winner, n_winner = counter.most_common(1)[0]
                consistency_agreement_by_field[field] = (n_winner, len(votes))
                if len(counter) > 1:
                    risk_flags.append(f"self_consistency_split:{field}={dict(counter)}")
                flat[field] = winner

        # Optional full self-critique pass (opt-in, off by default -- one
        # extra full call on EVERY issue, unlike surgical re-ask below).
        if self.enable_self_critique:
            result = self._self_critique(segments, flat)
            if result is not None:
                critique_flat, cr1, cr2, critique_evidence, changed_fields = result
                flat = critique_flat
                r1 = cr1 or r1
                r2 = cr2 or r2
                evidence = critique_evidence or evidence
                for f in changed_fields:
                    risk_flags.append(f"self_critique_changed:{f}")
                    # v0.9: a self-critique CHANGE invalidates whatever
                    # vote tally applied to the pre-critique value for
                    # this field -- the critique overrode the vote, so
                    # the "unanimous" evidence no longer describes the
                    # value actually being kept.
                    consistency_agreement_by_field.pop(f, None)

        # Cluster-majority check -- reuses the same real corpus data as
        # the dynamic few-shot above, this time as a post-hoc sanity
        # check rather than a prompt input. No-op with no prior labels.
        if self.cluster_index is not None:
            for field in CLASSIFICATION_FIELDS:
                model_val = flat.get(field) if isinstance(flat, dict) else None
                maj = self.cluster_index.majority(cluster_id, field)
                if maj and isinstance(model_val, str) and model_val not in ("Unknown", maj[0]):
                    risk_flags.append(f"cluster_majority_disagreement:{field}={model_val}_vs_{maj[0]}(n={maj[1]})")

        reasoning_by_field = {"task_type": r1, "role": r1, "experience_level": r2, "complexity": r2}
        evidence_by_field = evidence or {}

        self.last_raw = raw
        self.last_flat = flat
        self.last_reasoning = {"type_role": r1, "experience_complexity": r2}
        self.last_n_items = len(coverage)
        self.last_shape = "flat" if len(coverage) >= len(REQUIRED_FIELD_NAMES) else "flat-partial"

        if r1 or r2:
            log_dir = Path("data/reasoning_log")
            log_dir.mkdir(parents=True, exist_ok=True)
            (log_dir / f"{collection_id}.txt").write_text(
                f"[reasoning_type_role]\n{r1 or '(none)'}\n\n"
                f"[reasoning_experience_complexity]\n{r2 or '(none)'}\n",
                encoding="utf-8")

        if contamination_log is not None:
            log_dir = Path("data/exemplar_contamination_log")
            log_dir.mkdir(parents=True, exist_ok=True)
            (log_dir / f"{collection_id}.json").write_text(
                json.dumps(contamination_log, ensure_ascii=False, indent=2), encoding="utf-8")

        items, risk_flags2 = build_proposals_from_flat(flat, weak, segments, anchor_pointers,
                                                         reasoning_by_field, evidence_by_field,
                                                         consistency_agreement_by_field)
        risk_flags.extend(risk_flags2)

        # Surgical re-ask: one isolated, from-scratch call per FLAGGED
        # classification field only (on by default -- cheap since most
        # fields on most issues never trigger it).
        if self.enable_surgical_reask:
            flagged_fields: set[str] = set()
            reask_triggers = ("reasoning_mismatch:", "model_heuristic_disagreement:",
                               "no_deterministic_grounding:", "evidence_phrase_hallucinated:",
                               "cluster_majority_disagreement:")
            for rf in risk_flags:
                for cf in CLASSIFICATION_FIELDS:
                    if any(rf.startswith(f"{trig}{cf}") for trig in reask_triggers):
                        flagged_fields.add(cf)
            items_by_field = {it["field"]: it for it in items if it.get("field") in CLASSIFICATION_FIELDS}
            for field in flagged_fields:
                original_item = items_by_field.get(field)
                if not original_item or original_item.get("value") == "Unknown":
                    continue
                reask_value = self._surgical_reask(field, segments)
                if reask_value is None:
                    continue
                if reask_value == original_item["value"]:
                    original_item["note"] = (str(original_item.get("note") or "")
                                              + " -- confirmed by an independent surgical re-ask")
                    if isinstance(original_item.get("confidence"), (int, float)):
                        original_item["confidence"] = min(0.9, original_item["confidence"] + 0.15)
                else:
                    risk_flags.append(f"surgical_reask_disagreement:{field}="
                                       f"{original_item['value']}->{reask_value}")
                    original_item["confidence"] = 0.15
                    original_item["source"] = "INFERRED"
                    original_item["note"] = (f"an independent surgical re-ask gave a DIFFERENT value "
                                              f"({reask_value!r} vs {original_item['value']!r}) -- kept "
                                              "the original value but flagged for review rather than "
                                              "silently picking one")

        self.last_risk_flags = risk_flags

        proposals = verify_grounding(items, segments)
        return default_fill_proposals(proposals)


# --------------------------------------------------------- TrainingExample

def build_training_example(rec: dict, ground_truth: dict, license_: str, model_label: str) -> dict:
    core = rec["input_core"]
    src = ground_truth["task_identity"]["source_issue"]
    return {
        "example_id": str(uuid.uuid4()),
        "input": {
            "issue": {
                "title": core["title"], "body": core["body"],
                "labels": core["labels"], "comments": [c.get("body", "") for c in core["comments"]],
            },
            "context_tier": 1,
            "available_context": {},
        },
        "ground_truth": ground_truth,
        "label_provenance": {
            "labeling_method": "MODEL_ASSISTED_HUMAN_CORRECTED",
            "annotator_ids": [model_label],
            "source_repo": src["repo"],
            "source_issue_url": src["issue_url"],
            "snapshot_fetched_at": src["snapshot_fetched_at"],
            "license": license_,
            "labeled_at": architecture._now(),
            "labeling_tool_version": TOOL_VERSION,
        },
        "quality_status": {"tier": "SILVER", "quality_flags": [],
                            "reviewed_by": None, "review_notes": None},
        "collection_id": rec["collection_id"],
    }


def to_inference_input(rec: dict) -> "architecture.InferenceInput":
    core, ident = rec["input_core"], rec["identity"]
    return architecture.InferenceInput(
        repo=ident["source_repo"], issue_number=ident["issue_number"],
        issue_url=ident["source_issue_url"], snapshot_fetched_at=core["snapshot_fetched_at"],
        title=core["title"], body=core["body"], labels=core["labels"],
        comments=[{"author_role": "reporter" if i == 0 else "other", "body": c.get("body", ""),
                   "clarifies": False} for i, c in enumerate(core["comments"])],
        context_tier_ceiling=1,
    )


def record_license(rec: dict, fallback: str) -> str:
    return (rec.get("data_provenance") or {}).get("license") or fallback


def spot_check_probability(base_rate: float, risk_flags: list[str], multiplier: float) -> float:
    if not risk_flags:
        return base_rate
    return min(1.0, base_rate * multiplier)


# ------------------------------------------------------------- corrections

def apply_corrections(out_path: Path, corrections_path: Path):
    examples = {}
    order = []
    with out_path.open(encoding="utf-8") as fh:
        for line in fh:
            ex = json.loads(line)
            examples[ex["example_id"]] = ex
            order.append(ex["example_id"])

    n_applied = 0
    with corrections_path.open(encoding="utf-8") as fh:
        for line in fh:
            corr = json.loads(line)
            ex = examples.get(corr["example_id"])
            if ex is None:
                print(f"  skip: unknown example_id {corr['example_id']}", file=sys.stderr)
                continue
            gt = ex["ground_truth"]
            for field, value in corr.get("corrections", {}).items():
                if field in gt["task"]:
                    gt["task"][field] = value
                    gt["provenance"][field] = {
                        "source": "EXPLICIT",
                        "evidence": "human-corrected during Step 4 spot-check",
                        "confidence": 1.0,
                    }
                    ex["quality_status"]["quality_flags"] = list(
                        set(ex["quality_status"]["quality_flags"]) | {f"human_corrected:{field}"})
            annotator = corr.get("annotator_id")
            if annotator and annotator not in ex["label_provenance"]["annotator_ids"]:
                ex["label_provenance"]["annotator_ids"].append(annotator)
            ex["quality_status"]["reviewed_by"] = annotator or ex["quality_status"]["reviewed_by"]

            gt = finalize(gt)
            errors = validate_all(gt)
            if errors:
                print(f"  {ex['example_id']}: correction produced an invalid record, "
                      f"skipping write-back: {errors}", file=sys.stderr)
                continue
            ex["ground_truth"] = gt
            n_applied += 1

    with out_path.open("w", encoding="utf-8") as fh:
        for eid in order:
            fh.write(json.dumps(examples[eid], ensure_ascii=False) + "\n")
    print(f"applied {n_applied} correction(s) to {out_path}")


# --------------------------------------------------------------------- main

def load_weak_labels(path: Path) -> dict:
    weak = {}
    if path.exists():
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                row = json.loads(line)
                weak[row["collection_id"]] = row["weak_labels"]
    return weak


def iter_batched_records(records_by_id: dict, batches_path: Path):
    if batches_path.exists():
        with batches_path.open(encoding="utf-8") as fh:
            for line in fh:
                batch = json.loads(line)
                for cid in batch["collection_ids"]:
                    if cid in records_by_id:
                        yield cid
    else:
        yield from records_by_id.keys()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--collected", default="data/collected.jsonl")
    ap.add_argument("--weak-labels", default="data/weak_labels.jsonl")
    ap.add_argument("--batches", default="data/labeling_batches.jsonl")
    ap.add_argument("--out", default="data/training_examples.jsonl")
    ap.add_argument("--spot-check-out", default="data/spot_check_needed.jsonl")
    ap.add_argument("--rejects-out", default="data/rejected.jsonl")
    ap.add_argument("--spot-check-rate", type=float, default=0.175,
                     help="base sampling rate for spot_check_needed.jsonl; risky records "
                          "(see --spot-check-risk-multiplier) are sampled at a higher rate")
    ap.add_argument("--spot-check-risk-multiplier", type=float, default=3.0,
                     help="records with any risk flag (reasoning/answer mismatch, hallucinated "
                          "evidence citation, model-vs-heuristic or model-vs-cluster disagreement, "
                          "a self-consistency split, a surgical re-ask disagreement, or an "
                          "experience_level/complexity call -- which never has deterministic "
                          "grounding) are sampled at spot-check-rate x this multiplier, capped at 1.0")
    ap.add_argument("--model", default="qwen2.5:3b-instruct",
                     help="Ollama model tag, e.g. qwen2.5:3b-instruct-q8_0 for a free accuracy bump "
                          "at the same parameter count if you have RAM headroom")
    ap.add_argument("--ollama-url", default="http://localhost:11434")
    ap.add_argument("--timeout", type=int, default=180, help="seconds to wait for one issue's response")
    ap.add_argument("--num-ctx", type=int, default=6144,
                     help="Ollama context window size in tokens, passed explicitly on every call. "
                          "Ollama's own default is only 2048 REGARDLESS of the model, and it "
                          "silently truncates any prompt/response past that with no error -- this "
                          "script's prompt (decision criteria + few-shot + up to 3000 body chars + "
                          "up to 8 comments) can easily exceed 2048 before output is even generated. "
                          "6144 gives real headroom; raise it if you widen --max-body-chars/"
                          "--max-comments, lower it only if you hit out-of-memory.")
    ap.add_argument("--num-predict", type=int, default=None,
                     help="max tokens the model may generate per issue. Default: 1100 if reasoning "
                          "is on (two extra scratch fields to generate), else 900.")
    ap.add_argument("--no-reasoning", action="store_true",
                     help="disable the two scratch reasoning fields asked for before the "
                          "classification fields. On by default; pass this to trade the accuracy "
                          "lever for speed on slow hardware.")
    ap.add_argument("--max-body-chars", type=int, default=3000,
                     help="cap on title/body text length shown to the model (grounding still "
                          "searches the untruncated original text)")
    ap.add_argument("--max-comment-chars", type=int, default=400,
                     help="cap on each comment's text length shown to the model")
    ap.add_argument("--max-comments", type=int, default=8,
                     help="cap on how many comments are shown to the model")
    ap.add_argument("--self-consistency", type=int, default=1,
                     help="number of model calls to vote ALL FOUR classification fields across "
                          "(1 = off, the default). A field unanimous across >=3 votes earns a "
                          "confidence floor of 0.75 -- see v0.9 in the module docstring. Expensive "
                          "-- runs on every issue regardless of risk. See --no-surgical-reask below "
                          "for a targeted, cheaper alternative that only re-asks a field that "
                          "actually got flagged (no confidence floor, since it's a single re-ask, "
                          "not a vote).")
    ap.add_argument("--self-consistency-temp", type=float, default=0.7,
                     help="sampling temperature for the extra self-consistency calls")
    ap.add_argument("--no-surgical-reask", action="store_true",
                     help="disable the one-off, single-field, from-scratch re-ask triggered only "
                          "for a classification field that got flagged (reasoning/answer mismatch, "
                          "model-vs-heuristic or model-vs-cluster disagreement, a hallucinated "
                          "evidence citation, or complexity/experience_level with zero grounding). "
                          "On by default -- unlike --self-consistency, it only fires on flagged "
                          "fields, so it's cheap on average.")
    ap.add_argument("--self-critique", action="store_true",
                     help="do one extra full re-check call per issue where the model reviews its "
                          "own complete answer against the text again. OFF by default -- unlike "
                          "surgical re-ask, this fires on EVERY issue, doubling model calls.")
    ap.add_argument("--no-cluster-few-shot", action="store_true",
                     help="disable pulling a real, already-labeled example from the same embedding "
                          "cluster (weak_labels.jsonl's cluster_id) as a dynamic few-shot, and "
                          "disable checking a new label against that cluster's existing majority. "
                          "On by default; has no effect until --out already has some labeled "
                          "examples in it, so it's a no-op the very first time you run this. v0.6 "
                          "added a contamination check + one retry on top of this feature rather "
                          "than removing it -- see the module docstring -- but if you'd rather not "
                          "spend the extra retry call at all, this flag turns the whole feature off.")
    ap.add_argument("--license", default="MIT", help="fallback if a record's own data_provenance.license is missing")
    ap.add_argument("--limit", type=int, default=None, help="label at most N issues (testing)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--resume", action="store_true",
                     help="skip collection_ids already present in --out or --rejects-out, and "
                          "append instead of overwriting them.")
    ap.add_argument("--apply-corrections", default=None,
                     help="path to a corrections.jsonl; if given, all other labeling is skipped")
    args = ap.parse_args()

    if args.apply_corrections:
        apply_corrections(Path(args.out), Path(args.apply_corrections))
        return

    collected_path = Path(args.collected)
    records_by_id = {}
    with collected_path.open(encoding="utf-8") as fh:
        for line in fh:
            rec = json.loads(line)
            if is_labelable(rec):
                records_by_id[rec["collection_id"]] = rec
    if not records_by_id:
        sys.exit(f"No READY_FOR_LABELING records in {collected_path}. Run collect_issues.py first.")

    weak = load_weak_labels(Path(args.weak_labels))
    use_reasoning = not args.no_reasoning
    num_predict = args.num_predict if args.num_predict is not None else (1100 if use_reasoning else 900)

    out_path, spot_path, rej_path = Path(args.out), Path(args.spot_check_out), Path(args.rejects_out)
    for p in (out_path, spot_path, rej_path):
        p.parent.mkdir(parents=True, exist_ok=True)

    cluster_index = None
    if not args.no_cluster_few_shot:
        cluster_index = ClusterExampleIndex(Path(args.weak_labels), out_path)
        n_indexed = sum(len(v) for v in cluster_index.examples_by_cluster.values())
        print(f"cluster few-shot index: {n_indexed} already-labeled example(s) across "
              f"{len(cluster_index.examples_by_cluster)} cluster(s) with coverage "
              f"(no effect yet if this is your first run)", file=sys.stderr)

    engine = OllamaEngine(args.model, args.ollama_url, timeout=args.timeout, num_predict=num_predict,
                           num_ctx=args.num_ctx, use_reasoning=use_reasoning,
                           max_body_chars=args.max_body_chars, max_comment_chars=args.max_comment_chars,
                           max_comments=args.max_comments, self_consistency_n=args.self_consistency,
                           self_consistency_temperature=args.self_consistency_temp,
                           enable_surgical_reask=not args.no_surgical_reask,
                           enable_self_critique=args.self_critique, cluster_index=cluster_index,
                           use_cluster_few_shot=not args.no_cluster_few_shot)
    rng = random.Random(args.seed)
    model_label = f"local:{args.model}"

    already_done = set()
    file_mode = "w"
    if args.resume:
        file_mode = "a"
        for p in (out_path, rej_path):
            if p.exists():
                with p.open(encoding="utf-8") as fh:
                    for line in fh:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            row = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        cid = row.get("collection_id")
                        if cid:
                            already_done.add(cid)
        print(f"--resume: {len(already_done)} issue(s) already dispositioned -- skipping them",
              file=sys.stderr)

    n_written = n_rejected = n_spot = 0
    with out_path.open(file_mode, encoding="utf-8") as out_fh, \
         spot_path.open(file_mode, encoding="utf-8") as spot_fh, \
         rej_path.open(file_mode, encoding="utf-8") as rej_fh:

        for i, cid in enumerate(iter_batched_records(records_by_id, Path(args.batches))):
            if args.limit and i >= args.limit:
                break
            if cid in already_done:
                continue
            rec = records_by_id[cid]
            inp = to_inference_input(rec)
            task_identity = architecture._task_identity(inp)
            segments = architecture.gate(architecture.segment_issue(inp), inp.context_tier_ceiling)

            print(f"[{i + 1}] {cid} ...", file=sys.stderr)
            cluster_id = cluster_index.cluster_for(cid) if cluster_index is not None else None
            try:
                proposals = engine.propose(segments, weak.get(cid), collection_id=cid, cluster_id=cluster_id)
            except (ValueError, json.JSONDecodeError, requests.RequestException) as e:
                rej_fh.write(json.dumps({"collection_id": cid, "reason": f"engine_error: {e}"}) + "\n")
                n_rejected += 1
                continue

            # v0.6: a response that survived a contamination retry and
            # STILL matched the exemplar is not safe to keep, no matter
            # what assemble() below would otherwise do with it.
            if engine.last_reject_reason:
                rej_fh.write(json.dumps({"collection_id": cid, "reason": engine.last_reject_reason}) + "\n")
                n_rejected += 1
                continue

            risk_flags = list(engine.last_risk_flags)

            ground_truth, trace = None, None
            try:
                ground_truth, trace = architecture.assemble(task_identity, proposals, segments)
            except Exception as e:
                rej_fh.write(json.dumps({"collection_id": cid,
                                          "reason": f"assemble_crashed: {type(e).__name__}: {e}"}) + "\n")
                n_rejected += 1
                continue
            if isinstance(ground_truth, architecture.RejectedResult):
                rej_fh.write(json.dumps({"collection_id": cid, "reason_codes": ground_truth.reason_codes,
                                          "detail": ground_truth.detail}) + "\n")
                n_rejected += 1
                continue

            if getattr(trace, "degradation_level", 0) == 4:
                abstain_dir = Path("data/abstain_debug")
                abstain_dir.mkdir(parents=True, exist_ok=True)
                (abstain_dir / f"{cid}.json").write_text(json.dumps({
                    "collection_id": cid,
                    "response_shape": engine.last_shape,
                    "n_required_fields_covered": engine.last_n_items,
                    "parsed_flat_response": engine.last_flat,
                    "model_reasoning": engine.last_reasoning,
                    "risk_flags": risk_flags,
                    "trace_repairs": trace.repairs,
                    "trace_downgrades": trace.downgrades,
                    "raw_model_response": engine.last_raw,
                }, ensure_ascii=False, indent=2), encoding="utf-8")

            try:
                lic = record_license(rec, args.license)
                ex = build_training_example(rec, ground_truth, lic, model_label)
                errors = example_mod.validate_example(ex)
            except Exception as e:
                rej_fh.write(json.dumps({"collection_id": cid,
                                          "reason": f"build_or_validate_crashed: {type(e).__name__}: {e}"}) + "\n")
                n_rejected += 1
                continue
            if errors:
                rej_fh.write(json.dumps({"collection_id": cid, "reason": "invalid_training_example",
                                          "errors": errors}) + "\n")
                n_rejected += 1
                continue

            out_fh.write(json.dumps(ex, ensure_ascii=False) + "\n")
            n_written += 1
            prob = spot_check_probability(args.spot_check_rate, risk_flags, args.spot_check_risk_multiplier)
            if rng.random() < prob:
                spot_fh.write(json.dumps({
                    "example_id": ex["example_id"], "collection_id": cid,
                    "repo": rec["identity"]["source_repo"], "issue_number": rec["identity"]["issue_number"],
                    "issue_url": rec["identity"]["source_issue_url"],
                    "title": rec["input_core"]["title"],
                    "proposed": {f: ground_truth["task"].get(f) for f in
                                 (*CLASSIFICATION_FIELDS, "acceptance_criteria")},
                    "provenance": {f: ground_truth["provenance"].get(f) for f in CLASSIFICATION_FIELDS},
                    "review_required": ground_truth["review"]["review_required"],
                    "review_reasons": ground_truth["review"]["review_reasons"],
                    "risk_flags": risk_flags,
                    "sampled_at_probability": round(prob, 3),
                }, ensure_ascii=False) + "\n")
                n_spot += 1

    session_label = "this session" if args.resume else "total"
    print(f"\n{session_label}: written {n_written}  rejected {n_rejected}  flagged for spot-check {n_spot}")
    if args.resume:
        print(f"cumulative (including prior sessions): "
              f"{len(already_done) + n_written + n_rejected} of {len(records_by_id)} issues dispositioned")
    print(f"-> {out_path}\n-> {spot_path}\n-> {rej_path}")
    if n_written:
        reject_rate = n_rejected / (n_written + n_rejected)
        print(f"\nreject rate: {reject_rate:.0%} -- if this is high (>25-30%), the local model is "
              "probably struggling with the JSON contract; try a bigger/more instruction-tuned model.")
    print(f"\nNext: review {spot_path} (risk-weighted sample: base rate {args.spot_check_rate:.0%}, "
          f"{args.spot_check_risk_multiplier:.1f}x for flagged records) -- each row's risk_flags tells "
          f"you WHY it was sampled; check the model's stated reasoning against its answer via "
          f"data/reasoning_log/<collection_id>.txt for anything you want to double-check -- write "
          f"corrections to a corrections.jsonl (one line: "
          '{"example_id": "...", "corrections": {"task_type": "Bug"}, "annotator_id": "you"}), then:\n'
          f"  python local_label.py --apply-corrections data/corrections.jsonl --out {out_path}\n"
          "The spot-check error rate you find also estimates the error rate for the unreviewed rest.")


if __name__ == "__main__":
    main()