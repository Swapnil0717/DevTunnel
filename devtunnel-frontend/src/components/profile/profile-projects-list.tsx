import Link from "next/link";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { getTechTagClasses } from "@/lib/home/tag-style";
import type { ProfileProject, ProfileProjectKind } from "@/lib/profile/types";

const KIND_LABEL: Record<ProfileProjectKind, string> = {
  project: "Project",
  tool: "Open source tool",
  "github-project": "GitHub project",
  "github-tool": "GitHub tool",
};

/** Where each kind of entry's own page lives. */
function projectHref(project: ProfileProject): string {
  switch (project.kind) {
    case "project":
      return `/projects/${project.slug}`;
    case "tool":
      return `/opensource-tools/${project.slug}`;
    case "github-project":
      return `/github-projects/${project.slug}`;
    case "github-tool":
      return `/github-open-source-tools/${project.slug}`;
  }
}

/**
 * Same words and chip colors the rest of the app uses for a task's stage
 * (`lib/tasks/progress.ts`, `TaskRow`). "Contributing" means there is work in
 * the project — a task started, submitted or finished; "Joined" is intent
 * only. The chip carries the meaning in words, so nothing is conveyed by
 * color alone (rule 43).
 */
const STATUS_CHIP: Record<ProfileProject["status"], { label: string; className: string }> = {
  CONTRIBUTING: { label: "Contributing", className: "bg-status-success-bg text-status-success-label" },
  JOINED: { label: "Joined", className: "bg-status-info-bg text-status-info-text" },
};

/** "2 viewed · 1 started · 1 PR submitted · 1 done" — only the stages that have something in them. */
function taskSummary(project: ProfileProject): string | null {
  const counts = project.taskCounts;
  if (!counts) return null;

  const parts: string[] = [];
  if (counts.viewed > 0) parts.push(`${counts.viewed} viewed`);
  if (counts.inProgress > 0) parts.push(`${counts.inProgress} started`);
  if (counts.inReview > 0) parts.push(`${counts.inReview} PR submitted`);
  if (counts.done > 0) parts.push(`${counts.done} done`);

  return parts.length > 0 ? parts.join(" · ") : "No tasks opened yet";
}

/**
 * The Profile page's **Projects** tab — every project the signed-in
 * contributor has joined (pressed **Contribute** on) or is contributing to,
 * newest activity first, from `GET /users/me/profile-activity`.
 *
 * Covers all four places a contributor can join: an onboarded DevTunnel
 * project, an onboarded tool, and a raw repository from either GitHub catalog.
 * A project also appears here — as "Contributing", with no "Joined" date — if
 * they started a task in it from the CLI without ever pressing the button.
 *
 * Only DevTunnel projects carry per-task counts: tools and raw GitHub
 * repositories have no `devtunnel.tasks` rows (sql/017), so there is nothing
 * to count and none is invented.
 *
 * `projects === null` means the request failed. That is shown as such, never
 * as the "haven't joined anything" empty state — telling someone their joined
 * projects are gone because a request hiccuped would be worse than an error.
 * Each card is one link to the project's own page; the repository name is
 * plain text rather than a nested link, so there is a single link per row
 * like every other list in the app.
 */
export function ProfileProjectsList({ projects }: { projects: ProfileProject[] | null }) {
  if (projects === null) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface px-4 py-8 text-center text-[12.5px] text-text-dim">
        We couldn&apos;t load your projects right now. Try refreshing the page.
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface px-4 py-8 text-center text-[12.5px] text-text-dim">
        <p className="m-0">You haven&apos;t joined any projects yet.</p>
        <p className="m-0 mt-1.5">
          Press <span className="text-text-muted">Contribute</span> on a project and it&apos;ll show up
          here.{" "}
          <Link href="/projects" className="text-text-muted underline underline-offset-2 hover:text-accent">
            Browse projects
          </Link>
        </p>
      </div>
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Projects you've joined or are contributing to">
      {projects.map((project) => {
        const chip = STATUS_CHIP[project.status];
        const summary = taskSummary(project);

        return (
          <li key={project.id}>
            <Link
              href={projectHref(project)}
              className="flex flex-col gap-2 rounded-lg bg-surface px-3.5 py-3 hover:bg-surface-raised sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-[12.5px] font-medium text-text">{project.name}</span>
                  {project.primaryTech ? (
                    <span
                      className={`rounded-[5px] border px-[7px] py-[1px] text-[10px] ${getTechTagClasses(project.primaryTech)}`}
                    >
                      {project.primaryTech}
                    </span>
                  ) : null}
                </span>

                <span className="mt-0.5 block truncate text-[10.5px] text-text-faint">
                  {KIND_LABEL[project.kind]}
                  {project.repositoryFullName ? (
                    <>
                      {" · "}
                      <span className="font-mono">{project.repositoryFullName}</span>
                    </>
                  ) : null}
                  {project.joinedAt ? (
                    <>
                      {" · Joined "}
                      <time dateTime={project.joinedAt} suppressHydrationWarning>
                        {formatRelativeTime(project.joinedAt)}
                      </time>
                    </>
                  ) : null}
                </span>

                {summary ? (
                  <span className="mt-0.5 block truncate text-[10.5px] text-text-muted">{summary}</span>
                ) : null}
              </span>

              <span className="flex shrink-0 items-center gap-2">
                <span className={`rounded-[5px] px-[7px] py-[2px] text-[10px] ${chip.className}`}>
                  {chip.label}
                </span>
                <span className="font-mono text-[11px] text-text-faint">
                  <time dateTime={project.lastActivityAt} suppressHydrationWarning>
                    {formatRelativeTime(project.lastActivityAt)}
                  </time>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
