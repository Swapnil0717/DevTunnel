# ITU-1 training pipeline scripts (master build prompt v2)

Scripts that implement the master build prompt on top of the `itu1/` package.
Everything here needs to run on YOUR machine (network + a GitHub PAT for
Step 2; more RAM/CPU-friendly free libs for later steps) -- these were built
and unit-tested against your `itu1/` package in a sandboxed environment with
no network access, so the itu1-package-facing logic is verified, but the
live GitHub calls and the real MiniLM embedding path have not been run
end-to-end yet (only their TF-IDF fallback path was).

## Layout

```
itu1/                       your existing package, unmodified
collect_issues.py           Step 2: free GitHub issue collection -> itu1/intake.py
bootstrap_and_cluster.py    Step 3: weak-label bootstrap + embedding clustering
claude_label.py             Step 4: Claude-assisted labeling -> TrainingExample (SILVER)
train_baseline.py           Step 5: TF-IDF + logistic-regression/SVM baseline classifier
train_lora.py                Step 6: LoRA fine-tune of a small open instruct model
run_inference.py             Step 7 (+8's ONNX engines): wires the Step 5/6/8 models into
                              engine.propose(), one inference CLI
export_onnx.py               Step 8: ONNX export of the Step 5 baseline and Step 6 LoRA models
README_TRAINING_PIPELINE.md this file
```

## Step 1 -- environment (do this first)

```bash
python -m venv .venv && source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install transformers peft datasets accelerate
pip install scikit-learn sentence-transformers
pip install onnx onnxruntime
pip install requests
python -c "import torch; print(torch.cuda.is_available())"   # expect False
```

## Step 2 -- collect issues

```bash
export GITHUB_TOKEN=ghp_xxx...
python collect_issues.py \
    --repos psf/requests pallets/flask tiangolo/fastapi \
    --max-per-repo 800 \
    --out data/collected.jsonl \
    --lineage-out data/lineage.jsonl \
    --index-out data/corpus_index.json
```

Safe to re-run / add more repos later -- it skips issues already in `--out`
and reuses `--index-out` so dedup and per-repo ceilings stay correct across
runs. Everything is routed through `itu1/intake.py`'s real gates (licence,
spam/secret/PII, language, dedup, ceiling) before being written.

## Step 3 -- weak-label bootstrap + clustering

```bash
python bootstrap_and_cluster.py \
    --collected data/collected.jsonl \
    --out data/weak_labels.jsonl \
    --batches-out data/labeling_batches.jsonl \
    --n-clusters 40
```

Produces, per issue: a weak `task_type` guess from its own GitHub labels
(direct label-name mapping), a weak `experience_level=Beginner` guess from
"good first issue"-style labels, and a low-confidence `role` guess from a
frontend/backend keyword tilt in the title+body. `complexity` is left
unlabeled -- no reliable generic signal exists for it. All of these are
PROPOSALS for a human/Claude to confirm or overwrite in Step 4, never
accepted as-is.

It embeds each issue with `sentence-transformers/all-MiniLM-L6-v2` and
k-means clusters them so Step 4 can label similar issues back-to-back
instead of jumping topic every issue. If `sentence-transformers`/`torch`
aren't installed yet it automatically falls back to TF-IDF+SVD embeddings
(weaker clusters, but lets you sanity-check the pipeline before the full
install) and prints a warning -- install the real deps before doing your
actual Step-4 labeling pass.

Check the printed per-field/per-class weak-label coverage against the
build prompt's target (>=50-100 examples of even the rarest class per
field, 1,500-3,000 issues total) -- it tells you early which classes are
thin so you can add more/different repos before investing labeling time.

## Step 4 -- Claude-assisted labeling

```bash
export ANTHROPIC_API_KEY=sk-ant-...
python claude_label.py \
    --collected data/collected.jsonl \
    --weak-labels data/weak_labels.jsonl \
    --batches data/labeling_batches.jsonl \
    --out data/training_examples.jsonl \
    --spot-check-out data/spot_check_needed.jsonl \
    --rejects-out data/rejected.jsonl \
    --spot-check-rate 0.175 \
    --model claude-sonnet-4-6 \
    --license MIT
```

