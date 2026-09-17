import { getApiBaseUrl } from "./config";

export class ApiError extends Error {
  status: number;
  code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; requestId?: string };
}

/**
 * POSTs JSON to `${apiBaseUrl}${path}` and parses the JSON response.
 * Mirrors devtunnel-backend's error envelope (`src/lib/response.ts`) so a
 * failure surfaces the same `message` a browser client would see, instead
 * of a raw HTTP status.
 */
export async function apiPost<T>(
  path: string,
  body: unknown,
  options: { token?: string } = {},
): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (err) {
    throw new ApiError(0, `Could not reach ${getApiBaseUrl()} — is the API reachable? (${String(err)})`);
  }

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // Non-JSON body (e.g. a plain 5xx from an edge/proxy) — fall through
    // to the generic status-based message below.
  }

  if (!res.ok) {
    const envelope = parsed as ErrorEnvelope | null;
    const message = envelope?.error?.message ?? `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, envelope?.error?.code);
  }

  return parsed as T;
}