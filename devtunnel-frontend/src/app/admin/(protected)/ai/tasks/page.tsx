import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "AI Added Tasks",
  description: "Tasks DevTunnel's AI has proposed creating for onboarded projects.",
  path: "/admin/ai/tasks",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/ai/tasks` — AI section, "AI Added Tasks" (see
 * `admin-nav-items.ts`). Lists tasks an AI agent has proposed creating for
 * onboarded projects, ahead of an admin reviewing and confirming them
 * (see `/admin/ai/confirmation`).
 *
 * Frontend-only placeholder for now: there is no backend route yet for
 * listing AI-proposed tasks. Same honest one-`SectionMessage` degrade the
 * rest of the Admin Portal uses instead of a fake or empty table
 * (Frontend_Development_Rules.txt rule 26) — swap this for a real
 * fetch + table (mirroring `AdminTasksExplorer`) once `GET /admin/ai/tasks`
 * exists.
 */
export default function AdminAiTasksPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">AI added tasks</h1>
        <p className="m-0 text-sm text-text-muted">
          Tasks DevTunnel&apos;s AI has proposed creating for onboarded projects, awaiting review.
        </p>
      </div>

      <SectionMessage>AI added tasks aren&apos;t available yet — check back soon.</SectionMessage>
    </main>
  );
}
