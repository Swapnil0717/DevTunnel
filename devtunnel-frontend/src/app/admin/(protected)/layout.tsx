import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthProvider } from "@/lib/auth/auth-provider";

import { getServerUser } from "@/lib/auth/get-server-user";
import { isAdmin } from "@/lib/auth/is-admin";
import { AdminHeader } from "@/components/auth/admin-header";

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
 */
export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();

  if (!user || !isAdmin(user)) {
    const pathname = headers().get("x-pathname") ?? "/admin";
    redirect(`/admin/login?next=${encodeURIComponent(pathname)}`);
  }

  return (
    <AuthProvider initialUser={user}>
      <div className="flex min-h-screen flex-col bg-bg">
        <AdminHeader />
        <div className="flex-1">{children}</div>
      </div>
    </AuthProvider>
  );
}