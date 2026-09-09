"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ignoreAdminNewIssue } from "@/lib/admin/new-issues/client-api";

interface IgnoreNewIssueButtonProps {
  issueId: string;
  issueTitle: string;
  issueNumber: number;
}

/**
 * `POST /admin/new-issues/:id/ignore` (see
 * `lib/admin/new-issues/client-api.ts`).
 *
 * A native `window.confirm` guards the request — same reasoning
 * `DeleteTaskButton` documents: this codebase has no dialog/modal
 * component to reuse yet, and a plain confirm is fully keyboard- and
 * screen-reader-accessible without adding one just for a single action
 * (Frontend_Development_Rules.txt rule 34).
 *
 * The confirmation copy is explicit that the GitHub issue itself is
 * untouched — only DevTunnel stops surfacing it as "new" — so an admin
 * isn't left wondering whether they just closed something on GitHub.
 *
 * On failure the button surfaces an inline message and re-enables itself
 * rather than leaving the admin looking at a dead button
 * (Frontend_Development_Rules.txt rule 26).
 */
export function IgnoreNewIssueButton({
  issueId,
  issueTitle,
  issueNumber,
}: IgnoreNewIssueButtonProps) {
  const router = useRouter();
  const [isIgnoring, setIsIgnoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleIgnore() {
    const confirmed = window.confirm(
      `Ignore issue #${issueNumber} — "${issueTitle}"? It won't be onboarded as a DevTunnel task and will stop appearing here. The GitHub issue itself is not affected.`,
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setIsIgnoring(true);

    try {
      await ignoreAdminNewIssue(issueId);
      router.refresh();
    } catch {
      setError("Couldn't ignore this issue. Try again.");
      setIsIgnoring(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={handleIgnore}
        disabled={isIgnoring}
        aria-label={`Ignore issue #${issueNumber}`}
        className="rounded-md px-2 py-1 text-[11.5px] font-medium text-text-faint transition-colors hover:bg-surface-raised hover:text-text-secondary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isIgnoring ? "Ignoring…" : "Ignore"}
      </button>
      {error ? <span className="text-[10.5px] text-status-error-label">{error}</span> : null}
    </span>
  );
}