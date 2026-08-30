"use client";

import { useState, type SVGProps } from "react";
import { useAuth } from "@/context/auth-context";

interface GitHubLoginButtonProps {
  returnTo?: string;
  onError?: (message: string) => void;
}

/** Checklist: "Create GitHub login button". */
export function GitHubLoginButton({ returnTo, onError }: GitHubLoginButtonProps) {
  const { loginWithGitHub } = useAuth();
  const [isRedirecting, setIsRedirecting] = useState(false);

  async function handleClick() {
    setIsRedirecting(true);
    try {
      await loginWithGitHub(returnTo);
      // On success the browser navigates away to GitHub; nothing else to do.
    } catch (error) {
      setIsRedirecting(false);
      onError?.(
        error instanceof Error
          ? error.message
          : "Could not start GitHub sign-in. Please try again."
      );
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isRedirecting}
      aria-busy={isRedirecting}
      className="flex h-[38px] w-full items-center justify-center gap-2 rounded-chip bg-ink-primary text-[13px] font-medium text-surface-0 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <GitHubMark className="h-4 w-4" aria-hidden="true" />
      {isRedirecting ? "Redirecting to GitHub…" : "Continue with GitHub"}
    </button>
  );
}

function GitHubMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
