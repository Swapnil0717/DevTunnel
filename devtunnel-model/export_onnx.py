#!/usr/bin/env python3
"""
ITU-1 -- Step 8: ONNX export for faster CPU inference.

Two independent exports, matching the two trained-model engines
run_inference.py already wires into architecture.py's engine contract:

  baseline   Step 5's joblib bundle (train_baseline.py) -> one .onnx graph
             per classification field, via skl2onnx. TfidfVectorizer + the
             linear classifier (LogisticRegression / LinearSVC /
             CalibratedClassifierCV) convert cleanly to ONNX ops; onnxruntime
             can then predict without scikit-learn installed at inference
             time at all.

  lora       Step 6's MERGED model dir (train_lora.py --merge-and-save) -> an
             ONNX decoder via optimum.onnxruntime.ORTModelForCausalLM
             (export=True). Only the merged model can be exported this way --
             optimum's ONNX export operates on a full model, not a bare PEFT
             adapter, so a plain (unmerged) --out-dir from train_lora.py will
             fail here with a clear message telling you to rerun that step
             with --merge-and-save.

Both exports are verified immediately after conversion, against the exact
object being exported (not a fresh retrain), so a mismatch means the
CONVERSION is wrong, not that the model itself is inaccurate:

  baseline   onnxruntime's predictions on a handful of synthetic issue-shaped
             strings are compared field-by-field against the original joblib
             pipeline's own .predict()/.predict_proba() on the identical
             strings. This is a self-consistency check -- the strings don't
             need to resemble real training data, since both sides see the
             same input.
  lora       one greedy-decoded generation from the ONNX model is compared,
             token-for-token, against the original torch model generating
             from the identical prompt. Reports a diff rather than silently
             ignoring one -- ONNX/torch numerical drift can occasionally
             flip a near-tied token, which is worth knowing about, not a
             hard failure.

Neither export nor its verification touches architecture.py, example.py, or
any other itu1/ module -- this script only reads what train_baseline.py /
train_lora.py already wrote. run_inference.py's ONNXBaselineEngine /
ONNXLoRAEngine load exactly what this script produces; see that module's
docstring for the --engine onnx-baseline / onnx-lora wiring.

Usage
-----
    pip install skl2onnx onnxruntime            # baseline export
    pip install optimum[onnxruntime]              # lora export (also needs
                                                    # torch + transformers,
                                                    # already required by
                                                    # train_lora.py)

    python export_onnx.py baseline \\
        --bundle models/baseline.joblib \\
        --out-dir models/baseline-onnx

    python export_onnx.py lora \\
        --model-dir models/lora-itu1-merged \\
        --out-dir models/lora-itu1-onnx \\
        --skip-verify   # generation verification is slow on CPU; opt out if
                         # you just want the files and will spot-check later
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "itu1"))
import export_sft  # noqa: E402  -- SYSTEM_PROMPT, reused verbatim for the lora verify prompt


# ---------------------------------------------------------------------------
# baseline: joblib Pipeline(s) -> one ONNX graph per field
# ---------------------------------------------------------------------------

SAMPLE_TEXTS = [
    "App crashes when clicking the submit button on the login form",
    "Add a dark mode toggle to the settings page",
    "Improve error message when the API times out",
    "Typo in the README installation instructions",
    "Security: dependency has a known CVE, please bump the version",
    "",  # empty string -- a legitimate degenerate case to check doesn't crash
]


def load_bundle(bundle_path: Path) -> dict:
    import joblib
    return joblib.load(bundle_path)


def convert_field(field: str, pipe, out_dir: Path, opset: int) -> dict:
    """Converts one field's sklearn Pipeline to ONNX and writes it to
    out_dir/<field>.onnx. Returns the manifest entry for this field."""
    try:
        from skl2onnx import convert_sklearn
        from skl2onnx.common.data_types import StringTensorType
    except ImportError as e:  # pragma: no cover -- exercised without the dep in this sandbox
        sys.exit(f"missing dependency ({e}). Install with:\n    pip install skl2onnx onnx")

    clf = pipe.steps[-1][1]
    has_proba = hasattr(clf, "predict_proba")
    # zipmap=False: raw (label, probability-array) outputs instead of a
    # list-of-dict -- much simpler and faster to consume from onnxruntime
    # at inference time than parsing a ZipMap structure back out.
    options = {id(clf): {"zipmap": False}} if has_proba else {}
    onnx_model = convert_sklearn(
        pipe,
        initial_types=[("input", StringTensorType([None, 1]))],
        options=options,
        target_opset=opset,
    )
    onnx_path = out_dir / f"{field}.onnx"
    onnx_path.write_bytes(onnx_model.SerializeToString())

    classes = [str(c) for c in getattr(clf, "classes_", getattr(pipe, "classes_", []))]
    return {"onnx_file": onnx_path.name, "classes": classes, "has_proba": has_proba}


def _onnx_predict(session, text: str):
    """Runs one string through an already-loaded onnxruntime session in the
    exact shape skl2onnx's StringTensorType([None, 1]) expects, and returns
    (label, probability_array_or_None). Shared by verify_baseline_export and
    run_inference.ONNXBaselineEngine (which reimplements this shape rather
    than importing this script, to keep run_inference.py's own dependency
    surface -- onnxruntime only, no skl2onnx needed at inference time)."""
    import numpy as np
    input_name = session.get_inputs()[0].name
    arr = np.array([[text]], dtype=object)
    outputs = session.run(None, {input_name: arr})
    label = outputs[0][0]
    proba = outputs[1][0] if len(outputs) > 1 else None
    return label, proba


def verify_baseline_export(bundle: dict, manifest: dict, out_dir: Path) -> dict:
    """Self-consistency check: onnxruntime vs. the original joblib pipeline
    on the same synthetic strings. See module docstring."""
    import onnxruntime as ort
    import numpy as np

    report = {"n_samples": len(SAMPLE_TEXTS), "fields": {}}
    for field, meta in manifest["fields"].items():
        pipe = bundle["fields"][field]
        session = ort.InferenceSession(str(out_dir / meta["onnx_file"]))
        label_mismatches, proba_max_diff = [], 0.0
        for text in SAMPLE_TEXTS:
            sk_label = pipe.predict([text])[0]
            onnx_label, onnx_proba = _onnx_predict(session, text)
            if str(sk_label) != str(onnx_label):
                label_mismatches.append(text[:60])
            if meta["has_proba"] and onnx_proba is not None:
                try:
                    sk_proba = pipe.predict_proba([text])[0]
                    proba_max_diff = max(proba_max_diff, float(np.max(np.abs(sk_proba - onnx_proba))))
                except Exception:
                    pass
        report["fields"][field] = {
            "label_mismatches": label_mismatches,
            "label_match": not label_mismatches,
            "max_proba_diff": round(proba_max_diff, 6) if meta["has_proba"] else None,
        }
    report["all_labels_match"] = all(r["label_match"] for r in report["fields"].values())
    return report


def run_baseline(args) -> int:
    bundle = load_bundle(Path(args.bundle))
    fields = bundle.get("fields", {})
    if not fields:
        print(f"no fields in {args.bundle} -- nothing to export", file=sys.stderr)
        return 1

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest = {"backend": bundle.get("backend"), "include_labels": bundle.get("include_labels", True), "fields": {}}
    for field, pipe in fields.items():
        print(f"converting {field} ...")
        manifest["fields"][field] = convert_field(field, pipe, out_dir, args.opset)

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"wrote {len(fields)} field(s) + manifest -> {out_dir}")

    if args.skip_verify:
        print("--skip-verify set: not comparing onnxruntime output to the original pipeline")
        return 0

    report = verify_baseline_export(bundle, manifest, out_dir)
    for field, r in report["fields"].items():
        status = "OK" if r["label_match"] else "MISMATCH"
        extra = f", max_proba_diff={r['max_proba_diff']}" if r["max_proba_diff"] is not None else ""
        print(f"  verify {field}: {status} ({report['n_samples']} samples){extra}")
        if r["label_mismatches"]:
            for t in r["label_mismatches"]:
                print(f"    mismatched on: {t!r}")
    if not report["all_labels_match"]:
        print("\nWARNING: at least one field's ONNX predictions did not match the original "
              "pipeline -- do not ship this export; check the skl2onnx/onnxruntime versions "
              "and rerun.", file=sys.stderr)
        return 1
    print("\nall fields match the original joblib pipeline on the verification samples.")
    return 0


# ---------------------------------------------------------------------------
# lora: merged HF model dir -> ONNX decoder via optimum
# ---------------------------------------------------------------------------

VERIFY_ISSUE = {
    "title": "App crashes on startup after upgrading to v2.3",
    "body": "Since upgrading, the app crashes immediately on launch with a "
            "NullPointerException in the config loader. Reverting to v2.2 fixes it.",
    "labels": ["bug"],
    "comments": [],
}


def _build_prompt(tokenizer, issue_dict: dict) -> str:
    user_payload = json.dumps(
        {"issue": issue_dict, "context_tier": 1, "available_context": {}},
        ensure_ascii=False, sort_keys=True,
    )
    messages = [
        {"role": "system", "content": export_sft.SYSTEM_PROMPT},
        {"role": "user", "content": user_payload},
    ]
    return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)


def run_lora(args) -> int:
    model_dir = Path(args.model_dir)
    if (model_dir / "adapter_config.json").exists() and not (model_dir / "config.json").exists():
        sys.exit(
            f"{model_dir} looks like a bare PEFT adapter directory (adapter_config.json with no "
            "config.json), not a merged model. optimum's ONNX export needs a full model graph -- "
            "rerun train_lora.py with --merge-and-save and point --model-dir at the resulting "
            "...-merged directory."
        )

    try:
        from optimum.onnxruntime import ORTModelForCausalLM
        from transformers import AutoTokenizer
    except ImportError as e:  # pragma: no cover -- exercised without the dep in this sandbox
        sys.exit(f"missing dependency ({e}). Install with:\n    pip install optimum[onnxruntime] transformers torch")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"loading + exporting {model_dir} to ONNX (this reads the full torch model once) ...")
    ort_model = ORTModelForCausalLM.from_pretrained(model_dir, export=True)
    ort_model.save_pretrained(out_dir)
    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    tokenizer.save_pretrained(out_dir)
    print(f"saved ONNX model + tokenizer -> {out_dir}")

    if args.skip_verify:
        print("--skip-verify set: not comparing a generation against the original torch model")
        return 0

    import torch
    from transformers import AutoModelForCausalLM

    torch_model = AutoModelForCausalLM.from_pretrained(model_dir)
    torch_model.eval()
    prompt = _build_prompt(tokenizer, VERIFY_ISSUE)
    inputs = tokenizer(prompt, return_tensors="pt")

    with torch.no_grad():
        torch_out = torch_model.generate(
            **inputs, max_new_tokens=args.max_new_tokens, do_sample=False,
            pad_token_id=tokenizer.eos_token_id,
        )
    ort_out = ort_model.generate(
        **inputs, max_new_tokens=args.max_new_tokens, do_sample=False,
        pad_token_id=tokenizer.eos_token_id,
    )
    prompt_len = inputs["input_ids"].shape[1]
    torch_text = tokenizer.decode(torch_out[0][prompt_len:], skip_special_tokens=True)
    onnx_text = tokenizer.decode(ort_out[0][prompt_len:], skip_special_tokens=True)
    match = torch_text == onnx_text

    print(f"\nverify: greedy generation on 1 sample issue -- {'OK, identical' if match else 'MISMATCH'}")
    if not match:
        print(f"  torch: {torch_text!r}")
        print(f"  onnx : {onnx_text!r}")
        print("\nWARNING: the ONNX model's greedy generation diverged from the original torch "
              "model's on this prompt. Small numeric drift can occasionally flip a near-tied "
              "token -- inspect the two outputs above before trusting this export unattended.",
              file=sys.stderr)
        return 1
    print("ONNX generation matches the original torch model on the verification sample.")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="which", required=True)

    b = sub.add_parser("baseline", help="export a train_baseline.py joblib bundle to ONNX")
    b.add_argument("--bundle", default="models/baseline.joblib")
    b.add_argument("--out-dir", default="models/baseline-onnx")
    b.add_argument("--opset", type=int, default=15)
    b.add_argument("--skip-verify", action="store_true")
    b.set_defaults(func=run_baseline)

    lo = sub.add_parser("lora", help="export a train_lora.py --merge-and-save model dir to ONNX")
    lo.add_argument("--model-dir", required=True, help="the ...-merged directory, NOT the adapter dir")
    lo.add_argument("--out-dir", default="models/lora-itu1-onnx")
    lo.add_argument("--max-new-tokens", type=int, default=200, help="kept small by default -- verify is CPU generation")
    lo.add_argument("--skip-verify", action="store_true")
    lo.set_defaults(func=run_lora)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
