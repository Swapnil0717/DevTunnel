/**
 * Shared, non-alarming placeholder for a home-page section that has
 * nothing to show — either because the request failed (backend route not
 * live yet, network hiccup) or because the person genuinely has no data
 * there yet. Both cases render the same calm style: no red, no "try
 * refreshing" — just a dashed placeholder box that reads as "nothing here
 * yet" rather than "something is broken".
 */
 export function SectionMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border-subtle bg-surface/40 px-3 py-3 text-[11.5px] text-text-dim">
      {children}
    </p>
  );
}