import Image from "next/image";
import { CopyButton } from "@/components/github-projects/copy-button";
import { formatCompactNumber } from "@/lib/github-projects/format-compact-number";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { getTechTagClasses } from "@/lib/home/tag-style";
import type { GithubProjectDetail } from "@/lib/github-projects/types";

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function StarIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.75l2.46 5.06 5.54.62-4.06 3.9.98 5.52L12 16.1l-4.92 2.75.98-5.52-4.06-3.9 5.54-.62Z" />
    </svg>
  );
}

function GitBranchIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M6 8.2V15.8" />
      <path d="M18 8.2V11a5 5 0 0 1-5 5H8.5" />
    </svg>
  );
}

function IssueIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="12" r="2.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

function UsersIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19v-1.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V19" />
      <path d="M16 8.2a2.8 2.8 0 0 1 0 5.4" />
      <path d="M15 13.3c1.9.4 3.3 1.9 3.3 3.7v1" />
    </svg>
  );
}

function ScaleIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5v17" />
      <path d="M7 6.5h10" />
      <path d="M7 6.5 4 12.5a3 3 0 0 0 6 0L7 6.5Z" />
      <path d="M17 6.5l-3 6a3 3 0 0 0 6 0l-3-6Z" />
      <path d="M9 20.5h6" />
    </svg>
  );
}

function CalendarIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="5.5" width="16" height="15" rx="2" />
      <path d="M4 10h16" />
      <path d="M8.5 3.5v3.5" />
      <path d="M15.5 3.5v3.5" />
    </svg>
  );
}

function RefreshIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.5" />
      <path d="M17.5 4v3.5H14" />
      <path d="M19.5 12a7.5 7.5 0 0 1-12.6 5.5" />
      <path d="M6.5 20v-3.5H10" />
    </svg>
  );
}

function TerminalIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9.5l3 2.5-3 2.5" />
      <path d="M12.5 15.5h4.5" />
    </svg>
  );
}

function LinkIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 7.5l1.4-1.4a3.5 3.5 0 0 1 5 5L16 12.5" />
      <path d="M13 16.5l-1.4 1.4a3.5 3.5 0 0 1-5-5L8 11.5" />
    </svg>
  );
}

function StatRow({
  icon: Icon,
  label,
  value,
}: {
  icon: (props: IconProps) => JSX.Element;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="inline-flex items-center gap-1.5 text-text-faint">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {label}
      </span>
      <span className="font-medium text-text-secondary">{value}</span>
    </div>
  );
}

/**
 * GitHub-repo-style "About" panel for `/github-projects/:slug` and
 * `/github-open-source-tools/:slug` — reused as-is by both, same
 * relationship `GithubProjectDetailTabs` already has to both detail
 * pages, since a tool's `GithubProjectDetail` shape is identical to a
 * project's.
 *
 * Every one of these detail pages used to be just a tabbed body with no
 * persistent context panel next to it — description, license,
 * contributor count, and who actually maintains the repository were all
 * either buried one tab-click away (Project Info) or missing from the
 * page entirely (`owner`, part of `GithubProjectDetail` since
 * `lib/github-projects/types.ts`, was fetched but never once rendered
 * anywhere on this page). This sidebar surfaces all of that at a glance,
 * the way GitHub's own repository page keeps an "About" card pinned in
 * the right rail rather than making it compete for space with the file
 * tree — and adds two small, genuinely useful actions no part of this
 * page offered before: a one-click **clone command** (derived from the
 * repository's own real `repositoryUrl`, never a fabricated path) and a
 * **share link** back to this exact DevTunnel detail page.
 *
 * Every fact here is one already present on `GithubProjectDetail` — no
 * new field, no invented statistic (Frontend_Development_Rules.txt
 * rules 58/59), just a better home for data this page already had.
 */
