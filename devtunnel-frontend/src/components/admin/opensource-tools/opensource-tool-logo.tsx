"use client";

import { useMemo, useState } from "react";
import { ToolIcon } from "@/components/layout/nav-icons";

/**
 * Square logo shown on the `/admin/opensource-tools` grid card and the
 * tool detail page. `devtunnel.opensource_tools` (sql/017) has no
 * `logo_url` column — a tool is only ever onboarded from a URL — so
 * there is no real logo to fetch from the backend
 * (Frontend_Development_Rules.txt rule 58: never fabricate a field the
 * backend doesn't have). Instead this derives a real, existing image
 * from the tool's own `sourceUrl` — never inventing one.
 *
 * Two real sources are tried, in order, before giving up:
 *
 * 1. For a GitHub `sourceUrl` (the only kind onboarding accepts today —
 *    see `toolSource.ts`), the owner/org's own avatar straight from
 *    `github.com/{owner}.png`. This is a first-party GitHub CDN asset,
 *    not a third-party lookup, so it isn't affected by the ad blockers
 *    and privacy extensions that commonly block Google's favicon
 *    endpoint (`s2/favicons` is a well-known tracker-blocklist entry —
 *    blocked requests often come back as an empty 200 rather than a
 *    real network error, which is why a plain `<img>` pointed at it can
 *    sit there looking broken instead of ever firing `onError`).
 * 2. A favicon derived from the `sourceUrl` domain, for any non-GitHub
 *    source or if the GitHub avatar itself 404s.
 *
 * A plain `<img>`, not `next/image` — the tool's domain is arbitrary and
 * not knowable ahead of time, so it can never be listed in
 * `next.config.js`'s `images.remotePatterns` (currently just
 * `avatars.githubusercontent.com` for GitHub avatars) the way `next/image`
 * requires.
 *
 * Falls back to an initials-style placeholder — never a blank box — once
 * every real source has failed, same "always render something real"
 * posture as `ProfileAvatar`'s person-glyph fallback, just square instead
 * of round to match this grid's card shape.
 */

/** Ordered list of image sources still worth trying, most reliable first. */
function buildCandidates(sourceUrl: string, size: number): string[] {
  const candidates: string[] = [];

  try {
    const parsed = new URL(sourceUrl);
    const domain = parsed.hostname.replace(/^www\./, "");

    if (domain === "github.com") {
      const owner = parsed.pathname.split("/").filter(Boolean)[0];
      if (owner) {
        candidates.push(`https://github.com/${encodeURIComponent(owner)}.png?size=${size * 2}`);
      }
    }

    candidates.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size * 2}`);
  } catch {
    // Not a parseable URL — no candidates, falls straight to the placeholder.
  }

  return candidates;
}

export function OpenSourceToolLogo({
  name,
  sourceUrl,
  size = 56,
}: {
  name: string;
  sourceUrl: string;
  size?: number;
}) {
  const candidates = useMemo(() => buildCandidates(sourceUrl, size), [sourceUrl, size]);
  const [attempt, setAttempt] = useState(0);

  const currentSrc = candidates[attempt];

  if (!currentSrc) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-[12px] border border-avatar-placeholder-border bg-avatar-placeholder-bg"
      >
        <ToolIcon className="h-1/2 w-1/2 text-avatar-placeholder-icon" />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary external domain, see comment above
    <img
      key={currentSrc}
      src={currentSrc}
      alt=""
      title={name}
      width={size}
      height={size}
      onError={() => setAttempt((current) => current + 1)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-[12px] border border-border-subtle bg-surface-raised object-contain p-2.5"
    />
  );
}
