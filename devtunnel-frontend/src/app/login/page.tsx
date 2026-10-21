import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/landing-page/auth-shell";
import { AuthCard } from "@/components/landing-page/auth-card";
import { AuthStatus } from "@/components/landing-page/auth-status";
import { AuthPortalChoice } from "@/components/landing-page/auth-portal-choice";
import type { LoginStatus } from "@/components/auth/auth-status-panel";

import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
import { needsOnboarding } from "@/lib/onboarding/needs-onboarding";
import { isAdmin } from "@/lib/auth/is-admin";
import { getServerViewMode } from "@/lib/auth/view-mode.server";

export const metadata: Metadata = buildMetadata({
  title: "Sign in",
  description:
    "Sign in to DevTunnel with your GitHub account to create and manage tunnels.",
  path: "/login",
  noIndex: true,
});

interface LoginPageProps {
  searchParams: Promise<{
    next?: string;
    error?: string;
  }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  access_denied:
    "You cancelled the GitHub authorization request.",
  server_error:
    "Something went wrong finishing sign-in. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const user = await getServerUser();

  if (user) {
    if (isAdmin(user)) {
      const viewMode = await getServerViewMode();

      if (viewMode === "user") {
        redirect(
          resolvedSearchParams.next &&
            resolvedSearchParams.next.startsWith("/")
            ? resolvedSearchParams.next
            : "/home",
        );
      }

      if (viewMode === "admin") {
        redirect("/admin");
      }

      return (
        <AuthShell>
          <h1 className="h-h1">
            <span>Welcome back</span>
          </h1>

          <AuthPortalChoice
            name={user.name || user.username}
            userDestination={
              resolvedSearchParams.next &&
              resolvedSearchParams.next.startsWith("/")
                ? resolvedSearchParams.next
                : "/home"
            }
          />
        </AuthShell>
      );
    }

    if (needsOnboarding(user)) {
      redirect("/onboarding");
    }

    redirect(
      resolvedSearchParams.next &&
        resolvedSearchParams.next.startsWith("/")
        ? resolvedSearchParams.next
        : "/home",
    );
  }

  const next = resolvedSearchParams.next;
  const errorCode = resolvedSearchParams.error;

  const status: LoginStatus = errorCode
    ? "error"
    : "idle";

  const errorMessage = errorCode
    ? ERROR_MESSAGES[errorCode] ?? "Access was denied."
    : undefined;

  return (
    <AuthShell>
      <h1 className="h-h1">
        <span>Sign in to</span>
        <span>DevTunnel.</span>
      </h1>

      <p className="h-sub">
        Connect your GitHub account to get matched with open source tasks you
        can finish, and to send your first pull request.
      </p>

      <AuthCard next={next} />

      <p className="au-note">
        No account? GitHub sign-in creates one automatically.
      </p>

      <AuthStatus status={status} errorMessage={errorMessage} />
    </AuthShell>
  );
}
