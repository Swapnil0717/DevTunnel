// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as
// `lib/github-projects/client-api.ts`. Kept out of `./api.ts`, which
// reads request cookies via `next/headers` and can only ever run in a
// Server Component.
import { API_BASE_URL } from "@/lib/config";

export class GithubOpenSourceToolsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GithubOpenSourceToolsApiError";
    this.status = status;
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
