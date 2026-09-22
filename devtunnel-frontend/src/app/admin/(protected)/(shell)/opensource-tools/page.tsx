import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getAdminOpenSourceTools } from "@/lib/admin/opensource-tools/api";
import { AdminOpenSourceToolsExplorer } from "@/components/admin/opensource-tools/admin-opensource-tools-explorer";
import { SectionMessage } from "@/components/home/section-message";
import RouteLoading from "./loading";
import { BlueprintReveal } from "@/components/ui/blueprint-reveal";

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
 * DevTunnel catalog as a grid, with a search bar, filters, and 20-per-
 * page numbered pagination (`AdminOpenSourceToolsExplorer`) layered on
 * top of one fully-fetched `GET /admin/opensource-tools` list
 * (`getAdminOpenSourceTools` walks the backend's keyset pagination in
 * full).
 */
export default async function AdminOpenSourceToolsPage() {
  const result = await getAdminOpenSourceTools();

  return (
    <BlueprintReveal skeleton={<RouteLoading />} className="relative isolate min-h-screen w-full">
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
    </BlueprintReveal>
  );
}