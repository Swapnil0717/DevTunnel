"use client";

import { useId, useState } from "react";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import type { OnboardingToolSetupGuide } from "@/lib/admin/opensource-tool-onboarding/types";

interface SetupGuideStepProps {
  value: OnboardingToolSetupGuide;
  onChange: (next: OnboardingToolSetupGuide) => void;
}

type SetupGuideTab = "write" | "preview";

/**
 * A short starting skeleton, not a value the Admin has to keep — clicking
 * "Use template" replaces whatever is currently in the textarea (a plain
 * insert would just as easily produce malformed Markdown by landing
 * mid-sentence in existing content). Headings only, no invented install
 * commands or version numbers for any specific tool — rule 58/59 ("never
 * invent data") applies to a template exactly as much as to fetched
 * fields; the Admin fills in every real instruction by hand.
 */
const TEMPLATE = `## Setup

1. Clone the repository
2. Install dependencies
3. Configure environment variables
4. Run the project locally

## Usage

Explain the core workflow a contributor should follow once the tool is running.

## Troubleshooting

List common setup issues and how to resolve them.
`;

/**
 * Step 4 of Open Source Tool Onboarding — "Setup & Usage".
 *
 * Everything before this step (Tool URL, Description, Labels) is either
 * fetched from the source or a short structured choice. This step is
 * different on purpose: a contributor landing on this tool in the
 * DevTunnel catalog needs to know how to actually get it running and use
 * it, and that isn't something a repository URL or README reliably
 * answers — some READMEs document the project, not the "install steps
 * for a first-time contributor" workflow DevTunnel wants to show. So the
 * Admin writes it directly, in Markdown, the same authoring format used
 * for a project's custom description (`DescriptionStep`) and rendered
 * everywhere with the same `MarkdownReadme` component READMEs use
 * elsewhere in this app — one renderer, one visual language, per
 * `MarkdownReadme`'s own doc comment.
 *
 * Write/Preview tabs (rather than a permanently-split pane) keep this
 * step visually consistent with the single-column layout every other
 * onboarding step in this wizard uses, while still letting the Admin
 * check the rendered result before moving on — the same reason
 * `DescriptionStep` shows the fetched README in a scrollable panel
 * instead of asking the Admin to trust raw text.
 */
export function SetupGuideStep({ value, onChange }: SetupGuideStepProps) {
  const textareaId = useId();
  const [tab, setTab] = useState<SetupGuideTab>("write");

  const content = value.content ?? "";
  const isEmpty = content.trim().length === 0;

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Setup &amp; usage</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        Write the instructions a contributor needs to set up and use this
        tool — install steps, configuration, and how to run it. This is
        shown on the tool&apos;s catalog page exactly as written here, not
        pulled from the README.
      </p>

      <div className="mb-3 inline-flex rounded-md border border-border bg-surface p-0.5">
        <button
          type="button"
          onClick={() => setTab("write")}
          aria-pressed={tab === "write"}
          className={`rounded-[5px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            tab === "write" ? "bg-text text-bg" : "text-text-muted hover:text-text"
          }`}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setTab("preview")}
          aria-pressed={tab === "preview"}
          className={`rounded-[5px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            tab === "preview" ? "bg-text text-bg" : "text-text-muted hover:text-text"
          }`}
        >
          Preview
        </button>

        <button
          type="button"
          onClick={() => onChange({ content: TEMPLATE })}
          className="ml-1 rounded-[5px] px-3 py-1.5 text-[12.5px] text-text-faint transition-colors hover:text-text-muted"
        >
          Use template
        </button>
      </div>

      {tab === "write" ? (
        <div>
          <label htmlFor={textareaId} className="sr-only">
            Setup &amp; usage instructions (Markdown)
          </label>
          <textarea
            id={textareaId}
            rows={16}
            value={content}
            onChange={(event) => onChange({ content: event.target.value })}
            placeholder={"## Setup\n\n1. Clone the repository\n2. Install dependencies\n...\n\n## Usage\n\nDescribe how to use the tool once it's running."}
            className="w-full resize-y rounded-md border border-border bg-surface px-3.5 py-3 font-mono text-[12.5px] leading-[1.6] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <p className="m-0 mt-2 text-[11.5px] text-text-faint">
            Markdown is supported — headings, code blocks, and numbered
            steps all render on the catalog page.
          </p>
        </div>
      ) : (
        <div className="min-h-[300px] rounded-md border border-border-subtle bg-surface-raised p-4">
          {isEmpty ? (
            <p className="m-0 text-[12.5px] text-text-faint">
              Nothing written yet — switch to the Write tab to add setup
              and usage instructions.
            </p>
          ) : (
            <MarkdownReadme content={content} />
          )}
        </div>
      )}
    </div>
  );
}
