import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { AiConfirmationQueue, AiDiscoveredProject, AiDiscoveredTask, AiDiscoveredTool, AiDiscoveryCounters } from "./types";

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
 * `GET /admin/ai/status` — today's discovery quota counters
 * (devtunnel-backend/src/routes/admin/ai.ts). No frontend caller existed
 * for this endpoint before; it backs `AiDiscoveryStatusPanel` so an admin
 * can see how much of today's quota is used before triggering a manual
 * run. A single object, not a list, so this doesn't reuse `fetchList`'s
 * empty/non-empty distinction — only "ok" or "error".
 */
export async function getAiDiscoveryStatus(): Promise<{ status: "ok"; data: AiDiscoveryCounters } | { status: "error" }> {
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