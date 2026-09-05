import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";

export const metadata: Metadata = buildMetadata({
  title: "Admin dashboard",
  description: "DevTunnel Admin Portal.",
  path: "/admin",
  // Private application UI, never public content (rule 18).
  noIndex: true,
});

/**
 * `/admin` (devtunnel_workflow.txt, Module A2 — Admin Dashboard).
 *
 * This pass only builds Module A1 (Admin Authentication) end to end, so
 * this page is deliberately a minimal, honest landing spot for a
 * successful admin sign-in rather than a stub for the full A2 dashboard.
 * The real A2 dashboard (project/task/contributor counts) needs
 * `/admin/*` aggregation endpoints that don't exist on the backend yet —
 * rendering placeholder numbers here would be fabricated data (rule 58:
 * "AI-generated code must not invent SEO data" / never invent statistics),
 * so this shows only what's actually known right now: who is signed in,
 * confirmed as an admin, and confirmation of what's not built yet.
 * `getServerUser()` is called again here (rather than reading from
 * `AuthProvider` context) so this content matches what
 * `admin/(protected)/layout.tsx` just verified server-side, with no
 * dependency on the client re-fetching first.
 */
export default async function AdminDashboardPage() {
  const user = await getServerUser();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="m-0 mb-1 text-xl font-medium text-text">Admin dashboard</h1>
      <p className="m-0 mb-8 text-sm text-text-muted">
        Signed in as <strong className="text-text">{user?.username}</strong>
        {user?.name ? ` (${user.name})` : null} — admin access confirmed.
      </p>

      <div className="rounded-[10px] border border-border bg-surface px-6 py-5">
        <p className="m-0 mb-2 text-sm font-medium text-text">
          Project curation tools aren&apos;t live yet
        </p>
        <p className="m-0 text-[13px] leading-[1.6] text-text-muted">
          Repository import, task management, and publishing (Modules
          A3&ndash;A13) land once the corresponding{" "}
          <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-xs text-text-secondary">
            /admin/*
          </code>{" "}
          backend endpoints exist. Admin authentication and access control
          are fully wired up.
        </p>
      </div>
    </main>
  );
}