import type { ReactNode } from "react";

/**
 * Non-alarming placeholder for a Home section with nothing to show — either
 * the request failed or the person genuinely has no data there yet. Both
 * cases share one calm style (no red, no "try refreshing"): a dashed box in
 * the redesign's panel colors that reads as "nothing here yet" rather than
 * "something is broken".
 *
 * This is Home's own copy of `SectionMessage` rather than a restyle of it:
 * `SectionMessage` is shared with the admin and public pages, whose type
 * scale is the older, smaller one.
 */
export function HomeMessage({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`m-0 rounded-[10px] border border-dashed border-[#1F1F1F] bg-[#0E0E0E]/40 px-4 py-4 text-[12.5px] leading-[1.55] text-text-dim ${className}`}
    >
      {children}
    </p>
  );
}
