#!/usr/bin/env python3
"""
ITU-1 -- Step 6: LoRA fine-tune, CPU-only, zero-budget (Phase 8 stand-in)

Fine-tunes a small open instruction-tuned base model with a LoRA adapter
to author the exact same JSON your Step-4 Claude labeling pass produces
({"task", "provenance", "missing_information"}), using itu1/export_sft.py's
existing, unmodified chat-format conversion (repo-disjoint split,
near-dup-cluster grouping, GOLD-only eval) rather than reimplementing any
of it -- this script only adds the part export_sft.py explicitly says it
is NOT: an actual trainer.

Run this only after Step 5's TF-IDF baseline (train_baseline.py) shows a
field is worth the extra cost. This needs real GPU-less CPU training
time -- expect it to be slow (hours, not minutes) on a laptop-class CPU;
that's what --limit and small --epochs are for while you're smoke-testing
the pipeline itself.

Why this can't claim a real evaluation either
-----------------------------------------------
Same root cause as Step 5: export_sft.split() only ever puts GOLD
examples in its eval set (by the package's own design -- SILVER is
train-only), and Step 4 was built without a GOLD set. So the "real" eval
split will be empty until one exists. This script additionally carves an
INFORMAL, repo-disjoint holdout out of the SILVER training pool itself
(same idea as train_baseline.py's holdout, different salt so the two
scripts' holdouts don't have to agree) and reports generation quality
against that -- JSON-parse rate, full schema+derived validity (reusing
derived.validate_all via export_sft.assemble_record, i.e. the same L0
gate evaluation.py uses elsewhere), and per-field exact-match accuracy,
directly comparable to Step 5's report.json numbers for the same fields.
Every number this script prints is labeled informal for the same reason
Step 5's are -- treat it as "is this learning at all", not "is this
ready", until a real GOLD eval set exists.

Usage
-----
    pip install torch --index-url https://download.pytorch.org/whl/cpu
    pip install transformers peft accelerate

    python train_lora.py \\
        --training-examples data/training_examples.jsonl \\
        --out-dir models/lora-itu1 \\
        --base-model Qwen/Qwen2.5-0.5B-Instruct \\
        --epochs 3

    # fast smoke test of the whole pipeline before committing real time:
    python train_lora.py --training-examples data/training_examples.jsonl \\
        --out-dir /tmp/smoke --epochs 1 --limit 8 --max-new-tokens 64
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "itu1"))
import export_sft  # noqa: E402
from example import model_input  # noqa: E402

try:
    import torch
    from torch.utils.data import Dataset
    from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments
    from peft import LoraConfig, get_peft_model
except ImportError as e:  # pragma: no cover -- exercised in the sandbox, no network to install these
    torch = None
    IMPORT_ERROR = e
else:
    IMPORT_ERROR = None

CLASSIFICATION_FIELDS = ("role", "experience_level", "complexity", "task_type")

# Reasonable default target_modules by architecture family. Anything not
# listed falls back to attention-only ("q_proj", "v_proj") with a warning
# printed at runtime -- LoRA still works, just adapts less of the model.
TARGET_MODULES_BY_FAMILY = {
    "qwen": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    "llama": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    "mistral": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    "smollm": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    "phi": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_up_proj", "down_proj"],
    "gemma": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
}


def guess_target_modules(base_model: str) -> list[str]:
    name = base_model.lower()
    for family, modules in TARGET_MODULES_BY_FAMILY.items():
        if family in name:
            return modules
    print(f"warning: unrecognized model family in {base_model!r} -- defaulting LoRA to "
          "['q_proj', 'v_proj']; pass --target-modules to override", file=sys.stderr)
    return ["q_proj", "v_proj"]


# ---------------------------------------------------------------- pure, torch-free helpers
# Kept separate from anything that touches torch/transformers so they can be
# unit-tested (and were tested) without a real model or GPU/CPU training run.

def _bucket(key: str, salt: str) -> int:
    return int(hashlib.sha256(f"{salt}|{key}".encode()).hexdigest()[:8], 16) % 100


def build_splits(examples: list[dict], *, eval_fraction: float, split_seed: int,
                  train_tiers: tuple, informal_holdout_fraction: float,
                  holdout_salt: str) -> dict:
    """export_sft.split() gives the real (GOLD-only-eval) split, unmodified.
    We then carve an additional informal, repo-disjoint holdout out of
    whatever it assigned to `train`, purely for an internal sanity-check
    generation eval -- see module docstring."""
    train_all, real_eval, problems = export_sft.split(
        examples, eval_fraction=eval_fraction, seed=split_seed, tiers=train_tiers)

    if informal_holdout_fraction <= 0:
        return {"train": train_all, "real_eval": real_eval, "informal_holdout": [], "problems": problems}

    threshold = round(informal_holdout_fraction * 100)
    train, informal_holdout = [], []
    for ex in train_all:
        repo = ex["label_provenance"]["source_repo"]
        (informal_holdout if _bucket(repo, holdout_salt) < threshold else train).append(ex)
    return {"train": train, "real_eval": real_eval, "informal_holdout": informal_holdout, "problems": problems}


def mask_labels(full_ids: list[int], prompt_ids: list[int]) -> list[int] | None:
    """Loss-mask everything up to and including the prompt (system + user +
    the chat template's own assistant-turn opener), so the model is only
    trained to predict the JSON answer, not to reproduce the issue text or
    the template's own boilerplate. Returns None (caller should skip or
    fall back) if `prompt_ids` isn't actually a prefix of `full_ids` --
    can happen if a chat template renders the assistant turn differently
    depending on whether content follows it; better to skip loss-masking
    for that one example than to silently mask the wrong span."""
    if full_ids[:len(prompt_ids)] != prompt_ids:
        return None
    return [-100] * len(prompt_ids) + full_ids[len(prompt_ids):]


def score_generation(raw_text: str, ex: dict) -> dict:
    """Score one generated string against one TrainingExample's ground
    truth. Pure JSON/dict logic -- no torch, no tokenizer -- so this is
    fully unit-testable with hand-written fake model output, same as
    claude_label.py's grounding check was tested without a real API call.
    """
    prediction, parse_err = export_sft.parse_model_text(raw_text)
    row = {"json_parse_error": parse_err, "schema_errors": None, "field_correct": {}}
    if parse_err:
        return row

    src = ex["ground_truth"]["task_identity"]["source_issue"]
    record, errors = export_sft.assemble_record(prediction, src)
    row["schema_errors"] = errors

    truth = ex["ground_truth"]["task"]
    pred_task = (prediction.get("task") or {}) if isinstance(prediction, dict) else {}
    for field in CLASSIFICATION_FIELDS:
        if truth.get(field) is not None:
            row["field_correct"][field] = pred_task.get(field) == truth.get(field)
    return row


def summarize_generation_scores(rows: list[dict]) -> dict:
    n = len(rows)
    if n == 0:
        return {"n": 0}
    parsed = [r for r in rows if r["json_parse_error"] is None]
    schema_valid = [r for r in parsed if not r["schema_errors"]]
    out = {
        "n": n,
        "json_parse_rate": len(parsed) / n,
        "schema_valid_rate": len(schema_valid) / n,
        "field_accuracy": {},
    }
    for field in CLASSIFICATION_FIELDS:
        seen = [r["field_correct"][field] for r in rows if field in r["field_correct"]]
        out["field_accuracy"][field] = (sum(seen) / len(seen)) if seen else None
    return out


# ---------------------------------------------------------------- torch-dependent pieces
def require_torch():
    if torch is None:
        sys.exit(
            f"missing dependency ({IMPORT_ERROR}). Install with (CPU-only build):\n"
            "    pip install torch --index-url https://download.pytorch.org/whl/cpu\n"
            "    pip install transformers peft accelerate"
        )


class ChatDataset(Dataset if torch else object):
    def __init__(self, chat_examples: list[dict], tokenizer, max_length: int, strict_masking: bool):
        self.rows = []
        skipped = 0
        for ex in chat_examples:
            messages = ex["messages"]
            prompt_text = tokenizer.apply_chat_template(messages[:2], tokenize=False, add_generation_prompt=True)
            full_text = tokenizer.apply_chat_template(messages, tokenize=False)
            prompt_ids = tokenizer(prompt_text, add_special_tokens=False)["input_ids"]
            full_ids = tokenizer(full_text, add_special_tokens=False, truncation=True,
                                  max_length=max_length)["input_ids"]
            labels = mask_labels(full_ids, prompt_ids)
            if labels is None:
                if strict_masking:
                    raise RuntimeError("prompt is not a prefix of the full rendered chat -- "
                                        "the base model's chat template isn't compatible with this "
                                        "masking approach; see mask_labels()'s docstring")
                skipped += 1
                continue
            self.rows.append({"input_ids": full_ids, "labels": labels})
        if skipped:
            print(f"warning: skipped {skipped}/{len(chat_examples)} examples whose chat template "
                  "didn't prefix-match for loss masking (use --strict-masking to fail instead)")

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        return self.rows[idx]


def make_collate_fn(pad_token_id: int):
    def collate(batch):
        max_len = max(len(r["input_ids"]) for r in batch)
        input_ids, labels, attn = [], [], []
        for r in batch:
            pad = max_len - len(r["input_ids"])
            input_ids.append(r["input_ids"] + [pad_token_id] * pad)
            labels.append(r["labels"] + [-100] * pad)
            attn.append([1] * len(r["input_ids"]) + [0] * pad)
        return {
            "input_ids": torch.tensor(input_ids, dtype=torch.long),
            "labels": torch.tensor(labels, dtype=torch.long),
            "attention_mask": torch.tensor(attn, dtype=torch.long),
        }
    return collate


def generate_json(model, tokenizer, ex: dict, max_new_tokens: int) -> str:
    messages = export_sft.to_chat(ex)["messages"][:2]
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(prompt, return_tensors="pt")
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False,
                              pad_token_id=tokenizer.pad_token_id)
    new_tokens = out[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(new_tokens, skip_special_tokens=True)


# ---------------------------------------------------------------- CLI
def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--training-examples", default="data/training_examples.jsonl")
    p.add_argument("--out-dir", default="models/lora-itu1")
    p.add_argument("--report-out", default="data/lora_report.json")
    p.add_argument("--base-model", default="Qwen/Qwen2.5-0.5B-Instruct",
                    help="any small HF instruction-tuned causal LM; CPU-only friendly picks: "
                         "Qwen/Qwen2.5-0.5B-Instruct (default), HuggingFaceTB/SmolLM2-360M-Instruct, "
                         "HuggingFaceTB/SmolLM2-1.7B-Instruct")
    p.add_argument("--target-modules", default=None, help="comma-separated; default: guessed from --base-model")
    p.add_argument("--epochs", type=float, default=3.0)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--batch-size", type=int, default=1)
    p.add_argument("--grad-accum", type=int, default=8)
    p.add_argument("--max-length", type=int, default=1024)
    p.add_argument("--max-new-tokens", type=int, default=512, help="generation length for the eval pass")
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=32)
    p.add_argument("--lora-dropout", type=float, default=0.05)
    p.add_argument("--eval-fraction", type=float, default=0.1, help="passed to export_sft.split (GOLD-only)")
    p.add_argument("--split-seed", type=int, default=0)
    p.add_argument("--train-tiers", default="GOLD,SILVER")
    p.add_argument("--informal-holdout-fraction", type=float, default=0.15,
                    help="0 disables; see module docstring for why this is informal, not a real eval")
    p.add_argument("--holdout-salt", default="itu1-lora-holdout-v1")
    p.add_argument("--limit", type=int, default=None, help="cap train examples, for a fast smoke test")
    p.add_argument("--strict-masking", action="store_true")
    p.add_argument("--merge-and-save", action="store_true", help="also save a merged (non-adapter) copy")
    p.add_argument("--resume-from-checkpoint", default=None)
    p.add_argument("--seed", type=int, default=0)
    args = p.parse_args(argv)

    require_torch()
    torch.manual_seed(args.seed)
    random.seed(args.seed)

    examples = [json.loads(l) for l in Path(args.training_examples).read_text(encoding="utf-8").splitlines() if l.strip()]
    if not examples:
        print(f"no examples found in {args.training_examples}", file=sys.stderr)
        return 1

    splits = build_splits(
        examples, eval_fraction=args.eval_fraction, split_seed=args.split_seed,
        train_tiers=tuple(args.train_tiers.split(",")),
        informal_holdout_fraction=args.informal_holdout_fraction, holdout_salt=args.holdout_salt,
    )
    train_examples, real_eval, informal_holdout = splits["train"], splits["real_eval"], splits["informal_holdout"]
    if args.limit:
        train_examples = train_examples[:args.limit]
    print(f"train={len(train_examples)}  real_eval(GOLD-only, informational)={len(real_eval)}  "
          f"informal_holdout(SILVER, excluded from training)={len(informal_holdout)}  "
          f"dropped={len(splits['problems'])}")
    if not train_examples:
        print("no usable training examples", file=sys.stderr)
        return 1

    target_modules = args.target_modules.split(",") if args.target_modules else guess_target_modules(args.base_model)

    print(f"loading {args.base_model} ...")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(args.base_model, torch_dtype=torch.float32)
    lora_cfg = LoraConfig(r=args.lora_r, lora_alpha=args.lora_alpha, lora_dropout=args.lora_dropout,
                           target_modules=target_modules, task_type="CAUSAL_LM")
    model = get_peft_model(model, lora_cfg)
    model.print_trainable_parameters()

    train_chat = [export_sft.to_chat(ex) for ex in train_examples]
    train_ds = ChatDataset(train_chat, tokenizer, args.max_length, args.strict_masking)
    if len(train_ds) == 0:
        print("every training example was skipped by loss-masking -- nothing to train on", file=sys.stderr)
        return 1

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    training_args = TrainingArguments(
        output_dir=str(out_dir / "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        logging_steps=10,
        save_strategy="epoch",
        save_total_limit=2,
        report_to=[],
        use_cpu=True,
        remove_unused_columns=False,
    )
    trainer = Trainer(model=model, args=training_args, train_dataset=train_ds,
                       data_collator=make_collate_fn(tokenizer.pad_token_id))
    trainer.train(resume_from_checkpoint=args.resume_from_checkpoint)

    model.save_pretrained(out_dir)
    tokenizer.save_pretrained(out_dir)
    print(f"saved LoRA adapter -> {out_dir}")
    if args.merge_and_save:
        merged_dir = out_dir.parent / (out_dir.name + "-merged")
        merged = model.merge_and_unload()
        merged.save_pretrained(merged_dir)
        tokenizer.save_pretrained(merged_dir)
        print(f"saved merged model -> {merged_dir}")

    report = {"base_model": args.base_model, "n_train": len(train_ds),
              "n_real_eval": len(real_eval), "n_informal_holdout": len(informal_holdout),
              "note": "real_eval is GOLD-only per export_sft.split and will be empty until a GOLD "
                      "set exists; informal_holdout is SILVER, excluded from training, and is a "
                      "directional sanity check only -- see this script's module docstring",
              "real_eval_scores": None, "informal_holdout_scores": None}

    model.eval()
    for name, pool in (("real_eval", real_eval), ("informal_holdout", informal_holdout)):
        if not pool:
            continue
        print(f"\ngenerating on {len(pool)} {name} example(s) ...")
        rows = [score_generation(generate_json(model, tokenizer, ex, args.max_new_tokens), ex) for ex in pool]
        summary = summarize_generation_scores(rows)
        report[f"{name}_scores"] = summary
        print(f"  json_parse_rate={summary['json_parse_rate']:.3f}  "
              f"schema_valid_rate={summary['schema_valid_rate']:.3f}")
        for field, acc in summary["field_accuracy"].items():
            if acc is not None:
                print(f"  {field}_accuracy={acc:.3f}")

    report_path = Path(args.report_out)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(f"\nsaved report -> {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
