import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthProvider } from "@/lib/auth/auth-provider";
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

  return <AuthProvider initialUser={user}>{children}</AuthProvider>;
}