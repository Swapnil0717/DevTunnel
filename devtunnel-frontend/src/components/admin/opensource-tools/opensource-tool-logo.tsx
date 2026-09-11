"use client";

import { useState } from "react";
import { ToolIcon } from "@/components/layout/nav-icons";

/**
 * Square logo shown on the `/admin/opensource-tools` grid card and the
 * tool detail page. `devtunnel.opensource_tools` (sql/017) has no
 * `logo_url` column — a tool is only ever onboarded from a URL — so
 * there is no real logo to fetch from the backend
 * (Frontend_Development_Rules.txt rule 58: never fabricate a field the
 * backend doesn't have). Instead this derives a favicon from the tool's
 * own `sourceUrl` domain, the same "real, not invented" image a browser
 * tab would show for that site.
 *
 * A plain `<img>`, not `next/image` — the tool's domain is arbitrary and
 * not knowable ahead of time, so it can never be listed in
 * `next.config.js`'s `images.remotePatterns` (currently just
 * `avatars.githubusercontent.com` for GitHub avatars) the way `next/image`
 * requires.
 *
 * Falls back to an initials-style placeholder — never a blank box — on
 * a failed load, same "always render something real" posture as
 * `ProfileAvatar`'s person-glyph fallback, just square instead of round
 * to match this grid's card shape.
 */
export function OpenSourceToolLogo({
  name,
  sourceUrl,
  size = 56,
}: {
  name: string;
  sourceUrl: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  let faviconUrl: string | null = null;
  try {
    const domain = new URL(sourceUrl).hostname;
    faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size * 2}`;
  } catch {
    faviconUrl = null;
  }

  if (!faviconUrl || failed) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-[10px] border border-avatar-placeholder-border bg-avatar-placeholder-bg"
      >
        <ToolIcon className="h-1/2 w-1/2 text-avatar-placeholder-icon" />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary external domain, see comment above
    <img
      src={faviconUrl}
      alt=""
      title={name}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-[10px] border border-border-subtle bg-surface-raised object-contain p-2"
    />
  );
}