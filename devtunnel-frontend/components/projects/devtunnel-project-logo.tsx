"use client";

import { useState } from "react";
import { FolderIcon } from "@/components/layout/nav-icons";

export function DevtunnelProjectLogo({
  repositoryFullName,
  size = 32,
}: {
  repositoryFullName?: string;
  size?: number;
}) {
  const owner = repositoryFullName?.split("/")[0]?.trim() ?? "";
  const [failed, setFailed] = useState(false);

  if (!owner || failed) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-[10px] border border-avatar-placeholder-border bg-avatar-placeholder-bg"
      >
        <FolderIcon className="h-1/2 w-1/2 text-avatar-placeholder-icon" />
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
      className="shrink-0 rounded-[10px] border border-border-subtle bg-surface-raised object-cover"
    />
  );
}