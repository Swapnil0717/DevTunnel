"use client";

import { useId, useState, type FormEvent } from "react";
import { GitBranchIcon } from "@/components/layout/nav-icons";
import { importRepository, ProjectOnboardingApiError } from "@/lib/admin/project-onboarding/api";
import type { ProjectOnboardingDraft } from "@/lib/admin/project-onboarding/types";

interface RepositoryStepProps {
  draft: ProjectOnboardingDraft | null;
  onImported: (draft: ProjectOnboardingDraft) => void;
}

/**
 * Step 1 of Project Onboarding — "Import GitHub Repository"
 * (admin_workflow.txt, "Step 1 — Import GitHub Repository").
 *
 * The Admin provides exactly one input: the repository URL. Everything
 * else — author, GitHub username, repository name, contributors,
 * language, stars, forks, issues — is deliberately **not** a form field
 * here; the spec calls these out by name as things the Admin must never
 * manually enter. Submitting hits `POST .../onboarding/repository`
 * (`importRepository`), and this component only ever renders what comes
 * back from that call, never a locally-constructed guess
 * (Frontend_Development_Rules.txt rule 58).
 *
 * A real `<form>`/`<label>` drives entry (rule 36) rather than a bare
 * input + click handler, so "press Enter to fetch" works for free and the
 * field stays screen-reader accessible.
 */
export function RepositoryStep({ draft, onImported }: RepositoryStepProps) {
  const inputId = useId();
  const [url, setUrl] = useState(draft?.repository?.url ?? "");
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Enter a GitHub repository URL first.");
      return;
    }

    setIsFetching(true);
    setError(null);
    try {
      const next = await importRepository(trimmed, draft?.id);
      onImported(next);
      if (!next.repository?.hasGithubAppAccess) {
        setError(
          "Repository found, but the DevTunnel GitHub App isn't installed on it yet. Install the app on this repository before continuing.",
        );
      }
    } catch (err) {
      setError(
        err instanceof ProjectOnboardingApiError
          ? "We couldn't fetch that repository. Check the URL and that the GitHub App has access to it."
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setIsFetching(false);
    }
  }

  const repository = draft?.repository ?? null;

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Import GitHub repository</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        Paste the repository&apos;s GitHub URL. DevTunnel fetches the author,
        contributors, README, default branch and language directly from
        GitHub — nothing here is typed in by hand.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <label htmlFor={inputId} className="mb-1.5 block text-[11.5px] text-text-muted">
            GitHub repository URL
          </label>
          <input
            id={inputId}
            name="repositoryUrl"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://github.com/owner/repository"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </div>
        <button
          type="submit"
          disabled={isFetching}
          className="mt-[1px] shrink-0 rounded-md bg-text px-4 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-[22px]"
        >
          {isFetching ? "Fetching…" : "Fetch repository"}
        </button>
      </form>

      {error ? (
        <p role="alert" className="m-0 mt-3 text-[12.5px] text-status-error-label">
          {error}
        </p>
      ) : null}

      {repository ? (
        <div className="mt-6 rounded-[10px] border border-border bg-surface p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <GitBranchIcon className="h-4 w-4 text-text-faint" />
              <p className="m-0 font-mono text-[13px] text-text">{repository.fullName}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                repository.hasGithubAppAccess
                  ? "bg-status-success-bg text-status-success-label"
                  : "bg-status-error-bg text-status-error-label"
              }`}
            >
              {repository.hasGithubAppAccess ? "App connected" : "App not installed"}
            </span>
          </div>

          <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-2">
            <div>
              <dt className="text-text-muted">Author</dt>
              <dd className="m-0 flex items-center gap-2 text-text">
                {repository.author.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external GitHub avatar
                  <img
                    src={repository.author.avatarUrl}
                    alt=""
                    width={18}
                    height={18}
                    className="rounded-full"
                  />
                ) : null}
                @{repository.author.username}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Default branch</dt>
              <dd className="m-0 font-mono text-text">{repository.defaultBranch}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Primary language</dt>
              <dd className="m-0 text-text">{repository.primaryLanguage ?? "Not detected"}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Stars / forks / open issues</dt>
              <dd className="m-0 text-text">
                {repository.stars} stars, {repository.forks} forks,{" "}
                {repository.openIssues} open issues
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-text-muted">GitHub contributors</dt>
              <dd className="m-0 mt-1.5 flex flex-wrap items-center gap-1.5 text-text">
                {repository.contributors.length ? (
                  repository.contributors.map((contributor) => (
                    <span
                      key={contributor.username}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-raised px-2 py-1 text-[11.5px]"
                    >
                      {contributor.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- external GitHub avatar
                        <img
                          src={contributor.avatarUrl}
                          alt=""
                          width={16}
                          height={16}
                          className="rounded-full"
                        />
                      ) : null}
                      @{contributor.username}
                    </span>
                  ))
                ) : (
                  <span className="text-text-faint">None detected</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}