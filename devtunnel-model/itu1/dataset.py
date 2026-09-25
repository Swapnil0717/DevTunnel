"""
ITU-1 -- Step 7: Dataset construction (Phase 7)

Turns validated TrainingExamples into the six mutually exclusive datasets:

    training | validation | test | hard_case | adversarial | regression

    build_datasets(examples, cfg)      -> BuildResult   (assignment, drops, exceptions)
    check_leakage(datasets, ...)       -> {L1..L7: [findings]}     (Section 4, hard gates)
    dataset_statistics(records, ...)   -> DatasetStatistics        (Section 3, 5.2)
    quality_metrics(records, ...)      -> DatasetQualityMetrics    (Section 5.3)
    build_release(examples, cfg, ...)  -> (datasets, release)      (Section 8, gated)
    publish_release(datasets, release, out_dir)                    (writes files, enforces D12)
    relocate_to_regression(datasets, example_id, ...)              (Section 2.7, move not copy)
    validate_dataset_record(rec)       -> list[str]                (D1, D7, D13)
    next_version(...)                  -> (version, kind)          (Section 6.2)

Input examples are Phase 3 TrainingExamples (example.py). Two OPTIONAL top-level keys steer curation
and are stripped from the stored record (they end up in dataset_assignment.inclusion_reason):

    "annotation_summary": {"agreement_status": "agreed"|"disagreed"|"adjudicated"|...}
    "curation": {"inclusion_type": "contrast_pair"|"failure_mode_probe", "detail": str,
                 "failure_mode_targeted": str}      # adversarial records must be SYNTHETIC
Optional "corpus_meta": {"repo_type": ..., "domain": ...} is kept and only used for statistics.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from itertools import combinations
from typing import Any, Callable

import clean
import intake
from example import _check_input, validate_example

DATASET_IDS = ("training", "validation", "test", "hard_case", "adversarial", "regression")
POOL = ("training", "validation", "test")
CURATED = ("hard_case", "adversarial", "regression")
ASSIGNMENT_METHODS = {"hash_bucket", "curated", "relocated"}
INCLUSION_TYPES = {"disagreement", "contrast_pair", "low_confidence", "failure_mode_probe", "prior_model_failure"}
HARD_CASE_TYPES = {"disagreement", "contrast_pair", "low_confidence"}

# Phase 15 section 2 registry (Phase 7 D13: a defined set, not freeform).
FAILURE_MODES = {
    "keyword_misdirection", "label_authority_override", "unflagged_ambiguity",
    "forced_resolution_of_contradiction", "role_collapse", "technology_anchoring",
    "size_complexity_conflation", "depth_underestimation", "tone_driven_confidence_shift",
    "structural_non_robustness", "underabstention", "relevance_drift",
}
LEAKAGE_TESTS = tuple(f"L{i}" for i in range(1, 8))
VALIDATION_TESTS = tuple(f"D{i}" for i in range(1, 15))


# ================================================================== helpers
def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ts(s: str) -> datetime:
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _repo(ex: dict) -> str:
    return ex["label_provenance"]["source_repo"]


def _url(ex: dict) -> str:
    return ex["label_provenance"]["source_issue_url"]


def _snap(ex: dict) -> str:
    return ex["label_provenance"]["snapshot_fetched_at"]


def _tier(ex: dict) -> int:
    return ex["input"]["context_tier"]


def _clusters(ex: dict) -> list[str]:
    """Cluster ids from quality_flags ("near_dup_cluster:<id>", as export_sft.py reads them) and from
    corpus_meta.dedup_cluster_id. The second exists because GOLD examples may not carry quality flags
    (example.py), so a flag-only encoding could never mark a GOLD cluster member."""
    flags = (ex.get("quality_status") or {}).get("quality_flags") or []
    ids = [f.split(":", 1)[1] for f in flags if f.startswith("near_dup_cluster:")]
    cid = (ex.get("corpus_meta") or {}).get("dedup_cluster_id")
    return ids + ([str(cid)] if cid else [])


def _method(ex: dict) -> str:
    return ex["label_provenance"]["labeling_method"]


def _issue_hash(ex: dict) -> str:
    i = ex["input"]["issue"]
    return intake.exact_hash(i["title"], i["body"])


def _issue_text(ex: dict) -> str:
    i = ex["input"]["issue"]
    return f"{i['title']}\n{i['body']}"


def _content_sha(rec: dict) -> str:
    """Record content ignoring the version stamp (a version bump alone is not a content change)."""
    r = copy.deepcopy(rec)
    (r.get("dataset_assignment") or {}).pop("dataset_version", None)
    return _sha(r)


def _sha(obj: Any) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


class UnionFind:
    def __init__(self):
        self.p: dict[str, str] = {}

    def find(self, x: str) -> str:
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[max(ra, rb)] = min(ra, rb)      # deterministic root: smallest key


# ================================================================== config / result
@dataclass
class BuildConfig:
    split_salt: str                                    # Section 2.6 -- changing it is a MAJOR event
    source_version: str = "unversioned"                # Phase 4/5 corpus snapshot version
    annotation_version: str = "unversioned"            # Phase 6 guideline version
    upstream_snapshots: dict = field(default_factory=lambda: {
        "collection_snapshot_id": "unknown", "cleaning_snapshot_id": "unknown", "annotation_snapshot_id": "unknown"})
    built_by: str = "dataset.py"
    split: tuple = (80, 10, 10)                        # train / validation / test (percent of repo buckets)
    train_cutoff: str | None = None                    # Section 2.4 windows; None => derived from the data
    val_cutoff: str | None = None
    train_tiers: tuple = ("GOLD", "SILVER")            # BRONZE excluded: Phase 7 Section 1 says GOLD/SILVER
    hard_case_types: tuple = ("disagreement", "contrast_pair", "low_confidence")
    stratum_fn: Callable[[dict], str] | None = None    # Section 2.5; None => one stratum
    stratum_split: dict = field(default_factory=dict)  # stratum -> (train, val, test) override
    targets: dict = field(default_factory=lambda: {"synthetic_share": {"ceiling": 0.5}})
    benchmark_texts: tuple = ()                        # public-benchmark issue texts (L7)
    benchmark_train_ok: bool = False                   # keep benchmark overlaps in Training? (PS-4 decides)
    change_summary: str = "initial build"


@dataclass
class BuildResult:
    datasets: dict
    dropped: list                                      # [(example_id, reason)]
    exceptions: list                                   # cluster/sibling overrides of repo-level assignment
    repo_split: dict                                   # repo -> dataset id (derived artifact, Section 2.6)
    cutoffs: dict


# ================================================================== record wrapping (5.1)
def make_record(ex: dict, dataset_id: str, version: str, method: str, reason: dict | None = None,
                history: list | None = None) -> dict:
    rec = copy.deepcopy(ex)
    rec.pop("curation", None)
    rec.pop("annotation_summary", None)
    rec["dataset_assignment"] = {
        "dataset_id": dataset_id, "dataset_version": version, "split_assignment_method": method,
        "inclusion_reason": None if reason is None else {
            "type": reason.get("type"), "detail": reason.get("detail"),
            "failure_mode_targeted": reason.get("failure_mode_targeted"),
            "source_model_version": reason.get("source_model_version")},
        "relocation_history": history or [],
    }
    return rec


def validate_dataset_record(rec: dict) -> list[str]:
    """D1 / D7 / D13 for a single stored record."""
    errors = [f"example: {e}" for e in validate_example(rec)]
    da = rec.get("dataset_assignment")
    if not isinstance(da, dict):
        return errors + ["assignment: dataset_assignment missing"]
    ds = da.get("dataset_id")
    if ds not in DATASET_IDS:
        errors.append(f"assignment: dataset_id={ds!r} unknown")
        return errors
    if da.get("split_assignment_method") not in ASSIGNMENT_METHODS:
        errors.append("assignment: split_assignment_method invalid")
    if not (isinstance(da.get("dataset_version"), str) and da["dataset_version"]):
        errors.append("assignment: dataset_version missing")
    if not isinstance(da.get("relocation_history"), list):
        errors.append("assignment: relocation_history must be a list")
    reason = da.get("inclusion_reason")
    if ds in CURATED:
        if not isinstance(reason, dict) or reason.get("type") not in INCLUSION_TYPES:
            errors.append(f"assignment: {ds} needs inclusion_reason.type from {sorted(INCLUSION_TYPES)}")
        else:
            t = reason["type"]
            if ds == "hard_case" and t not in HARD_CASE_TYPES:
                errors.append(f"assignment: hard_case reason type {t!r} not allowed")
            if ds == "adversarial":
                if t != "failure_mode_probe":
                    errors.append("assignment: adversarial reason type must be failure_mode_probe")
                if reason.get("failure_mode_targeted") not in FAILURE_MODES:       # D13
                    errors.append(f"assignment: failure_mode_targeted={reason.get('failure_mode_targeted')!r} not in registry")
                if _safe_method(rec) != "SYNTHETIC":
                    errors.append("assignment: adversarial records must be SYNTHETIC (ER-8)")
            if ds == "regression":
                if t != "prior_model_failure" or not reason.get("source_model_version"):
                    errors.append("assignment: regression needs type prior_model_failure and source_model_version")
                if not da.get("relocation_history"):
                    errors.append("assignment: regression record needs relocation_history")
    elif reason is not None:
        errors.append(f"assignment: {ds} must have inclusion_reason null")
    if ds in ("validation", "test"):                                               # D7
        if _safe_method(rec) == "SYNTHETIC":
            errors.append(f"assignment: SYNTHETIC not allowed in {ds}")
        if (rec.get("quality_status") or {}).get("tier") != "GOLD":
            errors.append(f"assignment: {ds} is GOLD-only")
    return errors


def _safe_method(rec: dict) -> Any:
    return (rec.get("label_provenance") or {}).get("labeling_method")


# ================================================================== assignment (Sections 1-2)
def _bucket(key: str, salt: str) -> int:
    return int(hashlib.sha256(f"{salt}|{key}".encode()).hexdigest()[:8], 16) % 100


def _target_for(bucket: int, split: tuple) -> str:
    tr, va, _ = split
    return "training" if bucket < tr else "validation" if bucket < tr + va else "test"


def _hard_reason(ex: dict, types: tuple) -> dict | None:
    cur = ex.get("curation") or {}
    if cur.get("inclusion_type") == "contrast_pair" and "contrast_pair" in types:
        return {"type": "contrast_pair", "detail": cur.get("detail")}
    status = (ex.get("annotation_summary") or {}).get("agreement_status")
    if "disagreement" in types and status in ("disagreed", "adjudicated"):
        return {"type": "disagreement", "detail": f"agreement_status={status}"}
    unc = ex["ground_truth"].get("uncertainty", {}).get("uncertain_information") or []
    if "low_confidence" in types and unc:
        return {"type": "low_confidence", "detail": f"{len(unc)} uncertain field(s)"}
    return None


def _adversarial_reason(ex: dict) -> dict | None:
    cur = ex.get("curation") or {}
    if cur.get("inclusion_type") == "failure_mode_probe":
        return {"type": "failure_mode_probe", "detail": cur.get("detail"),
                "failure_mode_targeted": cur.get("failure_mode_targeted")}
    return None


def build_datasets(examples: list[dict], cfg: BuildConfig, version: str = "0.0.0") -> BuildResult:
    if sum(cfg.split) != 100 or len(cfg.split) != 3:
        raise ValueError("split must be three integers summing to 100")
    dropped: list[tuple[str, str]] = []
    exceptions: list[dict] = []

    # -- 0. validity, rejection, duplicate example_ids
    usable, seen = [], set()
    for ex in examples:
        eid = ex.get("example_id", "?") if isinstance(ex, dict) else "?"
        errs = validate_example(ex)
        if errs:
            dropped.append((eid, f"invalid: {errs[0]}"))
        elif ex["quality_status"]["tier"] == "REJECTED":
            dropped.append((eid, "rejected"))
        elif eid in seen:
            dropped.append((eid, "duplicate example_id"))
        else:
            seen.add(eid)
            usable.append(ex)

    # -- 1. issue units: same source issue (tier siblings, 2.3) or same near-dup cluster (2.2)
    uf = UnionFind()
    for ex in usable:
        uf.union(f"i:{_url(ex)}", f"e:{ex['example_id']}")
        for c in _clusters(ex):
            uf.union(f"c:{c}", f"e:{ex['example_id']}")
    unit_of = {ex["example_id"]: uf.find(f"e:{ex['example_id']}") for ex in usable}
    units: dict[str, list[dict]] = defaultdict(list)
    for ex in usable:
        units[unit_of[ex["example_id"]]].append(ex)

    # -- 2. curated units (Section 2.7): adversarial > hard_case; carved out of the pool wholesale
    datasets: dict[str, list[dict]] = {d: [] for d in DATASET_IDS}
    pool_units: dict[str, list[dict]] = {}
    for uid, members in units.items():
        adv = [(m, _adversarial_reason(m)) for m in members]
        hard = [(m, _hard_reason(m, cfg.hard_case_types)) for m in members]
        if any(r for _, r in adv):
            target, picked = "adversarial", adv
        elif any(r for _, r in hard):
            target, picked = "hard_case", hard
        else:
            pool_units[uid] = members
            continue
        for m, r in picked:
            if r is None:                     # sibling with no reason of its own: safe to drop, never to leak
                dropped.append((m["example_id"], f"sibling of a {target} unit without its own inclusion reason"))
            else:
                datasets[target].append(make_record(m, target, version, "curated", r))

    # -- 3. repo groups over the remaining units (repos linked through shared clusters go together)
    ruf = UnionFind()
    for members in pool_units.values():
        repos = sorted({_repo(m) for m in members})
        for r in repos:
            ruf.find(f"r:{r}")
        for r in repos[1:]:
            ruf.union(f"r:{repos[0]}", f"r:{r}")
    group_repos: dict[str, set[str]] = defaultdict(set)
    for members in pool_units.values():
        for m in members:
            group_repos[ruf.find(f"r:{_repo(m)}")].add(_repo(m))

    pool = [m for ms in pool_units.values() for m in ms]
    strat_fn = cfg.stratum_fn or (lambda ex: "all")
    group_stratum: dict[str, str] = {}
    for g in group_repos:
        counts = Counter(strat_fn(m) for m in pool if ruf.find(f"r:{_repo(m)}") == g)
        group_stratum[g] = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
    group_target: dict[str, str] = {}
    for g in group_repos:
        split = tuple(cfg.stratum_split.get(group_stratum[g], cfg.split))
        group_target[g] = _target_for(_bucket(g.removeprefix("r:"), cfg.split_salt), split)
    repo_split = {}
    for g, repos in group_repos.items():
        for r in repos:
            repo_split[r] = group_target[g]
            split = tuple(cfg.stratum_split.get(group_stratum[g], cfg.split))
            own = _target_for(_bucket(r, cfg.split_salt), split)
            if own != group_target[g]:
                exceptions.append({"repo": r, "own_bucket_split": own, "assigned": group_target[g],
                                   "reason": "near-duplicate cluster override (2.2)"})

    # -- 4. temporal windows (2.4)
    cutoffs = _cutoffs(pool, cfg)
    tc, vc = _ts(cutoffs["train"]) if cutoffs["train"] else None, _ts(cutoffs["val"]) if cutoffs["val"] else None

    def window(ts: datetime) -> str:
        return "training" if tc is None or ts <= tc else "validation" if ts <= vc else "test"

    bench = list(cfg.benchmark_texts)
    for ex in pool:
        eid, tgt = ex["example_id"], group_target[ruf.find(f"r:{_repo(ex)}")]
        if window(_ts(_snap(ex))) != tgt:
            dropped.append((eid, f"outside {tgt} time window"))
            continue
        if tgt == "training":
            if ex["quality_status"]["tier"] not in cfg.train_tiers:
                dropped.append((eid, f"tier {ex['quality_status']['tier']} not in train_tiers"))
                continue
        elif ex["quality_status"]["tier"] != "GOLD" or _method(ex) == "SYNTHETIC":
            dropped.append((eid, f"non-GOLD example in {tgt} repo (eval is GOLD-only)"))
            continue
        if bench and clean.leakage_findings([("issue", _issue_text(ex))], bench, clean.CleanConfig()):
            if tgt != "training" or not cfg.benchmark_train_ok:
                dropped.append((eid, "benchmark_overlap"))          # L7 routes it out immediately
                continue
        datasets[tgt].append(make_record(ex, tgt, version, "hash_bucket"))

    for d in DATASET_IDS:
        datasets[d].sort(key=lambda r: r["example_id"])
    return BuildResult(datasets, dropped, exceptions, dict(sorted(repo_split.items())), cutoffs)


def _cutoffs(pool: list[dict], cfg: BuildConfig) -> dict:
    """Explicit cutoffs win; otherwise quantiles of the pool's snapshot times (deterministic)."""
    if cfg.train_cutoff and cfg.val_cutoff:
        return {"train": cfg.train_cutoff, "val": cfg.val_cutoff, "derived": False}
    if not pool:
        return {"train": None, "val": None, "derived": True}
    times = sorted(_ts(_snap(m)) for m in pool)
    n, (tr, va, _) = len(times), cfg.split
    t = times[min(n - 1, max(0, n * tr // 100 - 1))]
    v = times[min(n - 1, max(0, n * (tr + va) // 100 - 1))]
    fmt = lambda d: d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"train": cfg.train_cutoff or fmt(t), "val": cfg.val_cutoff or fmt(v), "derived": True}


# ================================================================== leakage tests (Section 4)
def check_leakage(datasets: dict, benchmark_texts: tuple = (), allow_training_overlap: bool = False) -> dict[str, list[str]]:
    """Every finding is a string; an empty list means the test passes. Any finding blocks publication."""
    out: dict[str, list[str]] = {k: [] for k in LEAKAGE_TESTS}
    recs = [(d, r) for d in DATASET_IDS for r in datasets.get(d, [])]

    # L1 -- repo disjointness across training/validation/test
    repos = {d: {_repo(r) for r in datasets.get(d, [])} for d in POOL}
    for a, b in combinations(POOL, 2):
        for repo in sorted(repos[a] & repos[b]):
            out["L1"].append(f"repo {repo} appears in {a} and {b}")

    def cross(key: Callable[[dict], list[str]], label: str, test: str, min_datasets: int = 2):
        where: dict[str, set[str]] = defaultdict(set)
        for d, r in recs:
            for k in key(r):
                where[k].add(d)
        for k, ds in sorted(where.items()):
            if len(ds) >= min_datasets:
                out[test].append(f"{label} {k} spans {sorted(ds)}")

    cross(lambda r: [_url(r)], "issue", "L2")                                        # L2
    cross(lambda r: [_issue_hash(r)], "exact-duplicate text", "L3")                  # L3
    cross(_clusters, "dedup cluster", "L4")                                          # L4

    # L5 -- strict temporal ordering: train < validation < test
    def span(d):
        ts = [_ts(_snap(r)) for r in datasets.get(d, [])]
        return (min(ts), max(ts)) if ts else None
    tr, va, te = span("training"), span("validation"), span("test")
    if tr and va and va[0] <= tr[1]:
        out["L5"].append("a validation record is not later than the latest training record")
    if tr and te and te[0] <= tr[1]:
        out["L5"].append("a test record is not later than the latest training record")
    if va and te and te[0] <= va[1]:
        out["L5"].append("a test record is not later than the latest validation record")

    # L6 -- tier siblings in one dataset, and tier-boundary re-check
    variants: dict[str, dict[int, set[str]]] = defaultdict(lambda: defaultdict(set))
    for d, r in recs:
        variants[_url(r)][_tier(r)].add(d)
        for e in _check_input(r["input"], r["ground_truth"]):
            if e.startswith("tier:"):
                out["L6"].append(f"{r['example_id']}: {e}")
    for url, by_tier in sorted(variants.items()):
        if len(by_tier) > 1:
            ds = set().union(*by_tier.values())
            if len(ds) > 1:
                out["L6"].append(f"context-tier variants of {url} split across {sorted(ds)}")

    # L7 -- benchmark contamination (Test/Validation are hard failures; Training only if not allowed)
    if benchmark_texts:
        for d, r in recs:
            if allow_training_overlap and d == "training":
                continue
            if clean.leakage_findings([("issue", _issue_text(r))], list(benchmark_texts), clean.CleanConfig()):
                out["L7"].append(f"{r['example_id']} in {d} overlaps a public benchmark")
    return out


def leakage_summary(findings: dict, checked_at: str | None = None) -> dict:
    s = {k: ("pass" if not v else "fail") for k, v in findings.items()}
    s["checked_at"] = checked_at or _now()
    return s


# ================================================================== statistics (Section 3, 5.2)
def _dist(counter: Counter) -> dict:
    total = sum(counter.values()) or 1
    return {k: {"count": v, "share": round(v / total, 4)} for k, v in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))}


def _open_set(records: list[dict], field_name: str, top_n: int = 10) -> dict:
    c = Counter(v for r in records for v in (r["ground_truth"]["task"].get(field_name) or []))
    return {"top_n": [[k, n] for k, n in c.most_common(top_n)], "distinct_count": len(c)}


def dataset_statistics(records: list[dict], targets: dict | None = None, top_n: int = 10) -> dict:
    targets = targets or {}
    tasks = [r["ground_truth"]["task"] for r in records]
    by_repo = Counter(_repo(r) for r in records)
    n = len(records)
    label = {f: _dist(Counter(t.get(f, "Unknown") for t in tasks)) for f in ("role", "experience_level", "complexity", "task_type")}
    label.update({f: _open_set(records, f, top_n) for f in ("technologies", "languages", "frameworks")})
    label["repo_type"] = _dist(Counter((r.get("corpus_meta") or {}).get("repo_type", "unlabeled") for r in records))
    label["domain"] = _dist(Counter((r.get("corpus_meta") or {}).get("domain", "unlabeled") for r in records))
    label["context_tier"] = _dist(Counter(_tier(r) for r in records))
    iaa = [r["label_provenance"]["inter_annotator_agreement"] for r in records
           if isinstance(r["label_provenance"].get("inter_annotator_agreement"), (int, float))]
    prov = Counter(p.get("source") for r in records for p in r["ground_truth"]["provenance"].values())
    stats = {
        "volume": {"total": n, "by_context_tier": dict(Counter(_tier(r) for r in records)),
                   "by_repo": {"top_n": by_repo.most_common(top_n),
                               "long_tail_summary": {"distinct_repos": len(by_repo),
                                                     "repos_outside_top_n": max(0, len(by_repo) - top_n)}}},
        "label_distribution": label,
        "provenance": {
            "labeling_method": dict(Counter(_method(r) for r in records)),
            "quality_tier": dict(Counter(r["quality_status"]["tier"] for r in records)),
            "inter_annotator_agreement": {"mean": round(sum(iaa) / len(iaa), 4) if iaa else None, "by_field_category": {}},
            "provenance_source": dict(prov)},
    }
    stats["balance_verdict"] = balance_verdict(records, stats, targets)
    return stats


BALANCE_AXES = ("role", "experience_level", "complexity", "task_type", "languages", "frameworks",
                "domain", "repo_type", "context_tier", "repo_share", "synthetic_share")


def _shares(records: list[dict], axis: str) -> dict[str, float]:
    n = len(records) or 1
    if axis in ("role", "experience_level", "complexity", "task_type"):
        c = Counter(r["ground_truth"]["task"].get(axis, "Unknown") for r in records)
    elif axis in ("languages", "frameworks"):
        c = Counter(v for r in records for v in (r["ground_truth"]["task"].get(axis) or []))
    elif axis in ("domain", "repo_type"):
        c = Counter((r.get("corpus_meta") or {}).get(axis, "unlabeled") for r in records)
    elif axis == "context_tier":
        c = Counter(str(_tier(r)) for r in records)
    elif axis == "repo_share":
        c = Counter(_repo(r) for r in records)
    else:
        return {"synthetic": sum(1 for r in records if _method(r) == "SYNTHETIC") / n}
    return {k: v / n for k, v in c.items()}


def balance_verdict(records: list[dict], stats: dict, targets: dict) -> list[dict]:
    """One entry per axis (and per bound when a target is defined). Never silently omitted (D10).
    Floors apply to `targets[axis]["categories"]` (required categories) or, if absent, observed ones."""
    out = []
    for axis in BALANCE_AXES:
        t = targets.get(axis) or {}
        shares = _shares(records, axis)
        if not t or (t.get("floor") is None and t.get("ceiling") is None):
            out.append({"axis": axis, "floor": None, "ceiling": None, "observed": 0.0, "status": "no_target_defined"})
            continue
        if t.get("floor") is not None:
            cats = t.get("categories") or list(shares)
            obs = min((shares.get(c, 0.0) for c in cats), default=0.0)
            out.append({"axis": axis, "floor": t["floor"], "ceiling": None, "observed": round(obs, 4),
                        "status": "pass" if obs >= t["floor"] else "fail"})
        if t.get("ceiling") is not None:
            obs = max(shares.values(), default=0.0)
            out.append({"axis": axis, "floor": None, "ceiling": t["ceiling"], "observed": round(obs, 4),
                        "status": "pass" if obs < t["ceiling"] or (obs == 0.0) else "fail"})
    return out


def quality_metrics(records: list[dict], leakage: dict | None = None) -> dict:
    n = len(records) or 1
    valid = sum(1 for r in records if not validate_example(r))
    hashes = Counter(_issue_hash(r) for r in records)
    dupes = sum(v - 1 for v in hashes.values() if v > 1)
    conf = [r["ground_truth"]["confidence"]["overall_confidence"] for r in records]
    review = sum(1 for r in records if r["ground_truth"]["review"]["review_required"])
    return {"leakage_tests": leakage or {}, "schema_validity_rate": round(valid / n, 4),
            "duplicate_rate": round(dupes / n, 4), "mean_confidence": round(sum(conf) / n, 4),
            "review_required_rate": round(review / n, 4)}


# ================================================================== regression relocation (2.7)
def relocate_to_regression(datasets: dict, example_id: str, source_model_version: str, reason: str,
                           version: str = "0.0.0", at: str | None = None) -> tuple[dict, list[str]]:
    """MOVE (never copy) a record out of test/hard_case/adversarial into regression. Everything
    that shares its issue or near-dup cluster in the same origin dataset moves with it, so L2/L4/L6
    keep holding. Returns (new datasets, moved example_ids)."""
    at = at or _now()
    new = {d: list(rs) for d, rs in datasets.items()}
    origin = next((d for d in ("test", "hard_case", "adversarial") if any(r["example_id"] == example_id for r in new[d])), None)
    if origin is None:
        raise ValueError(f"{example_id} is not in test, hard_case or adversarial (regression is built by relocation only)")
    target = next(r for r in new[origin] if r["example_id"] == example_id)
    urls, clusters = {_url(target)}, set(_clusters(target))
    moving = [r for r in new[origin] if _url(r) in urls or set(_clusters(r)) & clusters]
    ids = {r["example_id"] for r in moving}
    new[origin] = [r for r in new[origin] if r["example_id"] not in ids]
    for r in moving:
        hist = list(r["dataset_assignment"]["relocation_history"]) + [
            {"from_dataset_id": origin, "to_dataset_id": "regression", "relocated_at": at, "reason": reason}]
        new["regression"].append(make_record(
            {k: v for k, v in r.items() if k != "dataset_assignment"}, "regression", version, "relocated",
            {"type": "prior_model_failure", "detail": reason, "source_model_version": source_model_version}, hist))
    new["regression"].sort(key=lambda r: r["example_id"])
    return new, sorted(ids)


# ================================================================== versioning (Section 6)
def bump(version: str, kind: str) -> str:
    major, minor, patch = (int(x) for x in version.split("."))
    return {"major": f"{major + 1}.0.0", "minor": f"{major}.{minor + 1}.0", "patch": f"{major}.{minor}.{patch + 1}"}[kind]


def next_version(dataset_id: str, prev: dict | None, prev_ids: set, new_ids: set, *, content_changed: bool = False,
                 major_reasons: tuple = (), metadata_changed: bool = False) -> tuple[str, str]:
    """(version, kind). kind in {"initial", "none", "patch", "minor", "major"}. Section 6.2."""
    if prev is None:
        return "1.0.0", "initial"
    removed = prev_ids - new_ids
    if removed and dataset_id == "regression":
        raise ValueError("regression is append-only; records may never be removed")
    if removed or major_reasons or (content_changed and dataset_id in POOL):
        return bump(prev["version"], "major"), "major"
    if (new_ids - prev_ids) or content_changed:
        return bump(prev["version"], "minor"), "minor"
    if metadata_changed:
        return bump(prev["version"], "patch"), "patch"
    return prev["version"], "none"


# ================================================================== release (Section 8)
def _schema_versions(records: list[dict]) -> set[str]:
    return {r["ground_truth"]["schema_version"] for r in records}


def _jsonl(records: list[dict]) -> str:
    return "".join(json.dumps(r, sort_keys=True, ensure_ascii=False) + "\n" for r in records)


def load_release(out_dir: str, manifest_name: str = "manifest.json") -> tuple[dict | None, dict]:
    path = os.path.join(out_dir, manifest_name)
    if not os.path.exists(path):
        return None, {d: [] for d in DATASET_IDS}
    with open(path, encoding="utf-8") as f:
        rel = json.load(f)
    ds = {}
    for d in DATASET_IDS:
        entry = rel["datasets"][d]
        with open(os.path.join(out_dir, entry["file"]), encoding="utf-8") as f:
            ds[d] = [json.loads(line) for line in f if line.strip()]
    return rel, ds


def build_release(examples: list[dict], cfg: BuildConfig, release_id: str, *, previous: tuple | None = None,
                  hard: list[dict] | None = None, adversarial_extra: list[dict] | None = None,
                  regression: list[dict] | None = None) -> tuple[dict, dict, BuildResult]:
    """Assemble, test, version and (if every gate passes) describe a release. Does not write files.

    `previous` is (prev_release, prev_datasets) from load_release; it drives version numbers and lets
    prior Regression records (append-only) carry forward. Returns (datasets, release, build_result)."""
    prev_rel, prev_ds = previous if previous else (None, {d: [] for d in DATASET_IDS})
    result = build_datasets(examples, cfg)
    datasets = {d: list(rs) for d, rs in result.datasets.items()}
    datasets["regression"] = sorted(list(prev_ds.get("regression", [])) + list(regression or []),
                                    key=lambda r: r["example_id"])

    built_at = _now()
    leak = check_leakage(datasets, cfg.benchmark_texts, cfg.benchmark_train_ok)
    leak_summary = leakage_summary(leak, built_at)
    entries, changes = {}, {}
    schema_seen = set()
    for d in DATASET_IDS:
        recs = datasets[d]
        schema_seen |= _schema_versions(recs)
    for d in DATASET_IDS:
        recs = datasets[d]
        prev = prev_rel["datasets"][d] if prev_rel else None
        prev_ids = {r["example_id"] for r in prev_ds.get(d, [])}
        new_ids = {r["example_id"] for r in recs}
        prev_sha = {r["example_id"]: _content_sha(r) for r in prev_ds.get(d, [])}
        changed = any(prev_sha.get(r["example_id"], _content_sha(r)) != _content_sha(r) for r in recs)
        reasons = []
        if prev and prev["split_salt"] != cfg.split_salt:
            reasons.append("split_salt changed")
        cur_schema = sorted(_schema_versions(recs))
        if prev and cur_schema and prev["schema_version"][:1].isdigit() and \
                prev["schema_version"].split(".")[0] != cur_schema[0].split(".")[0]:
            reasons.append("schema major version changed")
        version, kind = next_version(d, prev, prev_ids, new_ids, content_changed=changed, major_reasons=tuple(reasons))
        for r in recs:                                    # stamp the final version into each record
            r["dataset_assignment"]["dataset_version"] = version
        versions = sorted(_schema_versions(recs))
        entries[d] = {
            "dataset_id": d, "version": version, "version_change": kind, "source_version": cfg.source_version,
            "annotation_version": cfg.annotation_version,
            "schema_version": versions[0] if len(versions) == 1 else (",".join(versions) or "n/a"),
            "split_salt": cfg.split_salt, "record_count": len(recs),
            "statistics": dataset_statistics(recs, cfg.targets),
            "quality_metrics": quality_metrics(recs, leak_summary),
            "provenance": {"built_at": built_at, "built_by": cfg.built_by,
                           "upstream_snapshots": cfg.upstream_snapshots,
                           "change_summary": cfg.change_summary if kind != "none" else "no change"},
            "file": f"{d}-{version}.jsonl", "sha256": hashlib.sha256(_jsonl(recs).encode()).hexdigest(),
        }
    release = {"release_id": release_id, "released_at": built_at, "datasets": entries,
               "cross_dataset_checks": {"leakage_tests": leak_summary, "validation_tests": {}},
               "file_hashes": {d: entries[d]["sha256"] for d in DATASET_IDS}, "known_issues": []}
    release["cross_dataset_checks"]["validation_tests"] = run_validation_tests(datasets, release, cfg, examples)
    release["known_issues"] = _known_issues(release, result)
    return datasets, release, result


def _known_issues(release: dict, result: BuildResult) -> list[str]:
    issues = []
    for d, e in release["datasets"].items():
        for b in e["statistics"]["balance_verdict"]:
            if b["status"] == "fail":
                issues.append(f"{d}: balance axis {b['axis']} fails (observed {b['observed']})")
    if result.cutoffs.get("derived"):
        issues.append("temporal cutoffs were derived from data quantiles; pass explicit Phase 4 window cutoffs for production")
    return issues


def run_validation_tests(datasets: dict, release: dict, cfg: BuildConfig, examples: list[dict]) -> dict:
    """D1-D14 as far as they are checkable from artifacts. 'not_applicable' = nothing to exercise
    (e.g. no regression records yet); it does not block publication, but is never reported as 'pass'."""
    leak = check_leakage(datasets, cfg.benchmark_texts, cfg.benchmark_train_ok)
    res: dict[str, str] = {}
    P = lambda ok: "pass" if ok else "fail"
    res["D1"] = P(all(not validate_dataset_record(r) for d in DATASET_IDS for r in datasets[d]))
    res["D2"], res["D3"], res["D4"] = P(not leak["L1"]), P(not leak["L2"]), P(not leak["L4"])
    res["D5"], res["D6"] = P(not leak["L6"]), P(not leak["L5"])
    res["D7"] = P(all(_method(r) != "SYNTHETIC" for d in ("validation", "test") for r in datasets[d]))
    a = build_datasets(examples, cfg)
    b = build_datasets(examples, cfg)
    res["D8"] = P(a.repo_split == b.repo_split and _sha(a.datasets) == _sha(b.datasets))
    reg = datasets["regression"]
    res["D9"] = P(all(r["dataset_assignment"]["relocation_history"] and not leak_free_dup(r, datasets) for r in reg)) if reg else "not_applicable"
    axes_present = {b["axis"] for e in release["datasets"].values() for b in e["statistics"]["balance_verdict"]}
    defined = {ax for ax, t in cfg.targets.items() if t and (t.get("floor") is not None or t.get("ceiling") is not None)}
    res["D10"] = P(defined <= axes_present and all(e["statistics"]["balance_verdict"] for e in release["datasets"].values()))
    ident = ("dataset_id", "version", "source_version", "annotation_version", "schema_version", "split_salt",
             "record_count", "statistics", "quality_metrics", "provenance")
    res["D11"] = P(all(all(e.get(k) is not None for k in ident) and
                       (e["record_count"] == 0 or "," not in e["schema_version"]) and
                       all(r["ground_truth"]["schema_version"] == e["schema_version"] for r in datasets[d])
                       for d, e in release["datasets"].items()))
    res["D12"] = "not_applicable"                       # decided at publish time (publish_release)
    res["D13"] = P(all(r["dataset_assignment"]["inclusion_reason"]["failure_mode_targeted"] in FAILURE_MODES
                       for r in datasets["adversarial"])) if datasets["adversarial"] else "not_applicable"
    res["D14"] = P(not any(leak[k] for k in leak)) if reg else "not_applicable"
    return res


def leak_free_dup(rec: dict, datasets: dict) -> bool:
    """True if a regression record's example_id also sits in any other dataset (a copy, not a move)."""
    return any(r["example_id"] == rec["example_id"] for d in DATASET_IDS if d != "regression" for r in datasets[d])


def release_gate(release: dict) -> list[str]:
    """Section 8 publication gate: every check must pass ('not_applicable' is non-blocking)."""
    bad = [f"{k} failed" for k, v in release["cross_dataset_checks"]["leakage_tests"].items() if v == "fail"]
    bad += [f"{k} failed" for k, v in release["cross_dataset_checks"]["validation_tests"].items() if v == "fail"]
    return bad


class PublishError(RuntimeError):
    pass


def publish_release(datasets: dict, release: dict, out_dir: str) -> None:
    """Refuses a release with any failing check (Section 8), and refuses to overwrite an existing
    dataset file with different content (D12 / Section 6.3: published versions are immutable)."""
    problems = release_gate(release)
    if problems:
        raise PublishError("release blocked: " + "; ".join(problems))
    os.makedirs(out_dir, exist_ok=True)
    for d in DATASET_IDS:
        entry = release["datasets"][d]
        path = os.path.join(out_dir, entry["file"])
        text = _jsonl(datasets[d])
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                if f.read() != text:
                    release["cross_dataset_checks"]["validation_tests"]["D12"] = "fail"
                    raise PublishError(f"{entry['file']} already published with different content; bump the version (D12)")
        release["cross_dataset_checks"]["validation_tests"]["D12"] = "pass"
    for d in DATASET_IDS:
        path = os.path.join(out_dir, release["datasets"][d]["file"])
        if not os.path.exists(path):
            with open(path, "w", encoding="utf-8") as f:
                f.write(_jsonl(datasets[d]))
    body = json.dumps(release, indent=2, sort_keys=True, ensure_ascii=False)
    for name in (f"manifest-{release['release_id']}.json", "manifest.json"):
        with open(os.path.join(out_dir, name), "w", encoding="utf-8") as f:
            f.write(body)


def verify_release(out_dir: str, benchmark_texts: tuple = ()) -> list[str]:
    """Re-check a written release from disk: file hashes, per-record validity, L1-L7."""
    rel, ds = load_release(out_dir)
    if rel is None:
        return ["no manifest.json"]
    problems = []
    for d in DATASET_IDS:
        e = rel["datasets"][d]
        with open(os.path.join(out_dir, e["file"]), encoding="utf-8") as f:
            if hashlib.sha256(f.read().encode()).hexdigest() != e["sha256"]:
                problems.append(f"{e['file']}: sha256 mismatch")
        for r in ds[d]:
            problems += [f"{r.get('example_id')}: {x}" for x in validate_dataset_record(r)]
    for k, v in check_leakage(ds, benchmark_texts).items():
        problems += [f"{k}: {x}" for x in v]
    return problems


# ================================================================== CLI
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Build or verify an ITU-1 dataset release (Phase 7).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="examples.jsonl -> six datasets + manifest")
    b.add_argument("examples")
    b.add_argument("out_dir")
    b.add_argument("--salt", required=True, help="split_salt (changing it is a MAJOR version event)")
    b.add_argument("--release-id", required=True)
    b.add_argument("--source-version", default="unversioned")
    b.add_argument("--annotation-version", default="unversioned")
    b.add_argument("--train-cutoff")
    b.add_argument("--val-cutoff")
    b.add_argument("--benchmarks", help="JSONL of {'text': ...} public-benchmark issues (L7)")
    b.add_argument("--change-summary", default="build")
    v = sub.add_parser("verify", help="re-check a written release from disk")
    v.add_argument("out_dir")
    args = ap.parse_args(argv)

    if args.cmd == "verify":
        problems = verify_release(args.out_dir)
        print("OK" if not problems else "\n".join(problems))
        return 1 if problems else 0

    with open(args.examples, encoding="utf-8") as f:
        examples = [json.loads(line) for line in f if line.strip()]
    bench = ()
    if args.benchmarks:
        with open(args.benchmarks, encoding="utf-8") as f:
            bench = tuple(json.loads(line)["text"] for line in f if line.strip())
    cfg = BuildConfig(split_salt=args.salt, source_version=args.source_version,
                      annotation_version=args.annotation_version, train_cutoff=args.train_cutoff,
                      val_cutoff=args.val_cutoff, benchmark_texts=bench, change_summary=args.change_summary)
    previous = load_release(args.out_dir)
    datasets, release, result = build_release(examples, cfg, args.release_id,
                                              previous=previous if previous[0] else None)
    for d in DATASET_IDS:
        print(f"{d:12s} {release['datasets'][d]['version']:8s} {len(datasets[d]):5d} records")
    print(f"dropped: {len(result.dropped)}  overrides: {len(result.exceptions)}")
    for eid, why in result.dropped[:20]:
        print(f"  drop {eid}: {why}")
    try:
        publish_release(datasets, release, args.out_dir)
    except PublishError as e:
        print(f"NOT PUBLISHED: {e}", file=sys.stderr)
        return 1
    print(f"published {args.release_id} -> {args.out_dir}")
    for issue in release["known_issues"]:
        print("  known issue:", issue)
    return 0


if __name__ == "__main__":
    sys.exit(main())
