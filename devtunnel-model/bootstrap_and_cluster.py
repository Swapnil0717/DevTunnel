#!/usr/bin/env python3
"""
ITU-1 -- Step 3: weak-label bootstrap + clustering (Section 4.2 / 5 Step 3
of the master build prompt)

Reads the collected.jsonl produced by collect_issues.py (Step 2), and for
every record with collection_stage == READY_FOR_LABELING:

  1. Weak-labels task_type (and, much more tentatively, role /
     experience_level / complexity) from the issue's own GitHub labels and a
     small keyword heuristic. These are PROPOSALS ONLY -- never ground
     truth. Step 4 (Claude-assisted labeling + human correction) is what
     actually produces a TrainingExample; this step just gives that pass a
     head start and something to correct instead of writing from scratch.
  2. Embeds title+body with sentence-transformers/all-MiniLM-L6-v2 (falls
     back to TF-IDF + TruncatedSVD if sentence-transformers/torch aren't
     installed yet, e.g. while you're first wiring this up offline -- swap
     to MiniLM before you actually start Step 4, the fallback is weaker).
  3. Clusters the embeddings (KMeans) so Step 4 can batch visually/topically
     similar issues together -- this is the main labeling-speed win, since
     a human/Claude reviewing 10 similar issues in a row is much faster
     than 10 random ones.

Every weak label carries a DECISION-flagged heuristic and a confidence <=
0.7 -- Step 4 must treat these as pre-fill suggestions to confirm or
overwrite, never as accepted labels. Nothing here writes a TrainingExample
or touches example.py; that only happens once a human/Claude has actually
looked at the issue (Step 4).

Usage
-----
    python bootstrap_and_cluster.py \
        --collected data/collected.jsonl \
        --out data/weak_labels.jsonl \
        --batches-out data/labeling_batches.jsonl \
        --n-clusters 40

Output
------
--out: one JSON object per READY_FOR_LABELING record:
    {collection_id, repo, issue_number, weak_labels: {task_type, role,
     experience_level, complexity}, cluster_id, embedding_backend}
  Each weak_labels[field] is either null (no signal, will need a genuine
  read in Step 4) or {"value": ..., "source": ..., "confidence": 0-1}.

--batches-out: collection_ids grouped by cluster_id, ordered so Step 4 can
  walk through one cluster at a time; plus a per-field/per-class weak-label
  coverage count so you can see, before spending any labeling time, which
  task_type / role / experience_level / complexity values are thin and
  need targeted repo/issue selection (recall the build prompt's target:
  >=50-100 examples of even the rarest class per field).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans

sys.path.insert(0, str(Path(__file__).resolve().parent / "itu1"))
from collect_issues import is_labelable  # noqa: E402

# --------------------------------------------------------- closed vocabulary
# Must match itu1/schema.py exactly -- do not invent values here.
TASK_TYPE_VALUES = {"Bug", "Feature", "Improvement", "Refactor", "Performance",
                     "Security", "Maintenance", "Documentation", "Other", "Unknown"}
ROLE_VALUES = {"Frontend", "Backend", "Fullstack", "Unknown"}
EXPERIENCE_VALUES = {"Beginner", "Intermediate", "Advanced", "Unknown"}
COMPLEXITY_VALUES = {"Low", "Medium", "High", "Unknown"}

# --------------------------------------------------- weak label: task_type
# DECISION: this label->task_type table is a placeholder heuristic covering
# common conventions across popular OSS repos. It will miss repo-specific
# label schemes -- that's fine, unmapped issues just get task_type=None
# (no weak label) and fall to a genuine Step-4 read.
GITHUB_LABEL_TO_TASK_TYPE = {
    "bug": "Bug", "bugfix": "Bug", "defect": "Bug", "regression": "Bug",
    "feature": "Feature", "feature-request": "Feature", "feature request": "Feature",
    "new feature": "Feature",
    "enhancement": "Improvement", "improvement": "Improvement",
    "refactor": "Refactor", "refactoring": "Refactor", "tech-debt": "Refactor",
    "technical debt": "Refactor", "cleanup": "Refactor",
    "performance": "Performance", "perf": "Performance", "optimization": "Performance",
    "security": "Security", "vulnerability": "Security", "cve": "Security",
    "maintenance": "Maintenance", "chore": "Maintenance", "dependencies": "Maintenance",
    "housekeeping": "Maintenance", "build": "Maintenance", "ci": "Maintenance",
    "documentation": "Documentation", "docs": "Documentation", "doc": "Documentation",
}
TASK_TYPE_LABEL_CONFIDENCE = 0.7  # direct repo-label match, still not GOLD-grade

# DECISION: "good first issue"-style labels are a genuine, widely-standardized
# signal for experience_level=Beginner. Nothing else gets a weak
# experience_level label -- too repo-specific to guess reliably.
BEGINNER_LABELS = {
    "good first issue", "good-first-issue", "beginner-friendly",
    "beginner", "easy", "starter", "first-timers-only",
}
EXPERIENCE_LABEL_CONFIDENCE = 0.55

# DECISION: crude keyword tilt for role, title+body only, lowest confidence
# of the three heuristics. Only fires when one side has a clear majority of
# hits AND there are at least 2 hits total; otherwise no weak label.
FRONTEND_KEYWORDS = {
    "css", "html", "ui", "ux", "react", "vue", "svelte", "frontend", "front-end",
    "button", "style", "styling", "component", "render", "dom", "browser",
    "responsive", "layout", "accessibility", "a11y", "stylesheet",
}
BACKEND_KEYWORDS = {
    "api", "server", "database", "db", "backend", "back-end", "endpoint",
    "sql", "auth", "authentication", "migration", "query", "schema",
    "middleware", "cache", "queue", "worker", "cron",
}
ROLE_KEYWORD_CONFIDENCE = 0.35
_WORD_RE = re.compile(r"[a-z0-9][a-z0-9\-]*")


def weak_task_type(labels: list[str]) -> dict | None:
    for lbl in labels:
        mapped = GITHUB_LABEL_TO_TASK_TYPE.get(lbl.strip().lower())
        if mapped:
            return {"value": mapped, "source": f"github_label:{lbl}",
                    "confidence": TASK_TYPE_LABEL_CONFIDENCE}
    return None


def weak_experience_level(labels: list[str]) -> dict | None:
    for lbl in labels:
        if lbl.strip().lower() in BEGINNER_LABELS:
            return {"value": "Beginner", "source": f"github_label:{lbl}",
                    "confidence": EXPERIENCE_LABEL_CONFIDENCE}
    return None


def weak_role(text: str) -> dict | None:
    words = set(_WORD_RE.findall(text.lower()))
    fe = len(words & FRONTEND_KEYWORDS)
    be = len(words & BACKEND_KEYWORDS)
    total = fe + be
    if total < 2:
        return None
    if fe > 0 and be > 0 and min(fe, be) / total > 0.34:
        return {"value": "Fullstack", "source": "keyword_heuristic",
                "confidence": ROLE_KEYWORD_CONFIDENCE}
    if fe > be:
        return {"value": "Frontend", "source": "keyword_heuristic",
                "confidence": ROLE_KEYWORD_CONFIDENCE}
    if be > fe:
        return {"value": "Backend", "source": "keyword_heuristic",
                "confidence": ROLE_KEYWORD_CONFIDENCE}
    return None


# complexity: deliberately no weak label. No generic cross-repo signal is
# reliable enough even at low confidence -- Step 4 has to actually read
# the issue for this one.


def weak_labels_for(rec: dict) -> dict:
    core = rec["input_core"]
    labels = core.get("labels", [])
    text = core["title"] + "\n" + core["body"]
    return {
        "task_type": weak_task_type(labels),
        "role": weak_role(text),
        "experience_level": weak_experience_level(labels),
        "complexity": None,
    }


# ------------------------------------------------------------- embeddings

def embed_texts(texts: list[str]) -> tuple[np.ndarray, str]:
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        vecs = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)
        return np.asarray(vecs), "minilm"
    except ImportError:
        print("  sentence-transformers not installed -- falling back to TF-IDF+SVD.\n"
              "  Run `pip install sentence-transformers torch --index-url "
              "https://download.pytorch.org/whl/cpu` and re-run before Step 4 "
              "for real MiniLM embeddings.", file=sys.stderr)
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.decomposition import TruncatedSVD
        tfidf = TfidfVectorizer(max_features=20000, stop_words="english", min_df=2)
        X = tfidf.fit_transform(texts)
        n_comp = min(128, max(2, X.shape[0] - 1), X.shape[1] - 1)
        svd = TruncatedSVD(n_components=n_comp, random_state=0)
        vecs = svd.fit_transform(X)
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return vecs / norms, "tfidf_svd"


def cluster(vecs: np.ndarray, n_clusters: int) -> np.ndarray:
    n_clusters = max(1, min(n_clusters, vecs.shape[0]))
    km = KMeans(n_clusters=n_clusters, random_state=0, n_init="auto")
    return km.fit_predict(vecs)


# --------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--collected", default="data/collected.jsonl")
    ap.add_argument("--out", default="data/weak_labels.jsonl")
    ap.add_argument("--batches-out", default="data/labeling_batches.jsonl")
    ap.add_argument("--n-clusters", type=int, default=40,
                     help="rule of thumb: aim for ~20-40 issues per cluster")
    args = ap.parse_args()

    in_path = Path(args.collected)
    records = []
    with in_path.open(encoding="utf-8") as fh:
        for line in fh:
            rec = json.loads(line)
            if is_labelable(rec):
                records.append(rec)
    if not records:
        sys.exit(f"No READY_FOR_LABELING records in {in_path}. Run collect_issues.py first.")
    print(f"{len(records)} READY_FOR_LABELING records loaded from {in_path}")

    texts = [r["input_core"]["title"] + "\n" + r["input_core"]["body"] for r in records]
    vecs, backend = embed_texts(texts)
    print(f"embedding backend: {backend}")

    n_clusters = max(1, round(len(records) / 25)) if args.n_clusters <= 0 else args.n_clusters
    labels_arr = cluster(vecs, n_clusters)
    print(f"clustered into {len(set(labels_arr))} clusters")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    field_counts = {f: Counter() for f in ("task_type", "role", "experience_level", "complexity")}
    clusters: dict[int, list[str]] = defaultdict(list)

    with out_path.open("w", encoding="utf-8") as fh:
        for rec, cluster_id in zip(records, labels_arr):
            wl = weak_labels_for(rec)
            for field, val in wl.items():
                field_counts[field][val["value"] if val else "<no weak label>"] += 1
            row = {
                "collection_id": rec["collection_id"],
                "repo": rec["identity"]["source_repo"],
                "issue_number": rec["identity"]["issue_number"],
                "weak_labels": wl,
                "cluster_id": int(cluster_id),
                "embedding_backend": backend,
            }
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
            clusters[int(cluster_id)].append(rec["collection_id"])

    batches_path = Path(args.batches_out)
    with batches_path.open("w", encoding="utf-8") as fh:
        for cid in sorted(clusters):
            fh.write(json.dumps({"cluster_id": cid, "collection_ids": clusters[cid],
                                  "size": len(clusters[cid])}, ensure_ascii=False) + "\n")

    print(f"\nwrote {out_path} and {batches_path}")
    print("\n== weak-label coverage (proposals only -- NOT ground truth) ==")
    for field, counts in field_counts.items():
        print(f"  {field}:")
        for val, n in counts.most_common():
            print(f"    {val}: {n}")
    print("\nNext: Step 4 (Claude-assisted labeling pass). Walk labeling_batches.jsonl "
          "cluster-by-cluster; use each record's weak_labels as a pre-fill suggestion "
          "to confirm/correct, never accept unread. Separately hand-label the 50-100 "
          "issue GOLD eval set with no AI involvement.")


if __name__ == "__main__":
    main()
