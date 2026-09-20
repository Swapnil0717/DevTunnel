import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getIssues } from "@/lib/issues/api";
import { IssuesExplorer } from "@/components/issues/issues-explorer";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "All Issues",
  description:
    "Every open GitHub issue across DevTunnel's onboarded projects, searchable and filterable by project, repository, author, and tech stack.",
  path: "/issues",
  // Private, authenticated-only application UI — never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/issues` — "All Issues" in `AppSidebar` / `AppBottomNav`. The
 * contributor-facing counterpart to the Admin Portal's
 * `/admin/tasks/new-issues` ("All Issue") page: every open GitHub issue
 * across DevTunnel's onboarded projects, browsable with search + filters
 * and 20-per-page pagination (`IssuesExplorer`), layered on top of one
 * fully-fetched `GET /issues` list (`getIssues` walks the backend's
 * keyset pagination in full — see `lib/issues/api.ts`).
 *
 * Unlike the Admin page, there's no "Create task" / "Ignore" / "Sync"
 * here — those curate DevTunnel's task list and re-trigger a live
 * cross-project GitHub scan, both Admin/Maintainer responsibilities
 * (`AdminNewIssuesTable`, `SyncAllIssuesButton`). This page is read-only
 * browsing for a contributor deciding what to work on next.
 */
export default async function IssuesPage() {
  const result = await getIssues();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">All Issues</h1>
        <p className="m-0 text-sm text-text-muted">
          Every open GitHub issue across DevTunnel&apos;s onboarded projects — search or filter to
          find something to work on.
        </p>
      </div>

      {result.status === "error" ? (
        <SectionMessage>Issues aren&apos;t available yet — check back soon.</SectionMessage>
      ) : result.status === "empty" ? (
        <SectionMessage>No open GitHub issues right now — check back soon.</SectionMessage>
      ) : (
        <IssuesExplorer issues={result.data} />
      )}
    </main>
  );
}