"use client";

import Link from "next/link";
import { RepoLogo } from "@/components/admin/repo-logo";
import {
  EditIcon,
  GitBranchIcon,
  ToolIcon,
  FolderIcon,
} from "@/components/layout/nav-icons";
import { getTechTagClasses } from "@/lib/home/tag-style";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { useSubmissionUpvote } from "@/lib/submissions/use-submission-upvote";
import type { Submission } from "@/lib/submissions/types";

/**
 * One row of the Community list.
 *
 * Three things every card states plainly, because this list isn't
 * curated and shouldn't read as if it were:
 *  - who submitted it, with a link to their GitHub profile;
 *  - that the description is the submitter's or GitHub's, never
 *    DevTunnel's;
 *  - what it replaces, when it's a paid alternative — the claim is
 *    always attached to a named product, never a bare badge.
 *
 * Kind is a word next to its icon, not the icon alone (rule 43).
 *
 * The upvote button's behaviour lives in `useSubmissionUpvote`, shared
 * with the view page: it writes through to the API and renders the count
 * the server returns rather than incrementing locally (rule 38).
 *
 * The logo is the repository owner's GitHub avatar (`RepoLogo` — GitHub
 * has no per-repository logo, so it derives the real image from
 * `repositoryFullName` the same way the GitHub Projects cards do), with
 * its branch-icon placeholder when there's no repository or the avatar
 * fails to load — never a blank box.
 *
 * The name opens the submission's own view page (`/submissions/:slug`),
 * and the repository link in the footer still goes straight to GitHub.
 * "Edit" appears only on the viewer's own submissions
 * (`ownedByViewer`) and links to the edit page; the backend enforces
 * ownership independently, so this is a convenience, not the guard.
 */
export function SubmissionCard({ submission }: { submission: Submission }) {
  const { upvoted, count, isSaving, error, toggle: toggleUpvote } = useSubmissionUpvote(
    submission.slug,
    submission.upvotedByViewer,
    submission.upvoteCount,
  );

  const KindIcon = submission.kind === "TOOL" ? ToolIcon : FolderIcon;
  const viewHref = `/submissions/${submission.slug}`;

  return (
    <li className="flex gap-3 rounded-[10px] border border-border-subtle bg-surface-raised p-4 transition-colors hover:border-border">
      <div className="flex shrink-0 flex-col items-center gap-1">
        <button
          type="button"
          onClick={toggleUpvote}
          disabled={isSaving}
          aria-pressed={upvoted}
          aria-label={upvoted ? `Remove your upvote from ${submission.name}` : `Upvote ${submission.name}`}
          className={`flex h-8 w-9 items-center justify-center rounded-[7px] border text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            upvoted
              ? "border-accent/40 bg-surface-selected text-status-success-label"
              : "border-border-subtle bg-surface text-text-dim hover:text-text"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
          </svg>
        </button>
        <span className="text-[11px] tabular-nums text-text-faint">
          {count.toLocaleString()}
        </span>
      </div>

      <div className="shrink-0 pt-0.5">
        <RepoLogo repositoryFullName={submission.repositoryFullName ?? ""} size={40} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Link
            href={viewHref}
            className="text-[13.5px] font-medium text-text hover:text-accent"
          >
            {submission.name}
          </Link>
          <span className="inline-flex items-center gap-1 text-[11px] text-text-faint">
            <KindIcon className="h-3 w-3 shrink-0" />
            {submission.kind === "TOOL" ? "Tool" : "Project"}
          </span>
          {submission.isPaidAlternative ? (
            <span className="rounded-[5px] border border-tag-interest-border bg-tag-interest-bg px-[7px] py-[2px] text-[10.5px] text-tag-interest-text">
              Alternative to {submission.alternativeTo.join(", ")}
            </span>
          ) : null}

          <span className="ml-auto flex items-center gap-2 text-[11.5px]">
            <Link
              href={viewHref}
              className="rounded-[6px] border border-border-subtle px-2 py-1 text-text-dim transition-colors hover:border-border hover:text-text"
            >
              View
            </Link>
            {submission.ownedByViewer ? (
              <Link
                href={`${viewHref}/edit`}
                aria-label={`Edit ${submission.name}`}
                className="inline-flex items-center gap-1 rounded-[6px] border border-border-subtle px-2 py-1 text-text-dim transition-colors hover:border-border hover:text-text"
              >
                <EditIcon className="h-3 w-3 shrink-0" />
                Edit
              </Link>
            ) : null}
          </span>
        </div>

        {submission.description ? (
          <p className="m-0 mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-text-secondary">
            {submission.description}
          </p>
        ) : (
          <p className="m-0 mt-1.5 text-[12.5px] text-text-faint">
            No description on the repository.
          </p>
        )}

        {submission.techStack.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {submission.techStack.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10.5px] ${getTechTagClasses(tag)}`}
              >
                {tag}
              </span>
            ))}
            {submission.techStack.length > 5 ? (
              <span className="text-[10.5px] text-text-faint">
                +{submission.techStack.length - 5}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-text-faint">
          <span>
            Submitted by{" "}
            {submission.submittedBy.profileUrl ? (
              <a
                href={submission.submittedBy.profileUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-accent"
              >
                @{submission.submittedBy.username}
              </a>
            ) : (
              `@${submission.submittedBy.username}`
            )}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={submission.createdAt}>
            {formatRelativeTime(submission.createdAt)}
          </time>

          {submission.repositoryFullName ? (
            <>
              <span aria-hidden="true">·</span>
              <a
                href={submission.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 font-mono hover:text-accent"
              >
                <GitBranchIcon className="h-3 w-3 shrink-0" />
                {submission.repositoryFullName}
              </a>
            </>
          ) : null}
        </div>

        {error ? (
          <p className="m-0 mt-2 text-[11.5px] text-status-error-label">{error}</p>
        ) : null}
      </div>
    </li>
  );
}