For each `READY_FOR_LABELING` issue this walks `labeling_batches.jsonl`
cluster-by-cluster (falls back to collection order if that file is
missing), asks Claude to propose a value + closed-vocabulary source +
verbatim evidence quote + confidence for every field in the schema (the
`weak_labels.jsonl` guess, if any, is passed along as a hint to verify or
override, never trusted blindly), and feeds the result through your
**unmodified** `itu1/architecture.py` -- `understand()`'s exact
`engine.propose(segments) -> list[FieldProposal]` contract, so grounding,
the rule engine, and the degradation lattice are the same code already
tested in `itu1/test_architecture.py`, not reimplemented here.

Two safety nets on top of what `architecture.py` already enforces:
- **Verbatim-grounding check**: any claimed `evidence_text` that isn't
  actually a substring of the segment(s) it points to gets its source
  downgraded (EXPLICIT/SUPPORTED_BY_CONTEXT/INFERRED -> INFERRED, or
  UNKNOWN if it had no valid pointers at all) rather than trusted as-is --
  a hallucinated quote should never pass as grounded evidence.
- **Default-fill**: any optional field Claude's response omits gets an
  explicit UNKNOWN/empty proposal (mirroring `HeuristicStubEngine`), since
  a field with literally no proposal fails schema validation below what
  the degradation lattice repairs -- an omission should degrade the
  record honestly (Unknown, low confidence, `review_required`), never
  reject it outright for a reason that has nothing to do with the issue
  itself.

Every finalized record is wrapped as a `TrainingExample`
(`itu1/example.py`) with `quality_status.tier = "SILVER"` and
`label_provenance.labeling_method = "MODEL_ASSISTED_HUMAN_CORRECTED"` --
`example.py` itself refuses to let this tier be GOLD, correctly. Only
records that pass `example.validate_example` are written; anything
`architecture.assemble()` rejects or that fails validation goes to
`--rejects-out` with the reason, for your own debugging/triage (this is
not the same thing as a labeled "REJECTED" TrainingExample -- these never
made it into the training pool at all).

