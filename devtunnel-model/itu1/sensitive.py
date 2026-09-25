"""
ITU-1 -- shared detector for secrets / PII (Phase 3 PS-1, PS-2; Phase 4 Stage 9;
Phase 5 Section 4.3).

Detection lives in one place so that Phase 4 (detect + HOLD) and Phase 5
(REDACT) can never disagree about what counts as sensitive.

    detect(text)  -> list[Finding]   (sorted, non-overlapping)
    redact(text)  -> (new_text, findings_applied)

Each Finding carries a `confidence`. Phase 5 redacts only findings at or above
REDACTION_CONFIDENCE_FLOOR; a record that still has a below-floor finding is
excluded (ER-4) instead of being shipped partially redacted.

What this does NOT do: detect real personal names (needs an NER model). Only
@mentions (see clean.py) and home-directory usernames are handled.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

REDACTION_CONFIDENCE_FLOOR = 0.8

SECRET = "<REDACTED_SECRET>"
EMAIL = "<REDACTED_EMAIL>"
USER = "<REDACTED_USER>"


@dataclass(frozen=True)
class Finding:
    kind: str          # "secret" | "email" | "user_path"
    start: int
    end: int           # span of the text to be replaced
    confidence: float
    rule: str

    @property
    def placeholder(self) -> str:
        return {"secret": SECRET, "email": EMAIL, "user_path": USER}[self.kind]


# High-precision token formats (confidence 0.98).
_TOKEN_PATTERNS = [
    ("aws_access_key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("github_token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b")),
    ("github_pat", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{40,}\b")),
    ("stripe_key", re.compile(r"\b[sr]k_(?:live|test)_[A-Za-z0-9]{10,}")),
    ("slack_token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}")),
    ("google_api_key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")),
    ("private_key_block", re.compile(
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S)),
]

# scheme://user:password@host  -> the password is the secret.
_CONN_STRING = re.compile(r"\b[a-z][a-z0-9+.-]*://[^\s/:@]+:([^\s/@]{3,})@")

# key = value assignments; the value is judged separately.
_ASSIGNMENT = re.compile(
    r"""(?ix)
    \b(?:api[_-]?key|apikey|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|
        token|passwd|password|client[_-]?secret|private[_-]?key)
    ["']?\s*[:=]\s*["']?
    (?P<val>[^\s"',;&]{8,})
    """
)
_PLACEHOLDER_VALUE = re.compile(
    r"""(?ix)^(?:<[^>]*>|\$\{?[A-Z_]+\}?|%[A-Z_]+%|x{4,}|\*{4,}|\.{3,}|
        your[_-].*|my[_-].*|example.*|changeme|undefined|null|none|true|false|
        <?redacted.*|process\.env.*|os\.environ.*|env\..*)$"""
)

_URL_SECRET_PARAM = re.compile(
    r"(?i)([?&](?:access_token|token|api_key|apikey|key|secret|sig|signature|password|auth)=)([^&\s#)\]\"']+)"
)
# Simple, deliberately conservative email pattern; no-reply style bots are ignored.
_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b")
_BOT_EMAIL_LOCAL = re.compile(r"(?i)^(?:no-?reply|noreply|notifications?|bot|git)$")
_USER_PATH = re.compile(
    r"(?P<pre>(?:/home/|/Users/|[A-Za-z]:\\Users\\))(?P<user>[A-Za-z0-9._-]{2,32})(?=[/\\])"
)
_SYSTEM_USERS = {"runner", "root", "ubuntu", "vagrant", "node", "app", "user", "shared", "public",
                 "default", "circleci", "travis", "jenkins", "docker", "Shared", "Public"}


def _value_confidence(val: str) -> float | None:
    """None = not a secret (placeholder / plain word). Else detector confidence."""
    if _PLACEHOLDER_VALUE.match(val):
        return None
    classes = sum(bool(re.search(p, val)) for p in (r"[a-z]", r"[A-Z]", r"\d", r"[^A-Za-z0-9]"))
    if len(val) >= 16 and classes >= 3:
        return 0.9
    if re.fullmatch(r"[a-z]+(?:[_-][a-z]+)*", val):
        return None          # looks like ordinary words ("expired", "not_set")
    return 0.6               # ambiguous: plausible secret, boundary/identity unclear


def detect(text: str) -> list[Finding]:
    found: list[Finding] = []

    for name, pat in _TOKEN_PATTERNS:
        for m in pat.finditer(text):
            found.append(Finding("secret", m.start(), m.end(), 0.98, name))

    for m in _CONN_STRING.finditer(text):
        found.append(Finding("secret", m.start(1), m.end(1), 0.95, "connection_string_password"))

    for m in _ASSIGNMENT.finditer(text):
        conf = _value_confidence(m.group("val"))
        if conf is not None:
            found.append(Finding("secret", m.start("val"), m.end("val"), conf, "credential_assignment"))

    for m in _URL_SECRET_PARAM.finditer(text):
        if _value_confidence(m.group(2)) is not None or len(m.group(2)) >= 8:
            found.append(Finding("secret", m.start(2), m.end(2), 0.9, "url_query_secret"))

    for m in _EMAIL.finditer(text):
        local = m.group(0).split("@", 1)[0]
        if not _BOT_EMAIL_LOCAL.match(local):
            found.append(Finding("email", m.start(), m.end(), 0.9, "email"))

    for m in _USER_PATH.finditer(text):
        if m.group("user") not in _SYSTEM_USERS:
            found.append(Finding("user_path", m.start("user"), m.end("user"), 0.85, "home_dir_username"))

    return _resolve_overlaps(found)


def _resolve_overlaps(found: list[Finding]) -> list[Finding]:
    """Keep the widest / most confident finding when spans overlap."""
    found = sorted(found, key=lambda f: (f.start, -(f.end - f.start), -f.confidence))
    out: list[Finding] = []
    for f in found:
        if out and f.start < out[-1].end:
            prev = out[-1]
            if (f.end - f.start, f.confidence) > (prev.end - prev.start, prev.confidence):
                out[-1] = f
            continue
        out.append(f)
    return out


def redact(text: str, floor: float = REDACTION_CONFIDENCE_FLOOR) -> tuple[str, list[Finding], list[Finding]]:
    """Mask every finding at/above `floor`.

    Returns (new_text, applied, unresolved). `unresolved` are below-floor
    findings that were left in place -- the caller must exclude the record
    (ER-4) if that list is non-empty.
    """
    findings = detect(text)
    applied = [f for f in findings if f.confidence >= floor]
    unresolved = [f for f in findings if f.confidence < floor]
    out, cursor = [], 0
    for f in applied:
        out.append(text[cursor:f.start])
        out.append(f.placeholder)
        cursor = f.end
    out.append(text[cursor:])
    return "".join(out), applied, unresolved
