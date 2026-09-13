import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getAdminNewIssuesSinceOnboarding } from "@/lib/admin/new-issues/since-onboarding-api";
import { AdminIssuesSinceOnboardingExplorer } from "@/components/admin/new-issues/admin-issues-since-onboarding-explorer";
import { SectionMessage } from "@/components/home/section-message";
import { CursorPaginationControls } from "@/components/admin/cursor-pagination-controls";
import { nextPageHref, parseCursorStack, prevPageHref } from "@/lib/admin/cursor-pagination";

export const metadata: Metadata = buildMetadata({
  title: "Issues Since Onboarding",
  description:
    "GitHub issues that appeared after each project was added to DevTunnel and aren't onboarded as a DevTunnel task yet.",
  path: "/admin/tasks/new-issues/since-onboarding",
  noIndex: true,
});

const BASE_PATH = "/admin/tasks/new-issues/since-onboarding";

export default async function AdminIssuesSinceOnboardingPage({
  searchParams,
}: {
  searchParams: { before?: string; stack?: string };
}) {
  const result = await getAdminNewIssuesSinceOnboarding({ before: searchParams.before });
  const stack = parseCursorStack(searchParams);

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
        <Link
          href="/admin/tasks/new"
          className="inline-flex shrink-0 items-center rounded-[8px] bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground hover:bg-accent/90"
        >
          Create task
        </Link>
      </div>

      {result.status === "error" ? (
        <SectionMessage>Issues aren&apos;t available yet — check back soon.</SectionMessage>
      ) : result.status === "empty" ? (
        <SectionMessage>
          No new GitHub issues have appeared since these projects were added to DevTunnel.
        </SectionMessage>
      ) : (
        <>
          <AdminIssuesSinceOnboardingExplorer issues={result.data} />
          <CursorPaginationControls
            hasPrevious={Boolean(searchParams.before)}
            hasNext={Boolean(result.nextCursor)}
            prevHref={prevPageHref(BASE_PATH, stack)}
            nextHref={
              result.nextCursor ? nextPageHref(BASE_PATH, searchParams.before, stack, result.nextCursor) : "#"
            }
          />
        </>
      )}
    </main>
  );
}