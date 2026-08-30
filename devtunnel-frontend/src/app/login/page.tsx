import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { LoginCard } from "@/components/auth/login-card";
import { AuthStatusPanel, type LoginStatus } from "@/components/auth/auth-status-panel";
import { buildMetadata } from "@/lib/seo";

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

export default function LoginPage({ searchParams }: LoginPageProps) {
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
