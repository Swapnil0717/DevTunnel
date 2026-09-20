"use client";

import { useState } from "react";
import { githubLoginActionUrl } from "@/lib/auth/api";
import { Spinner } from "@/components/ui/spinner";
import { GithubIcon } from "./github-icon";

interface GithubLoginButtonProps {
  /** Where the backend should return the user after a successful sign-in. */
  next?: string;
}

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
        {isSubmitting ? <Spinner size={13} /> : <GithubIcon />}
        {isSubmitting ? "Redirecting to GitHub…" : "Continue with GitHub"}
      </button>
    </form>
  );
}