"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EditIcon } from "@/components/layout/nav-icons";
import { OptionCard } from "@/components/onboarding/option-card";
import { TagInput } from "@/components/onboarding/tag-input";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import {
  AdminOpenSourceToolsApiError,
  refreshAdminOpenSourceToolReadme,
  updateAdminOpenSourceTool,
} from "@/lib/admin/opensource-tools/client-api";
import type { AdminToolDetail } from "@/lib/admin/opensource-tools/types";
import type { ToolDescriptionChoice } from "@/lib/admin/opensource-tool-onboarding/types";

interface EditOpenSourceToolDetailsPanelProps {
  tool: AdminToolDetail;
  /**
   * Opens straight into edit mode — used when the Admin arrives here via
   * the grid card's "Edit" action (`?edit=1`), same convention
   * `EditProjectDetailsPanel` uses for the Projects table's "Edit" row
   * action.
   */
  startInEditMode?: boolean;
}

/**
 * Tool Detail page (`/admin/opensource-tools/:id`) — inline edit for
 * exactly the fields Steps 2–4 of Open Source Tool Onboarding hand the
 * Admin: Description (existing fetched description vs. a custom one
 * layered on top), Labels (free-form role/field tags), and the Setup &
 * Usage guide. Backed by `PATCH /admin/opensource-tools/:id`
 * (`updateAdminOpenSourceTool`).
 *
 * Deliberately excludes Step 1 ("Tool URL") — the source URL, fetched
 * description and primary language stay exactly what the backend
 * resolved from the tool's URL and are never hand-editable here, the
 * same restriction `EditProjectDetailsPanel` enforces for GitHub-derived
 * project fields ("Repository fields locked"). The README is likewise
 * read-only for the same reason.
 *
 * Read mode renders as plain sections matching the rest of the page.
 * Edit mode reuses the exact controls the onboarding wizard's own
 * Description and Labels steps use (`OptionCard`, `TagInput`) so
 * correcting a field after publishing looks and behaves identically to
 * setting it during onboarding.
 */
