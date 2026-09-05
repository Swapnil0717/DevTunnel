import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { AdminLoginCard } from "@/components/auth/admin-login-card";
import { AuthStatusPanel, type LoginStatus } from "@/components/auth/auth-status-panel";
import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
import { isAdmin } from "@/lib/auth/is-admin";

export const metadata: Metadata = buildMetadata({
  title: "Admin sign in",
  description: "Sign in to the DevTunnel Admin Portal to curate projects.",
  path: "/admin/login",
  // Admin auth is private/application UI, never public content
  // (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

interface AdminLoginPageProps {
  searchParams: { next?: string; error?: string };
}

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You cancelled the GitHub authorization request.",
  not_authorized: "That GitHub account doesn't have admin access.",
  server_error: "Something went wrong finishing sign-in. Please try again.",
};

/** Only ever send the admin OAuth flow back into the admin portal — never
 * let a `next` value steer someone into the contributor app or off-site
 * (same reasoning as the backend's `sanitizeNextPath`, applied again here
 * since the button posts straight through to `/auth/github`). */
function sanitizeAdminNext(next: string | undefined): string {
  const fallback = "/admin";
  if (!next) return fallback;
  if (!next.startsWith("/admin")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.includes("://")) return fallback;
  return next;
}

/**
 * `/admin/login` (devtunnel_workflow.txt, Module A1 — Admin Authentication).
 *
 * Mirrors `/login/page.tsx`'s "make the real check ourselves" fix: rather
 * than trusting the `dt_auth` flag cookie (middleware already used it for
 * a fast edge-level bounce), this page calls `getServerUser()` directly so
 * it always agrees with `admin/(protected)/layout.tsx` about who's
 * actually signed in — a stale flag with a dead session just renders the
 * sign-in card instead of causing a redirect loop.
 *
 * Unlike `/login`, an existing *non-admin* DevTunnel session does not
 * bounce anywhere — that would either silently drop an admin visitor into
 * the contributor app or hide the real reason the portal still shows the
 * sign-in card. Instead it's surfaced as an honest notice on the card
 * itself (rule 43 — keep important facts explicit).
 */
export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const user = await getServerUser();
  const next = sanitizeAdminNext(searchParams.next);

  if (user && isAdmin(user)) {
    redirect(next);
  }

  const errorCode = searchParams.error;
  const status: LoginStatus = errorCode ? "error" : "idle";
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] ?? "Access was denied." : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-9 px-6 py-16">
      <Logo />

      <h1 className="sr-only">Sign in to DevTunnel Admin</h1>

      <div className="flex w-full flex-col items-center">
        <AdminLoginCard
          next={next}
          signedInAsNonAdmin={user ? user.username : undefined}
        />
      </div>

      <div className="w-full max-w-[340px]">
        <AuthStatusPanel status={status} errorMessage={errorMessage} />
      </div>
    </main>
  );
}