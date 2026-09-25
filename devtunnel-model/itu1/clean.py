"""
ITU-1 -- Step 5: cleaning & normalization (Phase 5)

    CollectedRecord (immutable) --clean()--> CleanedRecord = CollectedRecord + record["cleaning"]

record["cleaning"] holds
    cleaned_view       typed spans + repaired/redacted/pseudonymized text (additive; source is never edited)
    normalized_terms   sidecar of canonical term forms, each with a span_ref into the RAW text
    transformation_log every edit, individually auditable (Section 1.3)
    dedup              refined fingerprint result (template-free, trace-normalized)

Stages implemented:  C1 parse . C2 repair (unclosed fence, table pipes) . C3 redaction +
mention pseudonymization . C4 lossless noise strip . C5 normalization . C6 refined dedup .
C7 leakage + contamination . C8 gates.

NOT implemented (say so, do not fake): contradiction detection (Section 6), real-name
detection (needs NER), repo-topic canonicalization, human spot-audit (HUMAN_REVIEWED tag
can only be set by a person), table repair beyond a missing trailing pipe.

Judgement calls where the spec is silent are marked  # DECISION.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

import intake
import sensitive
from intake import CorpusIndex, exact_hash, normalize_for_hash, simhash64, source_hash

TOOL_VERSION = "itu1-clean-0.1"
ALIAS_TABLE_VERSION = "aliases-0.1"
ACCEPTED_INPUT_STAGES = {"READY_FOR_LABELING", "REDACTION_HELD", "EVAL_RESERVED"}
PROVENANCE_TAGS = {"EXPLICIT", "MODEL_INFERRED", "HUMAN_REVIEWED", "UNKNOWN"}


class SourceMutationError(RuntimeError):
    """Raised when input_core/context_bundle differ from the Phase 4 original (V13).
    This fails the pipeline run, not just the record."""


@dataclass
class CleanConfig:
    near_dup_max_hamming: int = 8
    redaction_floor: float = sensitive.REDACTION_CONFIDENCE_FLOOR
    benchmark_simhashes: tuple = ()
    eval_simhashes: tuple = ()
    quarantine_texts: tuple = ()          # extra Tier-6 texts from the separate quarantine store
    leak_min_shingles: int = 8            # DECISION: placeholder thresholds for quote/paste leakage
    leak_containment: float = 0.6
    minimal_body_chars: int = 20


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# =====================================================================================
# C1 -- structural parsing
# =====================================================================================
_FENCE_OPEN = re.compile(r"^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)")
_TRACE_LINE = re.compile(
    r"""^(?:\s+at\s+\S.*                                   # java / js frames
        |\s*File\ ".*",\ line\ \d+.*                       # python frames
        |Traceback\ \(most\ recent\ call\ last\):.*
        |\s*(?:Caused\ by:|Exception\ in\ thread).*)$""", re.X)
_ERROR_LINE = re.compile(r"^\s*[\w.$]*(?:Error|Exception)\b.*")
_LOG_LINE = re.compile(r"^\s*(?:\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}|(?:INFO|WARN|WARNING|ERROR|DEBUG|TRACE)\b)")


def _lines(text: str):
    pos = 0
    for ln in text.splitlines(keepends=True):
        yield pos, pos + len(ln), ln
        pos += len(ln)


def segment(text: str) -> list[dict]:
    """Partition `text` into typed spans that cover it exactly.
    Types: prose | fenced_code | stack_trace | log."""
    spans: list[dict] = []
    lines = list(_lines(text))
    i = 0

    def add(kind, s, e, **extra):
        if s < e:
            if spans and spans[-1]["type"] == kind == "prose":
                spans[-1]["end"] = e
            else:
                spans.append({"type": kind, "start": s, "end": e, **extra})

    while i < len(lines):
        s, e, ln = lines[i]
        m = _FENCE_OPEN.match(ln)
        if m:
            marker, lang = m.group(1), m.group(2)
            j, closed = i + 1, False
            while j < len(lines):
                stripped = lines[j][2].strip()
                if stripped.startswith(marker[0] * len(marker)) and set(stripped) == {marker[0]}:
                    closed = True
                    break
                j += 1
            end = lines[j][1] if closed else len(text)
            add("fenced_code", s, end, lang=lang or None, closed=closed, marker=marker)
            i = j + 1 if closed else len(lines)
            continue
        if _TRACE_LINE.match(ln.rstrip("\n")) or (_LOG_LINE.match(ln)):
            kind = "stack_trace" if _TRACE_LINE.match(ln.rstrip("\n")) else "log"
            j = i
            while j < len(lines):
                l2 = lines[j][2].rstrip("\n")
                if kind == "stack_trace" and (_TRACE_LINE.match(l2) or (j > i and l2.startswith("    ") and
                                              _TRACE_LINE.match(lines[j - 1][2].rstrip("\n")) and
                                              lines[j - 1][2].lstrip().startswith("File"))):
                    j += 1
                elif kind == "log" and _LOG_LINE.match(l2):
                    j += 1
                else:
                    break
            run = j - i
            if kind == "stack_trace" and run >= 2:
                # pull in the error line just before the trace and just after a python traceback
                start = s
                if spans and spans[-1]["type"] == "prose":
                    prev = lines[i - 1] if i > 0 else None
                    if prev and _ERROR_LINE.match(prev[2]):
                        spans[-1]["end"] = prev[0]
                        if spans[-1]["start"] >= spans[-1]["end"]:
                            spans.pop()
                        start = prev[0]
                end_line = j
                if j < len(lines) and _ERROR_LINE.match(lines[j][2]) and lines[i][2].startswith("Traceback"):
                    end_line = j + 1
                add("stack_trace", start, lines[end_line - 1][1])
                i = end_line
                continue
            if kind == "log" and run >= 3:
                add("log", s, lines[j - 1][1])
                i = j
                continue
        add("prose", s, e)
        i += 1
    if not spans and text:
        spans.append({"type": "prose", "start": 0, "end": len(text)})
    return spans


def spans_cover(text: str, spans: list[dict]) -> bool:
    pos = 0
    for sp in spans:
        if sp["start"] != pos or sp["end"] <= sp["start"]:
            return False
        pos = sp["end"]
    return pos == len(text)


_INLINE_CODE = re.compile(r"`[^`\n]+`")
_URL = re.compile(r"https?://[^\s)>\]]+")
_MENTION = re.compile(r"`[^`\n]*`|(?<![\w/@.])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))(?![\w/-])")


# =====================================================================================
# edit helper: every text change goes through here and is logged
# =====================================================================================
@dataclass
class Edit:
    start: int
    end: int
    replacement: str
    action: str
    tag: str


class Log:
    def __init__(self, cid: str, ts: str):
        self.cid, self.ts, self.entries = cid, ts, []

    def add(self, stage, action, before, after, tag, detail=None):
        assert tag in PROVENANCE_TAGS
        e = {"collection_id": self.cid, "stage": stage, "action": action, "before_span_ref": before,
             "after_span_ref": after, "provenance_tag": tag, "timestamp": self.ts, "tool_version": TOOL_VERSION}
        if detail:
            e["detail"] = detail
        self.entries.append(e)


def apply_edits(text: str, edits: list[Edit], field_ref: str, stage: str, log: Log) -> str:
    out, cursor, shift = [], 0, 0
    for ed in sorted(edits, key=lambda x: x.start):
        if ed.start < cursor:
            continue                                   # overlapping edit: keep the earlier one
        out.append(text[cursor:ed.start])
        out.append(ed.replacement)
        new_start = ed.start + shift
        log.add(stage, ed.action, f"{field_ref}:{ed.start}-{ed.end}",
                f"{field_ref}:{new_start}-{new_start + len(ed.replacement)}", ed.tag)
        shift += len(ed.replacement) - (ed.end - ed.start)
        cursor = ed.end
    out.append(text[cursor:])
    return "".join(out)


# =====================================================================================
# C2 -- structural repair (unambiguous cases only)
# =====================================================================================
def repair_edits(text: str) -> tuple[list[Edit], list[str]]:
    edits: list[Edit] = []
    flags: list[str] = []
    spans = segment(text)
    for sp in spans:
        if sp["type"] == "fenced_code" and not sp["closed"]:
            body = text[sp["start"]:sp["end"]].splitlines()[1:]
            other = "~" if sp["marker"][0] == "`" else "`"
            nested = any(ln.strip().startswith(other * 3) or ln.strip().startswith(sp["marker"][0] * 3)
                         for ln in body)
            if nested:
                flags.append("unrepaired_formatting")       # ambiguous -> flag, never guess
            else:
                # DECISION: close at end of text (a blank line inside code is normal, so
                # "next blank line" would truncate real code).
                sep = "" if text.endswith("\n") else "\n"
                edits.append(Edit(len(text), len(text), f"{sep}{sp['marker']}\n",
                                  "close_unclosed_fence", "MODEL_INFERRED"))
        elif sp["type"] == "prose":
            edits += _table_edits(text, sp)
    return edits, flags


def _table_edits(text: str, sp: dict) -> list[Edit]:
    block, edits = [], []

    def flush():
        rows = [b for b in block]
        if len(rows) >= 2 and sum(r[2].rstrip().endswith("|") for r in rows) >= len(rows) - 1:
            for s, e, ln in rows:
                body = ln.rstrip("\r\n")
                if not body.rstrip().endswith("|"):
                    edits.append(Edit(s + len(body), s + len(body), " |", "add_table_pipe", "MODEL_INFERRED"))
        block.clear()

    for s, e, ln in _lines(text[sp["start"]:sp["end"]]):
        if ln.lstrip().startswith("|"):
            block.append((s + sp["start"], e + sp["start"], ln))
        else:
            flush()
    flush()
    return edits


# =====================================================================================
# C3 -- redaction, mention pseudonymization      C4 -- lossless noise stripping
# =====================================================================================
def redaction_edits(text: str, floor: float):
    findings = sensitive.detect(text)
    edits = [Edit(f.start, f.end, f.placeholder, f"redact_{f.kind}", "MODEL_INFERRED")
             for f in findings if f.confidence >= floor]
    unresolved = [f for f in findings if f.confidence < floor]
    return edits, unresolved


class MentionMap:
    def __init__(self):
        self.map: dict[str, str] = {}

    def token(self, name: str) -> str:
        key = name.casefold()
        if key not in self.map:
            self.map[key] = f"@user_{len(self.map) + 1}"
        return self.map[key]


def mention_edits(text: str, mm: MentionMap) -> list[Edit]:
    edits = []
    for sp in segment(text):
        if sp["type"] != "prose":
            continue
        chunk = text[sp["start"]:sp["end"]]
        for m in _MENTION.finditer(chunk):
            if m.group(1) is None:
                continue                                    # inline code, leave alone
            edits.append(Edit(sp["start"] + m.start(), sp["start"] + m.end(), mm.token(m.group(1)),
                              "pseudonymize_mention", "MODEL_INFERRED"))
    return edits


_HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)
_BADGE = re.compile(r"!\[[^\]]*\]\(https?://(?:img\.shields\.io|badgen\.net|travis-ci\.(?:org|com)|"
                    r"circleci\.com/gh|codecov\.io)[^)]*\)")
_PIXEL = re.compile(r"<img\b[^>]*\b(?:width|height)=[\"']?1[\"']?[^>]*>", re.I)


def strip_edits(text: str) -> list[Edit]:
    edits = []
    for sp in segment(text):
        if sp["type"] != "prose":
            continue                                        # never touch code / traces / logs
        chunk = text[sp["start"]:sp["end"]]
        for name, pat in (("strip_html_comment", _HTML_COMMENT), ("strip_badge", _BADGE),
                          ("strip_tracking_pixel", _PIXEL)):
            for m in pat.finditer(chunk):
                edits.append(Edit(sp["start"] + m.start(), sp["start"] + m.end(), "", name, "EXPLICIT"))
    return edits


# =====================================================================================
# C5 -- normalization sidecar
# =====================================================================================
# (canonical, category). Ambiguous English words (go, r, node, express, swift ...) are NOT
# bare aliases -- see AMBIGUOUS handling below.
_CANON = {
    "JavaScript": "language", "TypeScript": "language", "Python": "language", "Java": "language",
    "Rust": "language", "Kotlin": "language", "Ruby": "language", "PHP": "language",
    "PostgreSQL": "technology", "MySQL": "technology", "Redis": "technology", "Docker": "technology",
    "Kubernetes": "technology", "MongoDB": "technology", "GraphQL": "technology", "SQLite": "technology",
    "React": "framework", "Vue": "framework", "Angular": "framework", "Django": "framework",
    "Flask": "framework", "Rails": "framework", "Next.js": "framework", "Node.js": "technology",
}
_ALIASES = {  # alias (casefold) -> canonical
    "js": "JavaScript", "ecmascript": "JavaScript", "ts": None,          # 'ts' is ambiguous -> skipped
    "golang": "Go", "psql": "PostgreSQL", "postgres": "PostgreSQL", "pg": "PostgreSQL",
    "k8s": "Kubernetes", "nodejs": "Node.js", "node.js": "Node.js", "mongo": "MongoDB",
    "reactjs": "React", "vuejs": "Vue", "nextjs": "Next.js", "rb": None,
}
_CANON["Go"] = "language"
_TERMS = {"npe": "null pointer exception", "oom": "out of memory", "segfault": "segmentation fault"}
_LANG_TAGS = {
    "python": "Python", "py": "Python", "go": "Go", "golang": "Go", "js": "JavaScript",
    "javascript": "JavaScript", "ts": "TypeScript", "typescript": "TypeScript", "rust": "Rust",
    "rs": "Rust", "java": "Java", "sql": "SQL", "ruby": "Ruby", "rb": "Ruby", "kotlin": "Kotlin",
    "php": "PHP", "cpp": "C++", "c++": "C++", "csharp": "C#", "cs": "C#", "sh": "Shell", "bash": "Shell",
}
_LABEL_VOCAB = {
    "bug": "Bug", "bugfix": "Bug", "defect": "Bug", "feature": "Feature", "feature-request": "Feature",
    "enhancement": "Improvement", "improvement": "Improvement", "refactor": "Refactor",
    "refactoring": "Refactor", "performance": "Performance", "perf": "Performance",
    "security": "Security", "docs": "Documentation", "documentation": "Documentation",
    "chore": "Maintenance", "maintenance": "Maintenance",
}
_CAND = "|".join(sorted({re.escape(k) for k in list(_ALIASES) + [c.casefold() for c in _CANON]
                         if k and _ALIASES.get(k, True) is not None and k != "go"}, key=len, reverse=True))
_TERM_RE = re.compile(rf"(?<![\w.@/-])({_CAND})(?![\w-])", re.I)
_TERM_TERMS = re.compile(rf"(?<![\w.@/-])({'|'.join(_TERMS)})(?![\w-])", re.I)
_NODE_VER = re.compile(r"(?<![\w.@/-])(node(?:\.?js)?)\s+v?(\d+(?:\.\d+)*)(?![\w.])", re.I)
_SCOPED_PKG = re.compile(r"(?<![\w/])(@[a-z0-9][\w.-]*/[a-z0-9][\w.-]*)")
_PKG_LIKE = re.compile(r"^[A-Za-z@][\w.@/-]{1,50}$")
_FILE_EXT = re.compile(r"\.(?:js|ts|tsx|jsx|py|json|md|txt|ya?ml|go|rs|java|css|html|lock|toml|cfg|log|sh|c|h|cpp)$", re.I)

_LANG_SIGNALS = {
    "Go": [r"^package \w+", r"\bfunc \w*\(", r":=", r"\bfmt\.", r"^import \("],
    "Python": [r"^\s*def \w+\(.*\):", r"^\s*from \w[\w.]* import ", r"^\s*import \w+\s*$", r"\bself\.", r"\belif\b"],
    "JavaScript": [r"\bconst \w+ =", r"=>", r"console\.log", r"\brequire\(", r"\bfunction \w*\("],
    "Java": [r"\bpublic (?:static )?(?:class|void)", r"System\.out", r"^import java\.", r"\bnew \w+<"],
    "Rust": [r"\bfn \w+\(", r"\blet mut\b", r"println!", r"^use std::", r"->\s*\w+\s*\{"],
    "SQL": [r"(?i)\bselect\b.+\bfrom\b", r"(?i)\binsert into\b", r"(?i)\bcreate table\b", r"(?i)\bwhere\b"],
}


def infer_language(code: str) -> tuple[str | None, float]:
    """Syntax-based guess for an untagged fence. Needs >=2 independent signals."""
    hits = {lang: sum(bool(re.search(p, code, re.M)) for p in pats) for lang, pats in _LANG_SIGNALS.items()}
    best = max(hits, key=hits.get)
    ties = [l for l, h in hits.items() if h == hits[best]]
    if hits[best] < 2 or len(ties) > 1:
        return None, 0.3
    return best, round(min(0.9, 0.5 + 0.1 * hits[best]), 2)


def normalize_terms(fields: list[tuple[str, str]], labels: list[str]) -> list[dict]:
    """Sidecar entries. `fields` are (field_ref, RAW text); span_refs point into raw text so the
    sidecar-integrity gate can verify them. Never rewrites source prose."""
    out: list[dict] = []

    def entry(ref, s, e, raw, canonical, cat, method, conf, tag):
        out.append({"raw": raw, "span_ref": f"{ref}:{s}-{e}", "canonical": canonical, "category": cat,
                    "method": method, "confidence": conf, "provenance_tag": tag})

    for ref, text in fields:
        for sp in segment(text):
            chunk = text[sp["start"]:sp["end"]]
            if sp["type"] == "fenced_code":
                first = _FENCE_OPEN.match(chunk)
                if first and first.group(2):
                    tag = first.group(2)
                    canon = _LANG_TAGS.get(tag.casefold())
                    if canon:
                        s = sp["start"] + first.start(2)
                        entry(ref, s, s + len(tag), tag, canon, "language",
                              "exact_match" if tag.casefold() == canon.casefold() else "alias_table",
                              1.0, "EXPLICIT")
                elif first:
                    nl = chunk.find("\n")
                    body_start = nl + 1 if nl >= 0 else len(chunk)
                    code = chunk[body_start:]
                    lines = [l for l in code.splitlines() if l.strip()]
                    if lines:
                        lang, conf = infer_language(code)
                        anchor = lines[0].rstrip("\r")
                        s = sp["start"] + body_start + code.index(lines[0])
                        if lang:
                            entry(ref, s, s + len(anchor), anchor, lang, "language",
                                  "syntax_inference", conf, "MODEL_INFERRED")
                        else:
                            entry(ref, s, s + len(anchor), anchor, anchor, "language",
                                  "syntax_inference", conf, "UNKNOWN")
                continue
            if sp["type"] != "prose":
                continue
            masked = _mask(chunk, _URL)
            hit_spans: list[tuple[int, int]] = []

            def free(s, e):
                return not any(s < b and a < e for a, b in hit_spans)

            for m in _NODE_VER.finditer(masked):
                s, e = sp["start"] + m.start(), sp["start"] + m.end()
                entry(ref, s, e, m.group(0), f"Node.js {m.group(2)}", "technology", "alias_table", 0.95,
                      "MODEL_INFERRED")
                hit_spans.append((m.start(), m.end()))
            for m in _SCOPED_PKG.finditer(masked):
                if free(m.start(), m.end()):
                    s = sp["start"] + m.start()
                    entry(ref, s, sp["start"] + m.end(), m.group(1), m.group(1), "framework", "exact_match",
                          1.0, "EXPLICIT")
                    hit_spans.append((m.start(), m.end()))
            for m in _TERM_RE.finditer(masked):
                if not free(m.start(), m.end()):
                    continue
                raw = m.group(1)
                canon = _ALIASES.get(raw.casefold()) or next(c for c in _CANON if c.casefold() == raw.casefold())
                exact = raw.casefold() == canon.casefold()
                s = sp["start"] + m.start()
                entry(ref, s, s + len(raw), raw, canon, _CANON.get(canon, "technology"),
                      "exact_match" if exact else "alias_table", 1.0 if exact else 0.9,
                      "EXPLICIT" if exact else "MODEL_INFERRED")
                hit_spans.append((m.start(), m.end()))
            for m in _TERM_TERMS.finditer(masked):
                s = sp["start"] + m.start()
                entry(ref, s, sp["start"] + m.end(), m.group(1), _TERMS[m.group(1).casefold()],
                      "terminology", "alias_table", 0.85, "MODEL_INFERRED")
            for m in _INLINE_CODE.finditer(chunk):
                tok = m.group(0)[1:-1].strip()
                if ("(" in tok or " " in tok or not _PKG_LIKE.match(tok) or _FILE_EXT.search(tok)
                        or not re.search(r"[-/.]", tok) or tok.startswith("@") and "/" in tok
                        or tok.casefold() in _ALIASES or tok.casefold() in {c.casefold() for c in _CANON}):
                    continue
                idx = m.start() + 1 + m.group(0)[1:-1].index(tok)
                s = sp["start"] + idx
                entry(ref, s, s + len(tok), tok, tok, "technology", "exact_match", 0.3, "UNKNOWN")

    for i, lab in enumerate(labels):
        clean = re.sub(r"\s+", " ", lab).strip()
        canon = _LABEL_VOCAB.get(clean.casefold())
        if canon:
            exact = clean.casefold() == canon.casefold()
            entry(f"labels.{i}", 0, len(lab), lab, canon, "terminology",
                  "exact_match" if exact else "alias_table", 1.0 if exact else 0.7,
                  "EXPLICIT" if exact else "MODEL_INFERRED")
    return out


def _mask(text: str, pat: re.Pattern) -> str:
    return pat.sub(lambda m: " " * len(m.group(0)), text)


def normalize_labels(labels: list[str]) -> list[str]:
    """Whitespace-normalized only; set membership untouched."""
    return [re.sub(r"\s+", " ", l).strip() for l in labels]


_EXT_LANG = {".py": "Python", ".js": "JavaScript", ".ts": "TypeScript", ".go": "Go", ".rs": "Rust",
             ".java": "Java", ".rb": "Ruby", ".php": "PHP", ".kt": "Kotlin", ".c": "C", ".cpp": "C++"}


def primary_language_mismatch(rec: dict) -> bool:
    t2 = rec["context_bundle"].get("tier_2") or {}
    primary = (t2.get("repo_metadata") or {}).get("primary_language")
    tree = t2.get("repo_structure")
    paths = tree.get("files") if isinstance(tree, dict) else tree
    if not primary or not isinstance(paths, list):
        return False
    counts: dict[str, int] = {}
    for p in paths:
        if isinstance(p, str):
            lang = _EXT_LANG.get(re.search(r"\.[A-Za-z+]+$", p).group(0).lower()) if re.search(r"\.[A-Za-z+]+$", p) else None
            if lang:
                counts[lang] = counts.get(lang, 0) + 1
    return bool(counts) and max(counts, key=counts.get).casefold() != primary.casefold()


# =====================================================================================
# C6 -- refined dedup fingerprint
# =====================================================================================
_TEMPLATE_LINE = re.compile(r"^\s*(?:#{1,6}\s.*|[-*]\s*\[[ xX]\].*|\s*)$")
_VOLATILE = [(re.compile(r"0x[0-9a-fA-F]+"), "0x"), (re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\S*"), "TS"),
             (re.compile(r":\d+(?::\d+)?"), ":N"), (re.compile(r"\b\d{4,}\b"), "N")]


def fingerprint_text(text: str) -> str:
    """Template scaffolding removed from prose; volatile substrings masked in traces/logs/code
    FOR THE FINGERPRINT ONLY (cleaned_view keeps them verbatim)."""
    parts = []
    for sp in segment(text):
        chunk = text[sp["start"]:sp["end"]]
        if sp["type"] == "prose":
            parts.append("\n".join(l for l in chunk.splitlines() if not _TEMPLATE_LINE.match(l)))
        else:
            for pat, rep in _VOLATILE:
                chunk = pat.sub(rep, chunk)
            parts.append(chunk)
    return "\n".join(parts)


# =====================================================================================
# C7 -- leakage
# =====================================================================================
def _shingles(text: str, n: int = 5) -> set[str]:
    w = re.findall(r"\w+", normalize_for_hash(text))
    return {" ".join(w[i:i + n]) for i in range(max(0, len(w) - n + 1))}


def leakage_findings(candidates: list[tuple[str, str]], quarantine: list[str], cfg: CleanConfig) -> list[dict]:
    q_sets = [(i, _shingles(q)) for i, q in enumerate(quarantine)]
    found = []
    for where, text in candidates:
        c = _shingles(text)
        if len(c) < 1:
            continue
        for qi, q in q_sets:
            if not q:
                continue
            inter = len(c & q)
            if inter >= cfg.leak_min_shingles and max(inter / len(c), inter / len(q)) >= cfg.leak_containment:
                found.append({"where": where, "quarantine_index": qi, "shared_shingles": inter})
    return found


def _strings(x):
    if isinstance(x, str):
        yield x
    elif isinstance(x, dict):
        for v in x.values():
            yield from _strings(v)
    elif isinstance(x, list):
        for v in x:
            yield from _strings(v)


# =====================================================================================
# C8 -- immutability + sidecar integrity
# =====================================================================================
def check_immutable(original: dict, candidate: dict) -> None:
    if source_hash(original) != source_hash(candidate):
        raise SourceMutationError("input_core/context_bundle differ from the Phase 4 original")


def resolve_span(rec: dict, ref: str) -> str | None:
    m = re.fullmatch(r"(title|body|comments\.\d+|labels\.\d+):(\d+)-(\d+)", ref)
    if not m:
        return None
    field_, s, e = m.group(1), int(m.group(2)), int(m.group(3))
    core = rec["input_core"]
    try:
        if field_ in ("title", "body"):
            text = core[field_]
        elif field_.startswith("comments."):
            text = core["comments"][int(field_.split(".")[1])]["body"]
        else:
            text = core["labels"][int(field_.split(".")[1])]
    except (IndexError, KeyError):
        return None
    return text[s:e] if 0 <= s <= e <= len(text) else None


def sidecar_integrity_errors(rec: dict, terms: list[dict]) -> list[str]:
    errs = []
    for t in terms:
        got = resolve_span(rec, t["span_ref"])
        if got != t["raw"]:
            errs.append(f"{t['span_ref']}: expected {t['raw']!r}, source has {got!r}")
        if t["provenance_tag"] not in PROVENANCE_TAGS or not 0 <= t["confidence"] <= 1:
            errs.append(f"{t['span_ref']}: bad provenance_tag/confidence")
        if t["provenance_tag"] == "UNKNOWN" and t["canonical"] != t["raw"]:
            errs.append(f"{t['span_ref']}: UNKNOWN entries must keep canonical == raw")
    return errs


# =====================================================================================
# the pipeline
# =====================================================================================
def clean(record: dict, cfg: CleanConfig | None = None, index: CorpusIndex | None = None,
          now: str | None = None) -> dict:
    """Run C1-C8. Returns a CleanedRecord (deep copy + record['cleaning']). The input is never mutated."""
    cfg = cfg or CleanConfig()
    index = index if index is not None else CorpusIndex()
    errs = intake.validate_collected(record)
    if errs:
        raise ValueError(f"invalid CollectedRecord: {errs}")
    stage_in = record["quality_status"]["collection_stage"]
    if stage_in not in ACCEPTED_INPUT_STAGES:
        raise ValueError(f"clean() accepts {sorted(ACCEPTED_INPUT_STAGES)}, got {stage_in}")
    stored = record["data_provenance"].get("source_sha256")
    if stored and stored != source_hash(record):
        raise SourceMutationError("record content changed since Phase 4 intake (source_sha256 mismatch)")

    original = copy.deepcopy(record)
    out = copy.deepcopy(record)
    cid = out["collection_id"]
    log = Log(cid, now or _now())
    core = out["input_core"]
    qs = out["quality_status"]
    flags: list[str] = list(qs["quality_flags"])

    def finish(stage: str, reason: str | None = None, view=None, terms=None, dedup=None):
        check_immutable(original, out)
        qs["collection_stage"] = stage
        qs["exclusion_reason"] = reason if stage == "EXCLUDED" else None
        qs["quality_flags"] = intake._uniq(flags)
        out["cleaning"] = {"tool_version": TOOL_VERSION, "alias_table_version": ALIAS_TABLE_VERSION,
                           "cleaned_view": view, "normalized_terms": terms or [],
                           "transformation_log": log.entries, "dedup": dedup}
        return out

    # raw fields (C5 works on RAW text so span_refs resolve into the untouched source)
    raw_fields = [("title", core["title"]), ("body", core["body"])] + \
                 [(f"comments.{i}", c["body"]) for i, c in enumerate(core["comments"])]

    # ---- C1..C4 per field
    mm = MentionMap()
    texts: dict[str, str] = {}
    unresolved_any = []
    for ref, raw in raw_fields:
        text = raw
        log.add("C1", "segment", ref, ref, "EXPLICIT")
        edits, fl = repair_edits(text)                               # C2
        flags += fl
        text = apply_edits(text, edits, ref, "C2", log)
        edits, unresolved = redaction_edits(text, cfg.redaction_floor)   # C3
        unresolved_any += unresolved
        text = apply_edits(text, edits, ref, "C3", log)
        text = apply_edits(text, strip_edits(text), ref, "C4", log)     # C4
        text = apply_edits(text, mention_edits(text, mm), ref, "C3", log)
        texts[ref] = text

    ctx_view = {}
    for key, content in intake.model_visible_bundle(out).items():
        ctx_view[key] = _redact_tree(content, f"context.{key}", cfg, log, unresolved_any)

    if unresolved_any:                                                # ER-4: never ship a partial redaction
        return finish("EXCLUDED", "unresolved_redaction")

    # ---- C5
    terms = normalize_terms(raw_fields, core["labels"])
    if primary_language_mismatch(out):
        flags.append("primary_language_mismatch")

    # ---- final segmentation (C1 again, on the cleaned text)
    view = {"title": texts["title"], "body": texts["body"],
            "comments": [{"author_role": c["author_role"], "body": texts[f"comments.{i}"],
                          "created_at": c.get("created_at")} for i, c in enumerate(core["comments"])],
            "labels": normalize_labels(core["labels"]), "context": ctx_view,
            "spans": {"title": segment(texts["title"]), "body": segment(texts["body"]),
                      "comments": [segment(texts[f"comments.{i}"]) for i in range(len(core["comments"]))]}}
    for name, text in [("title", view["title"]), ("body", view["body"])]:
        if not spans_cover(text, view["spans"][name]):
            return finish("EXCLUDED", "unparseable_structure", None, terms)
    for i, c in enumerate(view["comments"]):
        if not spans_cover(c["body"], view["spans"]["comments"][i]):
            return finish("EXCLUDED", "unparseable_structure", None, terms)

    # ---- C8 invalid vs empty
    human_comments = [c for c in view["comments"] if c["author_role"] != "bot" and c["body"].strip()]
    if core.get("is_tombstone") or (not view["title"].strip() and not view["body"].strip() and not human_comments):
        return finish("EXCLUDED", "invalid_content", view, terms)
    if view["title"].strip() and len(view["body"].strip()) < cfg.minimal_body_chars and not human_comments:
        flags.append("minimal_content")

    # ---- C6 refined dedup
    fp_body = "\n".join([fingerprint_text(view["body"])] + [fingerprint_text(c["body"]) for c in view["comments"]])
    ex = exact_hash(view["title"], fp_body)
    sim = simhash64(view["title"] + "\n" + fp_body)
    dd = index.lookup(ex, sim, cfg.near_dup_max_hamming)
    dedup = {"exact_hash": ex, "simhash64": sim, "cluster_id": dd.cluster_id, "exact_of": dd.exact_of,
             "provenance_tag": "EXPLICIT" if dd.exact_of else ("MODEL_INFERRED" if dd.cluster_id else None)}
    log.add("C6", "refined dedup", cid, dd.exact_of or dd.cluster_id or "unique", dedup["provenance_tag"] or "EXPLICIT")
    if dd.cluster_id:
        flags.append(f"near_dup_cluster:{dd.cluster_id}")
        qs["dedup_cluster_id"] = dd.cluster_id

    def register():
        index.add(cid, out["identity"]["source_repo"], ex, sim, dd.cluster_id,
                  representative=dd.exact_of is None, neighbours=dd.neighbours)

    # ---- C7 leakage (candidates = every model-visible text; quarantine = Tier 6 + external store)
    quarantine = list(cfg.quarantine_texts) + list(_strings(out["context_bundle"].get("tier_6")))
    candidates = [("title", view["title"]), ("body", view["body"])] + \
                 [(f"comments.{i}", c["body"]) for i, c in enumerate(view["comments"])] + \
                 [(f"context.{k}", s) for k, v in ctx_view.items() for s in _strings(v)]
    leaks = leakage_findings(candidates, quarantine, cfg)
    if leaks:
        for lk in leaks:
            flags.append(f"leakage:{lk['where']}")
        log.add("C7", "leakage check", cid, "leak", "MODEL_INFERRED", detail=leaks)
        return finish("EXCLUDED", "leakage_detected", view, terms, dedup)

    # ---- C7 contamination
    if any(intake.hamming(sim, b) <= cfg.near_dup_max_hamming for b in cfg.benchmark_simhashes):
        flags.append("benchmark_overlap")
        return finish("EXCLUDED", "benchmark_overlap", view, terms, dedup)

    # ---- C8 sidecar integrity
    bad = sidecar_integrity_errors(out, terms)
    if bad:
        log.add("C8", "sidecar integrity", cid, "fail", "EXPLICIT", detail=bad)
        return finish("EXCLUDED", "sidecar_integrity_failure", view, terms, dedup)

    # ---- routing
    eval_hit = stage_in == "EVAL_RESERVED" or any(
        intake.hamming(sim, e) <= cfg.near_dup_max_hamming for e in cfg.eval_simhashes)
    register()
    if eval_hit:
        return finish("EVAL_RESERVED", None, view, terms, dedup)
    if dd.exact_of:
        flags.append(f"exact_duplicate_of:{dd.exact_of}")
        return finish("DEDUP_HELD", None, view, terms, dedup)
    return finish("ANNOTATION_READY", None, view, terms, dedup)


def _redact_tree(x, path: str, cfg: CleanConfig, log: Log, unresolved: list):
    if isinstance(x, str):
        edits, un = redaction_edits(x, cfg.redaction_floor)
        unresolved += un
        return apply_edits(x, edits, path, "C3", log)
    if isinstance(x, dict):
        return {k: _redact_tree(v, f"{path}.{k}", cfg, log, unresolved) for k, v in x.items()}
    if isinstance(x, list):
        return [_redact_tree(v, f"{path}.{i}", cfg, log, unresolved) for i, v in enumerate(x)]
    return x
