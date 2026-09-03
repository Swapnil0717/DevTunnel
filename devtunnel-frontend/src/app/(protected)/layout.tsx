import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppBottomNav } from "@/components/layout/app-bottom-nav";
import { getServerUser } from "@/lib/auth/get-server-user";
import { needsOnboarding } from "@/lib/onboarding/needs-onboarding";

/**
 * Real route protection for /dashboard, /home, /profile, /onboarding, and
 * anything else added under this route group (devtunnel_workflow.txt
 * task: "Create protected-route handling").
 *
 * `middleware.ts` already redirects unauthenticated requests based on the
 * `dt_auth` flag cookie for a fast, edge-level bounce. This layout is the
 * actual security check behind it: it forwards the request's cookies to
 * `GET /auth/me` and only renders the page if the backend confirms a valid
 * session. The flag cookie alone is never trusted (see lib/auth/session.ts).
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
 * /onboarding itself is excluded — otherwise a not-yet-onboarded user
 * would get redirected to /onboarding while already on /onboarding,
 * which is a redirect loop.
 *
 * This layout also owns the app-shell navigation: `AppSidebar` for sm+
 * screens, `AppBottomNav` for mobile. /onboarding is a full-bleed wizard
 * in the reference designs, not a shell page, so it skips both.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const pathname = headers().get("x-pathname") ?? "";
  if (pathname !== "/onboarding" && needsOnboarding(user)) {
    redirect("/onboarding");
  }

  if (pathname === "/onboarding") {
    return <AuthProvider initialUser={user}>{children}</AuthProvider>;
  }

  return (
    <AuthProvider initialUser={user}>
      <div className="flex min-h-screen bg-bg">
        <AppSidebar />
        {/* pb-16 keeps content clear of the fixed bottom nav on mobile */}
        <div className="flex min-w-0 flex-1 flex-col pb-16 sm:pb-0">
          {children}
        </div>
      </div>
      <AppBottomNav />
    </AuthProvider>
  );
}