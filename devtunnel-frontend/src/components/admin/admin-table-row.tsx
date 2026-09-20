"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

interface AdminTableRowProps {
  children: ReactNode;
  className?: string;
  /** Internal DevTunnel route to open on row click (client-side navigation). */
  href?: string;
  /** External URL to open in a new tab on row click (e.g. the GitHub issue itself). */
  externalHref?: string;
}

/**
 * A `<tr>` that navigates to `href` (or opens `externalHref` in a new
 * tab) when clicked anywhere in the row, while leaving every link/button
 * already inside the row — View, Edit, Tasks, Delete, the repo link,
 * etc. — working exactly as before: a click that lands on one of those
 * is left alone instead of double-navigating.
 *
 * This only adds a convenience on top of an already-real link. Every
 * table this is used on already defines its own real, keyboard- and
 * crawler-reachable "View" link/action (see each table's own docstring);
 * this component never becomes the *only* way to reach that page
 * (Frontend_Development_Rules.txt rule 10 — don't rely exclusively on
 * `onClick` when a normal link is appropriate).
 *
 * Kept as one shared component rather than duplicating the same
 * "was the click on a link/button, or on the row background" check in
 * every table (rule 51 — keep this kind of logic centralized).
 */
export function AdminTableRow({
  children,
  className = "",
  href,
  externalHref,
}: AdminTableRowProps) {
  const router = useRouter();
  const isClickable = Boolean(href || externalHref);

  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    if ((event.target as HTMLElement).closest("a, button")) return;

    if (href) {
      router.push(href);
    } else if (externalHref) {
      window.open(externalHref, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <tr
      onClick={isClickable ? handleClick : undefined}
      className={`${isClickable ? "cursor-pointer" : ""} ${className}`.trim()}
    >
      {children}
    </tr>
  );
}