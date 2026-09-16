// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import type { OpenSourceToolSummary, OpenSourceToolDetail } from "./types";

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

/**
 * `GET /opensource-tools/:slug` — backs the Tool Detail page
 * (`/opensource-tools/:toolSlug`).
 *
 * Three outcomes rather than the list's `ok`/`empty`/`error`, the same
 * split `getDevtunnelProjectBySlug` (`lib/projects/api.ts`) and
 * `getTaskDetail` use: a slug matching no tool is a real "this page
 * doesn't exist" result and renders Next's `notFound()`, never a
 * fabricated empty tool (Frontend_Development_Rules.txt rule 25), while a
 * network failure is a separate, temporary state with its own messaging.
 *
 * Same documented-assumption caveat as the list route above — TODO:
 * confirm the real path and payload with backend.
 */
export type OpenSourceToolResult =
  | { status: "ok"; data: OpenSourceToolDetail }
  | { status: "not-found" }
  | { status: "error" };

export async function getOpenSourceToolBySlug(
  slug: string,
): Promise<OpenSourceToolResult> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/opensource-tools/${encodeURIComponent(slug)}`,
      {
        headers: { Cookie: cookies().toString() },
        cache: "no-store",
      },
    );

    if (response.status === 404) {
      return { status: "not-found" };
    }

    if (!response.ok) {
      return { status: "error" };
    }

    const data = (await response.json()) as OpenSourceToolDetail;
    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}