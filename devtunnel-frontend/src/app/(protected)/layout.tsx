import { redirect } from "next/navigation";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { getServerUser } from "@/lib/auth/get-server-user";

/**
 * Real route protection for /dashboard, /profile, /onboarding, and
 * anything else added under this route group (devtunnel_workflow.txt
 * task: "Create protected-route handling").
 *
 * `middleware.ts` already redirects unauthenticated requests based on the
 * `dt_auth` flag cookie for a fast, edge-level bounce. This layout is the
 * actual security check behind it: it forwards the request's cookies to
 * `GET /auth/me` and only renders the page if the backend confirms a valid
 * session. The flag cookie alone is never trusted (see lib/auth/session.ts).
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

  return <AuthProvider initialUser={user}>{children}</AuthProvider>;
}
