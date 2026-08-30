import { API_URL } from "./constants";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

/**
 * Thin fetch wrapper for the DevTunnel backend (Module C1 — Authentication).
 *
 * `credentials: "include"` is required on every call: the backend issues an
 * httpOnly session cookie on login, and this is how the browser sends it
 * back. No token is ever read, stored, or handled here in JS — that would
 * expose it to any XSS on the page, which is exactly what the httpOnly
 * cookie is meant to prevent.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : null) ?? `Request to ${path} failed with status ${response.status}`;
    const code =
      payload && typeof payload === "object" && "code" in payload
        ? String((payload as { code?: unknown }).code)
        : undefined;
    throw new ApiError(message, response.status, code);
  }

  return payload as T;
}
