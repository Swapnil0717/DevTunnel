import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/layout/logo";
import { LoginCard } from "@/components/auth/login-card";
import { PortalChoiceCard } from "@/components/auth/portal-choice-card";
import {
  AuthStatusPanel,
  type LoginStatus,
} from "@/components/auth/auth-status-panel";

import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
import { needsOnboarding } from "@/lib/onboarding/needs-onboarding";
import { isAdmin } from "@/lib/auth/is-admin";
import { getServerViewMode } from "@/lib/auth/view-mode.server";
import RouteLoading from "./loading";
import { BlueprintReveal } from "@/components/ui/blueprint-reveal";

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
        <BlueprintReveal skeleton={<RouteLoading />} className="relative isolate min-h-screen w-full">
          <main className="flex min-h-screen flex-col items-center justify-center gap-9 px-6 py-16">
            <Logo />

            <h1 className="sr-only">
              Choose how to sign in to DevTunnel
            </h1>

            <PortalChoiceCard
              name={user.name || user.username}
              userDestination={
                resolvedSearchParams.next &&
                resolvedSearchParams.next.startsWith("/")
                  ? resolvedSearchParams.next
                  : "/home"
              }
            />
          </main>
        </BlueprintReveal>
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
    <BlueprintReveal skeleton={<RouteLoading />} className="relative isolate min-h-screen w-full">
      <main className="flex min-h-screen flex-col items-center justify-center gap-9 px-6 py-16">
        <Logo />

        <h1 className="sr-only">
          Sign in to DevTunnel
        </h1>

        <div className="flex w-full flex-col items-center">
          <LoginCard next={next} />

          <p className="mt-[22px] text-xs text-text-disabled">
            No account? GitHub sign-in creates one automatically.
          </p>
        </div>

        <div className="w-full max-w-[340px]">
          <AuthStatusPanel
            status={status}
            errorMessage={errorMessage}
          />
        </div>
      </main>
    </BlueprintReveal>
  );
}