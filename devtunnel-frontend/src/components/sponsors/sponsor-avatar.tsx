// devtunnel-frontend/src/components/sponsors/sponsor-avatar.tsx
"use client";

import { useState } from "react";

/**
 * Round avatar for a sponsor on the wall.
 *
 * With a GitHub `username` it shows `github.com/<username>.png`, GitHub's own
 * avatar address. That is an image URL the visitor's browser loads directly:
 * no GitHub API call, no token, nothing extra for the Worker to do, and the
 * lookup never counts against any API rate limit. Same approach as `RepoLogo`
 * in the admin portal. A plain `<img>`, not `next/image`, because the
 * username is arbitrary and can't be listed in `images.remotePatterns`.
 *
 * Without a username, or if the image fails to load (unknown account, GitHub
 * blocked), it shows a circle with the sponsor's initial instead, so there is
 * never a broken-image icon or an empty hole. `initial` is "?" for an
 * anonymous sponsor. The avatar is decorative (`alt=""`): the sponsor's name
 * is always rendered next to it.
 *
 * The caller passes only a username that already passed `sponsorAvatarUsername`
 * (Backer or Champion, valid GitHub format), so this component never builds a
 * URL from unchecked text.
 */
export function SponsorAvatar({
  username,
  initial,
  size = 28,
}: {
  username: string | null;
  initial: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!username || failed) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
        className="flex shrink-0 items-center justify-center rounded-full border border-avatar-placeholder-border bg-avatar-placeholder-bg font-medium text-avatar-placeholder-icon"
      >
        {initial}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary GitHub username, see comment above
    <img
      key={username}
      src={`https://github.com/${encodeURIComponent(username)}.png?size=${size * 2}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full border border-border-subtle bg-surface-raised object-cover"
    />
  );
}
