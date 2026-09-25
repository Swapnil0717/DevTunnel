"""
ITU-1 -- Step 3: TrainingExample (Phase 3, Section 1.3 and 6.5)

    {example_id, input, ground_truth, label_provenance, quality_status}

    input             what the model sees (issue + context tier + context)
    ground_truth      a full Phase 2 record (validated with schema + derived rules)
    label_provenance  DATA provenance (who labeled it, source, licence). Never
                      shown to the model; separate from per-field provenance.
    quality_status    GOLD | SILVER | BRONZE | REJECTED + flags

Public API:
    validate_example(ex) -> list[str]
    model_input(ex)      -> dict   (exactly what the model receives)
    eligible_uses(ex)    -> set[str]  subset of {"train", "eval"}
"""

from __future__ import annotations

import re
from typing import Any

from derived import validate_all

LABELING_METHODS = {
    "HUMAN_EXPERT", "ADJUDICATED_MULTI_ANNOTATOR",
    "MODEL_ASSISTED_HUMAN_CORRECTED", "SYNTHETIC",
}
QUALITY_TIERS = {"GOLD", "SILVER", "BRONZE", "REJECTED"}

# Lowest context tier at which each context field may appear (IR-3 / Q-CTX).
# Tier 7 (project conventions) has no field in the Phase 3 shape yet.
CONTEXT_FIELD_MIN_TIER = {
    "repo_structure": 2, "readme": 2,
    "source_excerpts": 3, "config": 3,
    "docs": 4,
    "dependency_graph": 5,
    "related_prs": 6, "commit_history": 6,
}
REQUIRED_TOP = ("input", "ground_truth", "label_provenance", "quality_status")
PROVENANCE_STR_FIELDS = ("source_repo", "source_issue_url", "snapshot_fetched_at",
                         "license", "labeled_at", "labeling_tool_version")


def _blank(x: Any) -> bool:
    if isinstance(x, (list, tuple)):
        return all(_blank(i) for i in x)
    if isinstance(x, dict):
        return all(_blank(v) for v in x.values())
    return x is None or (isinstance(x, str) and not x.strip())


def _strings(x: Any):
    if isinstance(x, str):
        yield x
    elif isinstance(x, dict):
        for v in x.values():
            yield from _strings(v)
    elif isinstance(x, (list, tuple)):
        for v in x:
            yield from _strings(v)


def _closing_pattern(repo: str, number: int) -> re.Pattern:
    n = re.escape(str(number))
    r = re.escape(repo)
    target = rf"(?:#{n}|{r}#{n}|https?://github\.com/{r}/issues/{n})(?!\d)"
    return re.compile(rf"(?i)\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+{target}")


def validate_example(ex: dict) -> list[str]:
    if not isinstance(ex, dict):
        return ["example must be an object"]
    errors = [f"structure: missing '{k}'" for k in REQUIRED_TOP if k not in ex]
    if "example_id" not in ex:
        errors.append("structure: missing 'example_id'")
    if errors:
        return errors

    inp, gt, lp, qs = ex["input"], ex["ground_truth"], ex["label_provenance"], ex["quality_status"]
    for name, part in (("input", inp), ("label_provenance", lp), ("quality_status", qs)):
        if not isinstance(part, dict):
            return [f"structure: '{name}' must be an object"]

    errors += _check_input(inp, gt)
    errors += [f"ground_truth: {e}" for e in validate_all(gt)]
    errors += _check_label_provenance(lp, gt)
    errors += _check_quality(qs, lp)
    return errors


# ---------------------------------------------------------------- input
def _check_input(inp: dict, gt: dict) -> list[str]:
    errors: list[str] = []
    issue = inp.get("issue")
    if not (isinstance(issue, dict) and isinstance(issue.get("title"), str)
            and isinstance(issue.get("body"), str)
            and isinstance(issue.get("labels"), list)
            and isinstance(issue.get("comments"), list)):
        errors.append("structure: input.issue needs title, body, labels[], comments[]")
    tier = inp.get("context_tier")
    if isinstance(tier, bool) or tier not in range(1, 8):
        errors.append(f"structure: input.context_tier={tier!r} must be an integer 1-7")
        return errors

    ctx = inp.get("available_context") or {}
    if not isinstance(ctx, dict):
        return errors + ["structure: input.available_context must be an object or null"]
    for field, value in ctx.items():
        if field not in CONTEXT_FIELD_MIN_TIER:
            if not _blank(value):
                errors.append(f"tier: unknown context field '{field}' (Tier 7 conventions have no field yet)")
            continue
        if _blank(value):
            continue                      # empty == not provided
        need = CONTEXT_FIELD_MIN_TIER[field]
        if need > tier:
            errors.append(f"tier: '{field}' needs Tier {need} but example declares Tier {tier} (IR-3)")

    # Leakage: PR / commit text that closes THIS issue must never be model input (ER-5, CP-4).
    try:
        src = gt["task_identity"]["source_issue"]
        pat = _closing_pattern(src["repo"], src["issue_number"])
    except (KeyError, TypeError):
        pat = None
    if pat is not None:
        for field in ("related_prs", "commit_history"):
            if any(pat.search(s) for s in _strings(ctx.get(field))):
                errors.append(f"leakage: {field} text closes/fixes this issue (ER-5)")
    return errors


