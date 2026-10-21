import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/landing-page/auth-shell";
import { SignupView } from "@/components/signup/signup-view";
import { AuthPortalChoice } from "@/components/landing-page/auth-portal-choice";

import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
import { needsOnboarding } from "@/lib/onboarding/needs-onboarding";
import { isAdmin } from "@/lib/auth/is-admin";
import { getServerViewMode } from "@/lib/auth/view-mode.server";

export const metadata: Metadata = buildMetadata({
  title: "Sign in or sign up",
  description:
    "Sign in or create your DevTunnel account with GitHub. No password to set up.",
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

/** Only same-site paths; blocks `//evil.com` and `/\\evil.com` open redirects. */
function safeNext(next: string | undefined): string | undefined {
  if (!next || !next.startsWith("/")) return undefined;
  if (next.startsWith("//") || next.startsWith("/\\")) return undefined;
  return next;
}

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

  const next = safeNext(resolvedSearchParams.next);
  const errorCode = resolvedSearchParams.error;

  const errorMessage = errorCode
    ? ERROR_MESSAGES[errorCode] ?? "Access was denied."
    : undefined;

  return <SignupView next={next} errorMessage={errorMessage} />;
}
