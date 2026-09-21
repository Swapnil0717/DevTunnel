import { Spinner } from "@/components/ui/spinner";
import type { LoadIssueListState } from "@/lib/issues/use-load-issue-list";

const BUTTON_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The one line above the All Issues table (`/issues`) that says how much
 * of the issue list is on screen and offers the way to get the rest — the
 * counterpart of `LoadCatalogBar` (`components/github-projects/`) and
 * `LoadAllIssuesBar` (`./load-all-issues-bar.tsx`), with the same
 * conventions: every state is text rather than colour or an icon alone,
 * loading/loaded are announced politely (`role="status"`), a failure is
 * `role="alert"` and offers "Try again", and it renders nothing when
 * there's nothing to say (a list that was already complete needs no bar).
 *
 * Before a successful load it says "most recently updated" and never
 * "all", and states outright that search and filters only cover what's
 * loaded, so an empty result set isn't mistaken for "there are no such
 * issues". It only claims the list is complete after a real load
 * succeeded (Frontend_Development_Rules.txt rule 58).
 */
export function LoadIssueListBar({ loader }: { loader: LoadIssueListState }) {
  const { status, issues, errorMessage, canLoadAll, loadAll } = loader;
  const count = issues.length;

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-3 flex items-center gap-2 text-[12px] text-text-dim"
      >
        <Spinner size={13} />
        <span>Loading every open issue — this can take a few seconds…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p role="alert" className="m-0 text-[12px] text-status-error-label">
          Couldn&apos;t load all issues. {errorMessage}
        </p>
        <button type="button" onClick={loadAll} className={BUTTON_CLASS}>
          Try again
        </button>
      </div>
    );
  }

  if (status === "loaded") {
    return (
      <p role="status" aria-live="polite" className="m-0 mb-3 text-[12px] text-text-faint">
        All {count.toLocaleString()} open {count === 1 ? "issue" : "issues"} loaded.
      </p>
    );
  }

  if (!canLoadAll) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <p className="m-0 text-[12px] text-text-faint">
        Showing the {count.toLocaleString()} most recently updated open issues — search and
        filters only cover what&apos;s loaded.
      </p>
      <button type="button" onClick={loadAll} className={BUTTON_CLASS}>
        Load all issues
      </button>
    </div>
  );
}
