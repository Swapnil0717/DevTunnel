import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "Open Source Tools",
  description: "All open source tools currently listed on DevTunnel.",
  path: "/admin/opensource-tools",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/opensource-tools` — Open Source Tools section, "All Open Source
 * Tools" (see `admin-nav-items.ts`). Shows every open source tool
 * currently listed on DevTunnel, with a "Add open source tool" CTA into
 * `/admin/opensource-tools/new` — same header + CTA layout `/admin/projects`
 * uses for its own "All Projects" + "Onboard a project" pairing.
 *
 * Frontend-only placeholder for now: there is no backend route yet for
 * listing open source tools. Same honest one-`SectionMessage` degrade the
 * rest of the Admin Portal uses instead of a fake or empty table
 * (Frontend_Development_Rules.txt rule 26) — swap this for a real
 * fetch + table (mirroring `AdminProjectsExplorer`) once
 * `GET /admin/opensource-tools` exists.
 */
export default function AdminOpenSourceToolsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1 text-xl font-medium text-text">Open source tools</h1>
          <p className="m-0 text-sm text-text-muted">
            All open source tools currently listed on DevTunnel.
          </p>
        </div>
        <Link
          href="/admin/opensource-tools/new"
          className="inline-flex shrink-0 items-center rounded-[8px] bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground hover:bg-accent/90"
        >
          Add open source tool
        </Link>
      </div>

      <SectionMessage>
        Open source tools aren&apos;t available yet — check back soon.
      </SectionMessage>
    </main>
  );
}
