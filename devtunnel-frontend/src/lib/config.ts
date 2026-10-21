/**
 * Central, single-source-of-truth config for the frontend.
 *
 * Keeping these in one file means every page/component derives the same
 * name, URL and API base instead of re-typing (and risking inconsistent)
 * literals — see Frontend_Development_Rules.txt rule 44 (consistent entity
 * names) and rule 51 (centralize cross-cutting concerns).
 */

/** Base URL of the DevTunnel backend API. Never hardcode this elsewhere. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

/** Canonical public URL of this frontend deployment. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://devtunnel.tech";

export const SITE_NAME = "DevTunnel";

/**
 * Default <title> for the whole site and the homepage (kept near 60 characters
 * so search results don't cut it off). Leads with the brand, then the phrases
 * people actually search for: "open source issues" and "first PR".
 */
export const SITE_TITLE = "DevTunnel: Find Open Source Issues & Make Your First PR";

/** Short line used in link previews and structured data. */
export const SITE_TAGLINE = "Find open source issues you can actually do.";

/**
 * Default meta description (aim for 150-160 characters). Every page that has
 * its own description overrides this; it is the fallback and the homepage text.
 */
export const SITE_DESCRIPTION =
  "Find open source issues matched to your role, level and tech stack. DevTunnel explains each task and its CLI opens your first pull request. Free, MIT licensed.";

/**
 * Topics the site is genuinely about. Google ignores the keywords meta tag, but
 * Bing and some other crawlers still read it, and it keeps the vocabulary used
 * across the site in one place. Only terms the pages really cover belong here.
 */
export const SITE_KEYWORDS = [
  "open source",
  "open source issues",
  "good first issues",
  "beginner friendly open source",
  "contribute to open source",
  "first pull request",
  "first open source contribution",
  "GitHub issues",
  "open source tasks",
  "open source projects",
  "open source tools",
  "developer CLI",
  "DevTunnel",
];


/**
 * External payment page (a Razorpay payment link or payment page that asks the
 * sponsor for the amount). Both "Sponsor us" in the app header and "Sponsor
 * DevTunnel" on the post-PR prompt open it in a new tab. DevTunnel takes no
 * payment itself and never learns whether anyone paid.
 *
 * `null` unless `NEXT_PUBLIC_SPONSOR_URL` is set to an `https://` URL, so an
 * unset (or mistyped) value hides both buttons instead of rendering a button
 * that goes nowhere or to a non-HTTPS target. Read at build time
 * (`NEXT_PUBLIC_*`), so changing it needs a rebuild.
 */
export const SPONSOR_URL: string | null = (() => {
  const raw = process.env.NEXT_PUBLIC_SPONSOR_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
})();


/** Public contact address shown in the footer and on the legal pages. */
export const CONTACT_EMAIL = "contact@devtunnel.tech";

/** Name of the person/entity that operates DevTunnel (shown in the footer and legal pages). */
export const OPERATOR_NAME = "Pranav Kiran Pathare";

/** Fixed links shown in the footers: the DevTunnel repository and the operator's LinkedIn profile. */
export const PROJECT_GITHUB_URL = "https://github.com/Swapnil0717/DevTunnel";
export const LINKEDIN_URL = "https://www.linkedin.com/in/pranav-pathare-4010653a2";

/**
 * Public GitHub repository URL (`https://github.com/<owner>/<repo>`), used for
 * the footer's "GitHub repository", Contributing, Code of conduct, Security and
 * Roadmap links. `null` unless `NEXT_PUBLIC_GITHUB_REPO_URL` is a valid
 * `https://github.com/...` URL, so an unset value hides those links instead of
 * rendering links that go nowhere. Read at build time.
 */
export const GITHUB_REPO_URL: string | null = (() => {
  const raw = process.env.NEXT_PUBLIC_GITHUB_REPO_URL?.trim().replace(/\/$/, "");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === "github.com" ? raw : null;
  } catch {
    return null;
  }
})();

/**
 * Google Analytics 4 measurement ID (`G-XXXXXXXXXX`). `null` unless
 * `NEXT_PUBLIC_GA_MEASUREMENT_ID` matches that shape. While it is `null`
 * nothing analytics-related loads, no consent banner is shown and the
 * "Cookie settings" links are hidden (there is nothing to consent to).
 * Read at build time, so setting it needs a rebuild.
 */
export const GA_MEASUREMENT_ID: string | null = (() => {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  return raw && /^G-[A-Z0-9]{4,20}$/.test(raw) ? raw : null;
})();

/** Date the legal pages were last revised. Update it whenever their text changes. */
export const LEGAL_LAST_UPDATED = "4 October 2026";
