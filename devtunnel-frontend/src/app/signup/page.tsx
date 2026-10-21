import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignupView } from "@/components/signup/signup-view";
import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";

export const metadata: Metadata = buildMetadata({
  title: "Sign up",
  description:
    "Create your DevTunnel account with GitHub. No password to set up, ready in a few seconds.",
  path: "/signup",
  noIndex: true,
});

interface SignupPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You cancelled the GitHub authorization request.",
  server_error: "Something went wrong finishing sign-up. Please try again.",
};

/** Only same-site paths; blocks `//evil.com` and `/\evil.com` open redirects. */
function safeNext(next: string | undefined): string | undefined {
  if (!next || !next.startsWith("/")) return undefined;
  if (next.startsWith("//") || next.startsWith("/\\")) return undefined;
  return next;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const next = safeNext(params.next);

  // Already signed in: `/login` owns every signed-in destination (onboarding,
  // admin portal choice, `next`), so hand over to it instead of repeating it.
  if (await getServerUser()) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }

  const errorMessage = params.error
    ? (ERROR_MESSAGES[params.error] ?? "Access was denied.")
    : undefined;

  return <SignupView next={next} errorMessage={errorMessage} />;
}
