"use client";

import { useEffect, useState } from "react";
import { GithubLoginButton } from "./github-login-button";

const RECONNECT_FLAG = "dt_github_reconnect_attempted";

interface GithubReconnectPromptProps {
  /** Page to return to after GitHub sign-in, e.g. `/projects/appwrite`. */
  next: string;
  /** What the person was trying to do, e.g. "star this project". */
  action?: string;
}

/**
 * Inline prompt shown when the backend answers `github_reauth_required`
 * (no live GitHub connection, or GitHub refused the Starring permission).
 *
 * Shared by the four Star buttons so they stay identical. It is a small
 * bordered card with a sized-to-content button — the previous version put
 * a full-width button inside a 220px box beside the Star button, which
 * clipped the label and left the row looking broken.
 *
 * If the person already went through "Reconnect" once and the prompt
 * comes back, GitHub has not granted the permission yet (an existing
 * authorization keeps its old permissions until it is re-approved), so
 * the second time it explains exactly how to fix that instead of
 * looping silently.
 */
export function GithubReconnectPrompt({
  next,
  action = "star this project",
}: GithubReconnectPromptProps) {
  const [alreadyTried, setAlreadyTried] = useState(false);

  useEffect(() => {
    try {
      setAlreadyTried(window.sessionStorage.getItem(RECONNECT_FLAG) === "1");
    } catch {
      /* storage unavailable — fall back to the first-time message */
    }
  }, []);

  function rememberAttempt() {
    try {
      window.sessionStorage.setItem(RECONNECT_FLAG, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      role="status"
      className="flex max-w-[320px] flex-col items-start gap-2 rounded-[8px] border border-border bg-surface px-3.5 py-3"
    >
      <p className="m-0 text-[12.5px] font-medium text-text">
        {alreadyTried ? "GitHub still needs your approval" : "Reconnect GitHub"}
      </p>

      <p className="m-0 text-[12px] leading-[1.5] text-text-muted">
        {alreadyTried ? (
          <>
            DevTunnel can&apos;t {action} until GitHub grants the Starring
            permission. Revoke DevTunnel on{" "}
            <a
              href="https://github.com/settings/apps/authorizations"
              target="_blank"
              rel="noreferrer"
              className="text-text underline underline-offset-2"
            >
              GitHub&apos;s authorized apps page
            </a>
            , then sign in again and approve it.
          </>
        ) : (
          <>
            To {action}, DevTunnel needs your GitHub connection. GitHub may ask
            you to approve the Starring permission.
          </>
        )}
      </p>

      <div onClickCapture={rememberAttempt}>
        <GithubLoginButton next={next} compact label="Reconnect GitHub" />
      </div>
    </div>
  );
}
