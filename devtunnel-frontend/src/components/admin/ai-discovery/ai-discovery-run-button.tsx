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

/** Pause between loop iterations — long enough that the confirmation queue's refresh and the quota panel aren't hammered, short enough that the loop still feels continuous. */
const LOOP_PAUSE_MS = 1500;

/** Two runs in a row that found nothing new means the project catalog is exhausted for today — stop instead of looping forever on empty results. */
const LOOP_EMPTY_RUNS_BEFORE_STOP = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  // Loop mode — only wired up for "tasks": repeatedly hits the same
  // single-issue endpoint used by the button above, one onboarded
  // project's random open issue at a time, until today's issue-discovery
  // Groq budget runs out or every project's issues are already covered.
  // Each proposed task lands in the PENDING queue exactly like a single
  // click would, so it's still sitting there for an admin to confirm —
  // looping just keeps that queue filling up instead of requiring a
  // click per issue.
  const [isLooping, setIsLooping] = useState(false);
  const [loopRuns, setLoopRuns] = useState(0);
  const [loopTotalProposed, setLoopTotalProposed] = useState(0);
  const [loopStopReason, setLoopStopReason] = useState<string | null>(null);
  const [lastRunWasLoop, setLastRunWasLoop] = useState(false);
  const stopLoopRef = useRef(false);

  useEffect(() => {
    if (!isRunning && !isLooping) return;
    const intervalId = setInterval(() => {
      if (runStartedAtRef.current !== null) {
        setElapsedMs(Date.now() - runStartedAtRef.current);
      }
    }, 1000);
    return () => clearInterval(intervalId);
  }, [isRunning, isLooping]);

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
    setLastRunWasLoop(false);
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

  /**
   * Loop: convert one random project's issue into a task, leave it in the
   * PENDING queue for confirmation, then immediately go looking for the
   * next one — repeating until today's tasks/issue budget (50% of the
   * shared Groq daily budget) is exhausted, or two runs in a row turn up
   * nothing new (every onboarded project's issues are already tracked).
   * Stops instantly if the admin clicks "Stop".
   */
  async function handleStartLoop() {
    setError(null);
    setLoopStopReason(null);
    setLastRun(null);
    setLastRunDurationMs(null);
    setSteps([]);
    nextStepIdRef.current = 0;
    setLoopRuns(0);
    setLoopTotalProposed(0);
    stopLoopRef.current = false;
    runStartedAtRef.current = Date.now();
    setElapsedMs(0);
    setIsLooping(true);
    setLastRunWasLoop(true);

    let consecutiveEmptyRuns = 0;
    let runCount = 0;
    let totalProposed = 0;

    while (!stopLoopRef.current) {
      runCount += 1;
      appendStep(`— Run ${runCount}: picking a random onboarded project to check for open issues…`);

      let summary: AiDiscoveryRunSummary;
      try {
        summary = await triggerAiTaskDiscoveryRun({ onStep: appendStep });
      } catch {
        setError(copy.error);
        appendStep("Run failed — stopping the loop.");
        break;
      }

      totalProposed += summary.tasksProposed;
      setLoopRuns(runCount);
      setLoopTotalProposed(totalProposed);
      setLastRun(summary);
      setQuotaRefreshKey((k) => k + 1);
      router.refresh();

      if (summary.tasksProposed > 0) {
        appendStep(
          `Proposed ${summary.tasksProposed} task${summary.tasksProposed === 1 ? "" : "s"} — now waiting in the queue for confirmation.`,
        );
      }

      if (summary.groqQuotaExceeded) {
        setLoopStopReason("Today's issue-conversion Groq budget is used up for now.");
        appendStep("Today's issue-conversion budget ran out — loop stopped.");
        break;
      }

      if (summary.tasksProposed === 0 && summary.candidatesDropped === 0 && summary.errors.length === 0) {
        consecutiveEmptyRuns += 1;
        if (consecutiveEmptyRuns >= LOOP_EMPTY_RUNS_BEFORE_STOP) {
          setLoopStopReason("Every onboarded project's open issues are already tracked or didn't qualify.");
          appendStep("No more actionable issues found — loop stopped.");
          break;
        }
      } else {
        consecutiveEmptyRuns = 0;
      }

      if (stopLoopRef.current) break;
      appendStep("Pausing briefly before the next issue…");
      await sleep(LOOP_PAUSE_MS);
    }

    if (runStartedAtRef.current !== null) {
      setLastRunDurationMs(Date.now() - runStartedAtRef.current);
    }
    runStartedAtRef.current = null;
    setIsLooping(false);
  }

  function handleStopLoop() {
    stopLoopRef.current = true;
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleRun}
          disabled={isRunning || isLooping}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SparkleIcon className="h-3.5 w-3.5 shrink-0" />
          {isRunning ? copy.running : copy.idle}
        </button>

        {kind === "tasks" ? (
          isLooping ? (
            <button
              type="button"
              onClick={handleStopLoop}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-status-error-border bg-status-error-bg px-4 py-2 text-[13px] font-medium text-status-error-label transition-opacity hover:opacity-90"
            >
              Stop loop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartLoop}
              disabled={isRunning}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-raised px-4 py-2 text-[13px] font-medium text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SparkleIcon className="h-3.5 w-3.5 shrink-0" />
              Auto-convert issues until budget runs out
            </button>
          )
        ) : null}
      </div>

      {(isRunning || isLooping) ? (
        <p className="m-0 mt-2 text-[12px] text-text-faint" aria-live="polite">
          {isLooping
            ? `Looping for ${formatElapsed(elapsedMs)} — run ${loopRuns}, ${loopTotalProposed} task${loopTotalProposed === 1 ? "" : "s"} proposed so far…`
            : `Running for ${formatElapsed(elapsedMs)}…`}
        </p>
      ) : null}

      {!isRunning && !isLooping && loopStopReason ? (
        <div className="mt-3 rounded-[8px] border border-border bg-surface-raised p-3">
          <p className="m-0 text-[12.5px] font-medium text-text">
            Loop stopped after {loopRuns} run{loopRuns === 1 ? "" : "s"}
            {lastRunDurationMs !== null ? ` (${formatElapsed(lastRunDurationMs)})` : ""}
          </p>
          <p className="m-0 mt-1 text-[12px] text-text-muted">{loopStopReason}</p>
          <p className="m-0 mt-1 text-[12px] text-text-muted">
            {loopTotalProposed} task{loopTotalProposed === 1 ? "" : "s"} proposed in total, waiting for confirmation.
          </p>
        </div>
      ) : null}

      {(isRunning || isLooping || steps.length > 0) && (
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
          {isRunning || isLooping ? (
            <li className="flex gap-2 text-text-faint">
              <span className="shrink-0">··</span>
              <span className="animate-pulse">Working…</span>
            </li>
          ) : null}
        </ol>
      )}

      {error ? <p className="m-0 mt-3 text-[12px] text-status-error-label">{error}</p> : null}

      {/* Loop runs get their own "Loop stopped" summary above instead of these
          per-run banners, which would otherwise flash a new one after every
          single iteration. */}
      {!lastRunWasLoop && lastRun && !error && lastRun.groqQuotaExceeded ? (
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

      {!lastRunWasLoop && lastRun && !error && !lastRun.groqQuotaExceeded ? (
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