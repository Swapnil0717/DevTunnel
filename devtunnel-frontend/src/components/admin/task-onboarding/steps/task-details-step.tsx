"use client";

import { useEffect, useId, useState } from "react";
import { OptionCard } from "@/components/onboarding/option-card";
import { TechIcon } from "@/components/onboarding/tech-icon";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import { fetchProjectTechStack } from "@/lib/admin/task-onboarding/api";
import {
  DEVELOPER_ROLE_LABEL,
  EXPERIENCE_LEVEL_LABEL,
  type DeveloperRole,
  type ExperienceLevel,
} from "@/lib/onboarding/types";
import { InlineLoading } from "@/components/ui/spinner";
import type { OnboardingTechStack } from "@/lib/admin/project-onboarding/types";
import type {
  IssueInformationChoice,
  TaskCuration,
  TaskIssueInformation,
  TaskOnboardingDraft,
} from "@/lib/admin/task-onboarding/types";

interface TaskDetailsStepProps {
  draft: TaskOnboardingDraft;
  issueInformation: TaskIssueInformation;
  onIssueInformationChange: (next: TaskIssueInformation) => void;
  curation: TaskCuration;
  onCurationChange: (next: TaskCuration) => void;
  onTechStackLoaded: (techStack: OnboardingTechStack) => void;
}

const ROLES: DeveloperRole[] = [
  "FRONTEND",
  "BACKEND",
  "FULL_STACK",
  "DOCUMENTATION",
  "TESTING",
  "DEVOPS",
];

const DIFFICULTIES: ExperienceLevel[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

function TechRow({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd className="m-0 mt-1.5 flex flex-wrap gap-1.5 text-text">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1.5 rounded-md border border-tag-tech-border bg-tag-tech-bg px-2 py-0.5 text-[11.5px] text-tag-tech-text"
          >
            <TechIcon name={value} />
            {value}
          </span>
        ))}
      </dd>
    </div>
  );
}

