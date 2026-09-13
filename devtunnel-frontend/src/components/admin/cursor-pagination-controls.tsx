import Link from "next/link";

/**
 * Previous/Next controls for the admin backend's keyset-paginated list
 * endpoints (see `lib/admin/cursor-pagination.ts` for the URL scheme).
 * A plain server-rendered component — both links are real `<Link>`s that
 * trigger a normal page navigation/refetch, so no client JS or fetch
 * logic is needed here; the Server Component page above does the actual
 * data fetching for whichever page the URL now points at.
 *
 * Renders nothing when there's only one page of results, so pages with
 * few items don't grow an empty pagination bar.
 */
export function CursorPaginationControls({
  hasPrevious,
  hasNext,
  prevHref,
  nextHref,
}: {
  hasPrevious: boolean;
  hasNext: boolean;
  prevHref: string;
  nextHref: string;
}) {
  if (!hasPrevious && !hasNext) return null;

  const buttonClass =
    "inline-flex items-center rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[12.5px] font-medium text-text hover:bg-surface-raised";
  const disabledClass =
    "inline-flex items-center rounded-[8px] border border-border-subtle px-3.5 py-2 text-[12.5px] font-medium text-text-faint cursor-not-allowed";

  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex items-center justify-between gap-3 border-t border-border-subtle pt-4"
    >
      {hasPrevious ? (
        <Link href={prevHref} className={buttonClass}>
          ← Previous
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          ← Previous
        </span>
      )}

      {hasNext ? (
        <Link href={nextHref} className={buttonClass}>
          Next →
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          Next →
        </span>
      )}
    </nav>
  );
}
