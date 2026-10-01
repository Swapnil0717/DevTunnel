"use client";

import { useId, useState } from "react";
import { SparkleIcon } from "@/components/layout/nav-icons";
import { AiExplanationPanel } from "@/components/ai/ai-explain-button";
import { AiCardHeader, AI_SECONDARY_BUTTON_CLASS } from "@/components/ai/ai-states";
import { getTaskExplainTarget } from "@/lib/ai/task-explain";
import type { Task } from "@/lib/tasks/types";

type Variant = "view" | "contribute";

const COPY: Record<Variant, string> = {
  view: "Not sure what this task is asking for? Let AI read the GitHub issue and explain it in plain language — what needs doing, the skills involved and where to start.",
  contribute: "About to start? Let AI read the GitHub issue and suggest first steps, the skills you'll need and what to watch out for.",
};

/**
 * "Explain this task with AI" card for the View Task page and the task
 * Contribute page.
 *
 * It reuses the same panel as the Explain button on the Issues and Tasks
 * lists (`AiExplanationPanel` → `POST /ai/issue-explanation`, source
 * `"devtunnel"`), so a task's explanation is the explanation of its GitHub
 * issue: stored once on the backend and shared by every page that shows it.
 *
 * Nothing is requested until the visitor clicks — a task page that nobody
 * asks AI about costs no request and no model call. After the click the
 * panel takes over and carries every state itself (loading, signed out,
 * AI switched off, nothing to explain, error with retry, done).
 *
 * Renders nothing when there is nothing to explain (no linked issue, the
 * issue is closed, the task is done) — see `getTaskExplainTarget`.
 */
export function TaskAiExplainCard({ task, variant = "view" }: { task: Task; variant?: Variant }) {
  const target = getTaskExplainTarget(task);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (!target) return null;

  if (open) {
    return <AiExplanationPanel id={panelId} source="devtunnel" repo={target.repo} issueNumber={target.issueNumber} />;
  }

  return (
    <section aria-label="AI task explanation" className="rounded-[10px] border border-border bg-surface p-5">
      <AiCardHeader title="Explain this task" level="h2" done={false} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-[12.5px] leading-relaxed text-text-muted">{COPY[variant]}</p>
        <button type="button" onClick={() => setOpen(true)} className={AI_SECONDARY_BUTTON_CLASS}>
          <SparkleIcon className="h-3.5 w-3.5" />
          Explain with AI
        </button>
      </div>
    </section>
  );
}
