import { GitBranchIcon } from "@/components/layout/nav-icons";
import { AdminProjectStatusBadge } from "./admin-project-status-badge";
import type { AdminProjectSummary } from "@/lib/admin/projects/types";

/**
 * A secondary row action that doesn't have a real page to link to yet.
 * Same "Soon" convention `AdminSidebar` uses for unbuilt nav routes
 * (admin-nav-items.ts) — never a link to a page that 404s
 * (Frontend_Development_Rules.txt rule 11).
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
 * Projects table (admin_workflow.txt, section 4 — Projects Page ▸
 * Frontend): "Show all projects currently available on DevTunnel."
 *
 * Columns match the spec exactly: Project Name, GitHub Repository,
 * Author, DevTunnel Contributors, GitHub Contributors, Task Count,
 * Status. The two contributor columns are deliberately separate numbers,
 * never summed or merged — section 5: "GitHub Contributors ≠ DevTunnel
 * Contributors... Do not mix the two datasets."
 *
 * Actions (section 4): View, Edit, Tasks, Repository, Sync. Only
 * "Repository" is a real link here — it's the project's actual GitHub
 * URL, already known data, not a DevTunnel page. View/Edit/Tasks/Sync all
 * depend on pages or endpoints that don't exist yet (`/admin/projects/:id`,
 * `/admin/projects/:id/tasks`, `POST /admin/projects/:id/sync`), so they
 * render as disabled `PendingAction`s instead of dead links or buttons
 * that would call a 404.
 *
 * A real `<table>` (rule 4 — semantic HTML over generic divs), wrapped in
 * a horizontally scrolling container so the seven columns stay usable on
 * narrow viewports without collapsing into an unreadable grid.
 */
export function AdminProjectsTable({ projects }: { projects: AdminProjectSummary[] }) {
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
              <th scope="row" className="px-4 py-3 font-medium text-text">
                {project.name}
              </th>
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
              <td className="px-4 py-3 text-text-secondary">
                @{project.author.username}
              </td>
              <td className="px-4 py-3 text-text-secondary">
                {project.devTunnelContributorCount}
              </td>
              <td className="px-4 py-3 text-text-secondary">
                {project.githubContributorCount}
              </td>
              <td className="px-4 py-3 text-text-secondary">{project.taskCount}</td>
              <td className="px-4 py-3">
                <AdminProjectStatusBadge status={project.status} />
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1">
                  <PendingAction label="View" />
                  <PendingAction label="Edit" />
                  <PendingAction label="Tasks" />
                  <PendingAction label="Sync" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
