import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthProvider } from "@/lib/auth/auth-provider";

import { getServerUser } from "@/lib/auth/get-server-user";
import { isAdmin } from "@/lib/auth/is-admin";

/**
 * Real route protection for everything under `/admin` (devtunnel_workflow.txt,
 * Module A1 — Admin Authentication: "Role-based access control (RBAC)").
 *
 * Mirrors `(protected)/layout.tsx` exactly in spirit: `middleware.ts`
 * already does a fast edge-level bounce for signed-out visitors based on
 * the non-sensitive `dt_auth` flag cookie, but this layout is the real
 * check — it forwards cookies to `GET /auth/me` and only renders admin
 * pages once the backend confirms both a valid session *and*
 * `role: "ADMIN"`. Neither the flag cookie nor anything client-side is
 * ever trusted as the security boundary (rule 18); the backend must
 * independently authorize every `/admin/*` API call too (Module 43 —
 * Admin Backend).
 *
 * A signed-in *non-admin* is treated exactly like a signed-out visitor
 * here — redirected to `/admin/login`, which is where the "your account
 * doesn't have access" messaging actually lives (`?error=not_authorized`,
 * surfaced by admin-login-card.tsx). This layout itself doesn't need to
 * explain why; it just refuses to render.
 *
 * This route group is `(protected)` so `/admin/login` — one level up,
 * outside this group — never gets wrapped by it. A layout that requires
 * `role: "ADMIN"` to render can't also host the page where someone who
 * *isn't* an admin yet is supposed to sign in.
 *
 * What this layout does NOT own any more is the admin shell chrome
 * (`AdminSidebar`/`AdminHeader`/`AdminMobileNav` vs. the full-bleed
 * onboarding wizards). That used to be a runtime
 * `FULL_BLEED_PATHS.includes(pathname)` check right here, comparing the
 * current pathname (read via `headers()`) against
 * `/admin/projects/new`, `/admin/tasks/new`, `/admin/opensource-tools/new`
 * and branching this layout's returned JSX on the result. This layout is
 * shared by every page under `/admin`, and Next.js can reuse an
 * already-rendered layout segment across a client-side navigation between
 * sibling pages — so a layout whose JSX *shape* depends on the exact
 * current pathname (rather than only on its own segment + children) could
 * end up showing whichever chrome an earlier admin page rendered, until a
 * full page reload forced a fresh server render. (Same bug, same fix, as
 * `(protected)/layout.tsx` on the contributor side — see the comment on
 * `(shell)/layout.tsx` there for the full explanation.)
 *
 * The fix is structural instead of pathname-based: `/admin/projects/new`,
 * `/admin/tasks/new` and `/admin/opensource-tools/new` each live in their
 * own `new/layout.tsx` (no admin shell, just the train footer), sibling to
 * the rest of their section rather than nested under it, and every other
 * admin page lives under `(shell)/layout.tsx`. Which layout renders is now
 * decided by Next.js's own routing, so it can't go stale across a
 * client-side navigation. This layout only handles auth and hands
 * `children` straight through, wrapped in the one `AuthProvider` every
 * route under `/admin` shares.
 */
export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();
  const pathname = (await headers()).get("x-pathname") ?? "/admin";

  if (!user || !isAdmin(user)) {
    redirect(`/admin/login?next=${encodeURIComponent(pathname)}`);
  }

  return (
    <AuthProvider initialUser={user} enforceSession loginPath="/admin/login">
      {children}
    </AuthProvider>
  );
}
