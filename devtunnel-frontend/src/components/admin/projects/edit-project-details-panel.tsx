"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EditIcon } from "@/components/layout/nav-icons";
import { OptionCard } from "@/components/onboarding/option-card";
import { TagInput } from "@/components/onboarding/tag-input";
import { TechIcon } from "@/components/onboarding/tech-icon";
import {
  AdminProjectsApiError,
  updateAdminProject,
} from "@/lib/admin/projects/client-api";
import type { AdminProjectDetail } from "@/lib/admin/projects/types";
import {
  EMPTY_TECH_STACK,
  type DescriptionChoice,
  type OnboardingDescription,
  type OnboardingTechStack,
} from "@/lib/admin/project-onboarding/types";

interface EditProjectDetailsPanelProps {
  project: AdminProjectDetail;
  /**
   * Opens straight into edit mode — used when the Admin arrives here via
   * the Projects table's "Edit" row action (`?edit=1`) instead of
   * "View", so the click actually lands on an editable form rather than
   * the read-only page with a second click required.
   */
  startInEditMode?: boolean;
}

type TechStackKey = keyof Omit<OnboardingTechStack, "packageManager">;

const TECH_FIELDS: { key: TechStackKey; label: string; placeholder: string }[] = [
  { key: "languages", label: "Language", placeholder: "e.g. TypeScript" },
  { key: "frontend", label: "Frontend", placeholder: "e.g. React" },
  { key: "backend", label: "Backend", placeholder: "e.g. Node.js" },
  { key: "frameworks", label: "Framework", placeholder: "e.g. Express" },
  { key: "databases", label: "Database", placeholder: "e.g. PostgreSQL" },
  { key: "libraries", label: "Libraries", placeholder: "e.g. Prisma" },
  { key: "buildTools", label: "Build tools", placeholder: "e.g. Vite" },
];

const DEFAULT_DESCRIPTION: OnboardingDescription = {
  choice: "EXISTING",
  customDescription: null,
};

