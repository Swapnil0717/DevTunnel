import { API_BASE_URL } from "@/lib/config";
import type { AiDiscoveryRunSummary } from "./types";

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