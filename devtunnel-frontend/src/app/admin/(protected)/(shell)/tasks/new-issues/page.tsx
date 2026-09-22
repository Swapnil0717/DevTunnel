import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getAdminNewIssues } from "@/lib/admin/new-issues/api";
import { AdminNewIssuesExplorer } from "@/components/admin/new-issues/admin-new-issues-explorer";
import { SyncAllIssuesButton } from "@/components/admin/new-issues/sync-all-issues-button";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "All Issue",
  description: "GitHub issues that exist in a DevTunnel project's repository but aren't onboarded as a DevTunnel task yet.",
  path: "/admin/tasks/new-issues",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/tasks/new-issues` — Admin Portal Master Coding Specification,
 * section 16 ("New Issues Section") / A15 in the final page list
 * (section 29).
 *
 * Purpose (section 16): show GitHub issues that are present on GitHub
 * **and** not currently covered by DevTunnel — section 9's "New Issue
 * Detection" algorithm. Each issue shows Issue #, Issue Title, Project,
 * GitHub Author, Labels, Created, Updated, with View / Create Task /
 * Ignore actions, search/filters, and 20-per-page numbered pagination
 * (`AdminNewIssuesExplorer`) layered on top of one fully-fetched
 * `GET /admin/new-issues` list (`getAdminNewIssues` walks the backend's
 * keyset pagination in full).
 *
 * `SyncAllIssuesButton` re-runs that same live, cross-project GitHub
 * scan on demand and reports a summary before refreshing the page —
 * this list is already always fresh on every server render, so the
 * button's value is giving the Admin an explicit "pull the latest
 * GitHub state now" action with visible feedback, the same posture
 * `SyncAllProjectsGithubDataButton` takes on the Projects page.
 */
export default async function AdminNewIssuesPage() {
  const result = await getAdminNewIssues();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1 text-xl font-medium text-text">All Issue</h1>
          <p className="m-0 text-sm text-text-muted">
            GitHub issues from your projects&apos; repositories that aren&apos;t onboarded as
            DevTunnel tasks yet.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <SyncAllIssuesButton />
          <Link
            href="/admin/tasks/new"
            className="inline-flex shrink-0 items-center rounded-[8px] bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground hover:bg-accent/90"
          >
            Create task
          </Link>
        </div>
      </div>

      {result.status === "error" ? (
        <SectionMessage>New issues aren&apos;t available yet — check back soon.</SectionMessage>
      ) : result.status === "empty" ? (
        <SectionMessage>
          No new GitHub issues right now — everything is either already onboarded as a task or
          ignored.
        </SectionMessage>
      ) : (
        <AdminNewIssuesExplorer issues={result.data} />
      )}
    </main>
  );
}