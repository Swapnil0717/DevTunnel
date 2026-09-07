import Link from "next/link";
import { GitBranchIcon } from "@/components/layout/nav-icons";
import { AdminProjectStatusBadge } from "./admin-project-status-badge";
import { DeleteProjectButton } from "./delete-project-button";
import type { AdminProjectSummary } from "@/lib/admin/projects/types";

/**
 * A secondary row action that doesn't have a real page to link to yet.
 * Same "Soon" convention AdminSidebar uses for unbuilt nav routes.
 */
function PendingAction({ label }: { label: string }) {
  return (
    <span
      aria-disabled="true"
      title={`${label} isn't built yet`}
      className="cursor-not-allowed rounded-md px-2 py-1 text-[11.5px] text-text-faint"
    >
      {label}
    </span>
  );
}

/**
 * Projects table.
 *
 * Columns:
 * Project Name, GitHub Repository, Author,
 * DevTunnel Contributors, GitHub Contributors,
 * Task Count, Status, Actions.
 *
 * DevTunnel contributors and GitHub contributors are kept
 * as separate values and are never merged.
 *
 * Actions:
 * - View: Project Detail page
 * - Edit: Project Detail page with ?edit=1
 * - Tasks: Disabled until the Tasks page is implemented
 * - Delete: Removes the project
 */
export function AdminProjectsTable({
  projects,
}: {
  projects: AdminProjectSummary[];
}) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border">
      <table className="w-full min-w-[880px] border-collapse text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-surface">
            {[
              "Project",
              "GitHub repository",
              "Author",
              "DevTunnel contributors",
              "GitHub contributors",
              "Tasks",
              "Status",
              "Actions",
            ].map((heading) => (
              <th
                key={heading}
                scope="col"
                className="px-4 py-3 text-[11px] font-normal uppercase tracking-wide text-text-faint"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {projects.map((project) => (
            <tr
              key={project.id}
              className="border-b border-border-subtle last:border-b-0 hover:bg-surface/60"
            >
              {/* Project */}
              <th
                scope="row"
                className="px-4 py-3 font-medium text-text"
              >
                {project.name}
              </th>

              {/* GitHub Repository */}
              <td className="px-4 py-3">
                <a
                  href={project.repositoryUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-text-secondary hover:text-accent"
                >
                  <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
                  {project.repositoryFullName}
                </a>
              </td>

              {/* Author */}
              <td className="px-4 py-3 text-text-secondary">
                @{project.author.username}
              </td>

              {/* DevTunnel Contributors */}
              <td className="px-4 py-3 text-text-secondary">
                {project.devTunnelContributorCount}
              </td>

              {/* GitHub Contributors */}
              <td className="px-4 py-3 text-text-secondary">
                {project.githubContributorCount}
              </td>

              {/* Tasks */}
              <td className="px-4 py-3 text-text-secondary">
                {project.taskCount}
              </td>

              {/* Status */}
              <td className="px-4 py-3">
                <AdminProjectStatusBadge status={project.status} />
              </td>

              {/* Actions */}
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1">
                  {/* View */}
                  <Link
                    href={`/admin/projects/${project.id}`}
                    className="rounded-md px-2 py-1 text-[11.5px] font-medium text-text-secondary hover:text-accent"
                  >
                    View
                  </Link>

                  {/* Edit */}
                  <Link
                    href={`/admin/projects/${project.id}?edit=1`}
                    className="rounded-md px-2 py-1 font-mono text-[11.5px] font-medium text-text-secondary hover:text-accent"
                  >
                    Edit
                  </Link>

                  {/* Tasks - Not implemented yet */}
                  <PendingAction label="Tasks" />

                  {/* Delete */}
                  <DeleteProjectButton
                    projectId={project.id}
                    projectName={project.name}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}