import { API_BASE_URL } from "@/lib/config";
import type { AiDiscoveryRunSummary, GroqQuotaSnapshot } from "./types";

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

export async function triggerAiDiscoveryRun(): Promise<AiDiscoveryRunSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/ai/run`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new AiDiscoveryApiError(`Failed to trigger run (${res.status})`, res.status);
  return res.json();
}

export async function triggerAiProjectDiscoveryRun(): Promise<AiDiscoveryRunSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/ai/projects/run`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new AiDiscoveryApiError(`Failed to trigger run (${res.status})`, res.status);
  return res.json();
}

export async function triggerAiToolDiscoveryRun(): Promise<AiDiscoveryRunSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/ai/tools/run`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new AiDiscoveryApiError(`Failed to trigger run (${res.status})`, res.status);
  return res.json();
}

export async function triggerAiTaskDiscoveryRun(): Promise<AiDiscoveryRunSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/ai/tasks/run`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new AiDiscoveryApiError(`Failed to trigger run (${res.status})`, res.status);
  return res.json();
}

/**
 * `GET /admin/ai/groq-quota` — how much of the shared Groq request/token
 * budget is left this minute and today.
 */
export async function getGroqQuota(): Promise<GroqQuotaSnapshot> {
  const res = await fetch(`${API_BASE_URL}/admin/ai/groq-quota`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new AiDiscoveryApiError(`Failed to load Groq quota (${res.status})`, res.status);
  return res.json();
}