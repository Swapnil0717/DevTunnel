// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import type {
  ProjectSummary,
  RecentActivity,
  RecommendedTask,
  MyTask,
} from "./types";

/**
 * Every Home section reads from a real devtunnel-backend route:
 * - GET /projects/available            → "Recommended for you" (projects)
 * - GET /users/me/recommended-tasks    → "Recommended tasks" — open tasks that
 *   fit the contributor's onboarding profile (roles, level, technologies,
 *   skills)
 * - GET /users/me/tasks                → "Your tasks"
 * - GET /users/me/activity             → "Recently active" — what the
 *   contributor recently started, submitted or finished
 *
 * Two of these — "Recommended tasks" and "Recently active" — used to call
 * placeholder paths (`/contributor/tasks?type=recommended`,
 * `/contributor/active-projects`) that were never built, so both sections
 * always showed their "not available yet" message.
 *
 * fetchFromApi() still catches a failed request (network error, 4xx/5xx) and
 * returns a status instead of throwing, so one failing endpoint degrades to a
 * message in its own section rather than a blank page.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type FetchResult<T> =
  | { status: "ok"; data: T }
  | { status: "empty" }
  | { status: "error" };

async function fetchFromApi<T>(path: string): Promise<FetchResult<T>> {
  try {
    const cookieStore = await cookies();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Cookie: cookieStore.toString() },
      cache: "no-store",
    });

    if (!response.ok) {
      return { status: "error" };
    }

    const data = (await response.json()) as T;

    if (Array.isArray(data) && data.length === 0) {
      return { status: "empty" };
    }

    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}

export function getRecommendedProjects() {
  return fetchFromApi<ProjectSummary[]>("/projects/available");
}

/** Open tasks that fit the signed-in contributor's profile, best fit first. */
export function getRecommendedTasks() {
  return fetchFromApi<RecommendedTask[]>("/users/me/recommended-tasks");
}

/** The signed-in contributor's own recent activity, newest first. */
export function getRecentActivity() {
  return fetchFromApi<RecentActivity[]>("/users/me/activity?limit=5");
}

export function getMyTasks() {
  return fetchFromApi<MyTask[]>("/users/me/tasks");
}