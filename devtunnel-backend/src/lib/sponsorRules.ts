/**
 * Sponsors — pure rules shared by the Razorpay webhook (and later parts):
 * the tier thresholds, and the sanitisers for the free-text answers a
 * supporter types into the Razorpay form. No imports and no I/O, so every
 * function here is trivially unit-testable.
 */

/* ---------------------------------------------------------------------------
 * Tiers — ONE place for the thresholds.
 *
 * The database is the authority: `devtunnel.sponsorships.tier` / `tier_rank`
 * are GENERATED columns (sql/048_sponsorships.sql), so the webhook never
 * writes a tier and a row can never disagree with its amount. These numbers
 * MIRROR that SQL and are used only for logging and for later parts that
 * need a tier before a row exists. If you change a threshold, change both
 * (the SQL header explains how to drop and re-add the generated columns).
 *
 * Amounts are in paise (Rs 1 = 100 paise).
 * ------------------------------------------------------------------------- */
export const SPONSOR_TIERS = {
  /** Rs 500 and above. */
  backerMinPaise: 50_000,
  /** Rs 2,000 and above. */
  championMinPaise: 200_000,
} as const;

export type SponsorTier = "supporter" | "backer" | "champion";

export function sponsorTierForPaise(amountPaise: number): SponsorTier {
  if (amountPaise >= SPONSOR_TIERS.championMinPaise) return "champion";
  if (amountPaise >= SPONSOR_TIERS.backerMinPaise) return "backer";
  return "supporter";
}

/** `amount_paise` is a Postgres `integer` (max 2,147,483,647); stay well under it. */
export const MAX_SPONSOR_AMOUNT_PAISE = 2_000_000_000;

/** Matches the `display_name` CHECK in sql/048 (<= 60 characters). */
export const DISPLAY_NAME_MAX_CHARS = 60;

/* ---------------------------------------------------------------------------
 * Sanitisers
 * ------------------------------------------------------------------------- */

/**
 * GitHub's own username rule: 1-39 characters, letters/digits/hyphens, no
 * leading or trailing hyphen, no two hyphens in a row. Stricter than (and so
 * always accepted by) the CHECK in sql/048.
 */
const GITHUB_USERNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/**
 * Turns whatever the supporter typed into a valid GitHub username, or `null`.
 * Accepts "@octocat", "octocat" and "https://github.com/octocat/". It never
 * "repairs" an invalid value by deleting characters — that could point the
 * wall at a different real account — it just drops it.
 */
export function sanitizeGithubUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let s = value.trim().slice(0, 200);
  s = s.replace(/^https?:\/\/(?:www\.)?github\.com\//i, "").replace(/^(?:www\.)?github\.com\//i, "");
  s = s.replace(/^@+/, "");
  s = s.split(/[/?#\s]/)[0] ?? "";
  return GITHUB_USERNAME_RE.test(s) ? s : null;
}

/**
 * Display name for the public wall: control/format/invisible characters,
 * angle brackets, backticks and links removed, whitespace collapsed, cut to
 * 60 characters (by code point, so an emoji is never split). `null` if
 * nothing is left. React escapes it on render; this keeps the stored value
 * clean as well.
 */
export function sanitizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .slice(0, 400)
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ")
    .replace(/[\p{C}]/gu, "")
    .replace(/[<>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const cut = Array.from(cleaned).slice(0, DISPLAY_NAME_MAX_CHARS).join("").trim();
  return cut.length > 0 ? cut : null;
}

const YES_RE = /^(?:yes|y|true|1|on|checked|show|stay|anonymous)\b/i;

/** "yes", "Yes, please", true, 1, "checked" ... -> true. Anything else (incl. missing) -> false. */
export function parseYesNo(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;
  return YES_RE.test(value.trim());
}

/* ---------------------------------------------------------------------------
 * Reading the supporter's answers out of Razorpay `notes`
 * ------------------------------------------------------------------------- */

export interface SponsorNotes {
  displayName: string | null;
  githubUsername: string | null;
  isAnonymous: boolean;
  showAmount: boolean;
}

type NoteField = "githubUsername" | "displayName" | "anonymous" | "showAmount";

/**
 * Maps a form-field label / note key to one of our four fields. Razorpay
 * notes use whatever label the Payment Page owner typed ("GitHub username",
 * "Stay anonymous?", ...), so the key is lower-cased, stripped to [a-z0-9]
 * and matched by keyword. Order matters: "github" before "name" so a
 * "GitHub name" field is the username, not the display name.
 */
function classifyNoteKey(rawKey: string): NoteField | null {
  const k = rawKey.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (k.includes("github")) return "githubUsername";
  if (k.includes("anonym")) return "anonymous";
  if (k.includes("amount")) return "showAmount";
  if (k === "name" || k.includes("displayname") || k.includes("yourname") || k.includes("fullname")) {
    return "displayName";
  }
  return null;
}

const MAX_NOTE_KEYS_SCANNED = 30;
const MAX_NOTE_VALUE_CHARS = 400;

/** Razorpay sends `notes: []` (an empty ARRAY) when there are none, and `null` on some entities. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the four answers from one or more `notes` objects (payment notes
 * first, then payment-link / order notes as fallbacks). Only string / number
 * / boolean values are looked at; every unknown key is ignored. First match
 * wins per field. Everything returned is already sanitised.
 */
export function readSponsorNotes(...sources: unknown[]): SponsorNotes {
  const found: Partial<Record<NoteField, unknown>> = {};

  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    for (const [key, value] of Object.entries(source).slice(0, MAX_NOTE_KEYS_SCANNED)) {
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
      const field = classifyNoteKey(key);
      if (!field || field in found) continue;
      found[field] = typeof value === "string" ? value.slice(0, MAX_NOTE_VALUE_CHARS) : value;
    }
  }

  return {
    displayName: sanitizeDisplayName(found.displayName),
    githubUsername: sanitizeGithubUsername(found.githubUsername),
    isAnonymous: parseYesNo(found.anonymous),
    showAmount: parseYesNo(found.showAmount),
  };
}

/** Key NAMES only (never values) of a notes object — safe to log when the form fields don't match. */
export function noteKeyNames(source: unknown): string[] {
  if (!isPlainObject(source)) return [];
  return Object.keys(source)
    .slice(0, 10)
    .map((k) => k.slice(0, 40));
}
