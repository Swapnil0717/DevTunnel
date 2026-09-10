"use client";

import { useId, useState, type FormEvent } from "react";
import { GitBranchIcon } from "@/components/layout/nav-icons";
import { importToolUrl, ToolOnboardingApiError } from "@/lib/admin/opensource-tool-onboarding/api";
import type { ToolOnboardingDraft } from "@/lib/admin/opensource-tool-onboarding/types";

interface ToolUrlStepProps {
  draft: ToolOnboardingDraft | null;
  onImported: (draft: ToolOnboardingDraft) => void;
}

/**
 * Step 1 of Open Source Tool Onboarding — "Tool URL".
 *
 * The Admin provides exactly one input: the project's URL. Name,
 * description, README and language are resolved by the backend from
 * that URL, never hand-typed here — same "GitHub/source is the source of
 * truth" principle admin_workflow.txt applies to Project Onboarding's
 * Step 1, applied to a plain tool URL instead of a strictly-GitHub
 * repository (a listed tool doesn't have to be hosted on GitHub).
 *
 * A real `<form>`/`<label>` drives entry (Frontend_Development_Rules.txt
 * rule 36) rather than a bare input + click handler, so "press Enter to
 * fetch" works for free and the field stays screen-reader accessible.
 */
export function ToolUrlStep({ draft, onImported }: ToolUrlStepProps) {
  const inputId = useId();
  const [url, setUrl] = useState(draft?.source?.url ?? "");
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Enter the tool's project URL first.");
      return;
    }

    setIsFetching(true);
    setError(null);
    try {
      const next = await importToolUrl(trimmed, draft?.id);
      onImported(next);
    } catch (err) {
      setError(
        err instanceof ToolOnboardingApiError
          ? "We couldn't fetch that URL. Check that it's correct and publicly reachable."
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setIsFetching(false);
    }
  }

  const source = draft?.source ?? null;

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Tool URL</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        Paste the project&apos;s URL — its GitHub repository, if it has
        one. DevTunnel fetches the name, description and README directly
        from the source; nothing here is typed in by hand.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <label htmlFor={inputId} className="mb-1.5 block text-[11.5px] text-text-muted">
            Project URL
          </label>
          <input
            id={inputId}
            name="toolUrl"
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
          {isFetching ? "Fetching…" : "Fetch tool"}
        </button>
      </form>

      {error ? (
        <p role="alert" className="m-0 mt-3 text-[12.5px] text-status-error-label">
          {error}
        </p>
      ) : null}

      {source ? (
        <div className="mt-6 rounded-[10px] border border-border bg-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <GitBranchIcon className="h-4 w-4 text-text-faint" />
            <p className="m-0 font-mono text-[13px] text-text">{source.name}</p>
          </div>

          <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-text-muted">Description</dt>
              <dd className="m-0 mt-1 text-text">
                {source.fetchedDescription ?? (
                  <span className="text-text-faint">No description found at this URL.</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Primary language</dt>
              <dd className="m-0 text-text">{source.primaryLanguage ?? "Not detected"}</dd>
            </div>
            <div>
              <dt className="text-text-muted">README</dt>
              <dd className="m-0 text-text">
                {source.readme ? "Found" : <span className="text-text-faint">Not found</span>}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}