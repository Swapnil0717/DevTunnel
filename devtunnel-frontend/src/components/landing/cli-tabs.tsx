"use client";

import { useState } from "react";

type CommandSet = {
  id: "issue" | "task" | "project";
  tab: string;
  hint: string;
  title: string;
  rows: ReadonlyArray<readonly [command: string, description: string]>;
};

/** Strings mirror lib/contribute/cli-commands.ts — the exact commands the Contribute pages show. */
const SETS: ReadonlyArray<CommandSet> = [
  {
    id: "issue",
    tab: "A GitHub issue",
    hint: "Any public repository",
    title: "Start from any public GitHub issue",
    rows: [
      ["npm install -g @devtunnelcli/cli", "Install the CLI globally (Node.js 18.18+)."],
      ["dev login", "Sign in with GitHub and store the token locally."],
      ["dev start owner/repo#123", "Fork, clone, and check out a branch for this issue from the latest upstream."],
      ["dev test", "Pull the latest changes and run the project's own tests."],
      ["dev submit", "Commit, push, and open the pull request using the repo's PR template if it has one."],
    ],
  },
  {
    id: "task",
    tab: "A DevTunnel task",
    hint: "Curated, with role and difficulty",
    title: "Start from a DevTunnel task",
    rows: [
      ["npm install -g @devtunnelcli/cli", "Install the CLI globally (Node.js 18.18+)."],
      ["dev login", "Sign in with GitHub and store the token locally."],
      ["dev start <task-id>", "Claim the task. The branch is named for it."],
      ["dev test", "Pull the latest changes and run the project's own tests."],
      ["dev submit <task-id>", "Open the pull request, link the task's issue and mark it in review."],
    ],
  },
  {
    id: "project",
    tab: "A whole project",
    hint: "Claim the project itself",
    title: "Claim a whole DevTunnel project",
    rows: [
      ["npm install -g @devtunnelcli/cli", "Install the CLI globally (Node.js 18.18+)."],
      ["dev login", "Sign in with GitHub and store the token locally."],
      ["dev start <project-id> --project", "Fork the repo, clone it, and check out a new branch."],
      ["dev test", "Pull the latest changes and run the project's own tests."],
      ["dev submit <project-id> --project", "Commit your changes, push them, and open a pull request."],
    ],
  },
];

export function CliTabs() {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const set = SETS[active];

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (index + dir + SETS.length) % SETS.length;
    setActive(next);
    document.getElementById(`lp-tab-${SETS[next].id}`)?.focus();
  }

  async function copy(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(command);
      window.setTimeout(() => setCopied((c) => (c === command ? null : c)), 1400);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="lp-demo">
      <div className="lp-tabs" role="tablist" aria-label="Where to start">
        {SETS.map((s, i) => (
          <button
            key={s.id}
            id={`lp-tab-${s.id}`}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-controls="lp-panel"
            tabIndex={i === active ? 0 : -1}
            className="lp-tab"
            onClick={() => setActive(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <strong>{s.tab}</strong>
            <span>{s.hint}</span>
          </button>
        ))}
      </div>

      <div
        id="lp-panel"
        role="tabpanel"
        aria-labelledby={`lp-tab-${set.id}`}
        className="lp-panel"
      >
        <h3>{set.title}</h3>
        {set.rows.map(([command, description]) => (
          <div key={command}>
            <div className="lp-cmdrow">
              <code>{command}</code>
              <button
                type="button"
                className="lp-copy"
                aria-label={`Copy ${command}`}
                onClick={() => copy(command)}
              >
                {copied === command ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="lp-desc">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
