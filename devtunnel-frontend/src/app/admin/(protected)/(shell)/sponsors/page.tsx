// src/app/admin/(protected)/(shell)/sponsors/page.tsx
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getAdminSponsorsFirstPage } from "@/lib/admin/sponsors/api";
import { getSponsorsData } from "@/lib/sponsors/api";
import { AdminSponsorsManager } from "@/components/admin/sponsors/admin-sponsors-manager";
import { SponsorGoalEditor } from "@/components/admin/sponsors/sponsor-goal-editor";
import RouteLoading from "./loading";
import { BlueprintReveal } from "@/components/ui/blueprint-reveal";

export const metadata: Metadata = buildMetadata({
  title: "Sponsors",
  description: "Approve and edit sponsors, add manual sponsors and set the monthly goal on DevTunnel.",
  path: "/admin/sponsors",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/sponsors` — moderation for the public `/sponsors` page.
 *
 * The table reads `GET /admin/sponsors` (needs `admin:sponsors:read`) and
 * every change goes through `PATCH /admin/sponsors/:id`,
 * `POST /admin/sponsors` and `PUT /admin/sponsor-goal` (`admin:sponsors:write`),
 * called from the browser with the admin's session cookie. The route group's
 * layout already guarantees an admin session; the backend re-checks the
 * permission on every call.
 *
 * The goal editor is pre-filled from the public `GET /sponsors` (this
 * month's goal and total), because the admin API has no goal read. If that
 * call fails the editor still renders, with the fallback numbers from
 * `lib/sponsors/sponsors.ts`.
 */
export default async function AdminSponsorsPage() {
  const [list, publicData] = await Promise.all([getAdminSponsorsFirstPage(), getSponsorsData()]);

  return (
    <BlueprintReveal skeleton={<RouteLoading />} className="relative isolate min-h-screen w-full">
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="m-0 mb-1 text-xl font-medium text-text">Sponsors</h1>
          <p className="m-0 text-sm text-text-muted">
            Approve and edit sponsors, add people who paid directly, and set the monthly goal.
          </p>
        </div>

        <SponsorGoalEditor
          month={publicData.goal.month}
          goalInr={publicData.goal.goalInr}
          raisedInr={publicData.goal.raisedInr}
        />

        <AdminSponsorsManager initial={list.status === "ok" ? list.data : null} />
      </main>
    </BlueprintReveal>
  );
}
