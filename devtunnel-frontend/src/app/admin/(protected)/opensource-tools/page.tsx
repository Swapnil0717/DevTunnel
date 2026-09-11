import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getAdminOpenSourceTools } from "@/lib/admin/opensource-tools/api";
import { AdminOpenSourceToolsExplorer } from "@/components/admin/opensource-tools/admin-opensource-tools-explorer";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "Open Source Tools",
  description: "All open source tools currently available in the DevTunnel catalog.",
  path: "/admin/opensource-tools",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/opensource-tools` — "All Open Source Tools" in
 * `admin-nav-items.ts`. Shows every open source tool currently in the
 * DevTunnel catalog as a grid of square boxes (logo, name, then
 * View / Edit / Delete), with a search bar and filters built only from
 * fields recorded during tool onboarding (primary language, labels) —
 * same split `/admin/projects` makes between this server-fetching page
 * and `AdminProjectsExplorer`'s client-side search/filter layer.
 *
 * Previously this route rendered `OpenSourceToolOnboardingWizard` — the
 * same component `/admin/opensource-tools/new` renders — because no
 * listing screen existed yet. That duplication is retired now that this
 * is a real listing page; adding a tool lives at
 * `/admin/opensource-tools/new` only, linked from the "Add tool" button
 * below (rule 11 — don't create orphan pages; rule 56 — this route
 * already exists and the wizard was never a documented spec URL of its
 * own, so nothing publicly indexed is broken by the swap).
 *
 * `GET /admin/opensource-tools` isn't built on the backend yet (see
 * `lib/admin/opensource-tools/api.ts` — only the six onboarding-wizard
 * routes are mounted under `/admin/opensource-tools/onboarding` so far),
 * so a failed or empty fetch degrades to one honest `SectionMessage`
 * instead of a fabricated grid or a blank page (rule 58).
 */
export default async function AdminOpenSourceToolsPage() {
  const result = await getAdminOpenSourceTools();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1 text-xl font-medium text-text">Open Source Tools</h1>
          <p className="m-0 text-sm text-text-muted">
            All open source tools currently available on DevTunnel.
          </p>
        </div>
        <Link
          href="/admin/opensource-tools/new"
          className="inline-flex shrink-0 items-center rounded-[8px] bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground hover:bg-accent/90"
        >
          Add tool
        </Link>
      </div>

      {result.status === "error" ? (
        <SectionMessage>
          Open source tools aren&apos;t available yet — check back soon.
        </SectionMessage>
      ) : result.status === "empty" ? (
        <SectionMessage>
          No open source tools have been added yet. Start with{" "}
          <Link href="/admin/opensource-tools/new" className="text-text-secondary hover:text-accent">
            Add Open Source Tool
          </Link>
          .
        </SectionMessage>
      ) : (
        <AdminOpenSourceToolsExplorer tools={result.data} />
      )}
    </main>
  );
}