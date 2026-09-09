"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EditIcon } from "@/components/layout/nav-icons";
import { OptionCard } from "@/components/onboarding/option-card";
import { AdminTaskStatusBadge } from "./admin-task-status-badge";
import {
  AdminTasksApiError,
  updateAdminTask,
} from "@/lib/admin/tasks/client-api";
import type { AdminTaskDetail, AdminTaskStatus } from "@/lib/admin/tasks/types";
import {
  DEVELOPER_ROLE_LABEL,
  EXPERIENCE_LEVEL_LABEL,
  type DeveloperRole,
  type ExperienceLevel,
} from "@/lib/onboarding/types";

interface EditTaskDetailsPanelProps {
  task: AdminTaskDetail;
  /**
   * Opens straight into edit mode — used when the Admin arrives via the
   * Tasks table's "Edit" row action (`?edit=1`), same convention as
   * `EditProjectDetailsPanel`'s `startInEditMode`.
   */
  startInEditMode?: boolean;
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
const STATUSES: AdminTaskStatus[] = ["OPEN", "IN_PROGRESS", "DONE"];

const STATUS_LABEL: Record<AdminTaskStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

/**
 * Task Detail page (`/admin/tasks/:id`) — inline edit for exactly the
 * fields Task Onboarding itself hands the Admin curation control over:
 * Step 5 ("Difficulty" + target `role`), the custom description layered
 * on the GitHub issue (Step 3), plus the task's own DevTunnel `status`
 * (section 13's Status column). Backed by `PATCH /admin/tasks/:id`
 * (`updateAdminTask`).
 *
 * Deliberately excludes the project, the GitHub issue itself, and
 * contributor/submission counts — those stay exactly what GitHub/backend
 * report and are never hand-editable here, same restriction
 * `EditProjectDetailsPanel` applies to the repository fields ("Do not
 * modify the original GitHub issue", section 10).
 *
 * Read mode renders as a plain section matching the rest of the page.
 * Edit mode reuses the exact `OptionCard` role/difficulty controls Task
 * Onboarding's own `TaskDetailsStep` uses, so correcting a field after
 * creation looks and behaves identically to setting it during onboarding
 * — one set of controls for the same data, never a second form
 * re-implementing the same fields.
 */
export function EditTaskDetailsPanel({
  task,
  startInEditMode = false,
}: EditTaskDetailsPanelProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<DeveloperRole | null>(task.role);
  const [difficulty, setDifficulty] = useState<ExperienceLevel | null>(task.difficulty);
  const [status, setStatus] = useState<AdminTaskStatus>(task.status);
  const [useCustomDescription, setUseCustomDescription] = useState(
    Boolean(task.customDescription),
  );
  const [customDescription, setCustomDescription] = useState(task.customDescription ?? "");

  // Keep the form in sync if the panel is re-mounted with fresh server
  // data (e.g. `router.refresh()` after a save elsewhere on the page).
  useEffect(() => {
    setRole(task.role);
    setDifficulty(task.difficulty);
    setStatus(task.status);
    setUseCustomDescription(Boolean(task.customDescription));
    setCustomDescription(task.customDescription ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync on a real task id/data change
  }, [task.id, task.role, task.difficulty, task.status, task.customDescription]);

  function startEditing() {
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setRole(task.role);
    setDifficulty(task.difficulty);
    setStatus(task.status);
    setUseCustomDescription(Boolean(task.customDescription));
    setCustomDescription(task.customDescription ?? "");
    setError(null);
    setIsEditing(false);
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await updateAdminTask(task.id, {
        role: role ?? undefined,
        difficulty: difficulty ?? undefined,
        status,
        customDescription: useCustomDescription ? customDescription.trim() || null : null,
      });
      setIsEditing(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof AdminTasksApiError
          ? "Couldn't save these changes. Try again."
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const canSave = Boolean(role) && Boolean(difficulty);

  const descriptionText =
    useCustomDescription && customDescription.trim()
      ? customDescription
      : "Using the original GitHub issue description.";

  if (!isEditing) {
    return (
      <section
        aria-labelledby="task-curation-heading"
        className="mb-8 rounded-[10px] border border-border bg-surface p-5"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2
            id="task-curation-heading"
            className="m-0 text-[11px] uppercase tracking-wide text-text-faint"
          >
            Curation
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

        <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-[140px_1fr]">
          <dt className="text-text-muted">Role</dt>
          <dd className="m-0 text-text">{role ? DEVELOPER_ROLE_LABEL[role] : "Not set"}</dd>

          <dt className="text-text-muted">Difficulty</dt>
          <dd className="m-0 text-text">
            {difficulty ? EXPERIENCE_LEVEL_LABEL[difficulty] : "Not set"}
          </dd>

          <dt className="text-text-muted">Status</dt>
          <dd className="m-0">
            <AdminTaskStatusBadge status={status} />
          </dd>

          <dt className="text-text-muted">Description</dt>
          <dd className="m-0 text-text">{descriptionText}</dd>
        </dl>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="task-edit-heading"
      className="mb-8 rounded-[10px] border border-accent/50 bg-surface p-5"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <p className="m-0 mb-1 font-mono text-[10.5px] uppercase tracking-wide text-accent">
            Editing task curation
          </p>
          <h2 id="task-edit-heading" className="m-0 font-mono text-[15px] font-medium text-text">
            {task.title}
          </h2>
        </div>
        <span className="rounded-full border border-border-subtle px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-text-faint">
          GitHub issue locked
        </span>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <h3 className="m-0 mb-2 font-mono text-[12px] uppercase tracking-wide text-text-muted">
            Role
          </h3>
          <div role="radiogroup" aria-label="Role" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ROLES.map((option) => (
              <OptionCard
                key={option}
                label={DEVELOPER_ROLE_LABEL[option]}
                selected={role === option}
                onSelect={() => setRole(option)}
              />
            ))}
          </div>
        </div>

        <div>
          <h3 className="m-0 mb-2 font-mono text-[12px] uppercase tracking-wide text-text-muted">
            Difficulty
          </h3>
          <div role="radiogroup" aria-label="Difficulty" className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((option) => (
              <OptionCard
                key={option}
                label={EXPERIENCE_LEVEL_LABEL[option]}
                selected={difficulty === option}
                onSelect={() => setDifficulty(option)}
              />
            ))}
          </div>
        </div>

        <div>
          <h3 className="m-0 mb-2 font-mono text-[12px] uppercase tracking-wide text-text-muted">
            Status
          </h3>
          <div role="radiogroup" aria-label="Status" className="grid grid-cols-3 gap-2">
            {STATUSES.map((option) => (
              <OptionCard
                key={option}
                label={STATUS_LABEL[option]}
                selected={status === option}
                onSelect={() => setStatus(option)}
              />
            ))}
          </div>
        </div>

        <div>
          <h3 className="m-0 mb-1 font-mono text-[12px] uppercase tracking-wide text-text-muted">
            Description
          </h3>
          <p className="m-0 mb-3 text-[12.5px] leading-[1.6] text-text-dim">
            The GitHub issue is never modified — a custom description only adds
            DevTunnel-specific context alongside it.
          </p>

          <div role="radiogroup" aria-label="Description source" className="flex flex-col gap-2">
            <OptionCard
              label="Use existing GitHub issue information"
              selected={!useCustomDescription}
              onSelect={() => setUseCustomDescription(false)}
            />
            <OptionCard
              label="Use existing issue + custom description"
              selected={useCustomDescription}
              onSelect={() => setUseCustomDescription(true)}
            />
          </div>

          {useCustomDescription ? (
            <div className="mt-3">
              <label
                htmlFor="edit-task-custom-description"
                className="mb-1.5 block text-[11.5px] text-text-muted"
              >
                Custom DevTunnel description
              </label>
              <textarea
                id="edit-task-custom-description"
                rows={4}
                value={customDescription}
                onChange={(event) => setCustomDescription(event.target.value)}
                placeholder="Add DevTunnel-specific context for contributors…"
                className="w-full resize-y rounded-md border border-border bg-surface-raised px-3 py-2.5 text-[13px] leading-[1.5] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </div>
          ) : null}
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