A random `--spot-check-rate` (default 17.5%, i.e. the middle of the build
prompt's 15-20% target) of written examples are also written to
`--spot-check-out` as a compact review sheet (proposed values + evidence +
`review_required`/reasons, no need to open the full record). Review that
file, write your corrections to a `corrections.jsonl`:

```json
{"example_id": "...", "corrections": {"task_type": "Bug"}, "annotator_id": "you"}
```

then fold them back in (re-derives confidence/uncertainty/review and
re-validates every corrected record; does not call Claude again):

```bash
python claude_label.py --apply-corrections data/corrections.jsonl --out data/training_examples.jsonl
```

The error rate you find in that spot-check sample is your estimate of the
error rate across the unreviewed 80-85%, per the build prompt -- use it to
judge whether the batch is trustworthy enough to train on as-is or needs a
wider correction pass.

This pass was built and tested against your real `itu1/architecture.py` +
`itu1/example.py` (using a stand-in for the Claude API call, since this
build environment has no network) -- confirmed: valid proposals produce a
valid SILVER `TrainingExample`; a hallucinated evidence quote gets
correctly downgraded rather than accepted; malformed API output is
rejected cleanly with a reason instead of crashing the run; and
`--apply-corrections` correctly re-derives and re-validates. The live
Claude API call itself has not been exercised end-to-end -- verify
against a small `--limit` batch first.

Cost note: `claude-haiku-4-5` is far cheaper for the 1,500-3,000-issue
bulk pass; `claude-sonnet-4-6` is more careful on ambiguous cases. Check
`/mnt/skills/public/product-self-knowledge` equivalent docs or Anthropic's
pricing page for current rates before committing to a model for the full
run -- consider Haiku for the bulk pass, Sonnet only for anything the
spot-check flags as low-confidence.

## Not built (by request)

The separate, fully hand-labeled 50-100 issue GOLD eval set (Section 4
step 4 / Section 6 Step 4 of the build prompt) is intentionally not
included here. Without it, `itu1/dataset.py`'s eval-eligible pool stays
empty -- SILVER examples are train-only (`example.eligible_uses`) -- so
Step 10 (honest evaluation) has nothing to score against until that set
exists by some other means.

## Step 5 -- classical baseline

```bash
pip install scikit-learn joblib   # already in Step 1's install list

python train_baseline.py \
    --training-examples data/training_examples.jsonl \
    --out models/baseline.joblib \
    --report-out data/baseline_report.json \
    --backend logreg \
    --holdout-fraction 0.2 \
    --predict-sample 5
```

One TF-IDF + linear-classifier pipeline per classification field (`role`,
`experience_level`, `complexity`, `task_type`), trained straight off
Step 4's output. Run this **before** Step 6's LoRA fine-tune -- it's fast
on CPU-only hardware and tells you early whether the labeled data has
enough signal to be worth fine-tuning at all. `--backend` is `logreg`
(default, gives calibrated `predict_proba` out of the box) or `svm`
(LinearSVC, wrapped in `CalibratedClassifierCV` when there's enough data
per class to cross-validate, otherwise falls back to the plain
uncalibrated margin classifier -- printed as `"svm (uncalibrated)"` in the
report when that happens).

**Reuses your existing package rather than reimplementing it:**
`itu1/dataset.py`'s real `build_datasets()` does the validity/rejection
filtering, near-dup/tier-sibling union-find, curated hard_case carve-out,
GOLD/SILVER tier filtering and temporal windows; `itu1/example.py`'s
`model_input()` is what defines the exact text a model is allowed to see;
`itu1/evaluation.py`'s `classification_report()` is the same accuracy /
macro-P/R/F1 / per-class metric Phase 14 uses elsewhere.

**Why this is NOT a Phase 14 evaluation.** `dataset.py`'s own
validation/test datasets are GOLD-only by design, and per your request
Step 4 doesn't produce a GOLD set -- `training_examples.jsonl` is 100%
SILVER, so there's nothing dataset.py would currently route to
validation/test; asking it to would just silently drop real training
data. So `train_baseline.py` pulls dataset.py's `training` + `hard_case`
pool, then carves its **own** second, independent repo-hash holdout out
of *that* (different salt, so no repo leaks between the two splits) --
purely an internal "did this learn anything at all" sanity check, not a
release gate. The report and the script's own docstring both flag this
explicitly. The moment a real GOLD eval set exists, dataset.py starts
routing to validation/test on its own and this script's honesty caveat
stops applying -- nothing in it needs to change for that day.

A field with fewer than 20 labeled (non-`Unknown`) examples, or only one
class after excluding `Unknown`, is skipped rather than fit (printed and
recorded in the report as `"skipped": "<reason>"`) -- with a small
first batch, expect `task_type` to train (GitHub's own bug/enhancement/
security-style labels give it the most signal) while `role`,
`experience_level` and `complexity` may stay skipped until the corpus
grows or those fields see more varied labels. Classes with fewer than 2
training examples get a `thin_classes_warning` instead of being dropped
-- they'll train but their per-class metrics won't mean much yet.

The issue's own GitHub labels are legitimate `input.issue` content (they
are literally part of what a real record contains) and are included in
the model's text input by default. For `task_type` especially this can
make the numbers look better than a label-blind deployment would see,
since e.g. a `bug` label is near-synonymous with `task_type=Bug`. Pass
`--exclude-github-labels` for a more conservative read of how much the
model is learning from the issue's actual prose rather than its
maintainer-applied tags.

Output: `models/baseline.joblib` (a dict of `{field: sklearn Pipeline}`,
each pipeline's `.predict([text])` taking raw issue text directly -- see
`issue_text()` in the script for exactly how title/body/comments/labels
are combined) and `data/baseline_report.json` (per-field train/holdout
counts, class distributions, majority-class-baseline accuracy for
comparison, and the full classification report). `--predict-sample N`
also prints N random holdout issues with predicted-vs-true labels as a
quick eyeball check after training.

## Step 6 -- LoRA fine-tune

Only worth doing once Step 5's numbers clearly beat the majority-class
baseline by a useful margin on the fields you care about; if a field
isn't beating majority-class in Step 5, more/better SILVER data will move
the needle further than a fine-tune will.

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install transformers peft accelerate

python train_lora.py \
    --training-examples data/training_examples.jsonl \
    --out-dir models/lora-itu1 \
    --base-model Qwen/Qwen2.5-0.5B-Instruct \
    --epochs 3
