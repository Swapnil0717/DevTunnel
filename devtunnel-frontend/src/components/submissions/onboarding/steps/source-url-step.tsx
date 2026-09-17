"use client";

import { useId, useState, type FormEvent } from "react";
import { GitBranchIcon } from "@/components/layout/nav-icons";
import { OptionCard } from "@/components/onboarding/option-card";
import { SubmissionsApiError, importSubmissionUrl } from "@/lib/submissions/client-api";
import type { SubmissionDraft, SubmissionKind } from "@/lib/submissions/types";

/**
 * Step 1 — "Repository URL".
 *
 * One input plus one choice. Name, description, README, language and the
 * tech stack all come back from GitHub via the backend; nothing on this
 * step is typed in by hand, the same "the source is the source of truth"
 * shape `ToolUrlStep` uses for admin tool onboarding.
 *
 * Project-vs-tool is the one thing GitHub can't answer, so it's asked
 * here rather than guessed from topics or language — a guess would be
 * wrong often enough to make the list's own filter untrustworthy
 * (rule 58).
 *
 * Every failure gets its own sentence. "That's not a GitHub URL",
 * "that repository is private" and "GitHub is unreachable" have three
 * different fixes, and one generic error message would hide all of them.
 *
 * A real `<form>`/`<label>` so Enter submits and the field stays
 * screen-reader accessible (rule 36).
 */
export function SourceUrlStep({
  draft,
  kind,
  onKindChange,
  onImported,
}: {
  draft: SubmissionDraft | null;
  kind: SubmissionKind;
  onKindChange: (next: SubmissionKind) => void;
  onImported: (draft: SubmissionDraft) => void;
}) {
  const inputId = useId();
  const [url, setUrl] = useState(draft?.source?.url ?? "");
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Paste the repository URL first.");
      return;
    }

    setIsFetching(true);
    setError(null);
    try {
      onImported(await importSubmissionUrl(trimmed, kind, draft?.id));
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setIsFetching(false);
    }
  }

  const source = draft?.source ?? null;

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Repository URL</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        Paste a public GitHub repository. DevTunnel reads the name,
        description, README and tech stack straight from it — you never
        type those in, and anyone reading your submission can check them
        against the source.
      </p>

      <div
        role="radiogroup"
        aria-label="What are you submitting?"
        className="mb-5 flex flex-col gap-2.5"
      >
        <OptionCard
          label="A project"
          description="Something people can contribute to, run, or build on."
          selected={kind === "PROJECT"}
          onSelect={() => onKindChange("PROJECT")}
        />
        <OptionCard
          label="A tool"
          description="Something people use while working — an app, a CLI, a service."
          selected={kind === "TOOL"}
          onSelect={() => onKindChange("TOOL")}
        />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <label htmlFor={inputId} className="mb-1.5 block text-[11.5px] text-text-muted">
            GitHub repository URL
          </label>
          <input
            id={inputId}
            name="sourceUrl"
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

      {source ? (
        <div className="mt-6 rounded-[10px] border border-border bg-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <GitBranchIcon className="h-4 w-4 text-text-faint" />
            <p className="m-0 font-mono text-[13px] text-text">
              {source.repositoryFullName ?? source.name}
            </p>
          </div>

          <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-text-muted">Description</dt>
              <dd className="m-0 mt-1 text-text">
                {source.fetchedDescription ?? (
                  <span className="text-text-faint">
                    This repository has no description on GitHub.
                  </span>
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
            <div className="sm:col-span-2">
              <dt className="text-text-muted">Detected tech stack</dt>
              <dd className="m-0 mt-1 text-text">
                {source.detectedTechStack.length > 0 ? (
                  source.detectedTechStack.join(", ")
                ) : (
                  <span className="text-text-faint">
                    Nothing detected — you can add tags on the next step.
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function messageFor(err: unknown): string {
  if (!(err instanceof SubmissionsApiError)) {
    return "Something went wrong. Check your connection and try again.";
  }

  switch (err.code) {
    case "not_a_github_repository":
      return "That isn't a GitHub repository URL. It should look like github.com/owner/repository.";
    case "repository_not_public":
      return "That repository is private, so nobody else could open it. Submit a public one.";
    case "repository_not_found":
      return "We couldn't find that repository on GitHub. Check the owner and name.";
    case "github_unavailable":
      return "GitHub isn't responding right now. Try again in a moment.";
    case "rate_limited":
      return "That's a lot of lookups — wait a minute and try again.";
    default:
      return "We couldn't fetch that repository. Check the URL and try again.";
  }
}
