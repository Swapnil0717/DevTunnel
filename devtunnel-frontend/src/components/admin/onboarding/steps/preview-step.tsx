import { TechIcon } from "@/components/onboarding/tech-icon";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import type { ProjectOnboardingDraft } from "@/lib/admin/project-onboarding/types";

interface PreviewStepProps {
  draft: ProjectOnboardingDraft;
}

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

/**
 * Step 4 of Project Onboarding — "Project Preview" (admin_workflow.txt,
 * "Step 4 — Project Preview": "Show exactly what will become the
 * DevTunnel project.").
 *
 * Read-only by design — editing happens by going Back to the relevant
 * step, not inline here, so there is exactly one place each field is
 * ever written from. Renders straight from the draft fetched via
 * `GET .../preview` (`ProjectOnboardingWizard`'s `loadPreview`), never
 * from stale local state, so what the Admin approves here is guaranteed
 * to match what the backend actually has stored (Frontend_Development_Rules.txt
 * rule 47 — don't fake freshness).
 */
export function PreviewStep({ draft }: PreviewStepProps) {
  const { repository, description, techStack } = draft;

  if (!repository) {
    return (
      <p className="m-0 text-[12.5px] text-status-error-label">
        No repository has been imported yet — go back to Step 1.
      </p>
    );
  }

  const descriptionText =
    description?.choice === "CUSTOM" && description.customDescription
      ? description.customDescription
      : repository.githubDescription ?? "No description set.";

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Project preview</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        This is exactly what will become the DevTunnel project. Go back to
        any step to make changes before continuing.
      </p>

      <div className="flex flex-col gap-5">
        <section className="rounded-[10px] border border-border bg-surface p-5">
          <p className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint">
            Project
          </p>
          <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-[140px_1fr]">
            <dt className="text-text-muted">Project name</dt>
            <dd className="m-0 text-text">{repository.name}</dd>

            <dt className="text-text-muted">GitHub repository</dt>
            <dd className="m-0 font-mono text-text">{repository.fullName}</dd>

            <dt className="text-text-muted">Author</dt>
            <dd className="m-0 text-text">@{repository.author.username}</dd>

            <dt className="text-text-muted">GitHub contributors</dt>
            <dd className="m-0 text-text">{repository.contributors.length}</dd>

            <dt className="text-text-muted">Default branch</dt>
            <dd className="m-0 font-mono text-text">{repository.defaultBranch}</dd>
          </dl>
        </section>

        <section className="rounded-[10px] border border-border bg-surface p-5">
          <p className="m-0 mb-2 text-[11px] uppercase tracking-wide text-text-faint">
            Description
          </p>
          <p className="m-0 mb-4 text-[13px] leading-[1.6] text-text">{descriptionText}</p>

          <p className="m-0 mb-1 text-[11px] uppercase tracking-wide text-text-faint">README</p>
          <div className="max-h-[180px] overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-3">
            {repository.readme ? (
              <MarkdownReadme content={repository.readme} />
            ) : (
              <p className="m-0 text-[12px] text-text-faint">No README found.</p>
            )}
          </div>
        </section>

        <section className="rounded-[10px] border border-border bg-surface p-5">
          <p className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint">
            Tech stack
          </p>
          {techStack ? (
            <dl className="m-0 flex flex-col gap-3 text-[12.5px]">
              <TechRow label="Languages" values={techStack.languages} />
              <TechRow label="Frontend" values={techStack.frontend} />
              <TechRow label="Backend" values={techStack.backend} />
              <TechRow label="Frameworks" values={techStack.frameworks} />
              <TechRow label="Databases" values={techStack.databases} />
              <TechRow label="Libraries" values={techStack.libraries} />
              <TechRow label="Build tools" values={techStack.buildTools} />
              {techStack.packageManager ? (
                <div>
                  <dt className="text-text-muted">Package manager</dt>
                  <dd className="m-0 mt-1 font-mono text-text">{techStack.packageManager}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="m-0 text-[12px] text-text-faint">No tech stack recorded yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}