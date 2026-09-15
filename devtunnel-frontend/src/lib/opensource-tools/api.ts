// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import type { OpenSourceToolSummary } from "./types";

/**
 * `GET /opensource-tools/available` is NOT a confirmed backend route —
 * see `types.ts`'s doc comment. Same "expected to fail until the backend
 * work lands, degrade to an honest status instead of throwing" shape
 * `lib/home/api.ts`'s `fetchFromApi` already uses; duplicated here
 * (rather than imported) since that helper is scoped to the home-page
 * module and this is a different catalog with its own doc trail.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type FetchResult<T> =
  | { status: "ok"; data: T }
  | { status: "empty" }
  | { status: "error" };

export async function getOpenSourceTools(): Promise<FetchResult<OpenSourceToolSummary[]>> {
  try {
    const cookieStore = cookies();
    const response = await fetch(`${API_BASE_URL}/opensource-tools/available`, {
      headers: { Cookie: cookieStore.toString() },
      cache: "no-store",
    });

    if (!response.ok) {
      return { status: "error" };
    }

    const data = (await response.json()) as OpenSourceToolSummary[];

    if (Array.isArray(data) && data.length === 0) {
      return { status: "empty" };
    }

    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}