// devtunnel-frontend/src/components/admin/ai-discovery/ai-discovery-run-button.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  triggerAiProjectDiscoveryRun,
  triggerAiToolDiscoveryRun,
  triggerAiTaskDiscoveryRun,
} from "@/lib/admin/ai-discovery/client-api";
import type { AiDiscoveryRunSummary } from "@/lib/admin/ai-discovery/types";
import { SparkleIcon } from "@/components/layout/nav-icons";
import { GroqQuotaPanel } from "@/components/admin/ai-discovery/groq-quota-panel";

interface AiDiscoveryRunButtonProps {
  kind: "projects" | "tools" | "tasks";
}

/** One live progress line shown in the running steps log. */
interface StepEntry {
  id: number;
  message: string;
}

const COPY = {
  projects: {
    idle: "Add AI project",
    running: "Finding an open source project…",
    noun: (n: number) => `${n} project${n === 1 ? "" : "s"}`,
    error: "Couldn't run project discovery. Try again.",
  },
  tools: {
    idle: "Add AI tool",
    running: "Finding an open source tool…",
    noun: (n: number) => `${n} tool${n === 1 ? "" : "s"}`,
    error: "Couldn't run tool discovery. Try again.",
  },
  tasks: {
    idle: "Add AI issue",
    running: "Going through onboarded projects' issues…",
    noun: (n: number) => `${n} task${n === 1 ? "" : "s"}`,
    error: "Couldn't run task discovery. Try again.",
  },
} as const;

const QUOTA_EXCEEDED_MESSAGE = "Today's Groq budget was hit partway through this run. It'll pick back up once the budget resets.";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function AiDiscoveryRunButton({ kind }: AiDiscoveryRunButtonProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<AiDiscoveryRunSummary | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastRunDurationMs, setLastRunDurationMs] = useState<number | null>(null);
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0);
  const [steps, setSteps] = useState<StepEntry[]>([]);
  const runStartedAtRef = useRef<number | null>(null);
  const nextStepIdRef = useRef(0);
  const stepsLogRef = useRef<HTMLOListElement | null>(null);
  const copy = COPY[kind];

  useEffect(() => {
    if (!isRunning) return;
    const intervalId = setInterval(() => {
      if (runStartedAtRef.current !== null) {
        setElapsedMs(Date.now() - runStartedAtRef.current);
      }
    }, 1000);
    return () => clearInterval(intervalId);
  }, [isRunning]);

  // Auto-scroll the live steps log to the newest line as it grows.
  useEffect(() => {
    const el = stepsLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [steps]);

  function appendStep(message: string) {
    const id = nextStepIdRef.current;
    nextStepIdRef.current += 1;
    setSteps((prev) => [...prev, { id, message }]);
  }

  async function handleRun() {
    setError(null);
    setLastRunDurationMs(null);
    setSteps([]);
    nextStepIdRef.current = 0;
    runStartedAtRef.current = Date.now();
    setElapsedMs(0);
    setIsRunning(true);
    try {
      const handlers = { onStep: appendStep };
      const summary =
        kind === "projects"
          ? await triggerAiProjectDiscoveryRun(handlers)
          : kind === "tools"
            ? await triggerAiToolDiscoveryRun(handlers)
            : await triggerAiTaskDiscoveryRun(handlers);
      setLastRun(summary);
      router.refresh();
    } catch {
      setError(copy.error);
    } finally {
      if (runStartedAtRef.current !== null) {
        setLastRunDurationMs(Date.now() - runStartedAtRef.current);
      }
      runStartedAtRef.current = null;
      setIsRunning(false);
      setQuotaRefreshKey((k) => k + 1);
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
      <GroqQuotaPanel refreshKey={quotaRefreshKey} kind={kind} />

      <button
        type="button"
        onClick={handleRun}
        disabled={isRunning}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <SparkleIcon className="h-3.5 w-3.5 shrink-0" />
        {isRunning ? copy.running : copy.idle}
      </button>

      {isRunning ? (
        <p className="m-0 mt-2 text-[12px] text-text-faint" aria-live="polite">
          Running for {formatElapsed(elapsedMs)}…
        </p>
      ) : null}

      {(isRunning || steps.length > 0) && (
        <ol
          ref={stepsLogRef}
          aria-live="polite"
          className="m-0 mt-3 max-h-56 list-none space-y-1 overflow-y-auto rounded-[8px] border border-border bg-surface-raised p-3 font-mono text-[11.5px] leading-relaxed text-text-muted"
        >
          {steps.map((step, index) => (
            <li key={step.id} className="flex gap-2">
              <span className="shrink-0 text-text-faint">{String(index + 1).padStart(2, "0")}</span>
              <span>{step.message}</span>
            </li>
          ))}
          {isRunning ? (
            <li className="flex gap-2 text-text-faint">
              <span className="shrink-0">··</span>
              <span className="animate-pulse">Working…</span>
            </li>
          ) : null}
        </ol>
      )}

      {error ? <p className="m-0 mt-3 text-[12px] text-status-error-label">{error}</p> : null}

      {lastRun && !error && lastRun.groqQuotaExceeded ? (
        <div className="mt-3 rounded-[8px] border border-status-error-border bg-status-error-bg p-3">
          <p className="m-0 text-[12.5px] font-medium text-status-error-label">Groq budget limit hit</p>
          <p className="m-0 mt-1 text-[12px] text-status-error-text">{QUOTA_EXCEEDED_MESSAGE}</p>
          {proposedCount ? (
            <p className="m-0 mt-1 text-[12px] text-status-error-text">
              {copy.noun(proposedCount)} were still proposed before the limit was hit.
            </p>
          ) : null}
        </div>
      ) : null}

      {lastRun && !error && !lastRun.groqQuotaExceeded ? (
        <div className="mt-3 rounded-[8px] border border-status-success-border bg-status-success-bg p-3">
          <p className="m-0 text-[12.5px] font-medium text-status-success-label">
            Run complete{lastRunDurationMs !== null ? ` in ${formatElapsed(lastRunDurationMs)}` : ""}
          </p>
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