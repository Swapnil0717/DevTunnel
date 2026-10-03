// src/app/admin/(protected)/(shell)/bug-reports/page.tsx
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getAdminBugReportsPage } from "@/lib/admin/bug-reports/api";
import {
  nextPageHref,
  parseCursorStack,
  prevPageHref,
  type CursorSearchParams,
} from "@/lib/admin/cursor-pagination";
import { AdminBugReportsList } from "@/components/admin/bug-reports/admin-bug-reports-list";
import { CursorPaginationControls } from "@/components/admin/cursor-pagination-controls";
import { SectionMessage } from "@/components/home/section-message";
import RouteLoading from "./loading";
import { BlueprintReveal } from "@/components/ui/blueprint-reveal";

export const metadata: Metadata = buildMetadata({
  title: "Bug reports",
  description: "Bugs reported by visitors through the Found a bug popup on DevTunnel.",
  path: "/admin/bug-reports",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

const BASE_PATH = "/admin/bug-reports";

/**
 * `/admin/bug-reports` — read-only list of what visitors sent through the
 * header's "Found a bug" popup, newest first.
 *
 * Reads `GET /admin/bug-reports` (needs `admin:bug-reports:read`). Paging uses
 * the same URL-based cursor stack as the other admin lists
 * (`lib/admin/cursor-pagination.ts`), so Previous/Next are plain links.
 */
export default async function AdminBugReportsPage({
  searchParams,
}: {
  searchParams?: Promise<CursorSearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const stack = parseCursorStack(params);
  const result = await getAdminBugReportsPage(params.before);

  return (
    <BlueprintReveal skeleton={<RouteLoading />} className="relative isolate min-h-screen w-full">
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <h1 className="m-0 mb-1 text-xl font-medium text-text">Bug reports</h1>
          <p className="m-0 text-sm text-text-muted">
            What visitors sent through Found a bug — newest first.
          </p>
        </div>

        {result.status === "error" ? (
          <SectionMessage>Bug reports aren&apos;t available right now — try again soon.</SectionMessage>
        ) : result.data.reports.length === 0 && !params.before ? (
          <SectionMessage>No bug reports yet.</SectionMessage>
        ) : (
          <>
            <AdminBugReportsList reports={result.data.reports} />
            <CursorPaginationControls
              hasPrevious={Boolean(params.before)}
              hasNext={result.data.nextCursor !== null}
              prevHref={prevPageHref(BASE_PATH, stack)}
              nextHref={
                result.data.nextCursor
                  ? nextPageHref(BASE_PATH, params.before, stack, result.data.nextCursor)
                  : BASE_PATH
              }
            />
          </>
        )}
      </main>
    </BlueprintReveal>
  );
}
