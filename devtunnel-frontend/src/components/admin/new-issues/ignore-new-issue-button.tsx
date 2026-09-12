"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ignoreAdminNewIssue } from "@/lib/admin/new-issues/client-api";
import { Spinner } from "@/components/ui/spinner";

interface IgnoreNewIssueButtonProps {
  issueId: string;
  issueTitle: string;
  issueNumber: number;
}

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
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium text-text-faint transition-colors hover:bg-surface-raised hover:text-text-secondary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isIgnoring ? <Spinner size={11} /> : null}
        {isIgnoring ? "Ignoring…" : "Ignore"}
      </button>
      {error ? <span className="text-[10.5px] text-status-error-label">{error}</span> : null}
    </span>
  );
}