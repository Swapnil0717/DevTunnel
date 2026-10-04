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
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://devtunnel.dev";

export const SITE_NAME = "DevTunnel";

export const SITE_DESCRIPTION =
  "DevTunnel connects contributors with open source projects to build, and helps maintainers organize tasks, roles, and pull requests.";


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