```

This is real CPU training -- expect hours, not minutes, on a laptop-class
CPU. Smoke-test the whole pipeline first on a tiny slice before
committing real time:

```bash
python train_lora.py --training-examples data/training_examples.jsonl \
    --out-dir /tmp/smoke --epochs 1 --limit 8 --max-new-tokens 64
```

**What it trains on.** Unmodified `itu1/export_sft.py` -- repo-disjoint
split (`export_sft.split()`), near-dup-cluster grouping, GOLD-only eval,
`export_sft.to_chat()`'s exact `{system, user, assistant}` target
(`{"task", "provenance", "missing_information"}` as JSON, same shape
Step 4 produces). `train_lora.py` only adds what `export_sft.py`'s own
docstring says it deliberately isn't: an actual trainer.

**Base model.** Defaults to `Qwen/Qwen2.5-0.5B-Instruct` -- a small
instruction-tuned model that's realistic to LoRA-tune on a CPU-only
laptop within a reasonable number of hours. `--target-modules` is guessed
from the model family in `--base-model` (Qwen/Llama/Mistral/SmolLM/Phi/
Gemma have sane defaults baked in; anything else falls back to
attention-only `q_proj`/`v_proj` with a printed warning -- pass
`--target-modules` explicitly for an unlisted architecture). Other
CPU-friendly options: `HuggingFaceTB/SmolLM2-360M-Instruct` (faster,
weaker) or `HuggingFaceTB/SmolLM2-1.7B-Instruct` (slower, stronger) --
try the default first.

**Why this still can't claim a real evaluation.** Same root cause as Step
5: `export_sft.split()` only ever routes GOLD examples to its eval set
(SILVER is train-only, by the package's own design), and there's still
no GOLD set. So `train_lora.py` additionally carves its own informal,
repo-disjoint holdout out of the SILVER training pool (different salt
from Step 5's, so the two scripts' holdouts don't have to agree), excludes
it from training, and after training reports on it:

- `json_parse_rate` -- did the model even produce parseable JSON
- `schema_valid_rate` -- of that, how much passes `derived.validate_all`
  end to end (the exact same schema/derived-rule gate `evaluation.py`'s
  L0 layer runs), via `export_sft.assemble_record()` reused unmodified
- per-field exact-match accuracy on `role` / `experience_level` /
  `complexity` / `task_type` -- **directly comparable** to Step 5's
  `baseline_report.json` numbers for the same fields, since both scripts
  score against ground truth the same way

Every one of these is printed and written to `data/lora_report.json`
labeled informal, for the same reason as Step 5 -- once a real GOLD set
exists, `export_sft.split()` starts populating a real eval set on its own
and this script's caveat stops applying; nothing in it needs to change
for that day.

**Loss masking.** Only the assistant's JSON answer is trained on (system
+ user + the chat template's own assistant-turn opener are masked to
`-100`), computed by rendering the prompt and the full turn through the
base model's own chat template and diffing token-id prefixes
(`mask_labels()` in the script -- unit-testable on its own with plain
token-id lists, no model needed). If a chat template renders the
assistant turn differently depending on what follows it, the prefix
check fails and that one example is skipped with a warning rather than
silently mis-masked; pass `--strict-masking` to fail loudly instead if
you want to catch a template incompatibility immediately rather than
losing a few examples quietly.

I tested `train_lora.py`'s non-model logic directly against your real
`itu1/export_sft.py`, `derived.py`, and `example.py` in this sandbox
(which has no network, so the actual `torch`/`transformers`/`peft`
install and a real training run have NOT been exercised end to end --
run the smoke-test command above first on your machine): the loss-mask
prefix/diff logic, the informal-holdout repo-disjoint split layered on
top of `export_sft.split()` (confirmed disjoint from train and additive
with `export_sft.split()`'s own real-eval carve-out), and the
generation-scoring path (`score_generation()`/`summarize_generation_scores()`)
against hand-written fake model output covering well-formed JSON matching
ground truth, malformed JSON, and JSON with wrong field values -- all
score correctly. Missing dependencies fail with an install hint instead
of a traceback, same as Step 5.

## Step 7 -- wire the trained models into `engine.propose()`

`run_inference.py` closes the gap the last two READMEs kept flagging: Step
5's classifiers and Step 6's fine-tune sat in `models/` unconnected to
`itu1/architecture.py`. This script adds two new engines that satisfy the
exact same `engine.propose(segments) -> list[FieldProposal]` contract
`NullEngine`, `HeuristicStubEngine`, and `claude_label.ClaudeEngine`
already implement -- nothing in `itu1/` changes.

* **`BaselineEngine`** (Step 5) -- loads a `train_baseline.py` joblib
  bundle. Only `role`/`experience_level`/`complexity`/`task_type` have a
  trained signal, so those come back `source=INFERRED` (a statistical
  guess, not a quote) with `confidence` from `predict_proba` (or a
  squashed decision margin for an uncalibrated `LinearSVC`), anchored to
  whichever of `ISSUE_TITLE`/`ISSUE_BODY` exist. `--baseline-min-confidence`
  routes a low-confidence prediction to `HeuristicStubEngine`'s guess
  instead. Every other field (prose, lists, scope, acceptance_criteria) is
  `HeuristicStubEngine`'s extractive default, unchanged.
* **`LoRAEngine`** (Step 6) -- loads a `train_lora.py` checkpoint
  (adapter dir or its `-merged` sibling), replays `export_sft.py`'s exact
  chat prompt, and parses the answer with `export_sft.parse_model_text()`.
  The SFT format has no `segment_id`s, so each field's claimed
  `provenance.evidence` is resolved to pointers by a verbatim
  (whitespace-normalized) search across every segment -- the same
  hallucination check `claude_label.verify_grounding` does for Claude, just
  adapted to search instead of trusting a declared citation. No match ->
  `EXPLICIT`/`SUPPORTED_BY_CONTEXT` downgrades to `INFERRED`, anchored to
  the issue as a whole. Unparseable model output returns `[]`, which
  `architecture.understand()` already turns into the same Level-4 abstain
  record `NullEngine` produces -- never a crash, never a malformed record.

One CLI drives every engine, on one ad-hoc issue or a whole `collected.jsonl`:

```bash
# no model needed
python run_inference.py --issue-json my_issue.json --engine heuristic

