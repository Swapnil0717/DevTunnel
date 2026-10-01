"use client";

import { useState } from "react";
import { githubLoginActionUrl } from "@/lib/auth/api";
import { Spinner } from "@/components/ui/spinner";
import { GithubIcon } from "./github-icon";

interface GithubLoginButtonProps {
  /** Where the backend should return the user after a successful sign-in. */
  next?: string;
  /**
   * `compact` sizes the button to its label instead of stretching to fill
   * its container — for inline prompts (e.g. "Reconnect GitHub" beside a
   * Star button) where a full-width button got clipped.
   */
  compact?: boolean;
  /** Overrides the default "Continue with GitHub" label. */
  label?: string;
}

export function GithubLoginButton({ next, compact = false, label }: GithubLoginButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className={compact ? "inline-block" : undefined}
      action={githubLoginActionUrl()}
      method="POST"
      onSubmit={() => setIsSubmitting(true)}
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-text text-[13px] font-medium text-bg transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-70 ${
          compact ? "h-9 px-4" : "h-[38px] w-full"
        }`}
      >
        {isSubmitting ? <Spinner size={13} /> : <GithubIcon />}
        {isSubmitting ? "Redirecting to GitHub…" : (label ?? "Continue with GitHub")}
      </button>
    </form>
  );
}