import { RepoLogo } from "@/components/admin/repo-logo";
import { StarIcon, GitBranchIcon, IssueIcon } from "@/components/layout/nav-icons";
import { formatCompactNumber } from "@/lib/github-projects/format-compact-number";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { getTechTagClasses } from "@/lib/home/tag-style";
import type { GithubProjectSummary } from "@/lib/github-projects/types";

/** How many tech-stack tags to show inline before collapsing into "+N". */
const MAX_VISIBLE_TAGS = 3;

/**
 * One card on the `/github-projects` grid ("GitHub Projects" in
 * `AppSidebar`). Repo logo + name + `owner/repo`, GitHub's own
 * description, a language/tech-stack tag row, then a bordered footer of
 * stars / forks / open issues plus a relative "Updated" timestamp.
 *
 * `RepoLogo` is reused as-is rather than duplicated — already a generic,
 * role-agnostic presentational component (no admin API calls, no
 * admin-only state), same reuse `IssuesTable`'s doc comment documents
 * for the same reason (Frontend_Development_Rules.txt rule 51).
 *
 * The whole card's primary click target is the repository name, which
 * opens the actual GitHub repository in a new tab — this page is a
 * read-only GitHub catalog (see `lib/github-projects/types.ts`), not a
 * DevTunnel project with its own detail route, so there's nowhere
 * internal for it to link to instead.
 *
 * Every stat pairs its icon with a real `aria-label` stating the full
 * number and unit ("1.2K stars", not just a bare compact number next to
 * a glyph) — rule 43: an icon is never the only cue for a fact, and the
 * accessible text must be meaningful on its own, not just an abbreviated
 * digit string.
 */
export function GithubProjectCard({ project }: { project: GithubProjectSummary }) {
  const visibleTags = project.techStack.slice(0, MAX_VISIBLE_TAGS);
  const hiddenTagCount = project.techStack.length - visibleTags.length;

  return (
    <article className="flex flex-col rounded-[10px] border border-border bg-surface p-4 transition-colors hover:border-border-subtle">
      <div className="mb-2.5 flex items-start gap-2.5">
        <RepoLogo repositoryFullName={project.repositoryFullName} size={32} />
        <div className="min-w-0 flex-1">
          <h3 className="m-0 truncate text-[13px] font-medium leading-tight text-text">
            <a
              href={project.repositoryUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-accent focus-visible:text-accent"
            >
              {project.name}
            </a>
          </h3>
          <p className="m-0 mt-0.5 truncate font-mono text-[11px] text-text-faint">
            {project.repositoryFullName}
          </p>
        </div>
      </div>

      <p className="m-0 mb-3 line-clamp-2 min-h-[2.6em] text-[11.5px] leading-snug text-text-secondary">
        {project.description ?? "No description provided."}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {project.primaryLanguage ? (
          <span
            className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10px] ${getTechTagClasses(project.primaryLanguage)}`}
          >
            {project.primaryLanguage}
          </span>
        ) : null}

        {visibleTags.map((tag) => (
          <span
            key={tag}
            className="inline-block rounded-[5px] border border-border bg-surface-raised px-[7px] py-[2px] text-[10px] text-text-secondary"
          >
            {tag}
          </span>
        ))}

        {hiddenTagCount > 0 ? (
          <span className="text-[10px] text-text-faint">+{hiddenTagCount}</span>
        ) : null}

        {project.license ? (
          <span className="inline-block rounded-[5px] border border-border-subtle px-[7px] py-[2px] text-[10px] text-text-faint">
            {project.license}
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle pt-2.5">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1 text-[11px] text-text-muted"
            aria-label={`${project.stars.toLocaleString()} stars`}
          >
            <StarIcon aria-hidden="true" className="h-3.5 w-3.5" />
            <span aria-hidden="true">{formatCompactNumber(project.stars)}</span>
          </span>

          <span
            className="inline-flex items-center gap-1 text-[11px] text-text-muted"
            aria-label={`${project.forks.toLocaleString()} forks`}
          >
            <GitBranchIcon aria-hidden="true" className="h-3.5 w-3.5" />
            <span aria-hidden="true">{formatCompactNumber(project.forks)}</span>
          </span>

          <span
            className="inline-flex items-center gap-1 text-[11px] text-text-muted"
            aria-label={`${project.openIssuesCount.toLocaleString()} open issues`}
          >
            <IssueIcon aria-hidden="true" className="h-3.5 w-3.5" />
            <span aria-hidden="true">{formatCompactNumber(project.openIssuesCount)}</span>
          </span>
        </div>

        <p className="m-0 shrink-0 text-[10.5px] text-text-faint">
          Updated <time dateTime={project.pushedAt}>{formatRelativeTime(project.pushedAt)}</time>
        </p>
      </div>
    </article>
  );
}
