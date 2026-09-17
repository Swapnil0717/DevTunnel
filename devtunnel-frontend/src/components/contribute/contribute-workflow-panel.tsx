"use client";

import { useState } from "react";
import { CommandBlock } from "@/components/contribute/command-block";
import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import type { WorkflowStep } from "@/lib/contribute/types";

/**
 * "How to submit" tab — the fork → branch → change → commit → push → PR
 * flow, as an ordered, tickable list.
 *
 * Numbered markers are used here because this content genuinely is a
 * sequence: you cannot open the pull request before you have pushed the
 * branch. (They're avoided elsewhere on this page for exactly that
 * reason — the ways-to-contribute cards are a menu, not an order.)
 *
 * The checkboxes are a scratchpad, not saved progress. They live in
 * component state only: nothing here is written to the backend, and the
 * page deliberately doesn't claim otherwise — the copy under the heading
 * says so, so nobody comes back tomorrow expecting their ticks to still
 * be there. Storing a contributor's private progress through a git
 * tutorial isn't worth a backend field, and a half-implemented one that
 * silently forgets is worse than none (rule 38 — don't show a state the
 * app can't actually stand behind).
 *
 * `steps` is `null` for a target with no repository behind it. There's no
 * fork to make and no clone URL to print, so the tab says that plainly
 * rather than rendering git commands that can't apply.
 */
export function ContributeWorkflowPanel({
  steps,
  repositoryUrl,
  contributingGuideUrl,
}: {
  steps: WorkflowStep[] | null;
  repositoryUrl: string | null;
  contributingGuideUrl: string | null;
}) {
  const [doneIds, setDoneIds] = useState<string[]>([]);

  if (!steps) {
    return (
      <GithubEmptyState
        compact
        variant="no-results"
        title="No repository to fork"
        description="This tool isn't backed by a GitHub repository, so there's no fork-and-pull-request flow to walk through. Its own site is the place to find out how the maintainers take contributions."
        primaryAction={
          repositoryUrl
            ? { label: "Visit the source", href: repositoryUrl, external: true }
            : undefined
        }
      />
    );
  }

  function toggle(id: string) {
    setDoneIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  const completed = doneIds.length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="m-0 text-[13px] font-medium text-text">
            From forked repository to merged pull request
          </h3>
          <p className="m-0 mt-1 text-[12px] text-text-muted">
            Tick steps off as you go. This is a scratchpad for this visit — nothing is saved.
          </p>
        </div>
        <span className="text-[11.5px] text-text-faint">
          {completed} of {steps.length} ticked
        </span>
      </div>

      {contributingGuideUrl ? (
        <a
          href={contributingGuideUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mb-4 flex items-center justify-between gap-3 rounded-[9px] border border-accent/25 bg-accent/[0.04] px-3.5 py-2.5 text-[12.5px] text-text-secondary transition-colors hover:border-accent/40"
        >
          <span>
            This project&apos;s own contributing guide overrides anything below it.
          </span>
          <span className="shrink-0 font-medium text-status-success-label">
            Read CONTRIBUTING.md
          </span>
        </a>
      ) : null}

      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map((step, index) => {
          const isDone = doneIds.includes(step.id);

          return (
            <li
              key={step.id}
              className={`rounded-[9px] border p-3.5 transition-colors ${
                isDone
                  ? "border-accent/25 bg-surface-selected"
                  : "border-border-subtle bg-surface-raised"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id={`workflow-step-${step.id}`}
                  checked={isDone}
                  onChange={() => toggle(step.id)}
                  className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-accent"
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`workflow-step-${step.id}`}
                    className={`block cursor-pointer text-[13px] font-medium ${
                      isDone ? "text-text-muted line-through" : "text-text"
                    }`}
                  >
                    <span className="mr-1.5 font-mono text-[11.5px] text-text-faint">
                      {index + 1}
                    </span>
                    {step.title}
                  </label>

                  <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-text-secondary">
                    {step.detail}
                  </p>

                  {step.commands ? (
                    <div className="mt-2.5">
                      <CommandBlock commands={step.commands} label={step.title} />
                    </div>
                  ) : null}

                  {step.note ? (
                    <p className="m-0 mt-2 text-[11.5px] text-text-faint">{step.note}</p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
