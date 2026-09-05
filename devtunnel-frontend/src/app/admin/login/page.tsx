import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { LoginCard } from "@/components/auth/login-card";
import { AuthStatusPanel, type LoginStatus } from "@/components/auth/auth-status-panel";
import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
import { needsOnboarding } from "@/lib/onboarding/needs-onboarding";
import { isAdmin } from "@/lib/auth/is-admin";

export const metadata: Metadata = buildMetadata({
  title: "Sign in",
  description: "Sign in to DevTunnel with your GitHub account to create and manage tunnels.",
  path: "/login",
  // Auth screens are private/application UI, not public content — never
  // indexed (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

interface LoginPageProps {
  searchParams: { next?: string; error?: string };
}

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You cancelled the GitHub authorization request.",
  server_error: "Something went wrong finishing sign-in. Please try again.",
};

/**
 * `/login` (devtunnel_workflow.txt, Module C1).
 *
 * "Already signed in? Skip straight to /home" used to be decided by
 * `middleware.ts` purely from the presence of the `dt_auth` flag cookie.
 * That cookie has no real data in it and nothing clears it if the
 * session it once represented goes away server-side — an expired
 * session, a revoked one, or a user row removed directly in the
 * database (as opposed to through the app). Bouncing on the flag alone
 * created a redirect loop for exactly that case: middleware sends
 * /login → /home because the stale flag is still set, but
 * `(protected)/layout.tsx` immediately sends /home → /login because its
 * real check (`getServerUser()`, i.e. `GET /auth/me`) correctly finds no
 * valid session.
 *
 * This page now makes that same real check itself, so it always agrees
 * with `(protected)/layout.tsx` — a dead session just renders the
 * sign-in card instead of bouncing, and the loop can't happen.
 *
 * Admin redirect: an already-signed-in `ADMIN` user always goes to
 * `/admin`, never contributor `/home` — even if `next` points at a
 * contributor route (e.g. a stale bookmark, or a role that was just
 * promoted to ADMIN). This mirrors the same check in
 * `(protected)/layout.tsx` so the two never disagree.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getServerUser();
  if (user) {
    if (isAdmin(user)) {
      redirect("/admin");
    }
    if (needsOnboarding(user)) {
      redirect("/onboarding");
    }
    redirect(searchParams.next && searchParams.next.startsWith("/") ? searchParams.next : "/home");
  }

  const next = searchParams.next;
  const errorCode = searchParams.error;
  const status: LoginStatus = errorCode ? "error" : "idle";
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] ?? "Access was denied." : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-9 px-6 py-16">
      <Logo />

      <h1 className="sr-only">Sign in to DevTunnel</h1>

      <div className="flex w-full flex-col items-center">
        <LoginCard next={next} />

        <p className="mt-[22px] text-xs text-text-disabled">
          No account? GitHub sign-in creates one automatically.
        </p>
      </div>

      <div className="w-full max-w-[340px]">
        <AuthStatusPanel status={status} errorMessage={errorMessage} />
      </div>
    </main>
  );
}