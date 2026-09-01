// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import type {
  ProjectSummary,
  ActiveProjectSummary,
  RecommendedTask,
  MyTask,
} from "./types";

/**
 * None of these endpoints are built on the backend yet.
 * - GET /projects/available and GET /contributor/tasks are the ones
 *   actually spec'd in docs/devtunnel-workflow.md (Module 3) / the
 *   confirmed auth routes.
 * - GET /contributor/active-projects below is NOT confirmed anywhere —
 *   there's no spec'd endpoint for "recently active projects" yet.
 *   Treat that path as a placeholder and get it confirmed with backend
 *   before relying on it.
 *
 * Every call is expected to fail (network error / 404) until the
 * backend work lands. fetchFromApi() catches that and returns a
 * status instead of throwing, so a missing endpoint degrades to an
 * "error" message in one section rather than a blank page.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type FetchResult<T> =
  | { status: "ok"; data: T }
  | { status: "empty" }
  | { status: "error" };

async function fetchFromApi<T>(path: string): Promise<FetchResult<T>> {
  try {
    const cookieStore = cookies();
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

export function getActiveProjects() {
  // TODO: confirm the real path — placeholder, see note above.
  return fetchFromApi<ActiveProjectSummary[]>("/contributor/active-projects");
}

export function getRecommendedTasks() {
  // TODO: confirm this query contract against GET /contributor/tasks.
  return fetchFromApi<RecommendedTask[]>("/contributor/tasks?type=recommended");
}

export function getMyTasks() {
  return fetchFromApi<MyTask[]>("/contributor/tasks?assignedToMe=true");
}