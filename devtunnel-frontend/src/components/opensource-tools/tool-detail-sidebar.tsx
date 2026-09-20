import Image from "next/image";
import { CopyButton } from "@/components/github-projects/copy-button";
import {
  StarIcon,
  GitBranchIcon,
  IssueIcon,
  UserIcon,
  RefreshIcon,
} from "@/components/layout/nav-icons";
import { formatCompactNumber } from "@/lib/github-projects/format-compact-number";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { getTechTagClasses } from "@/lib/home/tag-style";
import type { OpenSourceToolDetail } from "@/lib/opensource-tools/types";

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

/* No counterpart in `nav-icons.tsx` yet — drawn on the same 24px grid and
   stroke weight as the shared set so the rail doesn't mix icon styles.
   Same approach `GithubProjectSidebar` takes. */

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
 * The tool rail on `/opensource-tools/:toolSlug` — the "About" panel that
 * stays put while the body tabs change, same job and same shape as
 * `ProjectDetailSidebar`.
 *
 * The one structural difference is that the GitHub block is conditional:
 * a tool whose `sourceUrl` isn't a repository has no stars, forks,
 * issues, license or maintainer to show, so those cards and the clone
 * command simply don't render, rather than rendering as zeroes and dashes
 * that read like real values (Frontend_Development_Rules.txt rules
 * 38/58). "Stars on DevTunnel" and "Added" always render — those are
 * DevTunnel's own facts and exist for every tool.
 */
export function ToolDetailSidebar({
  tool,
  shareUrl,
}: {
  tool: OpenSourceToolDetail;
  /** Absolute URL to this tool's own DevTunnel page. */
  shareUrl: string;
}) {
  const repo = tool.repository;
  const cloneCommand = repo ? `git clone ${repo.url}.git` : null;

  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
      {/* About */}
      <div className="rounded-[10px] border border-border bg-surface p-4">
        <h2 className="m-0 mb-3 text-[11px] font-normal uppercase tracking-wide text-text-faint">
          About
        </h2>

        <p className="m-0 mb-3.5 text-[12.5px] leading-relaxed text-text-secondary">
          {tool.description ?? "No description provided."}
        </p>

        {tool.primaryLanguage || tool.labels.length > 0 ? (
          <div className="mb-3.5 flex flex-wrap gap-1.5">
            {tool.primaryLanguage ? (
              <span
                className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10.5px] ${getTechTagClasses(tool.primaryLanguage)}`}
              >
                {tool.primaryLanguage}
              </span>
            ) : null}
            {tool.labels.map((label) => (
              <span
                key={label}
                className="inline-block rounded-[5px] border border-border bg-surface-raised px-[7px] py-[2px] text-[10.5px] text-text-secondary"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}

        {/* DevTunnel's own facts — true for every tool, repository or not. */}
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
          <StatRow
            icon={StarIcon}
            label="Stars on DevTunnel"
            value={tool.localStarCount.toLocaleString()}
          />
        </div>

        {/* The repository's numbers, only when there is a repository. */}
        {repo ? (
          <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3">
            <StatRow
              icon={StarIcon}
              label="Stars on GitHub"
              value={`${repo.stars.toLocaleString()} (${formatCompactNumber(repo.stars)})`}
            />
            <StatRow icon={GitBranchIcon} label="Forks" value={repo.forks.toLocaleString()} />
            <StatRow
              icon={IssueIcon}
              label="Open issues"
              value={repo.openIssuesCount.toLocaleString()}
            />
            <StatRow
              icon={UserIcon}
              label="Contributors"
              value={repo.contributorCount.toLocaleString()}
            />
            <StatRow icon={ScaleIcon} label="License" value={repo.license ?? "Not specified"} />
          </div>
        ) : null}

        <div className="mt-3 flex flex-col gap-1.5 border-t border-border-subtle pt-3 text-[11.5px] text-text-faint">
          <span className="inline-flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            Added <time dateTime={tool.createdAt}>{formatRelativeTime(tool.createdAt)}</time>
          </span>
          {repo ? (
            <span className="inline-flex items-center gap-1.5">
              <RefreshIcon className="h-3.5 w-3.5 shrink-0" />
              Updated <time dateTime={repo.pushedAt}>{formatRelativeTime(repo.pushedAt)}</time>
            </span>
          ) : null}
        </div>
      </div>

      {/* Maintainer */}
      {repo ? (
        <div className="rounded-[10px] border border-border bg-surface p-4">
          <h2 className="m-0 mb-3 text-[11px] font-normal uppercase tracking-wide text-text-faint">
            Maintainer
          </h2>
          <a
            href={repo.owner.profileUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-2.5 rounded-md transition-opacity hover:opacity-80"
          >
            {repo.owner.avatarUrl ? (
              <Image
                src={repo.owner.avatarUrl}
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
                {repo.owner.name ?? repo.owner.username}
              </div>
              <div className="truncate font-mono text-[11px] text-text-faint">
                @{repo.owner.username}
              </div>
            </div>
          </a>
        </div>
      ) : null}

      {/* Clone */}
      {cloneCommand ? (
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
      ) : null}

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
