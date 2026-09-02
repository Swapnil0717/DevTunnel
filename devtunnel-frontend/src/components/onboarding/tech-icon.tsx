"use client";

import { useState } from "react";
import { findTechEntry } from "@/lib/onboarding/tech-catalog";

interface TechIconProps {
  name: string;
}

/**
 * Renders a technology's logo (Simple Icons, via cdn.simpleicons.org) in a
 * small light chip so brand marks that are dark/black — Next.js, Express,
 * GitHub — stay visible on this app's dark surfaces the same as colorful
 * ones. Purely decorative: the technology name is always shown as real
 * text right next to it, so `alt` is empty
 * (Frontend_Development_Rules.txt rule 21).
 *
 * Renders nothing when the name isn't in the catalog, or if the icon
 * fails to load — a missing logo degrades to plain text, never a broken
 * image.
 */
export function TechIcon({ name }: TechIconProps) {
  const entry = findTechEntry(name);
  const [failed, setFailed] = useState(false);

  if (!entry?.slug || failed) return null;

  return (
    <span className="inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[3px] bg-white p-[1.5px]">
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny 3rd-party
          brand icon, not an optimizable local/Next asset */}
      <img
        src={`https://cdn.simpleicons.org/${entry.slug}`}
        alt=""
        width={14}
        height={14}
        loading="lazy"
        className="h-full w-full object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  );
}