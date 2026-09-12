"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  triggerAiProjectDiscoveryRun,
  triggerAiToolDiscoveryRun,
  triggerAiTaskDiscoveryRun,
} from "@/lib/admin/ai-discovery/client-api";
import type { AiDiscoveryRunSummary } from "@/lib/admin/ai-discovery/types";
import { SparkleIcon } from "@/components/layout/nav-icons";

interface AiDiscoveryRunButtonProps {
  kind: "projects" | "tools" | "tasks";
}

const COPY = {
  projects: {
    idle: "Add AI projects",
    running: "Finding open source projects…",
    noun: (n: number) => `${n} project${n === 1 ? "" : "s"}`,
    error: "Couldn't run project discovery. Try again.",
  },
  tools: {
    idle: "Add AI tools",
    running: "Finding open source tools…",
    noun: (n: number) => `${n} tool${n === 1 ? "" : "s"}`,
    error: "Couldn't run tool discovery. Try again.",
  },
  tasks: {
    idle: "Add AI tasks",
    running: "Going through onboarded projects' issues…",
    noun: (n: number) => `${n} task${n === 1 ? "" : "s"}`,
    error: "Couldn't run task discovery. Try again.",
  },
} as const;

/**
 * Sits above the queue on the AI Added Projects / AI Added Tools / AI
 * Added Tasks admin pages (devtunnel-frontend .../ai/{projects,tools,tasks}).
 * Unlike AiDiscoveryStatusPanel (which runs all three discovery phases
 * from the Confirmation page), this triggers only the single phase
 * named by `kind` — POST /admin/ai/{projects,tools,tasks}/run — so an
 * admin can top up just the queue they're looking at. The "tasks" kind
 * walks every onboarded DevTunnel project's open issues one project at
 * a time (see runTaskDiscovery in the backend), converting eligible
 * issues into task candidates. Shares the same dedup guarantees as a
 * full run, so it's safe to click repeatedly.
 */
export function AiDiscoveryRunButton({ kind }: AiDiscoveryRunButtonProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<AiDiscoveryRunSummary | null>(null);
  const copy = COPY[kind];

  async function handleRun() {
    setError(null);
    setIsRunning(true);
    try {
      const summary =
        kind === "projects"
          ? await triggerAiProjectDiscoveryRun()
          : kind === "tools"
            ? await triggerAiToolDiscoveryRun()
            : await triggerAiTaskDiscoveryRun();
      setLastRun(summary);
      // New PENDING candidates land in the server-fetched list below —
      // refresh so the page picks them up without a manual reload.
      router.refresh();
    } catch {
      setError(copy.error);
    } finally {
      setIsRunning(false);
    }
  }

  const proposedCount = lastRun
    ? kind === "projects"
      ? lastRun.projectsProposed
      : kind === "tools"
        ? lastRun.toolsProposed
        : lastRun.tasksProposed
    : null;

  return (
    <div className="mb-8">
      <button
        type="button"
        onClick={handleRun}
        disabled={isRunning}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <SparkleIcon className="h-3.5 w-3.5 shrink-0" />
        {isRunning ? copy.running : copy.idle}
      </button>

      {error ? <p className="m-0 mt-3 text-[12px] text-status-error-label">{error}</p> : null}

      {lastRun && !error ? (
        <div className="mt-3 rounded-[8px] border border-status-success-border bg-status-success-bg p-3">
          <p className="m-0 text-[12.5px] font-medium text-status-success-label">Run complete</p>
          <p className="m-0 mt-1 text-[12px] text-status-success-text">
            {copy.noun(proposedCount ?? 0)} proposed
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