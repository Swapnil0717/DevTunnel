"use client";

import { useMemo, useState } from "react";
import { GitBranchIcon } from "@/components/layout/nav-icons";

/**
 * Small circular repository logo shown ahead of a repo's full name
 * (`owner/repo`) in the admin Projects, Tasks, and New Issues tables.
 *
 * GitHub has no per-repository logo — only the owner/org account has an
 * avatar — so, same convention as `OpenSourceToolLogo`
 * (`components/admin/opensource-tools/opensource-tool-logo.tsx`), this
 * derives a real image straight from GitHub's own first-party avatar CDN
 * (`github.com/{owner}.png`) rather than inventing a field the backend
 * doesn't have (Frontend_Development_Rules.txt rule 58). Every project
 * and task in this app is always onboarded from a GitHub repository, so
 * `repositoryFullName` is always `owner/repo` and the owner segment is
 * always derivable with no extra network round-trip.
 *
 * A plain `<img>`, not `next/image` — the owner is arbitrary (any GitHub
 * user/org) and can't be pre-listed in `next.config.js`'s
 * `images.remotePatterns`, same reasoning `OpenSourceToolLogo` documents
 * for tool source domains.
 *
 * Falls back to a branch-icon placeholder — never a blank box — if the
 * avatar 404s or `repositoryFullName` doesn't parse as `owner/repo`.
 */
export function RepoLogo({
  repositoryFullName,
  size = 20,
}: {
  repositoryFullName: string;
  size?: number;
}) {
  const owner = useMemo(
    () => repositoryFullName.split("/")[0]?.trim() ?? "",
    [repositoryFullName],
  );
  const [failed, setFailed] = useState(false);

  if (!owner || failed) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-raised"
      >
        <GitBranchIcon className="h-1/2 w-1/2 text-text-faint" />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary GitHub owner, see comment above
    <img
      key={owner}
      src={`https://github.com/${encodeURIComponent(owner)}.png?size=${size * 2}`}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full border border-border-subtle bg-surface-raised object-cover"
    />
  );
}