# Step 5
python run_inference.py --issue-json my_issue.json \
    --engine baseline --baseline-model models/baseline.joblib \
    --baseline-min-confidence 0.5

# Step 6 (needs torch/transformers -- not in this sandbox, see below)
python run_inference.py --collected data/collected.jsonl \
    --engine lora --lora-model-dir models/lora-itu1-merged \
    --out data/inferred.jsonl

# Step 4's engine, reused as-is
export ANTHROPIC_API_KEY=sk-ant-...
python run_inference.py --issue-json my_issue.json --engine claude
```

Omit `--issue-index` with `--collected` to run every record in the file as
a batch and write one JSON result per line (`collection_id`, `status`,
the record or rejection, and the degradation trace).

Tested in this sandbox: `BaselineEngine` end-to-end (trained a tiny
synthetic logreg bundle, confirmed correct predictions, correct
`predict_proba`-derived confidence, and that `--baseline-min-confidence`
correctly falls back to the heuristic); `LoRAEngine`'s prediction-to-proposal
conversion (`proposals_from_prediction`) directly -- a well-grounded verbatim
quote keeps its claimed source, a hallucinated quote is caught and downgraded
to `INFERRED` with capped confidence exactly like Step 4's check, and a
complete realistic prediction flows through the real, unmodified
`architecture.understand()` to a valid degradation-level-0 record; and the
malformed-output -> Level-4-abstain path. The real `AutoModelForCausalLM`
load and `.generate()` call haven't been exercised (no `torch`/`transformers`
here, matching Step 6's own note) -- `LoRAEngine.__init__` fails with an
install hint rather than a traceback when they're missing, confirmed. Reran
the full existing test suite (1240 tests, via `unittest` since `pytest`
isn't installable offline here either) unmodified -- still green.

## Step 8 -- ONNX export (optional, for faster CPU inference)

Two independent exports, matching the two trained-model engines above.
Neither touches `itu1/`; both only read what `train_baseline.py` /
`train_lora.py` already wrote.

```bash
pip install skl2onnx onnx                        # baseline export
pip install optimum[onnxruntime]                  # lora export (needs torch +
                                                    # transformers too, already
                                                    # in Step 1's install list)

