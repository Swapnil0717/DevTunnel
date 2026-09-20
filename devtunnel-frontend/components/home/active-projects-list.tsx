import Link from "next/link";
import { SectionMessage } from "./section-message";
import { getActiveProjects } from "@/lib/home/api";
import { formatRelativeTime } from "@/lib/home/format-relative-time";

export async function ActiveProjectsList() {
  const result = await getActiveProjects();

  if (result.status === "error") {
    return (
      <SectionMessage>
        Recent activity isn&apos;t available yet — check back soon.
      </SectionMessage>
    );
  }

  if (result.status === "empty") {
    return (
      <SectionMessage>
        No recent activity yet. Once you start contributing, it&apos;ll show up
        here.
      </SectionMessage>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
      {result.data.map((project) => (
        <li key={project.slug}>
          <Link
            href={`/projects/${project.slug}`}
            className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2.5 hover:bg-surface-raised"
          >
            <span className="truncate text-xs text-text-secondary">
              {project.name}
            </span>
            <span className="shrink-0 text-[11px] text-text-faint font-mono">
              {project.commitCount} commits ·{" "}
              <time dateTime={project.lastActiveAt}>
                {formatRelativeTime(project.lastActiveAt)}
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}