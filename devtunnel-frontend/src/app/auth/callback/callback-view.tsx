"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import {
  completeGitHubCallback,
  consumeStoredReturnTo,
  OAuthStateMismatchError,
} from "@/lib/auth-client";
import { ApiError } from "@/lib/api";
import { DEFAULT_POST_LOGIN_ROUTE } from "@/lib/constants";
import type { AuthErrorCode } from "@/types/auth";

/** Checklist: "Create OAuth callback handling". */
export function CallbackView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [message, setMessage] = useState("Completing sign-in…");
  // Guards against React 18 Strict Mode's dev-only double-invoke of
  // effects, which would otherwise send the single-use `code` twice.
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const githubError = searchParams.get("error");
    if (githubError) {
      router.replace(`/login?error=access_denied`);
      return;
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      router.replace(`/login?error=github_error`);
      return;
    }

    (async () => {
      try {
        await completeGitHubCallback(code, state);
        await refresh();
        const returnTo = consumeStoredReturnTo();
        router.replace(returnTo || DEFAULT_POST_LOGIN_ROUTE);
      } catch (error) {
        const errorCode: AuthErrorCode =
          error instanceof OAuthStateMismatchError
            ? "invalid_state"
            : error instanceof ApiError
              ? "github_error"
              : "server_error";
        setMessage("Sign-in failed. Redirecting…");
        router.replace(`/login?error=${errorCode}`);
      }
    })();
    // Intentionally run once on mount — see `hasRun` guard above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-0 px-6">
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-3"
      >
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-loading"
          aria-hidden="true"
        />
        <p className="text-sm text-ink-secondary">{message}</p>
      </div>
    </main>
  );
}
