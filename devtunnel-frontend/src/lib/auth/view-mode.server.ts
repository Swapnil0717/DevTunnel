import { cookies } from "next/headers";

import { VIEW_MODE_COOKIE, type ViewMode } from "./view-mode";

function parseViewMode(raw: string | undefined): ViewMode | null {
  return raw === "admin" || raw === "user" ? raw : null;
}

/**
 * Server-side read. Import this only from Server Components /
 * route handlers / server actions — it pulls in `next/headers`.
 */
export function getServerViewMode(): ViewMode | null {
  return parseViewMode(cookies().get(VIEW_MODE_COOKIE)?.value);
}