import Link from "next/link";
import type { ProjectSummary } from "@/lib/home/types";

export function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <article className="rounded-lg border border-border bg-surface p-3">
      <h3 className="text-xs font-medium text-text m-0 mb-1">
        <Link
          href={`/projects/${project.slug}`}
          className="hover:text-accent focus-visible:text-accent"
        >
          {project.name}
        </Link>
      </h3>
      <p className="text-[11px] text-text-dim m-0 mb-2">{project.description}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-block text-[10px] px-[7px] py-[2px] rounded-[5px] border bg-tag-tech-bg border-tag-tech-border text-tag-tech-text">
          {project.primaryTech}
        </span>
        {typeof project.matchPercent === "number" ? (
          <span className="text-[10px] text-status-success-text">
            {project.matchRole ? `${project.matchRole} — ` : ""}
            Match: {project.matchPercent}%
          </span>
        ) : null}
      </div>
    </article>
  );
}