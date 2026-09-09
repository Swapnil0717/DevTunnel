import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getAdminNewIssuesSinceOnboarding } from "@/lib/admin/new-issues/since-onboarding-api";
import { AdminIssuesSinceOnboardingExplorer } from "@/components/admin/new-issues/admin-issues-since-onboarding-explorer";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "Issues Since Onboarding",
  description:
    "GitHub issues that appeared after each project was added to DevTunnel and aren't onboarded as a DevTunnel task yet.",
  path: "/admin/tasks/new-issues/since-onboarding",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/tasks/new-issues/since-onboarding` — a filtered lens on the
 * Admin New Issues page (admin_workflow.txt, section 16), not a new
 * resource of its own. See `lib/admin/new-issues/since-onboarding.ts`
 * for the full reasoning; in short:
 *
 * The plain New Issues page (`/admin/tasks/new-issues`) shows every
 * GitHub issue that exists and isn't yet covered by DevTunnel,
 * regardless of when it was opened. For a project whose repository
 * pre-dates its DevTunnel onboarding, that list can be dominated by
 * issues that have nothing to do with DevTunnel picking the project up
 * — they were just always there. This page narrows that same list down
 * to issues opened on GitHub on or after the day their project was
 * added to DevTunnel, so an Admin can see what's actually new *because*
 * the project joined DevTunnel.
 *
 * Frontend-only for now: there is no dedicated backend route for this
 * view (see `since-onboarding-api.ts`) — it reuses the same
 * `GET /admin/new-issues` fetch `/admin/tasks/new-issues` already makes
 * and filters client-of-the-server-side, same "one real data source,
 * narrowed" convention `AdminNewIssuesExplorer` uses for its own
 * in-browser search (Frontend_Development_Rules.txt rule 58).
 *
 * Same three-state degrade as the plain New Issues page (rule 26): a
 * failed or fully-empty fetch renders one honest `SectionMessage`
 * instead of a broken or blank table.
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
        <AdminIssuesSinceOnboardingExplorer issues={result.data} />
      )}
    </main>
  );
}