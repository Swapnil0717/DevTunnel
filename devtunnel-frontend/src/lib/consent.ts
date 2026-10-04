// devtunnel-frontend/src/lib/consent.ts

/**
 * Analytics consent, stored in a first-party cookie (`dt_consent`) so the
 * choice survives reloads and is the same on every page.
 *
 *  - no cookie  → the visitor hasn't chosen: show the banner, load nothing.
 *  - "granted"  → Google Analytics may load.
 *  - "denied"   → Google Analytics never loads (and is switched off if it had).
 *
 * Only analytics is optional. The sign-in session cookies are strictly
 * necessary and don't depend on this choice.
 */
export type ConsentChoice = "granted" | "denied";

export const CONSENT_COOKIE = "dt_consent";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Fired on `window` whenever the stored choice changes. */
export const CONSENT_CHANGE_EVENT = "dt:consent-change";
/** Fired on `window` by "Cookie settings" links to reopen the banner. */
export const OPEN_SETTINGS_EVENT = "dt:open-cookie-settings";

export function readConsent(): ConsentChoice | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  const value = match?.split("=")[1];
  return value === "granted" || value === "denied" ? value : null;
}

export function writeConsent(choice: ConsentChoice): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: choice }));
}

/** Reopens the consent banner (used by every "Cookie settings" link). */
export function openCookieSettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

/** Removes Google Analytics' own cookies (`_ga`, `_ga_<ID>`) from this site's domain. */
export function clearAnalyticsCookies(): void {
  const hostParts = window.location.hostname.split(".");
  const domains = new Set<string | undefined>([undefined, window.location.hostname]);
  // Analytics cookies are often set on the registrable domain (".example.com").
  if (hostParts.length >= 2) domains.add(`.${hostParts.slice(-2).join(".")}`);

  for (const entry of document.cookie.split("; ")) {
    const name = entry.split("=")[0];
    if (name !== "_ga" && !name.startsWith("_ga_") && name !== "_gid") continue;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ""}`;
    }
  }
}
