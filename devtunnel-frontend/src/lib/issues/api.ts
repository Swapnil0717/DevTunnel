// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { Issue } from "./types";

/**
 * `GET /issues` — the contributor-facing counterpart to the Admin
 * Portal's `GET /admin/new-issues` (`lib/admin/new-issues/api.ts`):
 * every open GitHub issue across DevTunnel's onboarded projects, so a
 * contributor can browse and pick one to work on from `/issues`
 * ("All Issues" in `AppSidebar` / `AppBottomNav`).
 *
 * Not confirmed against the backend yet — same documented-assumption
 * convention as `lib/home/api.ts` and `lib/admin/new-issues/api.ts`
 * (Frontend_Development_Rules.txt rule 58: don't invent data, but a
 * plausible, clearly-flagged endpoint name is fine while the backend
 * catches up — TODO: confirm the real path with backend). Every call is
 * expected to fail (network error / 404) until that route ships;
 * `getIssues` catches that and the page degrades to one honest
 * `SectionMessage`, never a blank/broken page.
 *
 * Assumed keyset-paginated the same way every other DevTunnel list route
 * is (`limit`/`before` query params, `X-Next-Cursor` response header —
 * see `lib/admin/cursor-pagination.ts`), so this walks every page the
 * same way `fetchAllAdminPages` does and returns the complete result.
 * That's what lets `IssuesExplorer` filter the *complete* list
 * client-side and then page through it 20-at-a-time with real
 * "Page 1 of N" controls, instead of only ever being able to show
 * whatever the first backend page happened to contain.
 *
 * `PAGE_LIMIT` is 1000, not a smaller default — same reasoning
 * `lib/admin/new-issues/api.ts` documents for `/admin/new-issues`: if
 * this route also recomputes its result from a live, cross-project
 * GitHub scan rather than a cached table, requesting the largest page
 * the backend allows keeps a walk to one call/one scan for any
 * realistic installation, instead of multiplying an already-expensive
 * scan by however many small pages the combined issue count would
 * otherwise need.
 */
const PAGE_LIMIT = 1000;

/**
 * Safety ceiling on how many pages one request will ever walk — 200
 * pages * 1000/page is comfortably above any real installation's open
 * issue count. Stops rather than looping forever if a backend bug ever
 * made `X-Next-Cursor` repeat itself.
 */
const MAX_PAGES = 200;

export type IssuesResult =
  | { status: "ok"; data: Issue[] }
  | { status: "empty" }
  | { status: "error" };

export async function getIssues(): Promise<IssuesResult> {
  try {
    const items: Issue[] = [];
    let before: string | undefined;
    let pages = 0;

    do {
      const query = new URLSearchParams({ limit: String(PAGE_LIMIT) });
      if (before) query.set("before", before);

      const res = await fetch(`${API_BASE_URL}/issues?${query.toString()}`, {
        headers: { cookie: (await cookies()).toString() },
        cache: "no-store",
      });

      if (!res.ok) {
        return items.length > 0 ? { status: "ok", data: items } : { status: "error" };
      }

      const page = (await res.json()) as Issue[];
      items.push(...page);

      before = res.headers.get("X-Next-Cursor") ?? undefined;
      pages += 1;
    } while (before && pages < MAX_PAGES);

    if (items.length === 0) return { status: "empty" };
    return { status: "ok", data: items };
  } catch {
    return { status: "error" };
  }
}