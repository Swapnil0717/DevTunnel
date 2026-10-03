"use client";

import { Dialog } from "@/components/ui/dialog";

/**
 * The header's "Guide" popup — how to go from signing in to a merged pull
 * request. Plain steps only (no commands): the exact commands for a task are
 * shown on that task's Contribute page, so they can't go stale here.
 */
const STEPS = [
  {
    title: "Sign in with GitHub",
    body: "Browsing is open to everyone. An account lets you take tasks and track your progress.",
  },
  {
    title: "Pick a project",
    body: "Open Projects on Devtunnel and filter by tech stack and level to find one that fits you.",
  },
  {
    title: "Choose a task",
    body: "Read the issue and its AI explanation, then start the task to claim it.",
  },
  {
    title: "Work with the CLI",
    body: "Open the task's Contribute page and copy its commands into your terminal.",
  },
  {
    title: "Open your pull request",
    body: "Submit your work. The task moves to In review while the maintainers look at it.",
  },
  {
    title: "Get reviewed and merged",
    body: "Once it's accepted, the contribution shows on your profile.",
  },
] as const;

export function GuideDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      title="How to use DevTunnel"
      description="From sign-in to a merged pull request."
      onRequestClose={onClose}
    >
      <ol className="m-0 mt-3 flex list-none flex-col p-0">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex gap-3 border-t border-border-subtle py-3 first:border-t-0 first:pt-1"
          >
            <span
              aria-hidden="true"
              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-surface-raised text-[11.5px] font-medium text-accent"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="m-0 text-[13.5px] font-medium text-text">{step.title}</p>
              <p className="m-0 mt-0.5 text-[12.5px] leading-relaxed text-text-secondary">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={onClose}
        className="mt-3 rounded-md border border-border px-3.5 py-2 text-[13px] text-text transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Got it
      </button>
    </Dialog>
  );
}
