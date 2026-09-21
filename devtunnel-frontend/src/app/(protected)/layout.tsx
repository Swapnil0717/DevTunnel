import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { TrainFooter } from "@/components/layout/train-footer";
import { getServerUser } from "@/lib/auth/get-server-user";
import { needsOnboarding } from "@/lib/onboarding/needs-onboarding";
import { isAdmin } from "@/lib/auth/is-admin";
import { getServerViewMode } from "@/lib/auth/view-mode.server";
import { signInHref } from "@/lib/auth/sign-in-href";

/**
 * Real route protection for /dashboard, /home, /profile, /settings,
 * /onboarding, /submissions/new, /submissions/:slug/edit and anything else
 * added under this route group (devtunnel_workflow.txt task: "Create
 * protected-route handling").
 *
 * Only pages that genuinely need an account belong here. Content meant to
 * be discovered — the project/task/tool catalog, Community listings — lives
 * in the sibling `(public)` group (`app/(public)/layout.tsx`), which never
 * redirects a signed-out request. Putting public content behind this layout
 * would send every crawler and shared-link visitor to /login before they
 * saw a single word of it (Frontend_Development_Rules.txt rules 2, 16, 27).
 *
 * `middleware.ts` already redirects unauthenticated requests based on the
 * `dt_auth` flag cookie for a fast, edge-level bounce. This layout is the
 * actual security check behind it: it forwards the request's cookies to
 * `GET /auth/me` and only renders the page if the backend confirms a valid
 * session. The flag cookie alone is never trusted (see lib/auth/session.ts).
 *
 * Admin redirect: an `ADMIN` user is bounced to the Admin Portal (`/admin`)
 * unless they've explicitly picked "Continue as User" / "Switch to User
 * view", which sets the `dt_view_mode` cookie to `"user"` (see
 * lib/auth/view-mode.ts and portal-switch-link.tsx). That covers a fresh
 * sign-in, a role that was just promoted to ADMIN mid-session, or a stale
 * bookmark to /home — all default to `/admin` — while still letting an
 * admin who deliberately switched into the contributor shell actually stay
 * there instead of being bounced straight back out. This check runs first,
 * before the onboarding check.
 *
 * This is also the *one* place that enforces "signed in but hasn't
 * finished onboarding" for every route in this group — instead of each
 * page (home, profile, ...) re-implementing its own copy of the check and
 * inevitably missing one. `needsOnboarding()` reads the real
 * `onboardingCompleted` flag from the backend (see
 * lib/onboarding/needs-onboarding.ts), so this keeps catching a
 * half-finished signup no matter how long ago the person signed in or
 * how they navigated back to the site.
 *
 * /onboarding itself is excluded from the onboarding redirect — otherwise
 * a not-yet-onboarded user would get redirected to /onboarding while
 * already on /onboarding, which is a redirect loop.
 *
 * This layout also owns the app-shell navigation via `AppShell`: a fixed
 * `AppSidebar` for sm+ screens, `AppBottomNav` for mobile, and the train
 * footer at the bottom of the content column. /onboarding is a full-bleed
 * wizard in the reference designs, not a shell page, so it skips the
 * navigation — it still gets the footer, at the bottom of the page.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();
  const pathname = (await headers()).get("x-pathname") ?? "";

  if (!user) {
    // Carry the page they were trying to reach through sign-in. `pathname`
    // comes from `middleware.ts`, which is why every route in this group
    // has to be in its matcher.
    redirect(signInHref(pathname));
  }

  if (isAdmin(user) && (await getServerViewMode()) !== "user") {
    redirect("/admin");
  }

  if (pathname !== "/onboarding" && needsOnboarding(user)) {
    redirect("/onboarding");
  }

  if (pathname === "/onboarding") {
    return (
      <AuthProvider initialUser={user}>
        {children}
        <TrainFooter />
      </AuthProvider>
    );
  }

  return (
    <AuthProvider initialUser={user}>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}