import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "AI Added Projects",
  description: "Projects DevTunnel's AI has proposed adding to the platform.",
  path: "/admin/ai/projects",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/ai/projects` — AI section, "AI Added Projects" (see
 * `admin-nav-items.ts`). Lists projects an AI agent has proposed onboarding
 * onto DevTunnel, ahead of an admin reviewing and confirming them (see
 * `/admin/ai/confirmation`).
 *
 * Frontend-only placeholder for now: there is no backend route yet for
 * listing AI-proposed projects. Same honest one-`SectionMessage` degrade
 * the rest of the Admin Portal uses instead of a fake or empty table
 * (Frontend_Development_Rules.txt rule 26) — swap this for a real
 * fetch + table (mirroring `AdminProjectsExplorer`) once
 * `GET /admin/ai/projects` exists.
 */
export default function AdminAiProjectsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">AI added projects</h1>
        <p className="m-0 text-sm text-text-muted">
          Projects DevTunnel&apos;s AI has proposed adding to the platform, awaiting review.
        </p>
      </div>

      <SectionMessage>AI added projects aren&apos;t available yet — check back soon.</SectionMessage>
    </main>
  );
}
