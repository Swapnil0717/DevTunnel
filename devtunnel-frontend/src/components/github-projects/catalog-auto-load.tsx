"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type ComponentProps } from "react";
import { GithubProjectsExplorer } from "@/components/github-projects/github-projects-explorer";
import type { CatalogLoadConfig } from "@/components/github-projects/github-projects-explorer";
import { SkeletonFilterBar, SkeletonGithubProjectCardGrid } from "@/components/ui/skeleton";
import { CatalogLoadError, fetchFullCatalog } from "@/lib/github-projects/catalog-client";
import type { GithubProjectSummary } from "@/lib/github-projects/types";

/**
 * Wait before each retry (ms) — roughly 40 seconds in total. Only a safety
 * net: the backend now builds a cold catalog in about a second and no longer
 * answers 503 for it, so this mostly covers a slow or briefly unreachable
 * backend (the server render gives up after a few seconds and hands over).
 */
const RETRY_DELAYS_MS = [1000, 2000, 3000, 5000, 8000, 10000, 10000];

type Phase =
  | { kind: "loading"; attempt: number }
  | { kind: "ready"; projects: GithubProjectSummary[] }
  | { kind: "empty" }
  | { kind: "failed" };

type ExplorerProps = Omit<ComponentProps<typeof GithubProjectsExplorer>, "projects" | "catalogLoad">;

interface CatalogAutoLoadProps {
  /** Same config the server page would hand `GithubProjectsExplorer` (`hasMore` is ignored — everything is loaded here). */
  catalogLoad: CatalogLoadConfig;
  /** Every other explorer prop the page uses (card base path, AI search, filters …). All must be serializable. */
  explorerProps?: ExplorerProps;
  /** Shown when GitHub genuinely returned nothing for this catalog. */
  emptyMessage: string;
  /** Optional escape hatch shown when loading keeps failing, e.g. back to the unfiltered list. */
  fallbackLink?: { href: string; label: string };
}

/**
 * Fallback for the GitHub catalog pages (`/github-projects`,
 * `/github-open-source-tools`) when the server-side first-page fetch
 * didn't succeed.
 *
 * Why this exists: the backend answers `503 catalog_warming` while a cold
 * catalog is still being scanned (first visitor after a deploy, or while
 * another scan holds the shared lock). The page used to turn *any* failure
 * into a dead-end "aren't available yet — check back soon" message, so the
 * visitor saw nothing useful and had to refresh by hand — which then worked
 * because the scan had finished in the meantime. This component does that
 * refresh for them: it shows a loading state, retries from the browser with
 * backoff, and renders the full catalog as soon as it arrives. Only after
 * retrying for ~40s does it give up, and then with a "Try again" button
 * instead of a dead end.
 *
 * Give it a `key` that changes with the active catalog filter so switching
 * the filter restarts the load.
 */
export function CatalogAutoLoad({
  catalogLoad,
  explorerProps,
  emptyMessage,
  fallbackLink,
}: CatalogAutoLoadProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading", attempt: 0 });
  const [runId, setRunId] = useState(0);

  const { path, filter } = catalogLoad;

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function run(attempt: number) {
      try {
        const rows = await fetchFullCatalog(path, { filter, signal: controller.signal });
        if (controller.signal.aborted) return;
        setPhase(rows.length > 0 ? { kind: "ready", projects: rows } : { kind: "empty" });
      } catch (err) {
        if (controller.signal.aborted) return;

        // Network trouble, rate limits and 5xx (incl. the 503 "warming")
        // are worth retrying; other 4xx (bad filter, …) will never succeed.
        const retryable =
          !(err instanceof CatalogLoadError) ||
          err.status === 0 ||
          err.status === 429 ||
          err.status >= 500;
        const delay = RETRY_DELAYS_MS[attempt];

        if (retryable && delay !== undefined) {
          timer = setTimeout(() => {
            if (controller.signal.aborted) return;
            setPhase({ kind: "loading", attempt: attempt + 1 });
            void run(attempt + 1);
          }, delay);
        } else {
          setPhase({ kind: "failed" });
        }
      }
    }

    void run(0);

    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [path, filter, runId]);

  const retry = useCallback(() => {
    setPhase({ kind: "loading", attempt: 0 });
    setRunId((n) => n + 1);
  }, []);

  if (phase.kind === "ready") {
    return (
      <Suspense
        fallback={
          <>
            <SkeletonFilterBar filters={3} />
            <SkeletonGithubProjectCardGrid />
          </>
        }
      >
        <GithubProjectsExplorer
          {...explorerProps}
          projects={phase.projects}
          // Everything was just loaded, so there is nothing left for "Load all".
          catalogLoad={{ ...catalogLoad, hasMore: false }}
        />
      </Suspense>
    );
  }

  if (phase.kind === "empty") {
    return (
      <p className="rounded-lg border border-dashed border-border-subtle bg-surface/40 px-3 py-3 text-[11.5px] text-text-dim">
        {emptyMessage}
      </p>
    );
  }

  if (phase.kind === "failed") {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border-subtle bg-surface/40 px-4 py-5"
      >
        <p className="m-0 text-[13px] text-text">
          We couldn&apos;t load {catalogLoad.noun} from GitHub just now.
        </p>
        <p className="m-0 text-[12px] text-text-muted">
          This is usually temporary — GitHub is being scanned or is rate-limiting us. Please try
          again in a moment.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center rounded-[8px] bg-accent px-3.5 py-2 text-[12.5px] font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          {fallbackLink ? (
            <Link
              href={fallbackLink.href}
              className="text-[12.5px] text-text-muted underline-offset-2 hover:text-text hover:underline"
            >
              {fallbackLink.label}
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p
        role="status"
        aria-live="polite"
        className="mb-4 flex items-center gap-2 text-[12px] text-text-muted"
      >
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-border border-t-accent"
        />
        {phase.attempt === 0
          ? `Fetching the latest ${catalogLoad.noun} from GitHub…`
          : `Still gathering ${catalogLoad.noun} from GitHub — the first load can take a few seconds.`}
      </p>
      <SkeletonFilterBar filters={3} />
      <SkeletonGithubProjectCardGrid />
    </div>
  );
}
