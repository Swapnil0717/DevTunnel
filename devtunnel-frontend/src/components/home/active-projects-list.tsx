import Link from "next/link";
import { getActiveProjects } from "@/lib/home/api";
import { formatRelativeTime } from "@/lib/home/format-relative-time";

export async function ActiveProjectsList() {
  const result = await getActiveProjects();

  if (result.status === "error") {
    return (
      <p className="text-[11.5px] text-status-error-text">
        Couldn&apos;t load recent activity. Try refreshing the page.
      </p>
    );
  }

  if (result.status === "empty") {
    return (
      <p className="text-[11.5px] text-text-dim">
        No recent contribution activity yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
      {result.data.map((project) => (
        <li key={project.slug}>
          <Link
            href={`/projects/${project.slug}`}
            className="flex items-center justify-between rounded-lg bg-surface px-3 py-2.5 hover:bg-surface-raised"
          >
            <span className="text-xs text-text">{project.name}</span>
            <span className="text-[11px] text-text-faint font-mono">
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