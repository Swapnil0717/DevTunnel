// devtunnel-frontend/src/lib/admin/ai-discovery/client-api.ts
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

/**
 * One parsed Server-Sent Event out of a discovery run's stream. `event`
 * is the SSE event name ("step" | "done" | "error") and `data` is that
 * event's already-JSON-parsed payload.
 */
interface ParsedSseEvent {
  event: string;
  data: unknown;
}

/**
 * Minimal SSE parser over a `fetch` response body — used instead of the
 * browser's `EventSource` because `EventSource` only supports GET
 * requests, and these discovery runs are triggered with POST (they mutate
 * state and are protected by the same cookie-authenticated, CSRF-safe
 * POST endpoints as every other admin write here). Handles events split
 * across chunk boundaries by buffering until a full `\n\n`-terminated
 * event is available.
 */
async function* readSseEvents(res: Response): AsyncGenerator<ParsedSseEvent> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length === 0) continue;

        try {
          yield { event: eventName, data: JSON.parse(dataLines.join("\n")) };
        } catch {
          // A malformed data line is dropped rather than crashing the
          // whole run — the caller still gets every well-formed event.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export interface AiDiscoveryRunStreamHandlers {
  /** Called once per progress step, in order, as the run happens. */
  onStep?: (message: string) => void;
}

/**
 * Shared driver behind triggerAi{Project,Tool,Task}DiscoveryRun below:
 * POSTs to `path`, reads the `text/event-stream` response as it arrives,
 * forwards every "step" event to `handlers.onStep` live, and resolves
 * with the run's final summary once the "done" event arrives (or rejects
 * on an "error" event / network failure).
 */
async function triggerStreamingDiscoveryRun(path: string, handlers: AiDiscoveryRunStreamHandlers): Promise<AiDiscoveryRunSummary> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "text/event-stream" },
  });
  if (!res.ok) throw new AiDiscoveryApiError(`Failed to trigger run (${res.status})`, res.status);

  let summary: AiDiscoveryRunSummary | null = null;
  let errorMessage: string | null = null;

  for await (const { event, data } of readSseEvents(res)) {
    if (event === "step") {
      handlers.onStep?.((data as { message: string }).message);
    } else if (event === "done") {
      summary = data as AiDiscoveryRunSummary;
    } else if (event === "error") {
      errorMessage = (data as { message: string }).message;
    }
  }

  if (errorMessage) throw new AiDiscoveryApiError(errorMessage, 500);
  if (!summary) throw new AiDiscoveryApiError("Run ended without a result", 500);
  return summary;
}

/**
 * Triggers exactly one project-discovery pass (the backend caps it to
 * one proposed project per call — see aiDiscoveryAgent.ts's
 * `runProjectDiscoveryOnly`). `handlers.onStep` fires live as each step
 * (searching GitHub, reading a README, saving the record, …) happens.
 */
export function triggerAiProjectDiscoveryRun(handlers: AiDiscoveryRunStreamHandlers = {}): Promise<AiDiscoveryRunSummary> {
  return triggerStreamingDiscoveryRun("/admin/ai/projects/run", handlers);
}

/** Same as triggerAiProjectDiscoveryRun, for exactly one tool. */
export function triggerAiToolDiscoveryRun(handlers: AiDiscoveryRunStreamHandlers = {}): Promise<AiDiscoveryRunSummary> {
  return triggerStreamingDiscoveryRun("/admin/ai/tools/run", handlers);
}

/** Same as triggerAiProjectDiscoveryRun, for exactly one issue/task. */
export function triggerAiTaskDiscoveryRun(handlers: AiDiscoveryRunStreamHandlers = {}): Promise<AiDiscoveryRunSummary> {
  return triggerStreamingDiscoveryRun("/admin/ai/tasks/run", handlers);
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