"use client";

import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";
import { GitBranchIcon, ToolIcon, FolderIcon } from "@/components/layout/nav-icons";
import { getTechTagClasses } from "@/lib/home/tag-style";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import type { CreatedSubmission, SubmissionDraft } from "@/lib/submissions/types";

/**
 * Step 3 — "Preview and confirm".
 *
 * Renders the draft as it was read back from the server, not from the
 * wizard's local state: if a save silently failed on step 2, this is
 * where that has to become visible, and previewing local state would
 * show the contributor something the database doesn't have (rule 38).
 *
 * The preview is the real card, not a summary table — the card is what
 * everyone else will see, so it's what should be checked.
 *
 * Nothing is published until Confirm is pressed, and publishing is a
 * single backend call that re-validates every step in SQL before
 * inserting. `already_submitted` is surfaced as its own message with a
 * link to the list, because "someone beat you to it" is useful news, not
 * an error.
 */
export function PreviewConfirmStep({
  draft,
  isPublishing,
  publishError,
  duplicate,
  created,
  onPublish,
}: {
  draft: SubmissionDraft;
  isPublishing: boolean;
  publishError: string | null;
  /** True when the backend answered `already_submitted` — a different outcome from a failure. */
  duplicate: boolean;
  created: CreatedSubmission | null;
  onPublish: () => void;
}) {
  const source = draft.source;
  if (!source) {
    return (
      <p className="m-0 text-[13px] text-text-muted">
        This draft has no repository yet. Go back to the first step and fetch one.
      </p>
    );
  }

  const description =
    draft.details.descriptionSource === "CUSTOM" && draft.details.customDescription?.trim()
      ? draft.details.customDescription.trim()
      : source.fetchedDescription;

  const KindIcon = draft.kind === "TOOL" ? ToolIcon : FolderIcon;

  if (created) {
    return (
      <div>
        <h1 className="m-0 mb-1 text-[16px] font-medium text-text">
          {created.name} is on the community list
        </h1>
        <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
          It shows your name as the submitter, and it starts under New.
          Upvotes from other contributors are what move it into Trending
          and Popular.
        </p>

        <Link
          href="/submissions"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          See it on the list
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Preview and confirm</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        This is exactly how it will appear to everyone else, with your
        name on it. Nothing is published until you confirm.
      </p>

      <div className="rounded-[10px] border border-border bg-surface-raised p-4">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[13.5px] font-medium text-text">{source.name}</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-text-faint">
            <KindIcon className="h-3 w-3 shrink-0" />
            {draft.kind === "TOOL" ? "Tool" : "Project"}
          </span>
          {draft.details.isPaidAlternative && draft.details.alternativeTo.length > 0 ? (
            <span className="rounded-[5px] border border-tag-interest-border bg-tag-interest-bg px-[7px] py-[2px] text-[10.5px] text-tag-interest-text">
              Alternative to {draft.details.alternativeTo.join(", ")}
            </span>
          ) : null}
        </div>

        {description ? (
          <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-text-secondary">
            {description}
          </p>
        ) : (
          <p className="m-0 mt-1.5 text-[12.5px] text-text-faint">
            No description on the repository.
          </p>
        )}

        {draft.details.techStack.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {draft.details.techStack.map((tag) => (
              <span
                key={tag}
                className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10.5px] ${getTechTagClasses(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-text-faint">
          <span>Submitted by you</span>
          {source.repositoryFullName ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-mono">
                <GitBranchIcon className="h-3 w-3 shrink-0" />
                {source.repositoryFullName}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {source.readme ? (
        <details className="mt-4 rounded-[10px] border border-border-subtle bg-surface p-4">
          <summary className="cursor-pointer text-[12.5px] text-text-muted">
            README, as imported
          </summary>
          <div className="mt-3 max-h-[260px] overflow-y-auto">
            <MarkdownReadme content={source.readme} sourceUrl={source.url} />
          </div>
        </details>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onPublish}
          disabled={isPublishing || duplicate}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPublishing ? (
            <>
              <Spinner size={13} />
              Publishing…
            </>
          ) : (
            "Confirm and publish"
          )}
        </button>
      </div>

      {duplicate ? (
        <p className="m-0 mt-3 text-[12.5px] text-text-muted">
          This repository is already on the community list.{" "}
          <Link href="/submissions" className="text-accent hover:underline">
            Go and find it
          </Link>{" "}
          — an upvote helps it more than a second entry would.
        </p>
      ) : null}

      {publishError && !duplicate ? (
        <p role="alert" className="m-0 mt-3 text-[12.5px] text-status-error-label">
          {publishError}
        </p>
      ) : null}
    </div>
  );
}
