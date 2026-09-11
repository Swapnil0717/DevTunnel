import { API_BASE_URL } from "@/lib/config";

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

export async function triggerAiDiscoveryRun(): Promise<{ projectsProposed: number; toolsProposed: number; tasksProposed: number }> {
  const res = await fetch(`${API_BASE_URL}/admin/ai/run`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new AiDiscoveryApiError(`Failed to trigger run (${res.status})`, res.status);
  return res.json();
}