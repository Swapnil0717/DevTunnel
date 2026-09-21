import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getSubmissions } from "@/lib/submissions/api";
import { DEFAULT_SUBMISSION_FILTERS } from "@/lib/submissions/types";
import { SubmissionsExplorer } from "@/components/submissions/submissions-explorer";
import RouteLoading from "./loading";
import { BlueprintReveal } from "@/components/ui/blueprint-reveal";

/**
 * Indexable when the list actually loaded (rules 2, 27); a failed or empty
 * fetch renders only an error/empty message, which has nothing worth
 * indexing (rule 23), so that response is `noindex`. The canonical URL
 * never carries the `?...` query string some links add (rule 8).
 *
 * Runs the same fetch the page itself makes — Next de-duplicates identical
 * server `fetch` calls within one request, so this costs no extra round trip.
 */
export async function generateMetadata(): Promise<Metadata> {
  const result = await getSubmissions(DEFAULT_SUBMISSION_FILTERS);

  return buildMetadata({
    title: "Community",
    description:
      "Projects and tools submitted by DevTunnel contributors — sortable by new, trending and popular, filterable by tech stack and by what they replace.",
    path: "/submissions",
    noIndex: result.status !== "ok",
  });
}

/**
 * `/submissions` — "Community" in `AppSidebar`.
 *
 * The fifth catalog in this app, and the only one nobody curates. The
 * other four are worth naming, because the distinction is the whole
 * point of this page existing:
 *
 *  - `/github-projects`, `/github-open-source-tools` — live GitHub-wide
 *    search results. DevTunnel found them; nobody chose them.
 *  - `/projects`, `/opensource-tools` — DevTunnel's curated lists. An
 *    admin onboarded each one, and tasks hang off them.
 *  - `/submissions` — contributors pointed at these. Nobody reviewed
 *    them, and every row says who submitted it.
 *
 * That last line is why submissions live in their own table rather than
 * becoming `devtunnel.projects` rows (sql/028): promoting an unreviewed
 * link into the curated catalog would put it into task matching and
 * every query that reads it.
 *
 * The first page renders server-side with the default filters, so
 * landing here shows real rows rather than a skeleton that then fetches.
 * Every filter change after that goes back to the API — sorting happens
 * in Postgres because the read is capped, and re-sorting a truncated
 * page in the browser would answer a different question than the control
 * claims (see `lib/submissions/api.ts`).
 *
 * A failed first fetch degrades to the explorer's own error state rather
 * than an empty list: "nothing has been submitted" and "we couldn't
 * reach the list" are different facts and must not look identical
 * (rule 25).
 */
export default async function SubmissionsPage() {
  const result = await getSubmissions(DEFAULT_SUBMISSION_FILTERS);

  return (
    <BlueprintReveal skeleton={<RouteLoading />}>
      <main className="w-full px-6 py-10 lg:px-10">
        <div className="mb-6">
          <h1 className="m-0 mb-1 text-xl font-medium text-text">Community</h1>
          <p className="m-0 max-w-[70ch] text-[13px] leading-relaxed text-text-muted">
            Projects and tools submitted by contributors. These aren&apos;t
            curated by DevTunnel — each one carries the name of whoever
            submitted it, and upvotes are what move something up the list.
          </p>
        </div>

        <SubmissionsExplorer
          initialSubmissions={result.status === "ok" ? result.data : []}
          initialError={result.status === "error"}
        />
      </main>
    </BlueprintReveal>
  );
}