export function TaskDetailsStep({
  draft,
  issueInformation,
  onIssueInformationChange,
  curation,
  onCurationChange,
  onTechStackLoaded,
}: TaskDetailsStepProps) {
  const textareaId = useId();
  const [techStack, setTechStack] = useState<OnboardingTechStack | null>(draft.techStack);
  const [isLoadingTechStack, setIsLoadingTechStack] = useState(false);
  const [techStackError, setTechStackError] = useState(false);

  useEffect(() => {
    if (draft.techStack || !draft.project) return;
    setIsLoadingTechStack(true);
    fetchProjectTechStack(draft.project.id)
      .then((next) => {
        setTechStack(next);
        onTechStackLoaded(next);
      })
      .catch(() => setTechStackError(true))
      .finally(() => setIsLoadingTechStack(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the draft/project id changes
  }, [draft.project?.id, draft.techStack]);

  function selectChoice(choice: IssueInformationChoice) {
    onIssueInformationChange({ ...issueInformation, choice });
  }

  function toggleRole(role: DeveloperRole) {
    const next = curation.roles.includes(role)
      ? curation.roles.filter((value) => value !== role)
      : [...curation.roles, role];
    onCurationChange({ ...curation, roles: next });
  }

  if (!draft.issue) {
    return (
      <p className="m-0 text-[12.5px] text-status-error-label">
        No issue has been selected yet — go back to Step 2.
      </p>
    );
  }

  const issue = draft.issue;

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Task details</h1>
      <p className="m-0 mb-6 max-w-[560px] text-[13px] leading-[1.6] text-text-muted">
        Curate how this task shows up for contributors. The original
        GitHub issue and repository tech stack below are fetched
        automatically and are never modified.
      </p>

      <section className="mb-6">
        <p className="m-0 mb-2 text-[11px] uppercase tracking-wide text-text-faint">Role</p>
        <p className="m-0 mb-2 text-[11.5px] text-text-dim">
          Select every role this task is relevant to — a task can be both
          Frontend and Docs, for example.
        </p>
        <div role="group" aria-label="Role" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ROLES.map((role) => (
            <OptionCard
              key={role}
              multiple
              label={DEVELOPER_ROLE_LABEL[role]}
              selected={curation.roles.includes(role)}
              onSelect={() => toggleRole(role)}
            />
          ))}
        </div>
      </section>

      <section className="mb-6">
        <p className="m-0 mb-2 text-[11px] uppercase tracking-wide text-text-faint">
          Difficulty
        </p>
        <div role="radiogroup" aria-label="Difficulty" className="grid grid-cols-3 gap-2">
          {DIFFICULTIES.map((difficulty) => (
            <OptionCard
              key={difficulty}
              label={EXPERIENCE_LEVEL_LABEL[difficulty]}
              selected={curation.difficulty === difficulty}
              onSelect={() => onCurationChange({ ...curation, difficulty })}
            />
          ))}
        </div>
      </section>

      <section className="mb-6">
        <p className="m-0 mb-2 text-[11px] uppercase tracking-wide text-text-faint">
          Description
        </p>
        <div role="radiogroup" aria-label="Description source" className="flex flex-col gap-2.5">
          <OptionCard
            label="Use existing issue information"
            description="DevTunnel shows the GitHub issue description exactly as written."
            selected={issueInformation.choice === "EXISTING"}
            onSelect={() => selectChoice("EXISTING")}
          />
          <OptionCard
            label="Use existing issue information + custom description"
            description="Keep the GitHub issue, but add DevTunnel-specific context alongside it."
            selected={issueInformation.choice === "CUSTOM"}
            onSelect={() => selectChoice("CUSTOM")}
          />
        </div>

        {issueInformation.choice === "CUSTOM" ? (
          <div className="mt-3">
            <label htmlFor={textareaId} className="mb-1.5 block text-[11.5px] text-text-muted">
              Custom description
            </label>
            <textarea
              id={textareaId}
              rows={4}
              value={issueInformation.customDescription ?? ""}
              onChange={(event) =>
                onIssueInformationChange({
                  ...issueInformation,
                  customDescription: event.target.value,
                })
              }
              placeholder="Add DevTunnel-specific context for contributors…"
              className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2.5 text-[13px] leading-[1.5] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </div>
        ) : null}
      </section>

      <section className="mb-6 rounded-[10px] border border-border bg-surface p-5">
        <p className="m-0 mb-1 text-[11px] uppercase tracking-wide text-text-faint">
          Original GitHub issue
        </p>
        <p className="m-0 mb-3 flex items-center gap-2 text-[13px] text-text">
          <span className="font-mono text-text-muted">#{issue.number}</span>
          {issue.title}
        </p>

        <dl className="m-0 mb-4 grid grid-cols-1 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2">
          <div>
            <dt className="text-text-muted">Created by</dt>
            <dd className="m-0 flex items-center gap-2 text-text">
              {issue.author.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- external GitHub avatar
                <img
                  src={issue.author.avatarUrl}
                  alt=""
                  width={18}
                  height={18}
                  className="rounded-full"
                />
              ) : null}
              @{issue.author.username}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Created / updated</dt>
            <dd className="m-0 text-text">
              <time dateTime={issue.createdAt}>{formatDate(issue.createdAt)}</time> ·{" "}
              <time dateTime={issue.updatedAt}>{formatDate(issue.updatedAt)}</time>
            </dd>
          </div>
        </dl>

        <p className="m-0 mb-1 text-[11px] uppercase tracking-wide text-text-faint">
          Issue description
        </p>
        <div className="max-h-[200px] overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-3">
          {issue.body ? (
            <MarkdownReadme content={issue.body} />
          ) : (
            <p className="m-0 text-[12px] text-text-faint">No description provided on GitHub.</p>
          )}
        </div>
      </section>

      <section className="rounded-[10px] border border-border bg-surface p-5">
        <p className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint">
          Repository tech stack
        </p>
        {isLoadingTechStack ? (
          <InlineLoading label="Loading tech stack…" />
        ) : techStackError ? (
          <p className="m-0 text-[12.5px] text-status-error-label">
            Couldn&apos;t load the project&apos;s tech stack.
          </p>
        ) : techStack ? (
          <dl className="m-0 flex flex-col gap-3 text-[12.5px]">
            <TechRow label="Languages" values={techStack.languages} />
            <TechRow label="Frontend" values={techStack.frontend} />
            <TechRow label="Backend" values={techStack.backend} />
            <TechRow label="Frameworks" values={techStack.frameworks} />
            <TechRow label="Databases" values={techStack.databases} />
            <TechRow label="Libraries" values={techStack.libraries} />
            <TechRow label="Build tools" values={techStack.buildTools} />
          </dl>
        ) : (
          <p className="m-0 text-[12px] text-text-faint">
            This project doesn&apos;t have a recorded tech stack yet.
          </p>
        )}
      </section>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}