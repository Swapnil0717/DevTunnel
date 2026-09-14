import { cookies } from "next/headers";

export const VIEW_MODE_COOKIE = "dt_view_mode";

export type ViewMode = "admin" | "user";

function parseViewMode(raw: string | undefined): ViewMode | null {
  return raw === "admin" || raw === "user" ? raw : null;
}

/**
 * Server-side read.
 */
export function getServerViewMode(): ViewMode | null {
  return parseViewMode(cookies().get(VIEW_MODE_COOKIE)?.value);
}

/**
 * Client-side read.
 */
export function getClientViewMode(): ViewMode | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(
    /(?:^|; )dt_view_mode=([^;]*)/,
  );

  return parseViewMode(
    match ? decodeURIComponent(match[1]) : undefined,
  );
}

/**
 * One year.
 */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function setClientViewMode(mode: ViewMode): void {
  if (typeof document === "undefined") return;

  document.cookie =
    `${VIEW_MODE_COOKIE}=${mode}; ` +
    `path=/; ` +
    `max-age=${MAX_AGE_SECONDS}; ` +
    `samesite=lax`;
}

export function clearClientViewMode(): void {
  if (typeof document === "undefined") return;

  document.cookie =
    `${VIEW_MODE_COOKIE}=; ` +
    `path=/; ` +
    `max-age=0; ` +
    `samesite=lax`;
}