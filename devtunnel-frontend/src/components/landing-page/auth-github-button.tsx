"use client";

import { useState } from "react";
import { githubLoginActionUrl } from "@/lib/auth/api";
import { Spinner } from "@/components/ui/spinner";
import { Ic } from "./icon";

/** The landing page's white pill button, posting to the GitHub sign-in action. */
export function AuthGithubButton({ next }: { next?: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className="au-form"
      action={githubLoginActionUrl()}
      method="POST"
      onSubmit={() => setIsSubmitting(true)}
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <button type="submit" disabled={isSubmitting} className="h-cta au-btn">
        {isSubmitting ? <Spinner size={16} /> : <Ic id="gh" size={19} />}
        {isSubmitting ? "Redirecting to GitHub…" : "Sign up with GitHub"}
      </button>
    </form>
  );
}
