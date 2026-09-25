#!/usr/bin/env python3
"""
ITU-1 -- Step 7: wire the trained models into architecture.py's
engine.propose() contract, and give the whole pipeline one inference CLI.

Every previous step produced something that could, in principle, replace
NullEngine/HeuristicStubEngine in architecture.understand(engine=...):

    Step 4  claude_label.ClaudeEngine        -- already wired (untouched here)
    Step 5  train_baseline.py's TF-IDF+linear-classifier bundle -- NOT wired
    Step 6  train_lora.py's fine-tuned generator             -- NOT wired

This script closes both gaps and ties them to one command: raw issue ->
InferenceInput -> engine.propose() -> architecture.understand() -> a
validated (or honestly Level-4-abstained) Phase 2 record. Nothing in
architecture.py, derived.py, or schema.py is modified -- these engines are
exactly the pluggable `engine` argument understand() was already built to
accept.

Two new engines
----------------
BaselineEngine
    Loads a joblib bundle from train_baseline.py (--out models/baseline.joblib).
    It only has a trained signal for the four classification fields (role,
    experience_level, complexity, task_type) -- a TF-IDF+linear model has no
    way to author prose or point at a verbatim quote, so:
      * classification fields it has a model for -> source=INFERRED (a
        black-box statistical guess, not a traceable quote), pointers
        anchored to whichever of ISSUE_TITLE/ISSUE_BODY exist (mirrors how
        HeuristicStubEngine anchors its own INFERRED complexity/
        experience_level guesses), confidence from predict_proba (or a
        calibrated margin for an uncalibrated LinearSVC).
      * a field below --min-confidence, or with no bundle entry at all, or
        every other field the classifier doesn't touch (prose, lists,
        scope, acceptance_criteria) -- delegated to HeuristicStubEngine's
        extractive template, exactly as claude_label.default_fill_proposals
        already does for whatever Claude skips.
    This is the most defensible engine to run unattended: everything it
    emits is either a calibrated-ish classifier guess correctly marked
    INFERRED, or an honest keyword-extractive default -- nothing invents
    prose it can't grounds.

LoRAEngine
    Loads a fine-tuned model from train_lora.py (--out-dir models/lora-itu1
    or its ...-merged sibling), regenerates export_sft.py's exact chat
    prompt for the issue, and parses the answer with export_sft's own
    parse_model_text(). The model was trained to emit {task, provenance}
    with a provenance.evidence quote per field (export_sft.SYSTEM_PROMPT),
    but the SFT format has no notion of segment_ids -- so, in the same
    spirit as claude_label.verify_grounding's hallucination check, pointers
    here are resolved by a verbatim (whitespace-normalized) search across
    ALL segments for each field's claimed evidence, rather than trusting a
    pre-declared citation. No match -> EXPLICIT/SUPPORTED_BY_CONTEXT is
    downgraded to INFERRED and anchored to the issue as a whole, exactly
    what claude_label does for a hallucinated Claude quote. A response that
    doesn't even parse as JSON returns an empty proposal list, which
    architecture.understand() already turns into the same Level-4 abstain
    record NullEngine produces -- never a crash, never a malformed record.

ONNXBaselineEngine / ONNXLoRAEngine
    Step 8's (export_onnx.py) ONNX exports of the two engines above, for
    faster CPU inference once you've verified an export is faithful.
    ONNXBaselineEngine reimplements BaselineEngine's propose() logic
    exactly, but predicts via onnxruntime.InferenceSession against
    export_onnx.py's manifest.json + per-field .onnx files instead of a
    joblib Pipeline -- no scikit-learn needed at inference time.
    ONNXLoRAEngine shares LoRAEngine's prompt-building/parsing/grounding
    logic (see _GenerativeEngineMixin below) but generates via
    optimum.onnxruntime.ORTModelForCausalLM instead of a plain torch
    AutoModelForCausalLM. Both are drop-in replacements for their
    non-ONNX counterparts -- same propose() contract, same output shape --
    so switching between --engine baseline/lora and --engine
    onnx-baseline/onnx-lora should only change latency, never predictions
    (export_onnx.py's own verify step is what checks that claim holds).

Usage
-----
    # single ad-hoc issue, heuristic engine (no model needed)
    python run_inference.py --issue-json my_issue.json --engine heuristic

    # single issue from a Step-2 collected.jsonl, baseline engine
    python run_inference.py --collected data/collected.jsonl --issue-index 0 \\
        --engine baseline --baseline-model models/baseline.joblib

    # batch: every record in collected.jsonl, LoRA engine, write results
    python run_inference.py --collected data/collected.jsonl \\
        --engine lora --lora-model-dir models/lora-itu1-merged \\
        --out data/inferred.jsonl

    # ONNX equivalents (after export_onnx.py baseline / export_onnx.py lora)
    python run_inference.py --issue-json my_issue.json \\
        --engine onnx-baseline --onnx-baseline-dir models/baseline-onnx
    python run_inference.py --issue-json my_issue.json \\
        --engine onnx-lora --onnx-lora-dir models/lora-itu1-onnx

    # Claude engine (Step 4's, reused as-is) on one ad-hoc issue
    export ANTHROPIC_API_KEY=sk-ant-...
    python run_inference.py --issue-json my_issue.json --engine claude
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "itu1"))
import architecture  # noqa: E402
from architecture import (  # noqa: E402
    CLASSIFICATION_FIELDS, FieldProposal, HeuristicStubEngine, InferenceInput,
    NullEngine, RejectedResult, Segment, understand,
)
import export_sft  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from claude_label import ClaudeEngine, default_fill_proposals, to_inference_input  # noqa: E402


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def _anchor_pointers(segments: list[Segment]) -> list[str]:
    title = next((s for s in segments if s.type == "ISSUE_TITLE"), None)
    body = next((s for s in segments if s.type == "ISSUE_BODY"), None)
    return [s.segment_id for s in (title, body) if s]


# ---------------------------------------------------------------------------
# BaselineEngine -- Step 5's TF-IDF + linear classifiers
# ---------------------------------------------------------------------------

def _issue_text_from_segments(segments: list[Segment], *, include_labels: bool = True,
                               max_comments: int = 8) -> str:
    """Reproduces train_baseline.py's issue_text() shape (title doubled,
    body, joined comments, label_-prefixed labels) but built from Segments
    instead of a TrainingExample -- must match at inference time or the
    TF-IDF vectorizer sees an out-of-distribution input."""
    title = next((s.text for s in segments if s.type == "ISSUE_TITLE"), "")
    body = next((s.text for s in segments if s.type == "ISSUE_BODY"), "")
    comments = [s.text for s in segments if s.type == "COMMENT"][:max_comments]
    parts = [title, title, body, "\n".join(comments)]
    if include_labels:
        labels = [s.text for s in segments if s.type == "LABEL"]
        if labels:
            parts.append(" ".join(f"label_{l.replace(' ', '_')}" for l in labels))
    return "\n\n".join(p for p in parts if p)


def _classifier_confidence(pipe, text: str) -> float:
    """predict_proba when available (logreg, or calibrated SVM); otherwise
    a rough, deliberately conservative squash of the LinearSVC decision
    margin so an uncalibrated model still yields *some* usable number
    rather than crashing or claiming false precision."""
    try:
        return float(max(pipe.predict_proba([text])[0]))
    except Exception:
        pass
    try:
        dec = pipe.decision_function([text])
        import numpy as np
        margin = float(np.max(np.abs(dec)))
        return float(min(0.85, 0.5 + margin / 10.0))
    except Exception:
        return 0.5


class BaselineEngine:
    """Satisfies engine.propose(segments) -> list[FieldProposal] using a
    joblib bundle from train_baseline.py. See module docstring."""

    def __init__(self, bundle_path: str | Path, min_confidence: float = 0.0):
        import joblib
        self.bundle = joblib.load(bundle_path)
        self.min_confidence = min_confidence
        self.fallback = HeuristicStubEngine()

    def propose(self, segments: list[Segment]) -> list[FieldProposal]:
        fallback_by_field = {p.field: p for p in self.fallback.propose(segments)}
        kept = [p for f, p in fallback_by_field.items() if f not in CLASSIFICATION_FIELDS]
        text = _issue_text_from_segments(segments, include_labels=self.bundle.get("include_labels", True))
        anchor = _anchor_pointers(segments)

        covered = set()
        for field, pipe in self.bundle.get("fields", {}).items():
            covered.add(field)
            if not text.strip():
                kept.append(fallback_by_field.get(field, FieldProposal(field, "Unknown", "UNKNOWN")))
                continue
            pred = pipe.predict([text])[0]
            conf = _classifier_confidence(pipe, text)
            if conf < self.min_confidence:
                kept.append(fallback_by_field.get(field, FieldProposal(field, "Unknown", "UNKNOWN")))
                continue
            backend = self.bundle.get("backend", "?")
            kept.append(FieldProposal(
                field, pred, "INFERRED", anchor,
                f"predicted by TF-IDF+{backend} classifier over issue title/body"
                + ("/labels" if self.bundle.get("include_labels", True) else ""),
                round(conf, 3),
            ))
        # classification fields the bundle has no model for at all (e.g. an
        # earlier run skipped a thin field) -- fall back to the heuristic.
        for field in CLASSIFICATION_FIELDS:
            if field not in covered:
                kept.append(fallback_by_field.get(field, FieldProposal(field, "Unknown", "UNKNOWN")))
        return kept


# ---------------------------------------------------------------------------
# ONNXBaselineEngine -- Step 8's ONNX export of the Step 5 bundle
# ---------------------------------------------------------------------------

class ONNXBaselineEngine:
    """Same propose() contract and same text-building/anchoring/fallback
    logic as BaselineEngine, but predicts via onnxruntime against
    export_onnx.py's manifest.json + per-field .onnx files instead of a
    joblib Pipeline. Deliberately reimplements the shape of
    export_onnx._onnx_predict rather than importing export_onnx.py, so that
    running this engine never requires skl2onnx (only onnxruntime, which is
    the whole point of exporting)."""

    def __init__(self, manifest_dir: str | Path, min_confidence: float = 0.0):
        try:
            import onnxruntime as ort
        except ImportError as e:  # pragma: no cover -- exercised without the dep in this sandbox
            sys.exit(f"missing dependency ({e}). Install with:\n    pip install onnxruntime")
        manifest_dir = Path(manifest_dir)
        manifest_path = manifest_dir / "manifest.json"
        if not manifest_path.exists():
            sys.exit(f"no manifest.json in {manifest_dir} -- run export_onnx.py baseline first")
        self.manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.sessions = {
            field: ort.InferenceSession(str(manifest_dir / meta["onnx_file"]))
            for field, meta in self.manifest["fields"].items()
        }
        self.min_confidence = min_confidence
        self.fallback = HeuristicStubEngine()

    def _predict(self, field: str, text: str) -> tuple[str, float]:
        import numpy as np
        session = self.sessions[field]
        meta = self.manifest["fields"][field]
        input_name = session.get_inputs()[0].name
        outputs = session.run(None, {input_name: np.array([[text]], dtype=object)})
        label = str(outputs[0][0])
        conf = 0.5
        if meta.get("has_proba") and len(outputs) > 1:
            try:
                conf = float(max(outputs[1][0]))
            except Exception:
                conf = 0.5
        return label, conf

    def propose(self, segments: list[Segment]) -> list[FieldProposal]:
        fallback_by_field = {p.field: p for p in self.fallback.propose(segments)}
        kept = [p for f, p in fallback_by_field.items() if f not in CLASSIFICATION_FIELDS]
        text = _issue_text_from_segments(segments, include_labels=self.manifest.get("include_labels", True))
        anchor = _anchor_pointers(segments)

        covered = set()
        for field in self.manifest["fields"]:
            covered.add(field)
            if not text.strip():
                kept.append(fallback_by_field.get(field, FieldProposal(field, "Unknown", "UNKNOWN")))
                continue
            pred, conf = self._predict(field, text)
            if conf < self.min_confidence:
                kept.append(fallback_by_field.get(field, FieldProposal(field, "Unknown", "UNKNOWN")))
                continue
            kept.append(FieldProposal(
                field, pred, "INFERRED", anchor,
                f"predicted by ONNX-exported TF-IDF+{self.manifest.get('backend', '?')} classifier "
                "over issue title/body" + ("/labels" if self.manifest.get("include_labels", True) else ""),
                round(conf, 3),
            ))
        for field in CLASSIFICATION_FIELDS:
            if field not in covered:
                kept.append(fallback_by_field.get(field, FieldProposal(field, "Unknown", "UNKNOWN")))
        return kept


# ---------------------------------------------------------------------------
# LoRAEngine / ONNXLoRAEngine -- Step 6's fine-tuned generator, and Step 8's
# ONNX export of it. Both share the exact same prompt-building, parsing, and
# grounding logic (_GenerativeEngineMixin) -- the only difference between
# them is how the underlying model is loaded and generated from.
# ---------------------------------------------------------------------------

_VALID_SOURCES = {"EXPLICIT", "SUPPORTED_BY_CONTEXT", "INFERRED", "UNKNOWN"}


def _find_pointers(evidence: str | None, segments: list[Segment]) -> list[str]:
    if not evidence:
        return []
    needle = _normalize(evidence)
    if not needle:
        return []
    return [s.segment_id for s in segments if needle in _normalize(s.text)]


def proposals_from_prediction(prediction: dict, segments: list[Segment]) -> list[FieldProposal]:
    """{"task": {...}, "provenance": {field: {source, evidence, confidence}}}
    -> FieldProposal list, resolving pointers by verbatim search since the
    SFT format (export_sft.py) has no segment_id concept. Shared by
    LoRAEngine and directly testable without loading a real model."""
    task = prediction.get("task") or {}
    provenance = prediction.get("provenance") or {}
    anchor = _anchor_pointers(segments)

    proposals: list[FieldProposal] = []
    for field, value in task.items():
        prov = provenance.get(field) or {}
        source = prov.get("source") if prov.get("source") in _VALID_SOURCES else "UNKNOWN"
        evidence = prov.get("evidence")
        confidence = prov.get("confidence")

        if source == "UNKNOWN":
            proposals.append(FieldProposal(field, value, "UNKNOWN"))
            continue

        pointers = _find_pointers(evidence, segments)
        if not pointers:
            # Can't verify the quote verbatim -- honest downgrade, same
            # move claude_label.verify_grounding makes on a hallucinated
            # Claude quote, rather than trusting an ungroundable claim.
            if source in ("EXPLICIT", "SUPPORTED_BY_CONTEXT"):
                source = "INFERRED"
            pointers = anchor
            evidence = evidence or "model-inferred; no exact quote matched a segment"
            confidence = min(confidence, 0.4) if isinstance(confidence, (int, float)) else 0.4
        proposals.append(FieldProposal(field, value, source, pointers, evidence, confidence))

    return default_fill_proposals(proposals)


class _GenerativeEngineMixin:
    """Shared propose() for any engine that generates export_sft.py's
    {task, provenance} JSON from a prompt -- LoRAEngine and ONNXLoRAEngine
    both mix this in and only implement __init__ (how the model loads) and
    _generate(issue_dict) -> raw text (how it's called). Keeping this in one
    place means the parsing/grounding/abstain behavior can't drift between
    the torch and ONNX paths."""

    def propose(self, segments: list[Segment]) -> list[FieldProposal]:
        title = next((s.text for s in segments if s.type == "ISSUE_TITLE"), "")
        body = next((s.text for s in segments if s.type == "ISSUE_BODY"), "")
        labels = [s.text for s in segments if s.type == "LABEL"]
        comments = [s.text for s in segments if s.type == "COMMENT"]
        raw_text = self._generate({"title": title, "body": body, "labels": labels, "comments": comments})
        prediction, err = export_sft.parse_model_text(raw_text)
        if err or not isinstance(prediction, dict):
            return []  # -> the same Level-4 abstain path NullEngine's [] already produces
        return proposals_from_prediction(prediction, segments)

    def _build_prompt(self, issue_dict: dict) -> str:
        user_payload = json.dumps(
            {"issue": issue_dict, "context_tier": 1, "available_context": {}},
            ensure_ascii=False, sort_keys=True,
        )
        messages = [
            {"role": "system", "content": export_sft.SYSTEM_PROMPT},
            {"role": "user", "content": user_payload},
        ]
        return self.tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)


class LoRAEngine(_GenerativeEngineMixin):
    """Satisfies engine.propose(segments) -> list[FieldProposal] using a
    train_lora.py checkpoint (adapter dir or its ...-merged sibling). See
    module docstring."""

    def __init__(self, model_dir: str | Path, max_new_tokens: int = 700, device: str | None = None):
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except ImportError as e:  # pragma: no cover -- exercised without the deps in CI
            sys.exit(f"missing dependency ({e}). Install with:\n    pip install torch transformers")
        self.torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir)
        self.model = AutoModelForCausalLM.from_pretrained(model_dir)
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model.to(self.device)
        self.model.eval()
        self.max_new_tokens = max_new_tokens

    def _generate(self, issue_dict: dict) -> str:
        prompt = self._build_prompt(issue_dict)
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        with self.torch.no_grad():
            out = self.model.generate(
                **inputs, max_new_tokens=self.max_new_tokens, do_sample=False,
                pad_token_id=self.tokenizer.eos_token_id,
            )
        new_tokens = out[0][inputs["input_ids"].shape[1]:]
        return self.tokenizer.decode(new_tokens, skip_special_tokens=True)


class ONNXLoRAEngine(_GenerativeEngineMixin):
    """Same contract as LoRAEngine, generating via
    optimum.onnxruntime.ORTModelForCausalLM against a Step 8
    (export_onnx.py lora) export instead of a plain torch
    AutoModelForCausalLM. optimum's ORTModelForCausalLM.generate() is API-
    compatible with transformers' -- takes/returns the same tensors -- so
    _build_prompt and the parsing/grounding in _GenerativeEngineMixin need
    no changes at all; only model loading and the generate() call differ
    (no .to(device)/.eval()/torch.no_grad(), which are torch-model-specific
    and not meaningful for an onnxruntime-backed model)."""

    def __init__(self, model_dir: str | Path, max_new_tokens: int = 700):
        try:
            from optimum.onnxruntime import ORTModelForCausalLM
            from transformers import AutoTokenizer
        except ImportError as e:  # pragma: no cover -- exercised without the deps in this sandbox
            sys.exit(f"missing dependency ({e}). Install with:\n    pip install optimum[onnxruntime] transformers torch")
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir)
        self.model = ORTModelForCausalLM.from_pretrained(model_dir)
        self.max_new_tokens = max_new_tokens

    def _generate(self, issue_dict: dict) -> str:
        prompt = self._build_prompt(issue_dict)
        inputs = self.tokenizer(prompt, return_tensors="pt")
        out = self.model.generate(
            **inputs, max_new_tokens=self.max_new_tokens, do_sample=False,
            pad_token_id=self.tokenizer.eos_token_id,
        )
        new_tokens = out[0][inputs["input_ids"].shape[1]:]
        return self.tokenizer.decode(new_tokens, skip_special_tokens=True)


# ---------------------------------------------------------------------------
# Issue loading -> InferenceInput
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def inference_input_from_raw_issue(issue: dict) -> InferenceInput:
    """Ad-hoc format for --issue-json: {repo, issue_number, issue_url,
    title, body, labels, comments (list[str] or list[dict]),
    snapshot_fetched_at?}. Only title is required."""
    comments = issue.get("comments") or []
    norm_comments = []
    for i, c in enumerate(comments):
        body = c.get("body", "") if isinstance(c, dict) else str(c)
        norm_comments.append({"author_role": "reporter" if i == 0 else "other",
                               "body": body, "clarifies": False})
    return InferenceInput(
        repo=issue.get("repo", "local/adhoc"),
        issue_number=int(issue.get("issue_number", 1)),
        issue_url=issue.get("issue_url", "https://example.invalid/issues/1"),
        snapshot_fetched_at=issue.get("snapshot_fetched_at") or _now(),
        title=issue.get("title", ""),
        body=issue.get("body", ""),
        labels=issue.get("labels") or [],
        comments=norm_comments,
        context_tier_ceiling=1,
    )


def load_collected(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


# ---------------------------------------------------------------------------
# Engine selection + CLI
# ---------------------------------------------------------------------------

def build_engine(args):
    if args.engine == "null":
        return NullEngine()
    if args.engine == "heuristic":
        return HeuristicStubEngine()
    if args.engine == "baseline":
        if not args.baseline_model:
            sys.exit("--baseline-model is required for --engine baseline")
        return BaselineEngine(args.baseline_model, min_confidence=args.baseline_min_confidence)
    if args.engine == "lora":
        if not args.lora_model_dir:
            sys.exit("--lora-model-dir is required for --engine lora")
        return LoRAEngine(args.lora_model_dir, max_new_tokens=args.lora_max_new_tokens)
    if args.engine == "onnx-baseline":
        if not args.onnx_baseline_dir:
            sys.exit("--onnx-baseline-dir is required for --engine onnx-baseline")
        return ONNXBaselineEngine(args.onnx_baseline_dir, min_confidence=args.baseline_min_confidence)
    if args.engine == "onnx-lora":
        if not args.onnx_lora_dir:
            sys.exit("--onnx-lora-dir is required for --engine onnx-lora")
        return ONNXLoRAEngine(args.onnx_lora_dir, max_new_tokens=args.lora_max_new_tokens)
    if args.engine == "claude":
        import os
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            sys.exit("ANTHROPIC_API_KEY must be set for --engine claude")
        return ClaudeEngine(api_key, args.claude_model)
    raise ValueError(args.engine)


def run_one(inp: InferenceInput, engine) -> dict:
    record, trace = understand(inp, engine=engine)
    if isinstance(record, RejectedResult):
        return {"status": "rejected", "reason_codes": record.reason_codes, "detail": record.detail}
    return {
        "status": "ok",
        "record": record,
        "degradation_level": trace.degradation_level,
        "downgrades": trace.downgrades,
        "repairs": trace.repairs,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--issue-json", help="a single ad-hoc issue JSON file (see module docstring)")
    src.add_argument("--collected", help="a Step-2 collected.jsonl file")
    ap.add_argument("--issue-index", type=int, default=None,
                     help="with --collected: process only this 0-based record and print it; "
                          "omit to process every record in the file as a batch")
    ap.add_argument("--engine",
                     choices=["null", "heuristic", "baseline", "lora", "onnx-baseline", "onnx-lora", "claude"],
                     default="heuristic")
    ap.add_argument("--baseline-model", default=None, help="models/baseline.joblib from train_baseline.py")
    ap.add_argument("--baseline-min-confidence", type=float, default=0.0,
                     help="below this, fall back to the heuristic guess instead of the classifier's "
                          "(applies to both --engine baseline and --engine onnx-baseline)")
    ap.add_argument("--lora-model-dir", default=None, help="models/lora-itu1(-merged) from train_lora.py")
    ap.add_argument("--lora-max-new-tokens", type=int, default=700,
                     help="applies to both --engine lora and --engine onnx-lora")
    ap.add_argument("--onnx-baseline-dir", default=None,
                     help="models/baseline-onnx from `export_onnx.py baseline` (the manifest.json dir)")
    ap.add_argument("--onnx-lora-dir", default=None,
                     help="models/lora-itu1-onnx from `export_onnx.py lora`")
    ap.add_argument("--claude-model", default="claude-sonnet-4-6")
    ap.add_argument("--out", default=None, help="write result(s) here as JSON/JSONL instead of stdout")
    args = ap.parse_args(argv)

    engine = build_engine(args)

    if args.issue_json:
        issue = json.loads(Path(args.issue_json).read_text(encoding="utf-8"))
        inp = inference_input_from_raw_issue(issue)
        result = run_one(inp, engine)
        text = json.dumps(result, indent=2, ensure_ascii=False, default=str)
        if args.out:
            Path(args.out).write_text(text, encoding="utf-8")
            print(f"wrote 1 result -> {args.out}")
        else:
            print(text)
        return 0 if result["status"] == "ok" else 1

    records = load_collected(Path(args.collected))
    if not records:
        print(f"no records in {args.collected}", file=sys.stderr)
        return 1

    if args.issue_index is not None:
        rec = records[args.issue_index]
        inp = to_inference_input(rec)
        result = run_one(inp, engine)
        text = json.dumps(result, indent=2, ensure_ascii=False, default=str)
        if args.out:
            Path(args.out).write_text(text, encoding="utf-8")
            print(f"wrote 1 result -> {args.out}")
        else:
            print(text)
        return 0 if result["status"] == "ok" else 1

    # batch mode
    ok = rejected = 0
    out_fh = Path(args.out).open("w", encoding="utf-8") if args.out else None
    try:
        for rec in records:
            inp = to_inference_input(rec)
            result = run_one(inp, engine)
            ok += result["status"] == "ok"
            rejected += result["status"] == "rejected"
            line = json.dumps(
                {"collection_id": rec.get("collection_id") or rec.get("identity", {}).get("source_repo"),
                 **result}, ensure_ascii=False, default=str,
            )
            if out_fh:
                out_fh.write(line + "\n")
            else:
                print(line)
    finally:
        if out_fh:
            out_fh.close()
    print(f"\nprocessed {len(records)}: {ok} ok, {rejected} rejected"
          + (f" -> {args.out}" if args.out else ""), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
