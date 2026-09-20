import { Spinner } from "@/components/ui/spinner";
import type { LoadAllIssuesState } from "@/lib/issues/use-load-all-issues";

const BUTTON_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50";

function issueNoun(count: number): string {
  return count === 1 ? "issue" : "issues";
}

/**
 * The one line above a repository's issue list that says how much of the
 * backlog is on screen and offers the way to get the rest — shared by
 * all four detail pages' Issues tabs (GitHub Projects, GitHub Open
 * Source Tools, DevTunnel Projects, DevTunnel Tools) so the wording, the
 * loading/error handling and the "is this list complete?" claim are
 * identical everywhere (Frontend_Development_Rules.txt rule 51).
 *
 * Every state is text, not colour or an icon alone (rule 43), and the
 * moving parts are announced: loading and loaded use `role="status"`
 * (polite), a failure uses `role="alert"`, so a screen-reader user
 * learns the result of pressing the button without hunting for it
 * (rules 26/35). It renders nothing when there's nothing to say — a
 * list that's already complete and was never "loaded" needs no bar.
 *
 * It only claims a list is complete after a real "Load all issues"
 * result. Before that it says "recently updated", never "all", because
 * the preview is deliberately a first page (rule 58: don't state what
 * wasn't actually checked). `truncated` — the backend hit its cap —
 * gets its own message with a link to GitHub for the remainder rather
 * than a quietly capped list.
 */
export function LoadAllIssuesBar<Row>({
  loader,
  repositoryUrl,
}: {
  loader: LoadAllIssuesState<Row>;
  /** The repository's GitHub URL, for the "view the rest on GitHub" link. `null` when there isn't one. */
  repositoryUrl: string | null;
}) {
  const { status, issues, truncated, errorMessage, canLoadMore, loadAll } = loader;
  const count = issues.length;

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-3 flex items-center gap-2 text-[12px] text-text-dim"
      >
        <Spinner size={13} />
        <span>Loading every open issue — this can take a few seconds on a large repository…</span>
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
        {truncated ? (
          <>
            Loaded the {count.toLocaleString()} most recently updated open {issueNoun(count)}. This
            repository has more than that
            {repositoryUrl ? (
              <>
                {" — "}
                <a
                  href={`${repositoryUrl}/issues`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent hover:underline"
                >
                  view the rest on GitHub
                </a>
              </>
            ) : null}
            .
          </>
        ) : (
          <>
            All {count.toLocaleString()} open {issueNoun(count)} loaded.
          </>
        )}
      </p>
    );
  }

  if (!canLoadMore) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <p className="m-0 text-[12px] text-text-faint">
        {count === 0
          ? "No open issues are loaded yet."
          : `Showing ${count.toLocaleString()} recently updated open ${issueNoun(count)}.`}
      </p>
      <button type="button" onClick={loadAll} className={BUTTON_CLASS}>
        Load all issues
      </button>
    </div>
  );
}
