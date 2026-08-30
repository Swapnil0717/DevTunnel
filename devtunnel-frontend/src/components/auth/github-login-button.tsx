"use client";

import { useState } from "react";
import { githubLoginActionUrl } from "@/lib/auth/api";
import { GithubIcon } from "./github-icon";

interface GithubLoginButtonProps {
  /** Where the backend should return the user after a successful sign-in. */
  next?: string;
}

/**
 * Starts the OAuth flow via `POST /auth/github` (devtunnel_workflow.txt,
 * Module C1 — Authentication).
 *
 * This is a real HTML `<form method="POST">`, not a JS-only `onClick`
 * handler: the browser does the navigation itself, so sign-in keeps working
 * even if JavaScript fails to load (Frontend_Development_Rules.txt rule 38 —
 * don't require client-side JS where a normal control will do). The
 * `disabled`/label swap below is a progressive enhancement on top of that.
 */
export function GithubLoginButton({ next }: GithubLoginButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      action={githubLoginActionUrl()}
      method="POST"
      onSubmit={() => setIsSubmitting(true)}
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="flex h-[38px] w-full items-center justify-center gap-2 rounded-md bg-text text-[13px] font-medium text-bg transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-70"
      >
        <GithubIcon />
        {isSubmitting ? "Redirecting to GitHub…" : "Continue with GitHub"}
      </button>
    </form>
  );
}
