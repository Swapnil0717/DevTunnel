import { Spinner } from "@/components/ui/spinner";
import type { LoadFullCatalogState } from "@/lib/github-projects/use-load-full-catalog";

const BUTTON_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The one line above a GitHub catalog grid (`/github-projects`,
 * `/github-open-source-tools`) that says how much of the catalog is on
 * screen and offers the way to get the rest — the list-page counterpart
 * of `LoadAllIssuesBar` (`components/issues/load-all-issues-bar.tsx`),
 * with the same conventions: every state is text rather than colour or
 * an icon alone, loading/loaded are announced politely
 * (`role="status"`), a failure is `role="alert"` and offers "Try again",
 * and it renders nothing when there's nothing to say.
 *
 * Before a successful load it says "top N … by stars" and never "all" —
 * the preview is deliberately the first page of a stars-ranked catalog,
 * and it says outright that search and filters only see what's loaded, so
 * an empty result set isn't mistaken for "GitHub has nothing matching".
 * It only claims the list is complete after a real load succeeded
 * (Frontend_Development_Rules.txt rule 58).
 *
 * `noun` is the plural the page uses for its rows — "projects" or "tools".
 */
export function LoadCatalogBar({
  loader,
  noun,
}: {
  loader: LoadFullCatalogState;
  noun: string;
}) {
  const { status, projects, errorMessage, canLoadAll, loadAll } = loader;
  const count = projects.length;

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-4 flex items-center gap-2 text-[12px] text-text-dim"
      >
        <Spinner size={13} />
        <span>Loading the full list of {noun} from GitHub — this can take a few seconds…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p role="alert" className="m-0 text-[12px] text-status-error-label">
          Couldn&apos;t load all {noun}. {errorMessage}
        </p>
        <button type="button" onClick={loadAll} className={BUTTON_CLASS}>
          Try again
        </button>
      </div>
    );
  }

  if (status === "loaded") {
    return (
      <p role="status" aria-live="polite" className="m-0 mb-4 text-[12px] text-text-faint">
        All {count.toLocaleString()} {noun} loaded.
      </p>
    );
  }

  if (!canLoadAll) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <p className="m-0 text-[12px] text-text-faint">
        Showing the top {count.toLocaleString()} {noun} by stars — search and filters only cover
        what&apos;s loaded.
      </p>
      <button type="button" onClick={loadAll} className={BUTTON_CLASS}>
        Load all {noun}
      </button>
    </div>
  );
}
