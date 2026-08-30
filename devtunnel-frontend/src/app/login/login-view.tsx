"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { GitHubLoginButton } from "@/components/auth/github-login-button";
import { SignInStatusStrip, type SignInState } from "@/components/auth/sign-in-status-strip";
import { DEFAULT_POST_LOGIN_ROUTE } from "@/lib/constants";
import type { AuthErrorCode } from "@/types/auth";

const ERROR_MESSAGES: Record<AuthErrorCode | "unknown", string> = {
  access_denied: "Access was denied on GitHub.",
  invalid_state: "The sign-in request could not be verified. Please try again.",
  github_error: "GitHub couldn't complete sign-in. Please try again.",
  server_error: "Something went wrong on our end. Please try again shortly.",
  unknown: "Access was denied",
};

export function LoginView() {
  const { status } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? undefined;
  const errorParam = searchParams.get("error") as AuthErrorCode | null;

  const [signInState, setSignInState] = useState<SignInState>(
    errorParam ? "error" : "idle"
  );

  // Already signed in? Skip the login screen entirely.
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(returnTo ?? DEFAULT_POST_LOGIN_ROUTE);
    }
  }, [status, returnTo, router]);

  const errorMessage = errorParam
    ? ERROR_MESSAGES[errorParam] ?? ERROR_MESSAGES.unknown
    : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center bg-surface-0 px-6 py-20">
      <Link href="/" className="mb-9 focus-visible:rounded-sm">
        <Image
          src="/logo.png"
          alt="DevTunnel"
          width={172}
          height={27}
          priority
          className="h-7 w-auto"
        />
      </Link>

      <div className="w-[340px] rounded-card border border-border bg-surface-1 px-[26px] py-7">
        <h1 className="mb-1 text-center text-[15px] font-medium text-ink-primary">
          Sign in to DevTunnel
        </h1>
        <p className="mb-[22px] text-center text-[13px] leading-relaxed text-ink-muted">
          Connect your GitHub account to create and manage tunnels.
        </p>

        <GitHubLoginButton
          returnTo={returnTo}
          onError={() => setSignInState("error")}
        />

        <div className="my-[18px] flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="font-mono text-[11px] text-ink-disabled">
            secured via oauth
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <p className="text-center text-[11.5px] leading-relaxed text-ink-disabled">
          By continuing you agree to the
          <br />
          <Link href="/terms" className="text-ink-muted hover:text-ink-primary">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-ink-muted hover:text-ink-primary">
            Privacy Policy
          </Link>
        </p>
      </div>

      <p className="mt-[22px] text-xs text-ink-quiet">
        No account? GitHub sign-in creates one automatically.
      </p>

      <div className="mt-8">
        <SignInStatusStrip state={signInState} errorDescription={errorMessage} />
      </div>
    </main>
  );
}
