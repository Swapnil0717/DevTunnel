import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthProvider } from "@/lib/auth/auth-provider";

import { getServerUser } from "@/lib/auth/get-server-user";
import { isAdmin } from "@/lib/auth/is-admin";
import { AdminHeader } from "@/components/auth/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { TrainFooter } from "@/components/layout/train-footer";

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
 * Admin Home shell: `AdminSidebar` (branding + Module 31's full section
 * list, `md` and up) is `position: fixed`, so it stays put however far the
 * page scrolls and the footer can never move it; the content column beside
 * it reserves its width with `md:ml-[224px]` (keep in step with
 * `AdminSidebar`'s `w-[224px]`). The column is topped by `AdminHeader`
 * (current section + signed-in admin + sign-out) and, below `md` where the
 * sidebar is hidden, `AdminMobileNav` — same nav entries as a horizontally
 * scrollable strip. Every admin page (starting with the Module A2
 * dashboard) renders inside `{children}` beneath those two, and the train
 * footer closes the column — inside the page area, never under the sidebar.
 *
 * `FULL_BLEED_PATHS` is the exception to that shell: Project Onboarding
 * (`/admin/projects/new`), Task Onboarding (`/admin/tasks/new`), and Open
 * Source Tool Onboarding (`/admin/opensource-tools/new`) are each a
 * multi-step wizard with its own sidebar, so stacking any of them inside
 * `AdminSidebar` + `AdminHeader` would double up the chrome. Same
 * treatment as the contributor `/onboarding` page relative to
 * `(protected)/layout.tsx` — the auth/role check still runs unconditionally
 * above, only the shell around `{children}` is skipped (the footer still
 * closes the page).
 */
 const FULL_BLEED_PATHS = ["/admin/projects/new", "/admin/tasks/new", "/admin/opensource-tools/new"];

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

  if (FULL_BLEED_PATHS.includes(pathname)) {
    return (
      <AuthProvider initialUser={user} enforceSession loginPath="/admin/login">
        {children}
        <TrainFooter />
      </AuthProvider>
    );
  }

  return (
    <AuthProvider initialUser={user} enforceSession loginPath="/admin/login">
      <div className="min-h-screen bg-bg">
        <AdminSidebar />
        <div className="flex min-h-screen min-w-0 flex-col md:ml-[224px]">
          <AdminHeader />
          <AdminMobileNav />
          <div className="flex-1">{children}</div>
          <TrainFooter />
        </div>
      </div>
    </AuthProvider>
  );
}