import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getAdminProjects } from "@/lib/admin/projects/api";
import { AdminProjectsExplorer } from "@/components/admin/projects/admin-projects-explorer";
import { SyncAllProjectsGithubDataButton } from "@/components/admin/projects/sync-all-projects-github-data-button";
import { SectionMessage } from "@/components/home/section-message";
import { CursorPaginationControls } from "@/components/admin/cursor-pagination-controls";
import { nextPageHref, parseCursorStack, prevPageHref } from "@/lib/admin/cursor-pagination";

export const metadata: Metadata = buildMetadata({
  title: "Projects",
  description: "All projects currently available on DevTunnel.",
  path: "/admin/projects",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/projects` — Admin Portal Master Coding Specification, section 4
 * — Projects Page (A3 in the final page list, section 29).
 *
 * "Show all projects currently available on DevTunnel." Fetches
 * `GET /admin/projects` server-side (section 22 — Admin Backend API Map)
 * and hands the full list to `AdminProjectsExplorer`, which adds a
 * client-side search + status filter on top of the section-4 table.
 * That endpoint isn't built on the backend yet (see
 * `lib/admin/projects/api.ts`), so — same convention as the dashboard's
 * stat cards and traction chart — a failed or empty fetch degrades to
 * one honest `SectionMessage` instead of a fabricated table or a blank
 * page (Frontend_Development_Rules.txt rule 58).
 */
const BASE_PATH = "/admin/projects";

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: { before?: string; stack?: string };
}) {
  const result = await getAdminProjects({ before: searchParams.before });
  const stack = parseCursorStack(searchParams);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1 text-xl font-medium text-text">Projects</h1>
          <p className="m-0 text-sm text-text-muted">
            All projects currently available on DevTunnel.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <SyncAllProjectsGithubDataButton />
          <Link
            href="/admin/projects/new"
            className="inline-flex shrink-0 items-center rounded-[8px] bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground hover:bg-accent/90"
          >
            Onboard a project
          </Link>
        </div>
      </div>

      {result.status === "error" ? (
        <SectionMessage>
          Projects aren&apos;t available yet — check back soon.
        </SectionMessage>
      ) : result.status === "empty" ? (
        <SectionMessage>
          No projects have been onboarded yet. Start with{" "}
          <Link href="/admin/projects/new" className="text-text-secondary hover:text-accent">
            Project Onboarding
          </Link>
          .
        </SectionMessage>
      ) : (
        <>
          <AdminProjectsExplorer projects={result.data} />
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