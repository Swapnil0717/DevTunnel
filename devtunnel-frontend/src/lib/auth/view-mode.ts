export const VIEW_MODE_COOKIE = "dt_view_mode";

export type ViewMode = "admin" | "user";

function parseViewMode(raw: string | undefined): ViewMode | null {
  return raw === "admin" || raw === "user" ? raw : null;
}

/**
 * Client-side read.
 */
export function getClientViewMode(): ViewMode | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(
    /(?:^|; )dt_view_mode=([^;]*)/,
  );
  const raw = match?.[1];

  return parseViewMode(
    raw !== undefined ? decodeURIComponent(raw) : undefined,
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