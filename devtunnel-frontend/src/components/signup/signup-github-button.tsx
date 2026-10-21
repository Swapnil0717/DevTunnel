"use client";

import { useState } from "react";
import { githubLoginActionUrl } from "@/lib/auth/api";
import { Spinner } from "@/components/ui/spinner";

/** White pill button that posts to the GitHub OAuth action. */
export function SignupGithubButton({ next }: { next?: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className="sg-form"
      action={githubLoginActionUrl()}
      method="POST"
      onSubmit={() => setIsSubmitting(true)}
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <button type="submit" disabled={isSubmitting} className="sg-btn">
        {isSubmitting ? <Spinner size={16} /> : <GithubMark />}
        {isSubmitting ? "Redirecting to GitHub…" : "Sign up with GitHub"}
      </button>
    </form>
  );
}

export function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.64 0 8.13c0 3.6 2.29 6.65 5.47 7.72.4.08.55-.17.55-.39 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.5-2.69-.95-.09-.23-.48-.95-.82-1.14-.28-.15-.68-.53-.01-.54.63-.01 1.08.59 1.23.83.72 1.23 1.87.88 2.33.67.07-.52.28-.88.51-1.08-1.78-.2-3.64-.91-3.64-4.02 0-.89.31-1.62.82-2.19-.08-.2-.36-1.04.08-2.16 0 0 .67-.22 2.2.84a7.4 7.4 0 0 1 4 0c1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.96.08 2.16.51.57.82 1.3.82 2.19 0 3.12-1.87 3.82-3.65 4.02.29.25.54.74.54 1.5 0 1.08-.01 1.95-.01 2.22 0 .22.15.47.55.39A8.13 8.13 0 0 0 16 8.13C16 3.64 12.42 0 8 0Z" />
    </svg>
  );
}
