import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getAdminProjectDetail } from "@/lib/admin/projects/api";
import { AdminProjectStatusBadge } from "@/components/admin/projects/admin-project-status-badge";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { DeleteProjectButton } from "@/components/admin/projects/delete-project-button";
import { ProjectStatusToggle } from "@/components/admin/projects/project-status-toggle";
import { EditProjectDetailsPanel } from "@/components/admin/projects/edit-project-details-panel";
import { EditIcon, GitBranchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { MarkdownReadme } from "@/components/ui/markdown-readme";

interface ProjectDetailPageProps {
  params: { id: string };
  /**
   * `?edit=1` opens the Description/Tech Stack panel straight into edit
   * mode — this is what the Projects table's "Edit" row action links to
   * now, since there is no separate `/admin/projects/:id/edit` page in
   * the spec (section 22's Admin Backend API Map only lists
   * `PATCH /admin/projects/:id`, not a distinct edit route). Anything
   * other than `"1"` is treated the same as absent, so a stray/garbled
   * query value never silently forces edit mode open.
   */
  searchParams?: { edit?: string };
}

/**
 * Data-driven per rule 48 — the title/description describe the actual
 * project, never a hardcoded string repeated for every id. Falls back to
 * the generic "Project" only when the fetch itself hasn't resolved to a
 * real name yet (not-found / error), never `undefined` (rule 49).
 * `noIndex: true` throughout — this is private Admin Portal UI, not
 * public content (Frontend_Development_Rules.txt rule 18).
 */
export async function generateMetadata({
  params,
}: ProjectDetailPageProps): Promise<Metadata> {
  const result = await getAdminProjectDetail(params.id);
  const name = result.status === "ok" ? result.data.name : "Project";

  return buildMetadata({
    title: name,
    description: `Manage the ${name} DevTunnel project — repository, README, contributors, tasks and GitHub issues.`,
    path: `/admin/projects/${params.id}`,
    noIndex: true,
  });
}

/**
 * `/admin/projects/:id` — Admin Portal Master Coding Specification,
 * section 18 ("Project Detail Page" — "the central project management
 * page") / A9 in the final page list (section 29).
 *
 * Fetches `GET /admin/projects/:id` (section 22 — Admin Backend API Map)
 * server-side and renders exactly the fields the spec calls for on this
 * view: project name, GitHub repository, README, DevTunnel contributors,
 * GitHub contributors (kept as two separate numbers — section 5: "Do not
 * mix the two datasets"), open GitHub issue count, and DevTunnel task
 * count. That endpoint isn't built on the backend yet (see
 * `lib/admin/projects/api.ts`), so — same convention as the Projects list
 * and Admin Dashboard — a failed fetch degrades to one honest
 * `SectionMessage`, and an unknown id renders Next's real 404 via
 * `notFound()` rather than a fabricated "empty project" page
 * (Frontend_Development_Rules.txt rule 25).
 *
 * The README is rendered GitHub-style via `MarkdownReadme` (headings,
 * lists, tables, checkboxes, code blocks laid out, not raw `.md` text),
 * same as the Project Onboarding Description and Preview steps
 * (`description-step.tsx`, `preview-step.tsx`) — it parses to React
 * elements rather than going through `dangerouslySetInnerHTML`
 * (rule 20).
 *
 * Actions here replace "Sync GitHub" (section 18's original action list)
 * with "Delete project" in red, per product direction — see
 * `DeleteProjectButton`. Task management still routes back to
 * `/admin/projects` for now, since `/admin/projects/:id/tasks` isn't
 * built yet. Editing is handled inline on this page — see
 * `EditProjectDetailsPanel` — rather than a separate `/edit` route,
 * since the only mutation the spec defines is a flat
 * `PATCH /admin/projects/:id`, not a distinct edit page/flow.
 */
export default async function AdminProjectDetailPage({
  params,
  searchParams,
}: ProjectDetailPageProps) {
  const result = await getAdminProjectDetail(params.id);
  const startInEditMode = searchParams?.edit === "1";

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
          <Link href="/admin/projects" className="hover:text-accent">
            Projects
          </Link>
          {" / "}
          <span className="text-text-muted">Project</span>
        </nav>
        <h1 className="m-0 mb-4 text-xl font-medium text-text">Project</h1>
        <SectionMessage>
          This project isn&apos;t available right now — check back soon.
        </SectionMessage>
      </main>
    );
  }

  const project = result.data;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
        <Link href="/admin/projects" className="hover:text-accent">
          Projects
        </Link>
        {" / "}
        <span className="text-text-muted">{project.name}</span>
      </nav>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1.5 text-xl font-medium text-text">{project.name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-text-secondary">
            <a
              href={project.repositoryUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 font-mono hover:text-accent"
            >
              <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
              {project.repositoryFullName}
            </a>
            <span aria-hidden="true" className="text-text-faint">
              ·
            </span>
            <span>@{project.author.username}</span>
            <span aria-hidden="true" className="text-text-faint">
              ·
            </span>
            <AdminProjectStatusBadge status={project.status} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={project.repositoryUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
          >
            View on GitHub
          </a>
          <Link
            href={`/admin/projects/${project.id}?edit=1`}
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
          >
            <EditIcon className="h-3.5 w-3.5 shrink-0" />
            Edit details
          </Link>
          <ProjectStatusToggle
            projectId={project.id}
            projectName={project.name}
            status={project.status}
          />
          <DeleteProjectButton
            projectId={project.id}
            projectName={project.name}
            variant="button"
            redirectTo="/admin/projects"
          />
        </div>
      </div>

      <section aria-labelledby="project-stats-heading" className="mb-8">
        <h2
          id="project-stats-heading"
          className="mb-2.5 text-[12.5px] font-normal text-text-muted"
        >
          Contributors, tasks &amp; issues
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AdminStatCard
            label="DevTunnel contributors"
            value={project.devTunnelContributorCount}
          />
          <AdminStatCard label="GitHub contributors" value={project.githubContributorCount} />
          <AdminStatCard label="DevTunnel tasks" value={project.taskCount} />
          <AdminStatCard label="Open GitHub issues" value={project.openIssuesCount} />
        </div>
      </section>

      <EditProjectDetailsPanel project={project} startInEditMode={startInEditMode} />

      <section
        aria-labelledby="project-readme-heading"
        className="rounded-[10px] border border-border bg-surface p-5"
      >
        <h2
          id="project-readme-heading"
          className="m-0 mb-2 text-[11px] uppercase tracking-wide text-text-faint"
        >
          README
        </h2>
        <div className="max-h-[420px] overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-4">
          {project.readme ? (
            <MarkdownReadme content={project.readme} />
          ) : (
            <p className="m-0 text-[12px] text-text-faint">No README found.</p>
          )}
        </div>
      </section>
    </main>
  );
}
