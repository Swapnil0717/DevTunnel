"use client";

import { useState } from "react";
import Link from "next/link";
import { ClickableCard } from "@/components/ui/clickable-card";
import { AdminTaskStatusBadge } from "@/components/admin/tasks/admin-task-status-badge";
import { RepoLogo } from "@/components/admin/repo-logo";
import { IssueIcon } from "@/components/layout/nav-icons";
import { AiExplainToggle, AiExplanationPanel } from "@/components/ai/ai-explain-button";
import { getTaskExplainTarget } from "@/lib/ai/task-explain";
import { TechIcon } from "@/components/onboarding/tech-icon";
import { DEVELOPER_ROLE_LABEL, EXPERIENCE_LEVEL_LABEL } from "@/lib/onboarding/types";
import type { Task } from "@/lib/tasks/types";

/**
 * Task's own internal page — same `/projects/:projectSlug/tasks/:taskId`
 * pattern `TaskRow` (`components/home/task-row.tsx`) already links to,
 * reused here rather than invented fresh (rule 51).
 */
function taskHref(task: Task): string {
  return `/projects/${task.project.slug}/tasks/${task.id}`;
}

/** How many tech-stack chips to show inline before collapsing into "+N". */
const MAX_VISIBLE_TECH = 4;

/**
 * Tasks list (`/tasks`) — the contributor-facing counterpart to
 * `AdminTasksTable`. Each task is one card instead of a row in a 9-column
 * table, so a long title wraps across the full card width and nothing needs
 * a sideways scroll at any screen size (the old table forced `min-w-[1080px]`
 * and a separate mobile layout; this is one layout for every width).
 *
 * A card shows the same facts the table did, regrouped by how they are read:
 *  - title + status (top row);
 *  - project, repository and the linked GitHub issue (second line);
 *  - difficulty, role(s) and tech stack as chips;
 *  - contributor counts, the AI "Explain" toggle and the "View task" link
 *    (footer).
 * Facts a task doesn't have (no roles, no difficulty, no tech stack, no
 * linked issue) are left out rather than filled with a dash. Important
 * facts (role, difficulty, status) are always text, never color/icon alone
 * (rule 43).
 *
 * Every card opens the task's own DevTunnel page — same
 * `/projects/:projectSlug/tasks/:taskId` destination as the "View task"
 * link (`ClickableCard`, real client-side navigation rather than a new tab,
 * per rule 10) — on click anywhere on the card that isn't itself a link or
 * button. The underlying GitHub issue is still one click away from its own
 * link; it just isn't what the card itself opens, since the card's job is to
 * show what *this task* is, not the raw issue.
 *
 * Tasks that come from an open GitHub issue also get an "Explain" toggle
 * (AI, `AiExplainToggle`): it expands a plain-language explanation of the
 * issue inside the card (`AiExplanationPanel`, which only asks the backend
 * once it is on screen, so a task nobody clicks costs nothing). The toggle
 * is a real `<button>` beside the card's links, never inside one, and the
 * expanded panel is excluded from the card's click-to-open behavior so
 * reading or selecting its text never navigates away.
 *
 * `AdminTaskStatusBadge`, `RepoLogo`, `TechIcon`, `DEVELOPER_ROLE_LABEL`
 * and `EXPERIENCE_LEVEL_LABEL` are reused as-is — all generic,
 * role-agnostic presentational pieces (rule 51).
 */
export function TasksTable({ tasks }: { tasks: Task[] }) {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Tasks">
      {tasks.map((task) => {
        const visibleTech = task.techStack.slice(0, MAX_VISIBLE_TECH);
        const hiddenTechCount = task.techStack.length - visibleTech.length;
        const explainTarget = getTaskExplainTarget(task);
        const panelId = `ai-explain-task-${task.id}`;
        const isOpen = explainTarget !== null && openIds.has(task.id);
        const hasChips = Boolean(task.difficulty) || task.roles.length > 0 || task.techStack.length > 0;

        return (
          <li key={task.id}>
            <ClickableCard
              href={taskHref(task)}
              className="overflow-hidden rounded-[10px] border border-border bg-surface transition-colors hover:border-border-subtle hover:bg-surface-raised"
            >
              <div className="px-4 py-3.5 sm:px-5">
                {/* Title + status */}
                <div className="flex items-start justify-between gap-3">
                  <h3 className="m-0 min-w-0 text-[14.5px] font-medium leading-snug text-text">
                    <Link href={taskHref(task)} className="hover:text-accent">
                      {task.title}
                    </Link>
                  </h3>
                  <span className="shrink-0 pt-0.5">
                    <AdminTaskStatusBadge status={task.status} />
                  </span>
                </div>

                {/* Project, repository, GitHub issue */}
                <p className="m-0 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-muted">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <RepoLogo repositoryFullName={task.project.repositoryFullName} size={14} />
                    <span className="truncate">{task.project.name}</span>
                    <span className="truncate font-mono text-[11px] text-text-faint">{task.project.repositoryFullName}</span>
                  </span>
                  {task.githubIssue ? (
                    <a
                      href={task.githubIssue.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 font-mono text-[11.5px] text-text-secondary hover:text-accent"
                    >
                      <IssueIcon className="h-3.5 w-3.5 shrink-0" />#{task.githubIssue.number}
                    </a>
                  ) : null}
                </p>

                {/* Difficulty, roles, tech stack */}
                {hasChips ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {task.difficulty ? (
                      <span className="inline-flex items-center rounded-md border border-border bg-surface-raised px-2 py-0.5 text-[11.5px] text-text-secondary">
                        {EXPERIENCE_LEVEL_LABEL[task.difficulty]}
                      </span>
                    ) : null}
                    {task.roles.map((role) => (
                      <span
                        key={role}
                        className="inline-flex items-center rounded-md border border-border-subtle px-2 py-0.5 text-[11.5px] text-text-muted"
                      >
                        {DEVELOPER_ROLE_LABEL[role]}
                      </span>
                    ))}
                    {visibleTech.map((value) => (
                      <span
                        key={value}
                        className="inline-flex items-center gap-1 rounded-md border border-tag-tech-border bg-tag-tech-bg px-1.5 py-0.5 text-[11.5px] text-tag-tech-text"
                      >
                        <TechIcon name={value} />
                        {value}
                      </span>
                    ))}
                    {hiddenTechCount > 0 ? <span className="text-[11px] text-text-faint">+{hiddenTechCount}</span> : null}
                  </div>
                ) : null}

                {/* Footer — contributors, AI "Explain", View task. Editing/deleting a task is an Admin action. */}
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border-subtle pt-3">
                  <p className="m-0 text-[12px] text-text-muted">
                    {task.activeContributorCount} working · {task.completedContributorCount} completed
                  </p>
                  <div className="flex items-center gap-2">
                    {explainTarget ? (
                      <AiExplainToggle
                        open={isOpen}
                        onToggle={() => toggle(task.id)}
                        controlsId={panelId}
                        issueNumber={explainTarget.issueNumber}
                      />
                    ) : null}
                    <Link
                      href={taskHref(task)}
                      className="inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:text-accent"
                    >
                      View task <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              </div>

              {isOpen && explainTarget ? (
                <div className="border-t border-border bg-surface-raised">
                  <AiExplanationPanel
                    id={panelId}
                    source="devtunnel"
                    repo={explainTarget.repo}
                    issueNumber={explainTarget.issueNumber}
                    embedded
                  />
                </div>
              ) : null}
            </ClickableCard>
          </li>
        );
      })}
    </ul>
  );
}
