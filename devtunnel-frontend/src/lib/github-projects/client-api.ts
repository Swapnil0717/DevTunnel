// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as `lib/auth/api.ts` and
// `lib/admin/projects/client-api.ts`. Kept out of `./api.ts`, which reads
// request cookies via `next/headers` and can only ever run in a Server
// Component.
import { API_BASE_URL } from "@/lib/config";

export class GithubProjectsApiError extends Error {
  status: number;
  /**
   * The backend's own `error.code` (see devtunnel-backend
   * `lib/response.ts`'s `errorResponse` envelope), when the response
   * body parsed as JSON. `StarButton` branches on
   * `"github_reauth_required"` specifically — same convention
   * `ProfileApiError` (`lib/profile/api.ts`) already establishes for
   * `ContributionCalendar`'s own GitHub-reconnect prompt.
   */
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "GithubProjectsApiError";
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
 * `POST /github-projects/:slug/request-onboarding` — the Project Detail
 * page's "Nominate for DevTunnel" action (`RequestOnboardingButton`).
 *
 * This never onboards the repository itself — onboarding a project onto
 * DevTunnel is still the multi-step Admin flow
 * (`lib/admin/project-onboarding`), which needs a human to pick roles,
 * difficulty, and tech-stack categorization no automated call could
 * responsibly guess. What this does is put the repository in front of an
 * Admin as a candidate worth running that flow on — same "flag it for a
 * human, don't try to do the human's job" posture
 * Frontend_Development_Rules.txt rule 58 already asks for anywhere data
 * would otherwise have to be invented.
 *
 * Not yet confirmed against a live backend route — same documented-
 * assumption convention `getGithubProjectBySlug` (`./api.ts`) follows —
 * TODO: confirm the real path and response shape with backend once this
 * endpoint ships. Backend is free to de-duplicate repeat nominations for
 * the same repository however it likes; this call only ever reports
 * whatever it's told.
 */
export async function requestGithubProjectOnboarding(slug: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/github-projects/${encodeURIComponent(slug)}/request-onboarding`,
    {
      method: "POST",
      credentials: "include",
    },
  );

  if (!res.ok) {
    throw new GithubProjectsApiError(
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
 * `PUT /github-projects/:slug/star` — the Project Detail page's "Star"
 * button (`StarButton`, `components/github-projects/star-button.tsx`).
 * Confirmed against the backend (src/routes/githubProjects.ts): stars
 * the repository on the contributor's own real GitHub account first,
 * then records DevTunnel's own local star, so a successful call here
 * means both actually happened.
 *
 * Can reject with `GithubProjectsApiError` whose `code` is
 * `"github_reauth_required"` (status `403`) when the contributor has no
 * live GitHub connection — `StarButton` shows a "Reconnect GitHub"
 * prompt for that case specifically, same as
 * `ContributionCalendar`'s own reauth handling.
 */
export async function starGithubProject(slug: string): Promise<GithubStarStatus> {
  const res = await fetch(`${API_BASE_URL}/github-projects/${encodeURIComponent(slug)}/star`, {
    method: "PUT",
    credentials: "include",
  });

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new GithubProjectsApiError(message ?? `Failed to star project (${res.status})`, res.status, code);
  }

  return (await res.json()) as GithubStarStatus;
}

/** See `starGithubProject` above — same contract, in reverse. */
export async function unstarGithubProject(slug: string): Promise<GithubStarStatus> {
  const res = await fetch(`${API_BASE_URL}/github-projects/${encodeURIComponent(slug)}/star`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new GithubProjectsApiError(
      message ?? `Failed to unstar project (${res.status})`,
      res.status,
      code,
    );
  }

  return (await res.json()) as GithubStarStatus;
}