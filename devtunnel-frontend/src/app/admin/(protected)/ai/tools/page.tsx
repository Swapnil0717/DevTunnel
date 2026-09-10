import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "AI Added Tools",
  description: "Open source tools DevTunnel's AI has proposed adding to the platform.",
  path: "/admin/ai/tools",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/ai/tools` — AI section, "AI Added Tools" (see
 * `admin-nav-items.ts`). Lists open source tools an AI agent has proposed
 * adding to the Open Source Tools catalog, ahead of an admin reviewing and
 * confirming them (see `/admin/ai/confirmation`).
 *
 * Frontend-only placeholder for now: there is no backend route yet for
 * listing AI-proposed tools. Same honest one-`SectionMessage` degrade the
 * rest of the Admin Portal uses instead of a fake or empty table
 * (Frontend_Development_Rules.txt rule 26) — swap this for a real
 * fetch + table once `GET /admin/ai/tools` exists.
 */
export default function AdminAiToolsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">AI added tools</h1>
        <p className="m-0 text-sm text-text-muted">
          Open source tools DevTunnel&apos;s AI has proposed adding to the catalog, awaiting review.
        </p>
      </div>

      <SectionMessage>AI added tools aren&apos;t available yet — check back soon.</SectionMessage>
    </main>
  );
}
