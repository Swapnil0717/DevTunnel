import { API_BASE_URL } from "@/lib/config";
import type { AiDiscoveryRunSummary, GeminiQuotaSnapshot } from "./types";

export class AiDiscoveryApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AiDiscoveryApiError";
    this.status = status;
  }
}

type Kind = "projects" | "tools" | "tasks";

export async function approveAiDiscoveredItem(kind: Kind, id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/ai/${kind}/${id}/approve`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new AiDiscoveryApiError(`Failed to approve (${res.status})`, res.status);
}

export async function rejectAiDiscoveredItem(kind: Kind, id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/ai/${kind}/${id}/reject`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new AiDiscoveryApiError(`Failed to reject (${res.status})`, res.status);
}

/**
 * `POST /admin/ai/run` — same work the daily cron does
 * (devtunnel-backend/src/index.ts `scheduled`), useful for testing or
 * topping up today's quota without waiting for the cron. Safe to call
 * repeatedly — the backend's daily counters mean it only ever fills
 * whatever's left of today's quota.
 */
export async function triggerAiDiscoveryRun(): Promise<AiDiscoveryRunSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/ai/run`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new AiDiscoveryApiError(`Failed to trigger run (${res.status})`, res.status);
  return res.json();
}

/**
 * `POST /admin/ai/projects/run` — same idea as triggerAiDiscoveryRun,
 * scoped to only the project-discovery phase. Backs the "Add AI
 * projects" button on the AI Added Projects admin page.
 */
export async function triggerAiProjectDiscoveryRun(): Promise<AiDiscoveryRunSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/ai/projects/run`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new AiDiscoveryApiError(`Failed to trigger run (${res.status})`, res.status);
  return res.json();
}

/**
 * `POST /admin/ai/tools/run` — same idea as triggerAiDiscoveryRun,
 * scoped to only the tool-discovery phase. Backs the "Add AI tools"
 * button on the AI Added Tools admin page.
 */
export async function triggerAiToolDiscoveryRun(): Promise<AiDiscoveryRunSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/ai/tools/run`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new AiDiscoveryApiError(`Failed to trigger run (${res.status})`, res.status);
  return res.json();
}

/**
 * `POST /admin/ai/tasks/run` — same idea as triggerAiDiscoveryRun,
 * scoped to only the task-discovery phase (walks every onboarded
 * project's open issues one by one). Backs the "Add AI tasks" button
 * on the AI Added Tasks admin page.
 */
export async function triggerAiTaskDiscoveryRun(): Promise<AiDiscoveryRunSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/ai/tasks/run`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new AiDiscoveryApiError(`Failed to trigger run (${res.status})`, res.status);
  return res.json();
}

/**
 * `GET /admin/ai/gemini-quota` — how much of the shared Gemini request
 * budget is left this minute and today. Read-only, never reserves or
 * spends budget, so it's safe to call on mount and after every run.
 * Backs `GeminiQuotaPanel`.
 */
export async function getGeminiQuota(): Promise<GeminiQuotaSnapshot> {
  const res = await fetch(`${API_BASE_URL}/admin/ai/gemini-quota`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new AiDiscoveryApiError(`Failed to load Gemini quota (${res.status})`, res.status);
  return res.json();
}