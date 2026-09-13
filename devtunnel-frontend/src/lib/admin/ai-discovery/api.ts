import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type {
  AiConfirmationQueue,
  AiDiscoveredProject,
  AiDiscoveredTask,
  AiDiscoveredTool,
  AiDiscoveryCounters,
} from "./types";

type Result<T> = { status: "ok"; data: T } | { status: "empty" } | { status: "error" };

async function fetchList<T>(path: string): Promise<Result<T[]>> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { cookie: cookies().toString() },
      cache: "no-store",
    });
    if (!res.ok) return { status: "error" };
    const data = (await res.json()) as T[];
    if (Array.isArray(data) && data.length === 0) return { status: "empty" };
    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}

export function getAiDiscoveredProjects(status = "PENDING") {
  return fetchList<AiDiscoveredProject>(`/admin/ai/projects?status=${status}`);
}

export function getAiDiscoveredTools(status = "PENDING") {
  return fetchList<AiDiscoveredTool>(`/admin/ai/tools?status=${status}`);
}

export function getAiDiscoveredTasks(status = "PENDING") {
  return fetchList<AiDiscoveredTask>(`/admin/ai/tasks?status=${status}`);
}

export async function getAiConfirmationQueue(): Promise<Result<AiConfirmationQueue>> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/ai/confirmation`, {
      headers: { cookie: cookies().toString() },
      cache: "no-store",
    });
    if (!res.ok) return { status: "error" };
    const data = (await res.json()) as AiConfirmationQueue;
    if (!data.projects.length && !data.tools.length && !data.tasks.length) return { status: "empty" };
    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}

/**
 * `GET /admin/ai/status` (devtunnel-backend `src/routes/admin/ai.ts` —
 * `getTodayCounters`, src/db/aiDiscovery.ts). Today's UTC discovery
 * counters: how many beginner/intermediate/advanced projects, tools
 * (plus which tool categories), and tasks have already been proposed
 * today, and how much of each daily quota remains. Always a single
 * object (never an empty list) — an all-zero row for "nothing proposed
 * yet today" is a real, meaningful result on its own, so this has no
 * "empty" status the way the list fetchers above do.
 */
export async function getAiDiscoveryStatus(): Promise<
  { status: "ok"; data: AiDiscoveryCounters } | { status: "error" }
> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/ai/status`, {
      headers: { cookie: cookies().toString() },
      cache: "no-store",
    });
    if (!res.ok) return { status: "error" };
    const data = (await res.json()) as AiDiscoveryCounters;
    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}