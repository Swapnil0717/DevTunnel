import Link from "next/link";
import type { ProjectSummary } from "@/lib/home/types";
import { getTechDotColor } from "@/lib/home/tech-color";
import { ProjectAvatar } from "./project-avatar";
import { HOME_PANEL } from "./styles";

/**
 * A recommended-project card on `/home`.
 *
 * The **whole card opens the View Project page** (`/projects/:slug`): the
 * title link is stretched over the card with an `after:` pseudo-element
 * (`absolute inset-0` against the `relative` article), so there is still just
 * one link for keyboard and screen-reader users, and the focus ring outlines
 * the entire card.
 *
 * Layout follows the redesign: logo tile + name + `owner/repo` in monospace;
 * a description; then a footer with the primary language (colored dot *and*
 * its name), and — only when the API scored this project against the
 * contributor's profile — "{Role} — Match: {n}%" with a thin bar. The bar is
 * decorative (`aria-hidden`); the percentage is right there as text
 * (rule 43). No match line is ever shown for a project the API didn't score
 * (rule 58).
 */
export function ProjectCard({ project }: { project: ProjectSummary }) {
  const match =
    typeof project.matchPercent === "number"
      ? Math.min(100, Math.max(0, Math.round(project.matchPercent)))
      : null;

  return (
    <article
      className={`relative flex min-w-0 flex-1 flex-col gap-3 p-4 transition-colors hover:border-[#2E2E2E] ${HOME_PANEL}`}
    >
      <div className="flex items-center gap-2.5">
        <ProjectAvatar
          name={project.name}
          repositoryFullName={project.repositoryFullName}
        />
        <div className="min-w-0">
          <h3 className="m-0 text-[13.5px] font-medium leading-[1.3] text-text">
            <Link
              href={`/projects/${project.slug}`}
              className="block truncate rounded-sm focus-visible:outline-none after:absolute after:inset-0 after:rounded-[10px] after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent/40"
            >
              {project.name}
            </Link>
          </h3>
          {project.repositoryFullName ? (
            <p className="m-0 truncate font-mono text-[11px] text-text-dim">
              {project.repositoryFullName}
            </p>
          ) : null}
        </div>
      </div>

      <p className="m-0 line-clamp-3 flex-1 text-[12.5px] leading-[1.55] text-text-muted">
        {project.description}
      </p>

      {project.primaryTech || match !== null ? (
        <div className="flex flex-col gap-2 border-t border-[#1A1A1A] pt-3">
          {project.primaryTech ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[#C8C8C8]">
              <span
                aria-hidden="true"
                className="h-2 w-2 flex-none rounded-full"
                style={{ backgroundColor: getTechDotColor(project.primaryTech) }}
              />
              {project.primaryTech}
            </span>
          ) : null}

          {match !== null ? (
            <>
              <span className="text-[12px] text-status-success-label">
                {project.matchRole ? `${project.matchRole} — ` : ""}
                Match: {match}%
              </span>
              <span
                aria-hidden="true"
                className="block h-0.5 rounded-sm bg-[#1A1A1A]"
              >
                <span
                  className="block h-0.5 rounded-sm bg-accent"
                  style={{ width: `${match}%` }}
                />
              </span>
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
