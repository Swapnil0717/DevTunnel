import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getAdminNewIssuesSinceOnboarding } from "@/lib/admin/new-issues/since-onboarding-api";
import { AdminIssuesSinceOnboardingExplorer } from "@/components/admin/new-issues/admin-issues-since-onboarding-explorer";
import { SyncAllIssuesButton } from "@/components/admin/new-issues/sync-all-issues-button";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "Issues Since Onboarding",
  description:
    "GitHub issues that appeared after each project was added to DevTunnel and aren't onboarded as a DevTunnel task yet.",
  path: "/admin/tasks/new-issues/since-onboarding",
  noIndex: true,
});

/**
 * `/admin/tasks/new-issues/since-onboarding` — a date-filtered lens on
 * the same New Issues list (`getAdminNewIssuesSinceOnboarding` fetches
 * and filters the fully-walked `GET /admin/new-issues` result, no
 * separate backend route). Search/filters and 20-per-page numbered
 * pagination are handled by `AdminIssuesSinceOnboardingExplorer`.
 *
 * `SyncAllIssuesButton` triggers the same live GitHub re-scan as the
 * plain New Issues page — this view is just a narrower slice of that
 * same data.
 */
export default async function AdminIssuesSinceOnboardingPage() {
  const result = await getAdminNewIssuesSinceOnboarding();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1 text-xl font-medium text-text">Issues since onboarding</h1>
          <p className="m-0 text-sm text-text-muted">
            New GitHub issues opened on or after the day each project was added to DevTunnel,
            and aren&apos;t onboarded as a DevTunnel task yet.
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
        <SectionMessage>Issues aren&apos;t available yet — check back soon.</SectionMessage>
      ) : result.status === "empty" ? (
        <SectionMessage>
          No new GitHub issues have appeared since these projects were added to DevTunnel.
        </SectionMessage>
      ) : (
        <AdminIssuesSinceOnboardingExplorer issues={result.data} />
      )}
    </main>
  );
}