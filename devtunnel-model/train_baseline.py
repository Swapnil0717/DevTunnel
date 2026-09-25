#!/usr/bin/env python3
"""
ITU-1 -- Step 5: classical baseline (Section 5 Step 5 of the master build prompt)

TF-IDF + a linear classifier (logistic regression or linear SVM), one
model per classification field (role, experience_level, complexity,
task_type), trained on Step 4's data/training_examples.jsonl. This is
meant to run BEFORE any transformer fine-tune (Step 6's LoRA pass): it's
fast on CPU-only hardware and tells you whether the labeled data has
enough signal to be worth fine-tuning at all.

Reuses the existing, tested package logic rather than reimplementing it:

    itu1/example.py     validate_example() / model_input()  -- what a
                         record is and exactly what a model may see
    itu1/dataset.py      build_datasets()   -- validity + rejection
                         filtering, near-dup/sibling union-find, curated
                         hard_case/adversarial carve-out, GOLD/SILVER
                         tier filtering, temporal windows -- everything
                         except the actual train/eval split, see below
    itu1/evaluation.py   classification_report()  -- the same accuracy /
                         macro-P/R/F1 / per-class metric Phase 14 uses

Why this is NOT a Phase 14 evaluation
--------------------------------------
dataset.py's own validation/test datasets are GOLD-only by design (eval
must be scored against a human ground truth the model never influenced).
Step 4 was built without the separate hand-labeled GOLD set (by request),
so `data/training_examples.jsonl` is 100% SILVER -- there is currently
nothing in the repo that itu1/dataset.py would ever place in validation
or test; asking it to would just silently drop every record.

So this script pulls dataset.py's "training" (+ "hard_case", which is
still real organic SILVER data, just flagged low-confidence/disagreement)
pool, and then carves its OWN repo-disjoint holdout out of THAT pool,
purely as an internal sanity check: "did the model learn anything at
all", not "is the model good". The holdout is SILVER too, so its errors
are Claude's Step-4 errors as much as the baseline's -- treat every
number this script prints as optimistic and directional, never as a
release gate. Rerun this same script, unmodified, once a real GOLD eval
set exists and dataset.py will start routing to validation/test on its
own; nothing here needs to change for that day.

Usage
-----
    python train_baseline.py \\
        --training-examples data/training_examples.jsonl \\
        --out models/baseline.joblib \\
        --report-out data/baseline_report.json \\
        --backend logreg \\
        --holdout-fraction 0.2

    # sanity-check a couple of held-out issues after training:
    python train_baseline.py --predict-sample 3 ... (same args as above)

Needs scikit-learn + joblib (`pip install scikit-learn` -- already in
Step 1's install list).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "itu1"))
import dataset as ds          # noqa: E402
import evaluation as ev       # noqa: E402
from example import model_input  # noqa: E402

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.svm import LinearSVC
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.pipeline import Pipeline
    import joblib
except ImportError as e:  # pragma: no cover
    sys.exit(
        f"missing dependency ({e}). Install with:\n"
        "    pip install scikit-learn joblib"
    )

FIELDS = ev.CLASSIFICATION_FIELDS  # ("role", "experience_level", "complexity", "task_type")
MIN_PER_FIELD_DEFAULT = 20
MIN_PER_CLASS_WARN = 2


# ---------------------------------------------------------------- text building
def issue_text(ex: dict, *, include_labels: bool = True, max_comments: int = 8) -> str:
    """Everything a model is actually allowed to see for this example
    (example.model_input's exact contract), flattened to one string.
    Title is duplicated once -- a cheap, standard trick to give short,
    high-signal fields more weight than they'd get diluted into a long
    body/comment thread under plain TF-IDF term frequency."""
    issue = model_input(ex)["issue"]
    title = issue["title"] or ""
    body = issue["body"] or ""
    comments = issue.get("comments") or []
    parts = [title, title, body, "\n".join(comments[:max_comments])]
    if include_labels:
        labels = issue.get("labels") or []
        if labels:
            parts.append(" ".join(f"label_{l.replace(' ', '_')}" for l in labels))
    return "\n\n".join(p for p in parts if p)


def _repo(ex: dict) -> str:
    return ex["label_provenance"]["source_repo"]


def _bucket(key: str, salt: str) -> int:
    return int(hashlib.sha256(f"{salt}|{key}".encode()).hexdigest()[:8], 16) % 100


# ---------------------------------------------------------------- data pool
def load_examples(path: Path) -> list[dict]:
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def build_pool(examples: list[dict], split_salt: str) -> tuple[list[dict], list[tuple[str, str]]]:
    """Run the real dataset.py assignment (validity, dedup, curated
    carve-out, tier filtering, temporal windows) with split=(100,0,0) --
    there is no GOLD to put in validation/test, so asking dataset.py for
    those buckets would only drop real training data for nothing. Returns
    (usable records, dropped [(example_id, reason), ...])."""
    cfg = ds.BuildConfig(split_salt=split_salt, split=(100, 0, 0), built_by="train_baseline.py")
    result = ds.build_datasets(examples, cfg)
    pool = result.datasets["training"] + result.datasets["hard_case"]
    pool.sort(key=lambda r: r["example_id"])
    return pool, result.dropped


def holdout_split(pool: list[dict], holdout_fraction: float, holdout_salt: str) -> tuple[list[dict], list[dict]]:
    """A SECOND, independent repo-hash split (different salt from the
    dataset.py assignment above) so no repo's issues appear in both the
    training side and this internal holdout -- same repo-disjointness
    principle dataset.py's own L1 leakage test enforces, applied one
    level down since dataset.py already put everything in one bucket."""
    threshold = round(holdout_fraction * 100)
    train, holdout = [], []
    for ex in pool:
        (holdout if _bucket(_repo(ex), holdout_salt) < threshold else train).append(ex)
    return train, holdout


# ---------------------------------------------------------------- model
def make_pipeline(backend: str, n_smallest_class: int) -> Pipeline:
    vec = TfidfVectorizer(
        ngram_range=(1, 2), min_df=2, max_df=0.9, max_features=20000,
        sublinear_tf=True, stop_words="english",
    )
    if backend == "logreg":
        clf = LogisticRegression(max_iter=2000, class_weight="balanced", C=1.0)
    elif backend == "svm":
        base = LinearSVC(class_weight="balanced", C=1.0)
        # CalibratedClassifierCV needs at least `cv` examples of the rarest
        # class; fall back to the uncalibrated margin classifier (no
        # predict_proba) when the data's too thin for that.
        cv = min(3, n_smallest_class)
        clf = CalibratedClassifierCV(base, cv=cv) if cv >= 2 else base
    else:
        raise ValueError(f"unknown backend {backend!r}")
    return Pipeline([("tfidf", vec), ("clf", clf)])


def train_field(field: str, train_pool: list[dict], holdout_pool: list[dict], backend: str,
                 include_labels: bool) -> dict:
    def rows(pool):
        out = []
        for ex in pool:
            val = ex["ground_truth"]["task"].get(field)
            if val and val != "Unknown":
                out.append((issue_text(ex, include_labels=include_labels), val))
        return out

    train_rows, holdout_rows = rows(train_pool), rows(holdout_pool)
    train_counts = Counter(y for _, y in train_rows)
    holdout_counts = Counter(y for _, y in holdout_rows)

    result = {
        "n_train": len(train_rows), "n_holdout": len(holdout_rows),
        "class_distribution_train": dict(train_counts),
        "class_distribution_holdout": dict(holdout_counts),
    }
    if len(train_rows) < MIN_PER_FIELD_DEFAULT or len(train_counts) < 2:
        result["skipped"] = (
            f"only {len(train_rows)} labeled, {len(train_counts)} class(es) after "
            "excluding Unknown -- not enough signal to fit a classifier yet"
        )
        return result

    thin = [c for c, n in train_counts.items() if n < MIN_PER_CLASS_WARN]
    if thin:
        result["thin_classes_warning"] = (
            f"classes with <{MIN_PER_CLASS_WARN} training examples: {sorted(thin)} "
            "-- expect unreliable predictions for these"
        )

    X_train, y_train = zip(*train_rows)
    pipe = make_pipeline(backend, min(train_counts.values()))
    pipe.fit(list(X_train), list(y_train))
    result["pipeline"] = pipe
    result["backend"] = backend if not (
        backend == "svm" and min(train_counts.values()) < 2
    ) else "svm (uncalibrated)"

    majority = train_counts.most_common(1)[0][0]
    if holdout_rows:
        X_hold, y_hold = zip(*holdout_rows)
        preds = pipe.predict(list(X_hold))
        pairs = list(zip(preds, y_hold))
        result["metrics"] = ev.classification_report(pairs)
        result["majority_baseline_accuracy"] = sum(1 for _, y in holdout_rows if y == majority) / len(holdout_rows)
    else:
        result["metrics"] = None
        result["majority_baseline_accuracy"] = None
        result["holdout_warning"] = "no holdout examples for this field -- metrics unavailable"
    return result


# ---------------------------------------------------------------- CLI
def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--training-examples", default="data/training_examples.jsonl")
    p.add_argument("--out", default="models/baseline.joblib")
    p.add_argument("--report-out", default="data/baseline_report.json")
    p.add_argument("--backend", choices=["logreg", "svm"], default="logreg")
    p.add_argument("--holdout-fraction", type=float, default=0.2)
    p.add_argument("--split-salt", default="itu1-baseline-dataset-v1",
                    help="passed to dataset.build_datasets; changing it reshuffles which repos are usable at all")
    p.add_argument("--holdout-salt", default="itu1-baseline-holdout-v1",
                    help="salt for THIS script's internal repo-disjoint holdout; change to resample it")
    p.add_argument("--exclude-github-labels", action="store_true",
                    help="drop the issue's own GitHub labels from model input -- labels are legitimate "
                         "input.issue content, but for task_type especially they can be near-synonymous "
                         "with the target, making that field's numbers look better than a label-blind "
                         "deployment would see. Use this flag for a more conservative read.")
    p.add_argument("--predict-sample", type=int, default=0,
                    help="after training, print predictions for N random holdout issues as a spot-check")
    args = p.parse_args(argv)

    examples = load_examples(Path(args.training_examples))
    if not examples:
        print(f"no examples found in {args.training_examples}", file=sys.stderr)
        return 1

    pool, dropped = build_pool(examples, args.split_salt)
    print(f"loaded {len(examples)} examples -> {len(pool)} usable after dataset.py's validity/dedup/"
          f"tier/window filtering ({len(dropped)} dropped)")
    if not pool:
        print("nothing usable -- check the drop reasons below", file=sys.stderr)
        for eid, reason in dropped[:20]:
            print(f"  {eid}: {reason}", file=sys.stderr)
        return 1

    train_pool, holdout_pool = holdout_split(pool, args.holdout_fraction, args.holdout_salt)
    train_repos = {_repo(e) for e in train_pool}
    holdout_repos = {_repo(e) for e in holdout_pool}
    print(f"internal holdout (informal, NOT Phase 14 eval): {len(train_pool)} train / "
          f"{len(holdout_pool)} holdout examples, {len(train_repos)} / {len(holdout_repos)} repos "
          f"(disjoint: {train_repos.isdisjoint(holdout_repos)})")

    bundle, report = {}, {
        "backend": args.backend,
        "n_examples_total": len(examples),
        "n_examples_usable": len(pool),
        "n_dropped": len(dropped),
        "dropped_reasons": dict(Counter(reason for _, reason in dropped)),
        "n_train": len(train_pool), "n_holdout": len(holdout_pool),
        "note": "internal repo-disjoint holdout over 100% SILVER data -- directional signal only, "
                "not a Phase 14 (GOLD-only) evaluation; see this script's module docstring",
        "fields": {},
    }

    for field in FIELDS:
        print(f"\n=== {field} ===")
        r = train_field(field, train_pool, holdout_pool, args.backend,
                         include_labels=not args.exclude_github_labels)
        if r.get("skipped"):
            print(f"  skipped: {r['skipped']}")
            report["fields"][field] = r
            continue
        if r.get("thin_classes_warning"):
            print(f"  warning: {r['thin_classes_warning']}")
        m = r["metrics"]
        if m and m["n"]:
            print(f"  train={r['n_train']} holdout={r['n_holdout']} classes(train)={sorted(r['class_distribution_train'])}")
            print(f"  accuracy={m['accuracy']:.3f}  macro_f1={m['macro_f1']:.3f}  "
                  f"(majority-class baseline={r['majority_baseline_accuracy']:.3f})")
        else:
            print(f"  train={r['n_train']} holdout={r['n_holdout']} -- {r.get('holdout_warning', 'no metrics')}")
        bundle[field] = r.pop("pipeline")
        report["fields"][field] = r

    if not bundle:
        print("\nno field had enough data to train -- nothing to save", file=sys.stderr)
        return 1

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"backend": args.backend, "include_labels": not args.exclude_github_labels,
                 "fields": bundle}, out_path)
    print(f"\nsaved {len(bundle)} field model(s) -> {out_path}")

    report_path = Path(args.report_out)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(f"saved report -> {report_path}")

    if args.predict_sample and holdout_pool:
        import random
        print(f"\n=== spot-check: {min(args.predict_sample, len(holdout_pool))} holdout issue(s) ===")
        for ex in random.sample(holdout_pool, min(args.predict_sample, len(holdout_pool))):
            text = issue_text(ex, include_labels=not args.exclude_github_labels)
            title = ex["input"]["issue"]["title"]
            print(f"\n- {ex['example_id']}  ({_repo(ex)})")
            print(f"  title: {title[:100]}")
            for field, pipe in bundle.items():
                truth = ex["ground_truth"]["task"].get(field)
                pred = pipe.predict([text])[0]
                mark = "OK" if pred == truth else "!!"
                print(f"  [{mark}] {field}: predicted={pred!r} truth={truth!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