export function EditOpenSourceToolDetailsPanel({
  tool,
  startInEditMode = false,
}: EditOpenSourceToolDetailsPanelProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshingReadme, setIsRefreshingReadme] = useState(false);
  const [refreshReadmeError, setRefreshReadmeError] = useState<string | null>(null);

  const [descriptionChoice, setDescriptionChoice] = useState<ToolDescriptionChoice>(
    tool.descriptionChoice,
  );
  const [customDescription, setCustomDescription] = useState(tool.customDescription ?? "");
  const [labels, setLabels] = useState<string[]>(tool.labels);
  const [setupGuide, setSetupGuide] = useState(tool.setupGuide);

  // Keep the form in sync if the panel is re-mounted with fresh server
  // data (e.g. `router.refresh()` after a save elsewhere on the page).
  useEffect(() => {
    setDescriptionChoice(tool.descriptionChoice);
    setCustomDescription(tool.customDescription ?? "");
    setLabels(tool.labels);
    setSetupGuide(tool.setupGuide);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync on a real tool id/data change
  }, [tool.id, tool.descriptionChoice, tool.customDescription, tool.labels, tool.setupGuide]);

  function startEditing() {
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setDescriptionChoice(tool.descriptionChoice);
    setCustomDescription(tool.customDescription ?? "");
    setLabels(tool.labels);
    setSetupGuide(tool.setupGuide);
    setError(null);
    setIsEditing(false);
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await updateAdminOpenSourceTool(tool.id, {
        descriptionChoice,
        customDescription: descriptionChoice === "CUSTOM" ? customDescription : null,
        labels,
        setupGuide,
      });
      setIsEditing(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof AdminOpenSourceToolsApiError
          ? "Couldn't save these changes. Try again."
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRefreshReadme() {
    setIsRefreshingReadme(true);
    setRefreshReadmeError(null);
    try {
      await refreshAdminOpenSourceToolReadme(tool.id);
      router.refresh();
    } catch (err) {
      setRefreshReadmeError(
        err instanceof AdminOpenSourceToolsApiError
          ? "Couldn't fetch the latest README. Try again."
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setIsRefreshingReadme(false);
    }
  }

  const canSave = descriptionChoice === "EXISTING" || Boolean(customDescription.trim());

  const currentDescriptionText =
    descriptionChoice === "CUSTOM" && customDescription
      ? customDescription
      : tool.fetchedDescription ?? "No description found.";

  if (!isEditing) {
    return (
      <>
        <section
          aria-labelledby="tool-description-heading"
          className="mb-8 rounded-[10px] border border-border bg-surface p-5"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2
              id="tool-description-heading"
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
          aria-labelledby="tool-labels-heading"
          className="mb-8 rounded-[10px] border border-border bg-surface p-5"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2
              id="tool-labels-heading"
              className="m-0 text-[11px] uppercase tracking-wide text-text-faint"
            >
              Labels
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
          {labels.length ? (
            <div className="flex flex-wrap gap-1.5">
              {labels.map((value) => (
                <span
                  key={value}
                  className="inline-flex items-center rounded-md border border-tag-skill-border bg-tag-skill-bg px-2 py-0.5 text-[11.5px] text-tag-skill-text"
                >
                  {value}
                </span>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[12px] text-text-faint">No labels recorded yet.</p>
          )}
        </section>

        <section
          aria-labelledby="tool-setup-heading"
          className="mb-8 rounded-[10px] border border-border bg-surface p-5"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2
              id="tool-setup-heading"
              className="m-0 text-[11px] uppercase tracking-wide text-text-faint"
            >
              Setup &amp; usage
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
          {setupGuide.trim() ? (
            <MarkdownReadme content={setupGuide} />
          ) : (
            <p className="m-0 text-[12px] text-text-faint">No setup guide written yet.</p>
          )}
        </section>
      </>
    );
  }

  return (
    <section
      aria-labelledby="tool-edit-heading"
      className="mb-8 rounded-[10px] border border-accent/50 bg-surface p-5"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <p className="m-0 mb-1 font-mono text-[10.5px] uppercase tracking-wide text-accent">
            Editing tool details
          </p>
          <h2 id="tool-edit-heading" className="m-0 font-mono text-[15px] font-medium text-text">
            {tool.name}
          </h2>
        </div>
        <span className="rounded-full border border-border-subtle px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-text-faint">
          Source fields locked
        </span>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <h3 className="m-0 mb-1 font-mono text-[12px] uppercase tracking-wide text-text-muted">
            Description
          </h3>
          <p className="m-0 mb-3 text-[12.5px] leading-[1.6] text-text-dim">
            The fetched description is never modified — a custom description only adds
            DevTunnel-specific context alongside it.
          </p>

          <div role="radiogroup" aria-label="Description source" className="flex flex-col gap-2">
            <OptionCard
              label="Use fetched description"
              description="DevTunnel shows the description exactly as imported from the tool's URL."
              selected={descriptionChoice === "EXISTING"}
              onSelect={() => setDescriptionChoice("EXISTING")}
            />
            <OptionCard
              label="Use fetched description and custom description"
              description="Keep the fetched description, but show a DevTunnel-specific description alongside it."
              selected={descriptionChoice === "CUSTOM"}
              onSelect={() => setDescriptionChoice("CUSTOM")}
            />
          </div>

          <div className="mt-3 flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleRefreshReadme}
              disabled={isRefreshingReadme}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isRefreshingReadme ? "Fetching…" : "Fetch latest README from source"}
            </button>
            {refreshReadmeError ? (
              <span role="alert" className="text-[11.5px] text-status-error-label">
                {refreshReadmeError}
              </span>
            ) : null}
          </div>

          {descriptionChoice === "CUSTOM" ? (
            <div className="mt-3">
              <label
                htmlFor="edit-tool-custom-description"
                className="mb-1.5 block text-[11.5px] text-text-muted"
              >
                Custom DevTunnel description
              </label>
              <textarea
                id="edit-tool-custom-description"
                rows={4}
                value={customDescription}
                onChange={(event) => setCustomDescription(event.target.value)}
                placeholder="Describe this tool for DevTunnel contributors…"
                className="w-full resize-y rounded-md border border-border bg-surface-raised px-3 py-2.5 text-[13px] leading-[1.5] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </div>
          ) : null}
        </div>

        <div>
          <h3 className="m-0 mb-1 font-mono text-[12px] uppercase tracking-wide text-text-muted">
            Labels
          </h3>
          <p className="m-0 mb-3 text-[12.5px] leading-[1.6] text-text-dim">
            Roles or fields this tool is relevant to — used as filters on the Open Source Tools
            grid.
          </p>
          <TagInput
            label="Labels"
            variant="skill"
            values={labels}
            onChange={setLabels}
            placeholder="e.g. Backend developer, DevOps"
          />
        </div>

        <div>
          <h3 className="m-0 mb-1 font-mono text-[12px] uppercase tracking-wide text-text-muted">
            Setup &amp; usage
          </h3>
          <p className="m-0 mb-3 text-[12.5px] leading-[1.6] text-text-dim">
            Markdown describing how a contributor installs, configures and runs this tool.
          </p>
          <textarea
            id="edit-tool-setup-guide"
            rows={8}
            value={setupGuide}
            onChange={(event) => setSetupGuide(event.target.value)}
            placeholder="## Installation&#10;&#10;..."
            className="w-full resize-y rounded-md border border-border bg-surface-raised px-3 py-2.5 font-mono text-[12.5px] leading-[1.5] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
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