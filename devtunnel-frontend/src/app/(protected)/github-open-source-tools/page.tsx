import type { Metadata } from "next";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { getGithubOpenSourceTools } from "@/lib/github-open-source-tools/api";
import {
  GithubProjectsExplorer,
  NO_CATALOG_FILTER,
  type CatalogFilterConfig,
} from "@/components/github-projects/github-projects-explorer";
import { SectionMessage } from "@/components/home/section-message";
import { SkeletonFilterBar, SkeletonGithubProjectCardGrid } from "@/components/ui/skeleton";

export const metadata: Metadata = buildMetadata({
  title: "Github Open Source Tools",
  description:
    "Explore open-source developer tools from across GitHub — CLIs, libraries, and utilities — searchable and filterable by tech stack, star count, and activity.",
  path: "/github-open-source-tools",
  // Private, authenticated-only application UI — never public content
  // (Frontend_Development_Rules.txt rule 18), same treatment every other
  // `(protected)` route gives (see `/github-projects/page.tsx`).
  noIndex: true,
});

/**
 * The one named filter this catalog's backend route declares
 * (`src/routes/githubOpenSourceTools.ts`'s `CATALOG_CONFIG.filters`).
 */
const ALTERNATIVE_TO_PAID = "alternative-to-paid";

const CATALOG_FILTER_PARAM = "filter";

/**
 * `NO_CATALOG_FILTER` ("ALL") is the same "no selection" sentinel
 * `GithubProjectsExplorer` already uses for its own Tech stack/Minimum
 * stars dropdowns — reused here so all three dropdowns share one
 * convention.
 */
const CATALOG_FILTER_OPTIONS = [
  { value: NO_CATALOG_FILTER, label: "All tools" },
  { value: ALTERNATIVE_TO_PAID, label: "Alternative to paid software" },
];

interface GithubOpenSourceToolsPageProps {
  /** `?filter=alternative-to-paid` — see `CATALOG_FILTER_OPTIONS` above. */
  searchParams?: Promise<{ filter?: string }>;
}

/**
 * `/github-open-source-tools` — "Github Open source tools" in
 * `AppSidebar`. Sibling of `/github-projects` ("GitHub Projects"): same
 * live, GitHub-wide catalog shape, narrowed backend-side to
 * repositories that read as developer tools (CLIs, libraries, dev-
 * workflow utilities) rather than general open-source projects — see
 * `src/routes/githubOpenSourceTools.ts`'s doc comment for the discovery
 * query.
 *
 * Distinct from `/opensource-tools` ("Open Source Tools on DevTunnel"):
 * that's DevTunnel's own curated, onboarded tool list; this is the
 * unfiltered, GitHub-wide catalog — same relationship `/github-projects`
 * has to `/projects` ("Projects on DevTunnel").
 *
 * Reuses `GithubProjectsExplorer` as-is (search + tech-stack/star
 * filters + trending/stars/newest/recently-updated sort + 12-per-page
 * grid pagination) rather than a parallel component — the underlying
 * data shape and card UI are identical to `/github-projects`, only the
 * catalog's population differs, and that's already handled backend-side
 * (`getGithubOpenSourceTools`).
 *
 * The one thing this page adds beyond `/github-projects`: a "Show" filter
 * (`CATALOG_FILTER_OPTIONS`) for "Alternative to paid software". Unlike
 * `GithubProjectsExplorer`'s other filters (client-side, over the list
 * already fetched), this one changes *which* backend query ran — so it's
 * read from `?filter=` here, passed straight into `getGithubOpenSourceTools`
 * before the fetch happens, and the explorer is only told the active
 * value so it can render the dropdown and navigate to a new `?filter=`
 * on change (`components/github-projects/github-projects-explorer.tsx`).
 */
export default async function GithubOpenSourceToolsPage({
  searchParams,
}: GithubOpenSourceToolsPageProps) {
  const resolvedSearchParams = await searchParams;
  const requestedFilter = resolvedSearchParams?.filter;
  const activeFilter =
    requestedFilter === ALTERNATIVE_TO_PAID ? ALTERNATIVE_TO_PAID : NO_CATALOG_FILTER;

  const result = await getGithubOpenSourceTools(
    activeFilter === NO_CATALOG_FILTER ? undefined : activeFilter,
  );

  const catalogFilter: CatalogFilterConfig = {
    paramName: CATALOG_FILTER_PARAM,
    value: activeFilter,
    options: CATALOG_FILTER_OPTIONS,
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">Github Open Source Tools</h1>
        <p className="m-0 text-sm text-text-muted">
          Real open-source developer tools from across GitHub — search or filter by tech stack,
          stars, and activity to find one worth exploring.
        </p>
      </div>

      {result.status === "error" ? (
        <SectionMessage>
          GitHub open source tools aren&apos;t available yet — check back soon.
        </SectionMessage>
      ) : result.status === "empty" ? (
        <SectionMessage>
          {activeFilter === NO_CATALOG_FILTER
            ? "No open source tools found — check back soon."
            : "No open-source alternatives to paid software found — check back soon."}
        </SectionMessage>
      ) : (
        // See `/github-projects/page.tsx` for why this needs a Suspense
        // boundary (GithubProjectsExplorer calls useSearchParams).
        <Suspense
          fallback={
            <>
              <SkeletonFilterBar filters={4} />
              <SkeletonGithubProjectCardGrid />
            </>
          }
        >
          <GithubProjectsExplorer
            projects={result.data}
            catalogFilter={catalogFilter}
            // The server renders only the first page; "Load all tools"
            // fetches the rest — for the same `?filter=` population the
            // preview came from, so a filtered view never fills up with
            // unfiltered rows.
            catalogLoad={{
              path: "/github-open-source-tools",
              noun: "tools",
              filter: activeFilter === NO_CATALOG_FILTER ? undefined : activeFilter,
              hasMore: result.hasMore,
            }}
            cardBasePath="/github-open-source-tools"
          />
        </Suspense>
      )}
    </main>
  );
}