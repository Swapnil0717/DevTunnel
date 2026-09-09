import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getAdminNewIssues } from "@/lib/admin/new-issues/api";
import { AdminNewIssuesExplorer } from "@/components/admin/new-issues/admin-new-issues-explorer";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "New issues",
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
 * Detection" algorithm ("Compare Issue IDs… GitHub Issue exists in
 * DevTunnel? NO → New Issue"). This is explicitly *not* a project-health
 * system (section 16), so nothing here surfaces repository health, code
 * quality, or similar metrics the spec removes from Admin entirely
 * (section 1).
 *
 * Each issue shows Issue #, Issue Title, Project, GitHub Author, Labels,
 * Created, Updated, with View / Create Task / Ignore actions
 * (`AdminNewIssuesExplorer` / `AdminNewIssuesTable`), plus search and
 * filters by repository, author, tech stack, and project layered on top
 * of the one `GET /admin/new-issues` fetch.
 *
 * That endpoint isn't built on the backend yet (see
 * `lib/admin/new-issues/api.ts`), so — same convention as the Tasks and
 * Projects pages — a failed or empty fetch degrades to one honest
 * `SectionMessage` instead of a fabricated table or a blank page
 * (Frontend_Development_Rules.txt rule 26/58).
 */
export default async function AdminNewIssuesPage() {
  const result = await getAdminNewIssues();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1 text-xl font-medium text-text">New issues</h1>
          <p className="m-0 text-sm text-text-muted">
            GitHub issues from your projects&apos; repositories that aren&apos;t onboarded as
            DevTunnel tasks yet.
          </p>
        </div>
        <Link
          href="/admin/tasks/new"
          className="inline-flex shrink-0 items-center rounded-[8px] bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground hover:bg-accent/90"
        >
          Create task
        </Link>
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