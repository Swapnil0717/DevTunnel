// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as
// `lib/github-projects/client-api.ts`. Kept out of `./api.ts`, which
// reads request cookies via `next/headers` and can only ever run in a
// Server Component.
import { API_BASE_URL } from "@/lib/config";

export class GithubOpenSourceToolsApiError extends Error {
  status: number;
  /**
   * The backend's own `error.code` — see
   * `lib/github-projects/client-api.ts`'s `GithubProjectsApiError.code`
   * doc comment for the full reasoning; `StarButton` here branches on
   * it the same way.
   */
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "GithubOpenSourceToolsApiError";
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

/**
 * `POST /github-open-source-tools/:slug/request-onboarding` — the Tool
 * Detail page's "Request to add as a DevTunnel project/tool" action
 * (`RequestToolOnboardingButton`).
 *
 * Sibling of `requestGithubProjectOnboarding`
 * (`lib/github-projects/client-api.ts`) and same posture: this never
 * onboards the repository itself — onboarding a project or tool onto
 * DevTunnel is still the multi-step Admin flow
 * (`lib/admin/project-onboarding` / `lib/admin/opensource-tool-onboarding`),
 * which needs a human to pick roles, difficulty, and categorization no
 * automated call could responsibly guess. What this does is put the
 * repository in front of an Admin as a candidate worth running that flow
 * on, whichever shape (DevTunnel Project or Open Source Tool) the Admin
 * decides fits best — flag it for a human, don't try to do the human's
 * job.
 *
 * Not yet confirmed against a live backend route — same documented-
 * assumption convention `requestGithubProjectOnboarding` follows — TODO:
 * confirm the real path and response shape with backend once this
 * endpoint ships. Backend is free to de-duplicate repeat nominations for
 * the same repository however it likes; this call only ever reports
 * whatever it's told.
 */
export async function requestGithubToolOnboarding(slug: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/github-open-source-tools/${encodeURIComponent(slug)}/request-onboarding`,
    {
      method: "POST",
      credentials: "include",
    },
  );

  if (!res.ok) {
    throw new GithubOpenSourceToolsApiError(
      `Failed to request onboarding (${res.status})`,
      res.status,
    );
  }
}

export interface GithubStarStatus {
  starredByViewer: boolean;
  localStarCount: number;
}

/**
 * `PUT /github-open-source-tools/:slug/star` — the Tool Detail page's
 * "Star" button (`StarButton`,
 * `components/github-open-source-tools/star-button.tsx`). Sibling of
 * `starGithubProject` (`lib/github-projects/client-api.ts`) — identical
 * contract, pointed at this catalog's own route
 * (src/routes/githubOpenSourceTools.ts): stars the repository on the
 * contributor's real GitHub account first, then records DevTunnel's own
 * local star.
 *
 * Can reject with `GithubOpenSourceToolsApiError` whose `code` is
 * `"github_reauth_required"` (status `403`) when the contributor has no
 * live GitHub connection.
 */
export async function starGithubTool(slug: string): Promise<GithubStarStatus> {
  const res = await fetch(
    `${API_BASE_URL}/github-open-source-tools/${encodeURIComponent(slug)}/star`,
    {
      method: "PUT",
      credentials: "include",
    },
  );

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new GithubOpenSourceToolsApiError(
      message ?? `Failed to star tool (${res.status})`,
      res.status,
      code,
    );
  }

  return (await res.json()) as GithubStarStatus;
}

/** See `starGithubTool` above — same contract, in reverse. */
export async function unstarGithubTool(slug: string): Promise<GithubStarStatus> {
  const res = await fetch(
    `${API_BASE_URL}/github-open-source-tools/${encodeURIComponent(slug)}/star`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new GithubOpenSourceToolsApiError(
      message ?? `Failed to unstar tool (${res.status})`,
      res.status,
      code,
    );
  }

  return (await res.json()) as GithubStarStatus;
}
