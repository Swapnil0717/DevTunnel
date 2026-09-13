/**
 * Shared helpers for paging through the admin backend's keyset-paginated
 * list endpoints (`GET /admin/projects`, `/admin/tasks`,
 * `/admin/opensource-tools`, `/admin/new-issues` — all `limit`/`before` +
 * `X-Next-Cursor`, see each route's own doc comment). These endpoints
 * only ever expose a "give me everything before this cursor" step
 * forward; there's no server-side "step back". To still offer a real
 * Previous button without any client-side state, every page keeps the
 * cursors it has already visited in the URL itself, as a comma-joined
 * `stack` query param — oldest visited cursor first. Going forward
 * pushes the current `before` onto that stack; going back pops the most
 * recent one off it. Because it all lives in the URL, this works with
 * plain server-rendered `<Link>` navigation — no client component, no
 * browser storage, and the page is always directly linkable/shareable.
 */

 export interface CursorSearchParams {
    before?: string;
    stack?: string;
  }
  
  /** Splits the `stack` query param back into its individual cursor values. */
  export function parseCursorStack(searchParams: CursorSearchParams): string[] {
    if (!searchParams.stack) return [];
    return searchParams.stack.split(",").filter(Boolean);
  }
  
  /** Builds the `href` for "Next page", given the cursor the server just returned. */
  export function nextPageHref(
    basePath: string,
    currentBefore: string | undefined,
    stack: string[],
    nextCursor: string,
    extraParams?: Record<string, string | undefined>,
  ): string {
    const newStack = currentBefore ? [...stack, currentBefore] : stack;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(extraParams ?? {})) {
      if (value) params.set(key, value);
    }
    params.set("before", nextCursor);
    if (newStack.length > 0) params.set("stack", newStack.join(","));
    return `${basePath}?${params.toString()}`;
  }
  
  /** Builds the `href` for "Previous page" by popping the last visited cursor off the stack. */
  export function prevPageHref(
    basePath: string,
    stack: string[],
    extraParams?: Record<string, string | undefined>,
  ): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(extraParams ?? {})) {
      if (value) params.set(key, value);
    }
  
    if (stack.length === 0) {
      const qs = params.toString();
      return qs ? `${basePath}?${qs}` : basePath;
    }
  
    const newStack = stack.slice(0, -1);
    const prevBefore = stack[stack.length - 1]!;
    params.set("before", prevBefore);
    if (newStack.length > 0) params.set("stack", newStack.join(","));
    return `${basePath}?${params.toString()}`;
  }