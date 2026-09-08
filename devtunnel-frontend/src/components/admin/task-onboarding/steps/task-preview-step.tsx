import { TechIcon } from "@/components/onboarding/tech-icon";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import { DEVELOPER_ROLE_LABEL, EXPERIENCE_LEVEL_LABEL } from "@/lib/onboarding/types";
import type { TaskOnboardingDraft } from "@/lib/admin/task-onboarding/types";

interface TaskPreviewStepProps {
  draft: TaskOnboardingDraft;
}

/**
 * Step 6 of Task Onboarding — "Issue Preview" (admin_workflow.txt, "Step
 * 6 — Issue Preview": "Display: TASK PREVIEW — Project, Issue #, Title,
 * Description, Custom Information, Tech Stack, Difficulty, GitHub Issue,
 * Requirements").
 *
 * Read-only, same convention as Project Onboarding's `PreviewStep` —
 * editing happens by going Back to the relevant step, not inline here.
 * Renders straight from the draft fetched via `GET .../preview`
 * (`fetchTaskOnboardingPreview`), never from stale local state.
 */
export function TaskPreviewStep({ draft }: TaskPreviewStepProps) {
  const { project, issue, issueInformation, curation, techStack } = draft;

  if (!project || !issue) {
    return (
      <p className="m-0 text-[12.5px] text-status-error-label">
        This draft is missing a project or issue — go back and complete
        the earlier steps.
      </p>
    );
  }

  const descriptionText =
    issueInformation?.choice === "CUSTOM" && issueInformation.customDescription
      ? issueInformation.customDescription
      : null;

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Task preview</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        This is exactly what will become the DevTunnel task. Go back to
        any step to make changes before continuing.
      </p>

      <div className="flex flex-col gap-5">
        <section className="rounded-[10px] border border-border bg-surface p-5">
          <p className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint">Task</p>
          <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-[140px_1fr]">
            <dt className="text-text-muted">Project</dt>
            <dd className="m-0 text-text">{project.name}</dd>

            <dt className="text-text-muted">Issue</dt>
            <dd className="m-0 font-mono text-text">
              #{issue.number} — {issue.title}
            </dd>

            <dt className="text-text-muted">Role</dt>
            <dd className="m-0 text-text">
              {curation?.role ? DEVELOPER_ROLE_LABEL[curation.role] : "Not set"}
            </dd>

            <dt className="text-text-muted">Difficulty</dt>
            <dd className="m-0 text-text">
              {curation?.difficulty ? EXPERIENCE_LEVEL_LABEL[curation.difficulty] : "Not set"}
            </dd>
          </dl>
        </section>

        <section className="rounded-[10px] border border-border bg-surface p-5">
          <p className="m-0 mb-2 text-[11px] uppercase tracking-wide text-text-faint">
            Description
          </p>
          {descriptionText ? (
            <p className="m-0 mb-4 text-[13px] leading-[1.6] text-text">{descriptionText}</p>
          ) : (
            <p className="m-0 mb-4 text-[12px] text-text-faint">
              Using the original GitHub issue description below.
            </p>
          )}

          <p className="m-0 mb-1 text-[11px] uppercase tracking-wide text-text-faint">
            GitHub issue
          </p>
          <div className="max-h-[180px] overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-3">
            {issue.body ? (
              <MarkdownReadme content={issue.body} />
            ) : (
              <p className="m-0 text-[12px] text-text-faint">No description provided.</p>
            )}
          </div>
        </section>

        <section className="rounded-[10px] border border-border bg-surface p-5">
          <p className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint">
            Tech stack
          </p>
          {techStack ? (
            <div className="flex flex-wrap gap-1.5">
              {[
                ...techStack.languages,
                ...techStack.frontend,
                ...techStack.backend,
                ...techStack.frameworks,
                ...techStack.databases,
                ...techStack.libraries,
                ...techStack.buildTools,
              ].map((value) => (
                <span
                  key={value}
                  className="inline-flex items-center gap-1.5 rounded-md border border-tag-tech-border bg-tag-tech-bg px-2 py-0.5 text-[11.5px] text-tag-tech-text"
                >
                  <TechIcon name={value} />
                  {value}
                </span>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[12px] text-text-faint">No tech stack recorded.</p>
          )}
        </section>
      </div>
    </div>
  );
}