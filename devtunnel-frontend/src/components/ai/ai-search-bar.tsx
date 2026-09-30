"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { SparkleIcon } from "@/components/layout/nav-icons";
import { SignInLink } from "@/components/auth/sign-in-link";
import { Spinner } from "@/components/ui/spinner";
import { AiBadge } from "@/components/ai/ai-badge";
import { AI_SECONDARY_BUTTON_CLASS, AiError, AiLoading } from "@/components/ai/ai-states";
import { useAuth } from "@/lib/auth/use-auth";
import type { AiSearchState } from "@/lib/ai/use-ai-search";

const MAX_PROMPT_CHARS = 300;

const PRIMARY_BUTTON_CLASS =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[8px] bg-accent px-3.5 py-2 text-[12.5px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * "Ask AI" search bar shared by all four list pages — the GitHub catalogs
 * (Part 2, `GithubProjectsExplorer`) and the DevTunnel lists (Part 3,
 * `DevtunnelProjectsExplorer`, `DevtunnelOpenSourceToolsExplorer`). Purely
 * presentational: the request, cancellation and result state live in
 * `useAiSearch` (`lib/ai/use-ai-search.ts`) and the page that owns the
 * results decides what to do with them. It only reads counts and the
 * interpretation, so it accepts a search state of any row type. This
 * component renders the input and every state the search can be in:
 *
 *  - signed out ........ a sign-in prompt (the endpoint is signed-in only —
 *                        it spends a free AI budget — so a form that could
 *                        only ever fail is never shown);
 *  - AI switched off ... a plain notice (`ai_disabled`), and nothing to click;
 *  - loading ........... `role="status"` line, input and button disabled;
 *  - error ............. `role="alert"` with "Try again" (except when retrying
 *                        can't help: signed out / AI off);
 *  - done .............. the AI-generated interpretation as text chips
 *                        ("Looking for: …"), how many rows matched, and
 *                        "Clear AI search". When the backend fell back to
 *                        keyword scoring it says so plainly and drops the AI
 *                        label — it never presents keyword results as AI.
 *
 * Everything the model produced is rendered as React text, never as HTML.
 */
export function AiSearchBar({
  state,
  onSearch,
  onClear,
  noun,
}: {
  state: AiSearchState<unknown>;
  onSearch: (prompt: string) => void;
  onClear: () => void;
  /** Plural noun for the copy — "projects" or "tools". */
  noun: string;
}) {
  const { status: authStatus } = useAuth();
  const inputId = useId();
  const [text, setText] = useState("");

  // Clearing the search (here, or from the page — e.g. changing the "Show"
  // filter) empties the input too.
  useEffect(() => {
    if (state.prompt === "") setText("");
  }, [state.prompt]);

  const { result, error } = state;
  const isLoading = state.status === "loading";
  const trimmed = text.trim();
  const canSubmit = trimmed.length >= 2 && !isLoading && authStatus === "authenticated";

  const signedOut = authStatus === "unauthenticated" || error?.code === "unauthenticated";
  if (signedOut) {
    return (
      <section
        aria-label="AI search"
        className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="m-0 text-[12.5px] text-text-muted">
          Describe what you&apos;re looking for in plain English and let AI find matching {noun}.
        </p>
        <SignInLink variant="secondary" icon={<SparkleIcon className="h-3.5 w-3.5 shrink-0" />}>
          Sign in to use AI search
        </SignInLink>
      </section>
    );
  }

  if (error?.code === "ai_disabled") {
    return (
      <section aria-label="AI search" className="rounded-[10px] border border-border bg-surface p-3">
        <p role="status" className="m-0 text-[12.5px] text-text-muted">
          AI search is turned off right now. The search box above still works.
        </p>
      </section>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) onSearch(trimmed);
  }

  const canRetry = error !== null && error.code !== "rate_limited";

  const chips = result
    ? Array.from(
        new Set([...result.interpretation.techStack, ...result.interpretation.languages, ...result.interpretation.keywords]),
      )
    : [];

  return (
    <section aria-label="AI search" className="rounded-[10px] border border-border bg-surface p-3">
      <form role="search" onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="flex items-center gap-1.5 text-[11px] font-normal uppercase tracking-wide text-text-faint"
        >
          <SparkleIcon className="h-3 w-3" />
          Ask AI to find {noun}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            name="ai-search"
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_PROMPT_CHARS}
            disabled={isLoading}
            autoComplete="off"
            placeholder='e.g. "a tool that helps with frontend design"'
            className="w-full rounded-[8px] border border-border bg-bg py-2 px-3 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
          />
          <button type="submit" disabled={!canSubmit} className={PRIMARY_BUTTON_CLASS}>
            {isLoading ? <Spinner size={13} /> : <SparkleIcon className="h-3.5 w-3.5" />}
            Ask AI
          </button>
        </div>
      </form>

      {isLoading ? <AiLoading className="mt-3" message={`Working out what you mean and searching ${noun}…`} /> : null}

      {error && !isLoading ? (
        <AiError
          className="mt-3"
          message={`${error.message}${result ? " Your previous AI results are still shown." : ""}`}
          onRetry={canRetry ? () => void state.retry() : undefined}
        />
      ) : null}

      {result && !isLoading ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2">
              {result.aiUsed ? <AiBadge /> : null}
              <p className="m-0 text-[12px] text-text-muted">
                {result.aiUsed
                  ? `${result.results.length.toLocaleString()} ${result.results.length === 1 ? "match" : "matches"} from ${result.scanned.toLocaleString()} ${noun} searched.`
                  : result.fallbackReason === "unusable_answer"
                    ? `The AI's answer couldn't be used, so these are plain keyword matches (${result.results.length.toLocaleString()} found).`
                    : `AI search isn't available right now, so these are plain keyword matches (${result.results.length.toLocaleString()} found).`}
              </p>
            </div>
            <button type="button" onClick={onClear} className={AI_SECONDARY_BUTTON_CLASS}>
              Clear AI search
            </button>
          </div>

          {chips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-normal uppercase tracking-wide text-text-faint">
                {result.aiUsed ? "Looking for:" : "Searched for:"}
              </span>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {chips.map((chip) => (
                  <li
                    key={chip}
                    className="rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[11.5px] text-text-muted"
                  >
                    {chip}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.aiUsed && result.interpretation.intent ? (
            <p className="m-0 text-[12px] text-text-dim">{result.interpretation.intent}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
