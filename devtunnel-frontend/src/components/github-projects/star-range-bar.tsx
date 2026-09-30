import { Spinner } from "@/components/ui/spinner";
import type { StarRangeCatalogState } from "@/lib/github-projects/use-star-range-catalog";

const BUTTON_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Status line shown instead of `LoadCatalogBar` while a Minimum/Maximum stars
 * range is selected (`useStarRangeCatalog`). Same conventions as
 * `LoadCatalogBar`: states are text, loading is announced politely, a failure
 * is `role="alert"` with a retry.
 *
 * The loaded message is deliberately honest about the ceiling: GitHub search
 * returns at most 1,000 repositories per query, so each star bucket holds its
 * top 1,000 by stars — a busy range can have more than is listed here.
 */
export function StarRangeBar({
  range,
  noun,
}: {
  range: StarRangeCatalogState;
  noun: string;
}) {
  const { status, projects, errorMessage, loadedBuckets, totalBuckets, retry } = range;

  if (status === "error") {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p role="alert" className="m-0 text-[12px] text-status-error-label">
          Couldn&apos;t load {noun} for this star range. {errorMessage}
        </p>
        <button type="button" onClick={retry} className={BUTTON_CLASS}>
          Try again
        </button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-4 flex items-center gap-2 text-[12px] text-text-dim"
      >
        <Spinner size={13} />
        <span>
          Loading {noun} for this star range from GitHub
          {totalBuckets > 1 ? ` (${loadedBuckets} of ${totalBuckets})` : ""}…
        </span>
      </div>
    );
  }

  if (status === "loaded") {
    return (
      <p role="status" aria-live="polite" className="m-0 mb-4 text-[12px] text-text-faint">
        {projects.length.toLocaleString()} {noun} in this star range. GitHub lists up to 1,000
        per range, so very busy ranges show the most-starred ones first.
      </p>
    );
  }

  return null;
}
