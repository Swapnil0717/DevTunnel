import Link from "next/link";
import type { ProjectSummary } from "@/lib/home/types";
import { getTechTagClasses } from "@/lib/home/tag-style";
import { DevtunnelProjectLogo } from "@/components/projects/devtunnel-project-logo";

/**
 * A recommended-project card on `/home`. Like `DevtunnelProjectCard`, the
 * **whole card opens the View Project page** (`/projects/:slug`) — the
 * title link is stretched over the card with an `after:` pseudo-element
 * (`absolute inset-0` against the `relative` article), so there is still
 * only one link for keyboard and screen-reader users, and the focus ring
 * outlines the entire card.
 *
 * Shares `ProjectSummary` with `DevtunnelProjectCard` (`/projects`), which
 * already renders a `DevtunnelProjectLogo` from the same
 * `repositoryFullName` field — that field was going unused here, so every
 * card on Home fell back silently to no logo even when the API sent one.
 * Reusing that component keeps the "owner avatar, falls back to a folder
 * icon" behavior identical on both pages instead of Home inventing its
 * own variant of it.
 */
export function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <article className="group relative rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-subtle hover:bg-surface-raised">
      <Link
        href={`/projects/${project.slug}`}
        className="mb-1 flex items-start gap-2 rounded-md focus-visible:outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent/40"
      >
        <DevtunnelProjectLogo repositoryFullName={project.repositoryFullName} size={20} />
        <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-text m-0 leading-5 transition-colors group-hover:text-accent">
          {project.name}
        </h3>
      </Link>
      <p className="text-[11px] text-text-dim m-0 mb-2">{project.description}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-block text-[10px] px-[7px] py-[2px] rounded-[5px] border ${getTechTagClasses(project.primaryTech)}`}
        >
          {project.primaryTech}
        </span>
        {typeof project.matchPercent === "number" ? (
          <span className="text-[10px] text-status-success-label">
            {project.matchRole ? `${project.matchRole} — ` : ""}
            Match: {project.matchPercent}%
          </span>
        ) : null}
      </div>
    </article>
  );
}
