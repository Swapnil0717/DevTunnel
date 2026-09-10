import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "Add Open Source Tool",
  description: "Add a new open source tool to the DevTunnel catalog.",
  path: "/admin/opensource-tools/new",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/opensource-tools/new` — Open Source Tools section, "Add Open
 * Source Tool" (see `admin-nav-items.ts`). Where an admin adds a new open
 * source tool to the catalog shown at `/admin/opensource-tools`.
 *
 * Frontend-only placeholder for now: there is no backend route yet to
 * submit a new tool to, so this intentionally doesn't render a form an
 * admin could fill in and lose (Frontend_Development_Rules.txt rule 26 —
 * don't fake functionality that doesn't work yet). Same honest
 * `SectionMessage` degrade the rest of the Admin Portal uses — swap this
 * for a real form (mirroring `ProjectOnboardingWizard`'s first step) once
 * `POST /admin/opensource-tools` exists.
 */
export default function AdminAddOpenSourceToolPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">Add open source tool</h1>
        <p className="m-0 text-sm text-text-muted">
          Add a new open source tool to the DevTunnel catalog.
        </p>
      </div>

      <SectionMessage>
        Adding open source tools isn&apos;t available yet — check back soon.
      </SectionMessage>
    </main>
  );
}
