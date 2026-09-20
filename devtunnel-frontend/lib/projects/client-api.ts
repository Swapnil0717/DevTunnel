// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as
// `lib/github-projects/client-api.ts`. Kept out of `./api.ts`, which
// reads request cookies via `next/headers` and can only ever run in a
// Server Component.
import { API_BASE_URL } from "@/lib/config";

export class DevtunnelProjectsApiError extends Error {
  status: number;
  /**
   * The backend's own `error.code` (devtunnel-backend `lib/response.ts`).
   * `ProjectStarButton` branches on `"github_reauth_required"`
   * specifically, same as `StarButton`
   * (`components/github-projects/star-button.tsx`) and
   * `ContributionCalendar` already do for that code.
   */
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "DevtunnelProjectsApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseErrorBody(res: Response): Promise<{ code?: string; message?: string }> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return { code: body.error?.code, message: body.error?.message };
  } catch {
    return {};
  }
}

export interface ProjectStarStatus {
  starredByViewer: boolean;
  localStarCount: number;
}

/**
 * `PUT /projects/:slug/star` — the View Project page's Star action.
 *
 * Mirrors the confirmed `PUT /github-projects/:slug/star` contract
 * (devtunnel-backend src/routes/githubProjects.ts): stars the repository
 * on the contributor's own real GitHub account, then records DevTunnel's
 * local star, so a successful call means both actually happened. Can
 * reject with `code: "github_reauth_required"` (403) when the
 * contributor has no live GitHub connection.
 *
 * TODO: confirm this route exists for onboarded DevTunnel projects too,
 * rather than only for the GitHub catalog.
 */
export async function starDevtunnelProject(slug: string): Promise<ProjectStarStatus> {
  const res = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(slug)}/star`, {
    method: "PUT",
    credentials: "include",
  });

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new DevtunnelProjectsApiError(
      message ?? `Failed to star project (${res.status})`,
      res.status,
      code,
    );
  }

  return (await res.json()) as ProjectStarStatus;
}

/** See `starDevtunnelProject` above — same contract, in reverse. */
export async function unstarDevtunnelProject(slug: string): Promise<ProjectStarStatus> {
  const res = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(slug)}/star`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new DevtunnelProjectsApiError(
      message ?? `Failed to unstar project (${res.status})`,
      res.status,
      code,
    );
  }

  return (await res.json()) as ProjectStarStatus;
}

/**
 * `POST /projects/:slug/contribute` — the View Project page's primary
 * action ("Contribute to this project", `ContributeButton`).
 *
 * This joins the contributor to the project on DevTunnel's side: it
 * records them as an active contributor so the project shows up under
 * their active work, and unlocks the project's tasks for them to pick
 * up. It deliberately does **not** fork the repository, open a pull
 * request, or assign a task — picking a specific task is its own
 * decision the contributor makes from the Tasks tab, and nothing here
 * should touch the upstream repository on their behalf
 * (admin_workflow.txt section 10: "do not modify the original GitHub
 * issue" applies to the repository side generally).
 *
 * TODO: confirm the real path and response shape with backend.
 */
export interface ProjectContributionStatus {
  /** Whether the viewer is now recorded as contributing to this project. */
  contributing: boolean;
  /** Updated DevTunnel contributor count, so the sidebar can stay accurate without a reload. */
  devTunnelContributorCount: number;
}

export async function joinDevtunnelProject(
  slug: string,
): Promise<ProjectContributionStatus> {
  const res = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(slug)}/contribute`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new DevtunnelProjectsApiError(
      message ?? `Failed to join project (${res.status})`,
      res.status,
      code,
    );
  }

  return (await res.json()) as ProjectContributionStatus;
}