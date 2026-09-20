import Link from "next/link";
import { DevtunnelProjectLogo } from "./devtunnel-project-logo";
import { SparkleIcon, ChevronRightIcon } from "@/components/layout/nav-icons";
import { getTechTagClasses } from "@/lib/home/tag-style";
import type { ProjectSummary } from "@/lib/home/types";

/**
 * A project card on `/projects`. **The whole card is the link** — a click
 * or tap anywhere on it (logo, name, description, tech tag, match badge,
 * footer) opens the View Project page (`/projects/:slug`).
 *
 * Done with the stretched-link pattern rather than wrapping the card in an
 * `<a>`: the title `Link` carries an `after:` pseudo-element that is
 * `absolute inset-0` against the `relative` article, so it covers the
 * entire card. That keeps exactly one link per card for screen readers
 * and keyboard users (Tab lands once, Enter opens the project), avoids
 * nesting interactive elements, and still gives mouse and touch users the
 * full card as a target. The focus ring is drawn on that same
 * pseudo-element so keyboard focus outlines the whole card, not just the
 * title.
 *
 * The footer's "View project" is now a visual cue only (`aria-hidden`,
 * not a second link to the same place) and reacts to hovering anywhere on
 * the card via `group-hover`.
 */
export function DevtunnelProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <article className="group relative flex flex-col rounded-[10px] border border-border bg-surface p-4 transition-colors hover:border-border-subtle hover:bg-surface-raised">
      <Link
        href={`/projects/${project.slug}`}
        className="mb-2.5 flex items-start gap-2.5 rounded-md focus-visible:outline-none after:absolute after:inset-0 after:rounded-[10px] after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent/40"
      >
        <DevtunnelProjectLogo repositoryFullName={project.repositoryFullName} size={32} />
        <div className="min-w-0 flex-1">
          <h3 className="m-0 truncate text-[13px] font-medium leading-tight text-text transition-colors group-hover:text-accent">
            {project.name}
          </h3>
          <p className="m-0 mt-0.5 truncate text-[11px] text-text-faint">
            Project on Devtunnel
          </p>
        </div>
      </Link>

      <p className="m-0 mb-3 line-clamp-2 min-h-[2.6em] text-[11.5px] leading-snug text-text-secondary">
        {project.description}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10px] ${getTechTagClasses(project.primaryTech)}`}
        >
          {project.primaryTech}
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle pt-2.5">
        {typeof project.matchPercent === "number" ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-status-success-label">
            <SparkleIcon className="h-3 w-3" />
            {project.matchRole ? `${project.matchRole} — ` : ""}
            {project.matchPercent}% match
          </span>
        ) : (
          <span aria-hidden="true" />
        )}

        <span
          aria-hidden="true"
          className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-medium text-text-faint transition-colors group-hover:text-accent"
        >
          View project
          <ChevronRightIcon className="h-3 w-3" />
        </span>
      </div>
    </article>
  );
}