# ---------------------------------------------------------------- label provenance
def _check_label_provenance(lp: dict, gt: dict) -> list[str]:
    errors: list[str] = []
    method = lp.get("labeling_method")
    if method not in LABELING_METHODS:
        errors.append(f"label: labeling_method={method!r} invalid")
    for f in PROVENANCE_STR_FIELDS:
        if not (isinstance(lp.get(f), str) and lp[f].strip()):
            errors.append(f"label: label_provenance.{f} must be a non-empty string")

    ids = lp.get("annotator_ids")
    if method in LABELING_METHODS - {"SYNTHETIC"}:
        if not (isinstance(ids, list) and ids and all(isinstance(i, str) and i for i in ids)):
            errors.append(f"label: {method} must name its annotator_ids")
    if method == "ADJUDICATED_MULTI_ANNOTATOR":
        iaa = lp.get("inter_annotator_agreement")
        if isinstance(iaa, bool) or not isinstance(iaa, (int, float)) or not 0 <= iaa <= 1:
            errors.append("label: adjudicated labels need inter_annotator_agreement in [0, 1] (Q-AGREE)")

    try:
        src = gt["task_identity"]["source_issue"]
        if src["issue_url"] != lp.get("source_issue_url"):
            errors.append("label: ground_truth issue_url != label_provenance.source_issue_url")
        if src["repo"] != lp.get("source_repo"):
            errors.append("label: ground_truth repo != label_provenance.source_repo")
        if src["snapshot_fetched_at"] != lp.get("snapshot_fetched_at"):
            errors.append("label: ground_truth snapshot_fetched_at != label_provenance.snapshot_fetched_at")
    except (KeyError, TypeError):
        pass  # ground_truth structure errors are reported by validate_all
    return errors


# ---------------------------------------------------------------- quality
def _check_quality(qs: dict, lp: dict) -> list[str]:
    errors: list[str] = []
    tier = qs.get("tier")
    if tier not in QUALITY_TIERS:
        errors.append(f"quality: tier={tier!r} invalid")
        return errors
    flags = qs.get("quality_flags")
    if not (isinstance(flags, list) and all(isinstance(f, str) for f in flags)):
        errors.append("quality: quality_flags must be a list of strings")
        flags = []

    method = lp.get("labeling_method")
    if tier == "GOLD":
        if method == "SYNTHETIC":
            errors.append("quality: SYNTHETIC examples can never be GOLD (ER-8)")
        if method == "MODEL_ASSISTED_HUMAN_CORRECTED":
            errors.append("quality: MODEL_ASSISTED_HUMAN_CORRECTED is SILVER at best")
        if method == "HUMAN_EXPERT":
            ids = lp.get("annotator_ids") or []
            if len(ids) < 2 and not qs.get("reviewed_by"):
                errors.append("quality: single-annotator GOLD needs a second reviewer (reviewed_by), else SILVER")
        if flags:
            errors.append("quality: GOLD may not carry unresolved quality_flags")
    if "unidentified_language" in flags and tier != "REJECTED":
        errors.append("quality: unidentified_language must be REJECTED (Q-LANG)")
    return errors


# ---------------------------------------------------------------- helpers
def model_input(ex: dict) -> dict:
    """Exactly what the model receives: issue, tier, non-empty context. No labels, no metadata."""
    inp = ex["input"]
    ctx = {k: v for k, v in (inp.get("available_context") or {}).items() if not _blank(v)}
    return {
        "issue": inp["issue"],
        "context_tier": inp["context_tier"],
        "available_context": ctx,
    }


def eligible_uses(ex: dict) -> set[str]:
    """GOLD -> train+eval, SILVER/BRONZE -> train, REJECTED -> nothing. Invalid examples -> nothing."""
    if validate_example(ex):
        return set()
    return {
        "GOLD": {"train", "eval"},
        "SILVER": {"train"},
        "BRONZE": {"train"},
        "REJECTED": set(),
    }[ex["quality_status"]["tier"]]
