import Link from "next/link";
import { DevtunnelProjectLogo } from "./devtunnel-project-logo";
import { SparkleIcon, ChevronRightIcon } from "@/components/layout/nav-icons";
import { getTechTagClasses } from "@/lib/home/tag-style";
import type { ProjectSummary } from "@/lib/home/types";

export function DevtunnelProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <article className="flex flex-col rounded-[10px] border border-border bg-surface p-4 transition-colors hover:border-border-subtle">
      <Link
        href={`/projects/${project.slug}`}
        className="mb-2.5 flex items-start gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-md"
      >
        <DevtunnelProjectLogo repositoryFullName={project.repositoryFullName} size={32} />
        <div className="min-w-0 flex-1">
          <h3 className="m-0 truncate text-[13px] font-medium leading-tight text-text hover:text-accent">
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

        <Link
          href={`/projects/${project.slug}`}
          className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-medium text-text-faint hover:text-accent"
        >
          View project
          <ChevronRightIcon className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}