function TechRow({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div>
      <dt className="text-[11.5px] text-text-muted">{label}</dt>
      <dd className="m-0 mt-1.5 flex flex-wrap gap-1.5">
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
 * Project Detail page (`/admin/projects/:id`) — inline edit for the two
 * fields Project Onboarding hands the Admin control over: Step 2
 * ("Project Description" — existing README/description vs. a custom
 * DevTunnel description layered on top) and Step 3 ("Project Tech
 * Stack" — languages, frontend, backend, frameworks, databases,
 * libraries, build tools, package manager). Backed by
 * `PATCH /admin/projects/:id` (`updateAdminProject`).
 *
 * Deliberately excludes Step 1 ("Import GitHub Repository") — the
 * repository, author, GitHub contributors, stars, forks and open issues
 * stay exactly what GitHub reports and are never hand-editable here, the
 * same restriction the onboarding wizard itself enforces
 * ("Admin should not manually enter Author, GitHub username, repository
 * name, contributors, language, stars, forks, issues — these should come
 * from GitHub"). Re-importing the repository is a separate action
 * (`POST /admin/projects/:id/sync`), not part of this panel.
 *
 * Read mode renders as two plain sections matching the rest of the page.
 * Edit mode reuses the exact controls Project Onboarding's own
 * `DescriptionStep` and `TechStackStep` use (`OptionCard`, `TagInput`,
 * `TechIcon`) so correcting a field after launch looks and behaves
 * identically to setting it during onboarding — one set of controls for
 * the same data, never a second form re-implementing the same fields.
 * Section labels switch from the sans body copy used elsewhere on this
 * page to the app's monospace face (already used for repository paths
 * and IDs) while editing — a deliberate, purely typographic signal that
 * these fields are live/editable right now, distinct from the
 * surrounding read-only prose, without introducing a font the rest of
 * the app doesn't already use.
 */
export function EditProjectDetailsPanel({
  project,
  startInEditMode = false,
}: EditProjectDetailsPanelProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState<OnboardingDescription>(
    project.description ?? DEFAULT_DESCRIPTION,
  );
  const [techStack, setTechStack] = useState<OnboardingTechStack>(
    project.techStack ?? EMPTY_TECH_STACK,
  );

  // Keep the form in sync if the panel is re-mounted with fresh server
  // data (e.g. `router.refresh()` after a save elsewhere on the page).
  useEffect(() => {
    setDescription(project.description ?? DEFAULT_DESCRIPTION);
    setTechStack(project.techStack ?? EMPTY_TECH_STACK);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync on a real project id/data change
  }, [project.id, project.description, project.techStack]);

  function startEditing() {
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setDescription(project.description ?? DEFAULT_DESCRIPTION);
    setTechStack(project.techStack ?? EMPTY_TECH_STACK);
    setError(null);
    setIsEditing(false);
  }

  function selectDescriptionChoice(choice: DescriptionChoice) {
    setDescription((current) => ({ ...current, choice }));
  }

  function setTechField(key: TechStackKey, next: string[]) {
    setTechStack((current) => ({ ...current, [key]: next }));
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await updateAdminProject(project.id, { description, techStack });
      setIsEditing(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof AdminProjectsApiError
          ? "Couldn't save these changes. Try again."
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const canSave =
    description.choice === "EXISTING" || Boolean(description.customDescription?.trim());

  const currentDescriptionText =
    description.choice === "CUSTOM" && description.customDescription
      ? description.customDescription
      : project.githubDescription ?? "No description set.";

  const hasTechStack = TECH_FIELDS.some((field) => techStack[field.key].length > 0);

  if (!isEditing) {
    return (
      <>
        <section
          aria-labelledby="project-description-heading"
          className="mb-8 rounded-[10px] border border-border bg-surface p-5"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2
              id="project-description-heading"
              className="m-0 text-[11px] uppercase tracking-wide text-text-faint"
            >
              Description
            </h2>
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-text-muted transition-colors hover:border-border hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <EditIcon className="h-3 w-3 shrink-0" />
              Edit
            </button>
          </div>
          <p className="m-0 text-[13px] leading-[1.6] text-text">{currentDescriptionText}</p>
        </section>

        <section
          aria-labelledby="project-techstack-heading"
          className="mb-8 rounded-[10px] border border-border bg-surface p-5"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2
              id="project-techstack-heading"
              className="m-0 text-[11px] uppercase tracking-wide text-text-faint"
            >
              Tech stack
            </h2>
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-text-muted transition-colors hover:border-border hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <EditIcon className="h-3 w-3 shrink-0" />
              Edit
            </button>
          </div>
          {hasTechStack || techStack.packageManager ? (
            <dl className="m-0 flex flex-col gap-3">
              {TECH_FIELDS.map((field) => (
                <TechRow key={field.key} label={field.label} values={techStack[field.key]} />
              ))}
              {techStack.packageManager ? (
                <div>
                  <dt className="text-[11.5px] text-text-muted">Package manager</dt>
                  <dd className="m-0 mt-1 font-mono text-[12.5px] text-text">
                    {techStack.packageManager}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="m-0 text-[12px] text-text-faint">No tech stack recorded yet.</p>
          )}
        </section>
      </>
    );
  }

  return (
    <section
      aria-labelledby="project-edit-heading"
      className="mb-8 rounded-[10px] border border-accent/50 bg-surface p-5"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <p className="m-0 mb-1 font-mono text-[10.5px] uppercase tracking-wide text-accent">
            Editing project details
          </p>
          <h2 id="project-edit-heading" className="m-0 font-mono text-[15px] font-medium text-text">
            {project.name}
          </h2>
        </div>
        <span className="rounded-full border border-border-subtle px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-text-faint">
          Repository fields locked
        </span>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <h3 className="m-0 mb-1 font-mono text-[12px] uppercase tracking-wide text-text-muted">
            Description
          </h3>
          <p className="m-0 mb-3 text-[12.5px] leading-[1.6] text-text-dim">
            The GitHub README is never modified — a custom description only adds
            DevTunnel-specific context alongside it.
          </p>

          <div role="radiogroup" aria-label="Description source" className="flex flex-col gap-2">
            <OptionCard
              label="Use existing README and description"
              description="DevTunnel shows the GitHub description and README exactly as imported."
              selected={description.choice === "EXISTING"}
              onSelect={() => selectDescriptionChoice("EXISTING")}
            />
            <OptionCard
              label="Use existing README and custom description"
              description="Keep the README, but show a DevTunnel-specific description alongside it."
              selected={description.choice === "CUSTOM"}
              onSelect={() => selectDescriptionChoice("CUSTOM")}
            />
          </div>

          {description.choice === "CUSTOM" ? (
            <div className="mt-3">
              <label
                htmlFor="edit-custom-description"
                className="mb-1.5 block text-[11.5px] text-text-muted"
              >
                Custom DevTunnel description
              </label>
              <textarea
                id="edit-custom-description"
                rows={4}
                value={description.customDescription ?? ""}
                onChange={(event) =>
                  setDescription((current) => ({
                    ...current,
                    customDescription: event.target.value,
                  }))
                }
                placeholder="Describe this project for DevTunnel contributors…"
                className="w-full resize-y rounded-md border border-border bg-surface-raised px-3 py-2.5 text-[13px] leading-[1.5] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </div>
          ) : null}
        </div>

        <div>
          <h3 className="m-0 mb-1 font-mono text-[12px] uppercase tracking-wide text-text-muted">
            Tech stack
          </h3>
          <p className="m-0 mb-3 text-[12.5px] leading-[1.6] text-text-dim">
            Originally detected from the repository. Correct anything that looks wrong.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TECH_FIELDS.map((field) => (
              <TagInput
                key={field.key}
                label={field.label}
                variant="tech"
                values={techStack[field.key]}
                onChange={(next) => setTechField(field.key, next)}
                placeholder={field.placeholder}
                renderIcon={(tech) => <TechIcon name={tech} />}
              />
            ))}
          </div>

          <div className="mt-4">
            <label
              htmlFor="edit-package-manager"
              className="mb-1.5 block text-[11.5px] text-text-muted"
            >
              Package manager
            </label>
            <input
              id="edit-package-manager"
              type="text"
              value={techStack.packageManager ?? ""}
              onChange={(event) =>
                setTechStack((current) => ({
                  ...current,
                  packageManager: event.target.value || null,
                }))
              }
              placeholder="e.g. npm, pnpm, pip, cargo"
              className="w-full max-w-[280px] rounded-md border border-border bg-surface-raised px-3 py-2 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="m-0 mt-5 text-[12.5px] text-status-error-label">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center gap-2 border-t border-border-subtle pt-5">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className="rounded-md bg-text px-4 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={cancelEditing}
          disabled={isSaving}
          className="rounded-md border border-border bg-surface px-4 py-2 text-[13px] font-medium text-text-muted transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}