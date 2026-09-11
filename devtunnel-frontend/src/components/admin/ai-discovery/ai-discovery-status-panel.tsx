"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { triggerAiDiscoveryRun } from "@/lib/admin/ai-discovery/client-api";
import type { AiDiscoveryCounters, AiDiscoveryRunSummary } from "@/lib/admin/ai-discovery/types";
import { SparkleIcon } from "@/components/layout/nav-icons";

interface AiDiscoveryStatusPanelProps {
  /** `null` when the initial server-side fetch of `/admin/ai/status` failed. */
  initialCounters: AiDiscoveryCounters | null;
}

/**
 * Sits at the top of the Confirmation page. Two things this pipeline was
 * previously missing on the frontend: a way to see today's discovery
 * quota, and a way to trigger `POST /admin/ai/run` on demand instead of
 * only waiting for the daily cron (devtunnel-backend/src/index.ts
 * `scheduled`). A completed run's counts are shown inline and the page
 * is refreshed so newly proposed candidates show up in the queues below
 * without a manual reload.
 */
export function AiDiscoveryStatusPanel({ initialCounters }: AiDiscoveryStatusPanelProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<AiDiscoveryRunSummary | null>(null);

  async function handleRun() {
    setError(null);
    setIsRunning(true);
    try {
      const summary = await triggerAiDiscoveryRun();
      setLastRun(summary);
      // A run may use up some of today's remaining quota and adds new
      // PENDING candidates below — refresh so the server-fetched
      // `initialCounters` prop and the queue lists both pick that up.
      // (Read directly from the prop rather than mirroring it into local
      // state, so this component can't show a stale quota after refresh.)
      router.refresh();
    } catch {
      setError("Couldn't start a discovery run. Try again.");
    } finally {
      setIsRunning(false);
    }
  }

  const counters = initialCounters;
  const projectsRemaining = counters
    ? counters.projectsRemaining.beginner + counters.projectsRemaining.intermediate + counters.projectsRemaining.advanced
    : null;

  return (
    <div className="mb-8 rounded-[10px] border border-border-subtle bg-surface/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="m-0 text-[13px] font-medium text-text">Today&apos;s discovery quota</p>
          {counters ? (
            <p className="m-0 mt-1 text-[12px] text-text-muted">
              Projects remaining: {counters.projectsRemaining.beginner} beginner ·{" "}
              {counters.projectsRemaining.intermediate} intermediate · {counters.projectsRemaining.advanced} advanced
              ({projectsRemaining} total). Tool categories remaining: {counters.toolCategoriesRemaining.length}. Tasks
              found today: {counters.tasksFound}.
            </p>
          ) : (
            <p className="m-0 mt-1 text-[12px] text-text-muted">Couldn&apos;t load today&apos;s quota.</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={isRunning}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SparkleIcon className="h-3.5 w-3.5 shrink-0" />
          {isRunning ? "Running discovery…" : "Run discovery now"}
        </button>
      </div>

      {error ? <p className="m-0 mt-3 text-[12px] text-status-error-label">{error}</p> : null}

      {lastRun ? (
        <div className="mt-4 rounded-[8px] border border-status-success-border bg-status-success-bg p-3">
          <p className="m-0 text-[12.5px] font-medium text-status-success-label">Run complete</p>
          <p className="m-0 mt-1 text-[12px] text-status-success-text">
            {lastRun.projectsProposed} project{lastRun.projectsProposed === 1 ? "" : "s"} proposed ·{" "}
            {lastRun.toolsProposed} tool{lastRun.toolsProposed === 1 ? "" : "s"} proposed ·{" "}
            {lastRun.tasksProposed} task{lastRun.tasksProposed === 1 ? "" : "s"} proposed
            {lastRun.candidatesDropped > 0
              ? ` · ${lastRun.candidatesDropped} candidate${lastRun.candidatesDropped === 1 ? "" : "s"} dropped (incomplete)`
              : ""}
          </p>
          {lastRun.errors.length > 0 ? (
            <p className="m-0 mt-1 text-[12px] text-status-error-label">
              {lastRun.errors.length} error{lastRun.errors.length === 1 ? "" : "s"} during this run — check server
              logs.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}