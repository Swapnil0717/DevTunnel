/**
 * Builds the `/login` URL a signed-out visitor is sent to from a public
 * page, carrying the page they were on as `?next=` so they land back where
 * they were after GitHub sign-in (`app/login/page.tsx` already honours
 * `next` — and only for same-site paths, which this mirrors by only
 * forwarding values that start with a single "/").
 *
 * Kept as a plain function (no `"use client"`, no hooks) so both server
 * and client components can share it instead of each re-deriving the same
 * string (Frontend_Development_Rules.txt rule 51).
 */
export function signInHref(next?: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/login";
  }

  return `/login?next=${encodeURIComponent(next)}`;
}