export function GithubProjectSidebar({
  project,
  shareUrl,
}: {
  project: GithubProjectDetail;
  /** Absolute URL to this project/tool's own DevTunnel detail page. */
  shareUrl: string;
}) {
  const cloneCommand = `git clone ${project.repositoryUrl}.git`;

  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
      {/* About */}
      <div className="rounded-[10px] border border-border bg-surface p-4">
        <h2 className="m-0 mb-3 text-[11px] font-normal uppercase tracking-wide text-text-faint">
          About
        </h2>

        <p className="m-0 mb-3.5 text-[12.5px] leading-relaxed text-text-secondary">
          {project.description ?? "No description provided."}
        </p>

        {project.techStack.length > 0 || project.primaryLanguage ? (
          <div className="mb-3.5 flex flex-wrap gap-1.5">
            {project.primaryLanguage ? (
              <span
                className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10.5px] ${getTechTagClasses(project.primaryLanguage)}`}
              >
                {project.primaryLanguage}
              </span>
            ) : null}
            {project.techStack.map((tag) => (
              <span
                key={tag}
                className="inline-block rounded-[5px] border border-border bg-surface-raised px-[7px] py-[2px] text-[10.5px] text-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
          <StatRow
            icon={StarIcon}
            label="Stars"
            value={`${project.stars.toLocaleString()} (${formatCompactNumber(project.stars)})`}
          />
          <StatRow
            icon={GitBranchIcon}
            label="Forks"
            value={project.forks.toLocaleString()}
          />
          <StatRow
            icon={IssueIcon}
            label="Open issues"
            value={project.openIssuesCount.toLocaleString()}
          />
          <StatRow
            icon={UsersIcon}
            label="Contributors"
            value={project.contributorCount.toLocaleString()}
          />
          <StatRow icon={ScaleIcon} label="License" value={project.license ?? "Not specified"} />
        </div>

        <div className="mt-3 flex flex-col gap-1.5 border-t border-border-subtle pt-3 text-[11.5px] text-text-faint">
          <span className="inline-flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            Created <time dateTime={project.createdAt}>{formatRelativeTime(project.createdAt)}</time>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <RefreshIcon className="h-3.5 w-3.5 shrink-0" />
            Updated <time dateTime={project.pushedAt}>{formatRelativeTime(project.pushedAt)}</time>
          </span>
        </div>
      </div>

      {/* Maintainer — `project.owner` was already part of the fetched
          `GithubProjectDetail` shape but had no home anywhere on this
          page before this sidebar. */}
      <div className="rounded-[10px] border border-border bg-surface p-4">
        <h2 className="m-0 mb-3 text-[11px] font-normal uppercase tracking-wide text-text-faint">
          Maintainer
        </h2>
        <a
          href={project.owner.profileUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-2.5 rounded-md transition-opacity hover:opacity-80"
        >
          {project.owner.avatarUrl ? (
            <Image
              src={project.owner.avatarUrl}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-full border border-border-subtle"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-avatar-placeholder-border bg-avatar-placeholder-bg"
            >
              <UsersIcon className="h-4 w-4 text-avatar-placeholder-icon" />
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-text">
              {project.owner.name ?? project.owner.username}
            </div>
            <div className="truncate font-mono text-[11px] text-text-faint">
              @{project.owner.username}
            </div>
          </div>
        </a>
      </div>

      {/* Clone */}
      <div className="rounded-[10px] border border-border bg-surface p-4">
        <h2 className="m-0 mb-3 flex items-center gap-1.5 text-[11px] font-normal uppercase tracking-wide text-text-faint">
          <TerminalIcon className="h-3.5 w-3.5" />
          Clone
        </h2>
        <div className="flex items-center gap-1.5 rounded-[8px] border border-border-subtle bg-surface-raised px-2.5 py-2">
          <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-[11px] text-text-secondary">
            {cloneCommand}
          </code>
          <CopyButton value={cloneCommand} label="Copy clone command" />
        </div>
      </div>

      {/* Share */}
      <div className="rounded-[10px] border border-border bg-surface p-4">
        <h2 className="m-0 mb-3 flex items-center gap-1.5 text-[11px] font-normal uppercase tracking-wide text-text-faint">
          <LinkIcon className="h-3.5 w-3.5" />
          Share
        </h2>
        <div className="flex items-center gap-1.5 rounded-[8px] border border-border-subtle bg-surface-raised px-2.5 py-2">
          <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-[11px] text-text-secondary">
            {shareUrl}
          </code>
          <CopyButton value={shareUrl} label="Copy link to this page" />
        </div>
      </div>
    </aside>
  );
}
