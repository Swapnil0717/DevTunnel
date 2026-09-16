// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as `lib/auth/api.ts` and
// `lib/admin/projects/client-api.ts`. Kept out of `./api.ts`, which reads
// request cookies via `next/headers` and can only ever run in a Server
// Component.
import { API_BASE_URL } from "@/lib/config";

export class GithubProjectsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GithubProjectsApiError";
    this.status = status;
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