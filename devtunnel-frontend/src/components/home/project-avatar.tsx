"use client";

import { useEffect, useRef, useState } from "react";

const TILE_CLASSES =
  "h-7 w-7 flex-none rounded-md border border-[#2A2A2A] bg-[#161616]";

/**
 * The 28px logo tile on a Home project card.
 *
 * Shows the repository owner's GitHub avatar when the project has a recorded
 * repository, and falls back to the design's initial-letter tile when it
 * doesn't — or when the image fails to load. (Home used to fall back to a
 * folder icon; the initial is what the redesign specifies.)
 *
 * The image is decorative — the project name sits right beside it — so
 * `alt=""` is correct here (rule 21). An `onError` handler alone can miss an
 * error that fires before React hydrates, so the effect also checks whether
 * an already-finished image came back empty.
 */
export function ProjectAvatar({
  name,
  repositoryFullName,
}: {
  name: string;
  repositoryFullName?: string;
}) {
  const owner = repositoryFullName?.split("/")[0]?.trim() ?? "";
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0) {
      setFailed(true);
    }
  }, [owner]);

  if (!owner || failed) {
    const initial = (name.trim().charAt(0) || "?").toUpperCase();
    return (
      <span
        aria-hidden="true"
        className={`flex items-center justify-center text-[12px] text-[#C8C8C8] ${TILE_CLASSES}`}
      >
        {initial}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary GitHub owner avatar
    <img
      key={owner}
      ref={imageRef}
      src={`https://github.com/${encodeURIComponent(owner)}.png?size=56`}
      alt=""
      width={28}
      height={28}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`object-cover ${TILE_CLASSES}`}
    />
  );
}
