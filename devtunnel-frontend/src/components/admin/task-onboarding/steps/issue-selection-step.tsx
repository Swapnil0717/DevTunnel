"use client";

import { useEffect, useState } from "react";
import { SectionMessage } from "@/components/home/section-message";
import { IssueIcon } from "@/components/layout/nav-icons";
import { GithubLoginButton } from "@/components/auth/github-login-button";
import { InlineLoading } from "@/components/ui/spinner";
import {
  fetchProjectIssues,
  selectIssue,
  TaskOnboardingApiError,
} from "@/lib/admin/task-onboarding/api";
import type { GithubIssueSummary, TaskOnboardingDraft } from "@/lib/admin/task-onboarding/types";

interface IssueSelectionStepProps {
  draft: TaskOnboardingDraft;
  onSelected: (draft: TaskOnboardingDraft) => void;
}

type LoadFailure = "unauthorized" | "unknown";

export function IssueSelectionStep({ draft, onSelected }: IssueSelectionStepProps) {
  const [issues, setIssues] = useState<GithubIssueSummary[] | null>(null);
  const [loadError, setLoadError] = useState<LoadFailure | null>(null);
  const [selectingNumber, setSelectingNumber] = useState<number | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!draft.project) return;
    let cancelled = false;
    setIssues(null);
    setLoadError(null);
    fetchProjectIssues(draft.project.id)
      .then((result) => {
        if (!cancelled) setIssues(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(
          error instanceof TaskOnboardingApiError && error.status === 401
            ? "unauthorized"
            : "unknown",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [draft.project, retryCount]);

  async function handleSelect(issue: GithubIssueSummary) {
    setSelectingNumber(issue.number);
    setSelectError(null);
    try {
      const next = await selectIssue(draft.id, issue.number);
      onSelected(next);
    } catch (error) {
      setSelectError(
        error instanceof TaskOnboardingApiError
          ? "We couldn't select that issue. Please try again."
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setSelectingNumber(null);
    }
  }

  if (!draft.project) {
    return (
      <p className="m-0 text-[12.5px] text-status-error-label">
        No project has been selected yet — go back to Step 1.
      </p>
    );
  }

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Select an issue</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        Open GitHub issues from{" "}
        <span className="font-mono text-text-secondary">{draft.project.repositoryFullName}</span>
        . Pick the one this DevTunnel task should be based on.
      </p>

      {selectError ? (
        <p role="alert" className="m-0 mb-4 text-[12.5px] text-status-error-label">
          {selectError}
        </p>
      ) : null}

      {loadError === "unauthorized" ? (
        <div className="mb-1">
          <SectionMessage>
            Your GitHub connection has expired — reconnect GitHub to load issues for this
            repository.
          </SectionMessage>
          <div className="mt-2 max-w-[220px]">
            <GithubLoginButton
              next={typeof window !== "undefined" ? window.location.pathname : undefined}
            />
          </div>
        </div>
      ) : loadError === "unknown" ? (
        <div className="mb-1">
          <SectionMessage>Issues aren&apos;t available right now — check back soon.</SectionMessage>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="mt-2 text-[12px] font-medium text-accent hover:underline"
          >
            Try again
          </button>
        </div>
      ) : !issues ? (
        <InlineLoading label="Loading issues…" />
      ) : issues.length === 0 ? (
        <SectionMessage>No open GitHub issues found for this repository.</SectionMessage>
      ) : (
        <ul role="radiogroup" aria-label="Issue" className="m-0 flex list-none flex-col gap-2 p-0">
          {issues.map((issue) => {
            const isSelected = draft.issue?.number === issue.number;
            const isSelecting = selectingNumber === issue.number;
            return (
              <li key={issue.number}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleSelect(issue)}
                  disabled={isSelecting}
                  className={`flex w-full flex-col gap-1.5 rounded-md border px-3.5 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${
                    isSelected
                      ? "border-accent bg-surface-selected"
                      : "border-border bg-surface hover:border-border-subtle"
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[13px] font-medium text-text">
                      <IssueIcon className="h-3.5 w-3.5 shrink-0 text-text-faint" />
                      #{issue.number} {issue.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        issue.state === "OPEN"
                          ? "bg-status-success-bg text-status-success-label"
                          : "bg-surface-raised text-text-faint"
                      }`}
                    >
                      {issue.state === "OPEN" ? "Open" : "Closed"}
                    </span>
                  </span>

                  <span className="flex flex-wrap items-center gap-1.5">
                    {issue.labels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-border-subtle bg-surface-raised px-2 py-0.5 text-[10.5px] text-text-muted"
                      >
                        {label}
                      </span>
                    ))}
                  </span>

                  <span className="text-[11.5px] text-text-faint">
                    Opened <time dateTime={issue.createdAt}>{formatDate(issue.createdAt)}</time>{" "}
                    · Updated <time dateTime={issue.updatedAt}>{formatDate(issue.updatedAt)}</time>
                    {isSelecting ? " · Selecting…" : isSelected ? " · Selected" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}