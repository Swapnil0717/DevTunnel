// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as
// `lib/github-open-source-tools/client-api.ts`. Kept out of `./api.ts`,
// which reads request cookies via `next/headers` and can only ever run in
// a Server Component.
import { API_BASE_URL } from "@/lib/config";

export class OpenSourceToolsApiError extends Error {
  status: number;
  /**
   * The backend's own `error.code` (devtunnel-backend `lib/response.ts`).
   * `ToolStarButton` branches on `"github_reauth_required"`, same as the
   * GitHub-catalog star buttons and `ContributionCalendar` already do.
   */
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "OpenSourceToolsApiError";
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

export interface ToolStarStatus {
  starredByViewer: boolean;
  localStarCount: number;
}

/**
 * `PUT /opensource-tools/:slug/star` — the Tool Detail page's Star
 * action.
 *
 * Mirrors the confirmed `PUT /github-open-source-tools/:slug/star`
 * contract (devtunnel-backend src/routes/githubOpenSourceTools.ts):
 * stars the repository on the contributor's own real GitHub account,
 * then records DevTunnel's local star. Can reject with
 * `code: "github_reauth_required"` (403) when the contributor has no
 * live GitHub connection.
 *
 * A tool whose `sourceUrl` isn't a GitHub repository has nothing to star
 * upstream — `ToolStarButton` isn't rendered at all in that case, so
 * this is never called for one.
 *
 * TODO: confirm this route exists for DevTunnel-curated tools too,
 * rather than only for the GitHub catalog.
 */
export async function starOpenSourceTool(slug: string): Promise<ToolStarStatus> {
  const res = await fetch(`${API_BASE_URL}/opensource-tools/${encodeURIComponent(slug)}/star`, {
    method: "PUT",
    credentials: "include",
  });

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new OpenSourceToolsApiError(
      message ?? `Failed to star tool (${res.status})`,
      res.status,
      code,
    );
  }

  return (await res.json()) as ToolStarStatus;
}

/** See `starOpenSourceTool` above — same contract, in reverse. */
export async function unstarOpenSourceTool(slug: string): Promise<ToolStarStatus> {
  const res = await fetch(`${API_BASE_URL}/opensource-tools/${encodeURIComponent(slug)}/star`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new OpenSourceToolsApiError(
      message ?? `Failed to unstar tool (${res.status})`,
      res.status,
      code,
    );
  }

  return (await res.json()) as ToolStarStatus;
}

export interface ToolContributionStatus {
  /** Whether the viewer is now recorded as wanting to contribute to this tool. */
  contributing: boolean;
}

/**
 * `POST /opensource-tools/:slug/contribute` — the Tool Detail page's
 * primary action.
 *
 * Deliberately weaker than the project equivalent
 * (`joinDevtunnelProject`, `lib/projects/client-api.ts`), because a tool
 * genuinely is a weaker thing to join: DevTunnel curates tools for
 * contributors to *use*, and has no tasks, roles, or contributor
 * tracking on them the way it does on an onboarded project
 * (`devtunnel.tasks` hangs off a project, not a tool — sql/017). So this
 * records interest and nothing more; the actual work still happens in
 * the tool's own repository, which is why the button's success copy
 * sends the contributor to the repository's contributing guide rather
 * than to a DevTunnel task list that doesn't exist for tools.
 *
 * TODO: confirm the real path and response shape with backend — and
 * confirm with product whether "contribute" on a tool should record
 * anything at all, or just be a signposted link out.
 */
export async function joinOpenSourceTool(slug: string): Promise<ToolContributionStatus> {
  const res = await fetch(
    `${API_BASE_URL}/opensource-tools/${encodeURIComponent(slug)}/contribute`,
    {
      method: "POST",
      credentials: "include",
    },
  );

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new OpenSourceToolsApiError(
      message ?? `Failed to register interest (${res.status})`,
      res.status,
      code,
    );
  }

  return (await res.json()) as ToolContributionStatus;
}