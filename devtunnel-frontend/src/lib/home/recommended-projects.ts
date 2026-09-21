import type { ProjectSummary } from "./types";

/**
 * How many projects Home's "Recommended for you" row shows. The design is a
 * three-card preview with a "See all" link into `/projects` — not the whole
 * catalog.
 */
export const HOME_RECOMMENDED_PROJECT_LIMIT = 3;

/**
 * `GET /projects/available` returns *every* active project (up to 500),
 * newest first; the per-project `matchPercent` is only present when the
 * contributor has an onboarding profile to score against. For a section
 * titled "Recommended for you", that means: best match first, then cut to the
 * preview size.
 *
 * Projects without a `matchPercent` sort after every scored one and keep the
 * API's newest-first order among themselves (`Array.prototype.sort` is
 * stable). Nothing is invented — this only reorders and trims data the API
 * already sent.
 */
export function pickRecommendedProjects(
  projects: ProjectSummary[],
  limit: number = HOME_RECOMMENDED_PROJECT_LIMIT,
): ProjectSummary[] {
  return [...projects]
    .sort((a, b) => (b.matchPercent ?? -1) - (a.matchPercent ?? -1))
    .slice(0, limit);
}