# baseline: one .onnx graph per classification field + a manifest.json
python export_onnx.py baseline \
    --bundle models/baseline.joblib \
    --out-dir models/baseline-onnx

# lora: MUST be a merged model (train_lora.py --merge-and-save), not a bare
# PEFT adapter dir -- optimum's ONNX export needs a full model graph
python export_onnx.py lora \
    --model-dir models/lora-itu1-merged \
    --out-dir models/lora-itu1-onnx
```

Both exports verify themselves immediately after conversion, against the
exact object just exported (not a fresh retrain), so a mismatch means the
*conversion* is wrong, not that the model is inaccurate:

* `baseline`: onnxruntime's predictions on a handful of synthetic
  issue-shaped strings are compared field-by-field against the original
  joblib pipeline's own `.predict()`/`.predict_proba()` on the identical
  strings -- a self-consistency check, so the strings don't need to
  resemble real training data.
* `lora`: one greedy-decoded generation from the ONNX model is compared,
  token-for-token, against the original torch model generating from the
  identical prompt. A mismatch is reported (exit code 1), not silently
  ignored -- ONNX/torch numeric drift can occasionally flip a near-tied
  token, worth knowing about even if it isn't necessarily fatal. Pass
  `--skip-verify` on either subcommand to skip this (verification does a
  real CPU generation for `lora`, which is slow) and just get the files.

Then point `run_inference.py` at the export directories instead of the
original bundle/checkpoint:

```bash
python run_inference.py --issue-json my_issue.json \
    --engine onnx-baseline --onnx-baseline-dir models/baseline-onnx

python run_inference.py --issue-json my_issue.json \
    --engine onnx-lora --onnx-lora-dir models/lora-itu1-onnx
```

`ONNXBaselineEngine` and `ONNXLoRAEngine` (both in `run_inference.py`) are
drop-in replacements for `BaselineEngine`/`LoRAEngine`: same
`propose(segments) -> list[FieldProposal]` contract, same fallback and
grounding/hallucination-downgrade behavior, so switching `--engine
baseline`/`lora` to `--engine onnx-baseline`/`onnx-lora` should only change
latency, never predictions -- `export_onnx.py`'s own verify step is what
checks that claim holds for a given export.

Tested in this sandbox (no `skl2onnx`, `onnx`, `optimum`, `torch`, or
`transformers` installable offline here; `onnxruntime` itself is,
coincidentally, already present): `export_onnx.py baseline`'s conversion +
verify against a real, trained sklearn `Pipeline` (`skl2onnx.convert_sklearn`
mocked to round-trip the pipeline itself, `onnxruntime.InferenceSession`
mocked to predict through it) -- confirmed matching predictions/probabilities
report as OK, and a deliberately wrong label is caught and reported as a
mismatch with exit code 1, not silently accepted. `export_onnx.py lora`'s
export + verify and both `ONNXLoRAEngine`'s and `LoRAEngine`'s shared
`_GenerativeEngineMixin` logic against the real, unmodified
`architecture.py` (`torch`/`transformers`/`optimum` mocked): a bare PEFT
adapter directory is rejected with an install/usage hint rather than a
crash; a well-grounded prediction flows to a valid degradation-level-0
record; a hallucinated evidence quote is caught and downgraded from
EXPLICIT to INFERRED with capped confidence, exactly like Step 4's and
Step 7's checks; malformed model output abstains honestly (Level 4) instead
of crashing; and a deliberately divergent ONNX generation is caught by the
verify step and reported, not silently accepted. Reran the full existing
test suite (1240 tests) unmodified -- still green. The real
`skl2onnx`/`optimum` conversion calls and a real CPU generation haven't been
exercised (same sandbox limitation as Steps 2, 6, and 7) -- run
`export_onnx.py`'s own verify step (on by default) after your first real
export before trusting it unattended.

## Not built yet

The separate hand-labeled GOLD eval set everything above keeps flagging the
absence of isn't built -- ask for it next if you want `dataset.py`'s real
validation/test splits, `export_sft.py`'s eval split, and a genuine Phase 14
evaluation to start working as originally designed. Nothing in the existing
scripts needs to change for that day; they're written to pick it up
automatically.
