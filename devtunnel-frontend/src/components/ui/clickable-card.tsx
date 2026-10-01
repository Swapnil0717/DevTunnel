"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

interface ClickableCardProps {
  children: ReactNode;
  className?: string;
  /** Internal DevTunnel route to open on card click (client-side navigation). */
  href?: string;
  /** External URL to open in a new tab on card click (e.g. the GitHub issue itself). */
  externalHref?: string;
}

/**
 * A `<div>` that navigates to `href` (or opens `externalHref` in a new tab)
 * when clicked anywhere on it, while leaving every link/button already inside
 * — View task, Explain, the GitHub issue link, etc. — working exactly as
 * before: a click that lands on one of those is left alone instead of
 * double-navigating. Same behavior `AdminTableRow` gives a table row, for the
 * card layout used by `/tasks` and `/issues`.
 *
 * Like `AdminTableRow`, this only adds a convenience on top of an already-real
 * link: every card renders its own keyboard- and crawler-reachable link to the
 * same destination (Frontend_Development_Rules.txt rule 10).
 *
 * A click inside an element marked `data-card-static` (the expanded AI
 * explanation) is also left alone, so selecting or reading text there never
 * navigates away.
 */
export function ClickableCard({ children, className = "", href, externalHref }: ClickableCardProps) {
  const router = useRouter();
  const isClickable = Boolean(href || externalHref);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("a, button, [data-card-static]")) return;
    if (window.getSelection()?.toString()) return;

    if (href) {
      router.push(href);
    } else if (externalHref) {
      window.open(externalHref, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div onClick={isClickable ? handleClick : undefined} className={`${isClickable ? "cursor-pointer" : ""} ${className}`.trim()}>
      {children}
    </div>
  );
}
