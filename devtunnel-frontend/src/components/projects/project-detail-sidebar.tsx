import Image from "next/image";
import { CopyButton } from "@/components/github-projects/copy-button";
import {
  StarIcon,
  GitBranchIcon,
  IssueIcon,
  ChecklistIcon,
  UserIcon,
  RefreshIcon,
  SparkleIcon,
} from "@/components/layout/nav-icons";
import { formatCompactNumber } from "@/lib/github-projects/format-compact-number";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { getTechTagClasses } from "@/lib/home/tag-style";
import type { DevtunnelProjectDetail } from "@/lib/projects/types";

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

/* The four icons below have no counterpart in `nav-icons.tsx` yet, so
   they're defined here the same way `GithubProjectSidebar` defines its
   own — drawn on the same 24px grid and stroke weight as the shared set
   so the rail doesn't visibly mix two icon styles. */

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
 * The project rail on `/projects/:projectSlug` — the "About" panel that
 * stays put while the body tabs change, so a contributor never has to
 * click back to Project Info to remember what the project is, who
 * maintains it, or how big it is.
 *
 * Same shape and spacing as `GithubProjectSidebar`, which does this job
 * for the un-onboarded GitHub catalog, but the stat block is genuinely
 * different, because this project has a DevTunnel side the catalog ones
 * don't: **DevTunnel contributors** and **DevTunnel tasks** sit above the
 * repository's own GitHub numbers, separated by a rule, rather than being
 * folded in among them (admin_workflow.txt section 5 — "GitHub
 * Contributors ≠ DevTunnel Contributors. Do not mix the two datasets").
 * Every row says which side it's counting, so neither number can be
 * mistaken for the other.
 *
 * The match card only renders when the contributor has a match to show —
 * absent, not a fabricated 0% (Frontend_Development_Rules.txt rules
 * 38/58) — using the same `matchPercent`/`matchRole` pair the project
 * cards on `/home` and `/projects` already display.
 *
 * Clone and Share are both derived from real values already on the
 * payload (`repositoryUrl`, `slug`), never a constructed path that might
 * not exist.
 */
export function ProjectDetailSidebar({
  project,
  shareUrl,
}: {
  project: DevtunnelProjectDetail;
  /** Absolute URL to this project's own DevTunnel page. */
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

        {project.primaryTech || project.techStack.length > 0 ? (
          <div className="mb-3.5 flex flex-wrap gap-1.5">
            {project.primaryTech ? (
              <span
                className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10.5px] ${getTechTagClasses(project.primaryTech)}`}
              >
                {project.primaryTech}
              </span>
            ) : null}
            {project.techStack
              .filter((tag) => tag !== project.primaryTech)
              .map((tag) => (
                <span
                  key={tag}
                  className="inline-block rounded-[5px] border border-border bg-surface-raised px-[7px] py-[2px] text-[10.5px] text-text-secondary"
                >
                  {tag}
                </span>
              ))}
          </div>
        ) : null}

        {/* DevTunnel's own numbers — kept above and apart from GitHub's. */}
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
          <StatRow
            icon={UserIcon}
            label="DevTunnel contributors"
            value={project.devTunnelContributorCount.toLocaleString()}
          />
          <StatRow
            icon={ChecklistIcon}
            label="DevTunnel tasks"
            value={project.taskCount.toLocaleString()}
          />
          <StatRow
            icon={StarIcon}
            label="Stars on DevTunnel"
            value={project.localStarCount.toLocaleString()}
          />
        </div>

        {/* The repository's own numbers, straight from GitHub. */}
        <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3">
          <StatRow
            icon={StarIcon}
            label="Stars on GitHub"
            value={`${project.stars.toLocaleString()} (${formatCompactNumber(project.stars)})`}
          />
          <StatRow icon={GitBranchIcon} label="Forks" value={project.forks.toLocaleString()} />
          <StatRow
            icon={IssueIcon}
            label="Open issues"
            value={project.openIssuesCount.toLocaleString()}
          />
          <StatRow
            icon={UserIcon}
            label="GitHub contributors"
            value={project.githubContributorCount.toLocaleString()}
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

      {/* Match — only when there's a real one to show. */}
      {typeof project.matchPercent === "number" ? (
        <div className="rounded-[10px] border border-border bg-surface p-4">
          <h2 className="m-0 mb-2 text-[11px] font-normal uppercase tracking-wide text-text-faint">
            Your match
          </h2>
          <p className="m-0 inline-flex items-center gap-1.5 text-[13px] font-medium text-status-success-label">
            <SparkleIcon className="h-3.5 w-3.5 shrink-0" />
            {project.matchPercent}% match
          </p>
          {project.matchRole ? (
            <p className="m-0 mt-1 text-[11.5px] text-text-faint">
              Based on your {project.matchRole} profile
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Maintainer */}
      <div className="rounded-[10px] border border-border bg-surface p-4">
        <h2 className="m-0 mb-3 text-[11px] font-normal uppercase tracking-wide text-text-faint">
          Maintainer
        </h2>
        <a
          href={project.author.profileUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-2.5 rounded-md transition-opacity hover:opacity-80"
        >
          {project.author.avatarUrl ? (
            <Image
              src={project.author.avatarUrl}
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
              <UserIcon className="h-4 w-4 text-avatar-placeholder-icon" />
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-text">
              {project.author.name ?? project.author.username}
            </div>
            <div className="truncate font-mono text-[11px] text-text-faint">
              @{project.author.username}
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
