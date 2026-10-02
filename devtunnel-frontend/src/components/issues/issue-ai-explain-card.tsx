"use client";

import { useId, useState } from "react";
import { SparkleIcon } from "@/components/layout/nav-icons";
import { AiExplanationPanel } from "@/components/ai/ai-explain-button";
import { AiCardHeader, AI_SECONDARY_BUTTON_CLASS } from "@/components/ai/ai-states";
import { getIssueExplainTarget } from "@/lib/ai/issue-explain";
import type { IssueDetail } from "@/lib/issues/detail-types";

type Variant = "view" | "contribute";

const COPY: Record<Variant, string> = {
  view: "Not sure what this issue is asking for? Let AI read it and explain it in plain language — what needs doing, the skills involved and where to start.",
  contribute: "About to start? Let AI read the issue and suggest first steps, the skills you'll need and what to watch out for.",
};

/**
 * "Explain this issue with AI" card for the View Issue page and the issue
 * Contribute page — the issue counterpart of `TaskAiExplainCard`.
 *
 * It reuses the same panel as the Explain toggle on the `/issues` cards
 * (`AiExplanationPanel` → `POST /ai/issue-explanation`, source
 * `"devtunnel"`), so the explanation is stored once per (repository, issue)
 * on the backend and shared by every page that shows it — including the task
 * pages, when a task was made from this issue.
 *
 * Nothing is requested until the visitor clicks: a page nobody asks AI about
 * costs no request and no model call. After the click the panel takes over
 * and carries every state itself (loading, signed out, AI switched off,
 * nothing to explain, error with retry, done).
 *
 * Renders nothing when there is nothing to explain — see
 * `getIssueExplainTarget` (closed issue, malformed repository name).
 */
export function IssueAiExplainCard({ issue, variant = "view" }: { issue: IssueDetail; variant?: Variant }) {
  const target = getIssueExplainTarget(issue);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (!target) return null;

  if (open) {
    return <AiExplanationPanel id={panelId} source="devtunnel" repo={target.repo} issueNumber={target.issueNumber} />;
  }

  return (
    <section aria-label="AI issue explanation" className="rounded-[10px] border border-border bg-surface p-5">
      <AiCardHeader title="Explain this issue" level="h2" done={false} />
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
