import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "Confirmation by Admin",
  description: "Review queue for AI-proposed projects, tools, and tasks awaiting admin approval.",
  path: "/admin/ai/confirmation",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/ai/confirmation` — AI section, "Confirmation by Admin" (see
 * `admin-nav-items.ts`). The single review queue where an admin approves
 * or rejects everything the AI has proposed across AI Added Projects, AI
 * Added Tools, and AI Added Tasks, rather than confirming from three
 * separate pages.
 *
 * Frontend-only placeholder for now: there is no backend route yet for
 * a combined AI review queue. Same honest one-`SectionMessage` degrade
 * the rest of the Admin Portal uses instead of a fake or empty table
 * (Frontend_Development_Rules.txt rule 26) — swap this for a real
 * fetch + approve/reject table once `GET /admin/ai/confirmation` (or
 * equivalent) exists.
 */
export default function AdminAiConfirmationPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">Confirmation by admin</h1>
        <p className="m-0 text-sm text-text-muted">
          Review and confirm AI-proposed projects, tools, and tasks before they go live.
        </p>
      </div>

      <SectionMessage>Nothing is awaiting confirmation yet — check back soon.</SectionMessage>
    </main>
  );
}
