import { API_BASE_URL } from "@/lib/config";
import type {
  ContributionMonth,
  ContributionSummary,
  DevTunnelContributionMonth,
  DevTunnelStats,
} from "./types";

export class ProfileApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ProfileApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseErrorBody(res: Response): Promise<{ code?: string; message?: string }> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return { code: body.error?.code, message: body.error?.message };
  } catch {
    return {};
  }
}

/**
 * `GET /users/me/contributions?month=YYYY-MM` (devtunnel-backend
 * src/routes/contributions.ts). `month` omitted defaults to the current
 * month server-side. Thrown `ProfileApiError.code` values a caller may
 * want to branch on: `github_account_not_linked`, `github_user_not_found`,
 * `github_unavailable`, `rate_limited`.
 */
export async function fetchContributionMonth(month?: string): Promise<ContributionMonth> {
  const url = new URL(`${API_BASE_URL}/users/me/contributions`);
  if (month) url.searchParams.set("month", month);

  const res = await fetch(url.toString(), {
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ProfileApiError(
      message ?? `Failed to load contributions (${res.status})`,
      res.status,
      code,
    );
  }

  const body = (await res.json()) as { data: ContributionMonth };
  return body.data;
}

/** `GET /users/me/contributions/summary` — rolling 365-day total. */
export async function fetchContributionSummary(): Promise<ContributionSummary> {
  const res = await fetch(`${API_BASE_URL}/users/me/contributions/summary`, {
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ProfileApiError(
      message ?? `Failed to load contribution summary (${res.status})`,
      res.status,
      code,
    );
  }

  const body = (await res.json()) as { data: ContributionSummary };
  return body.data;
}

/**
 * `GET /users/me/contributions/devtunnel?month=YYYY-MM` (devtunnel-backend
 * src/routes/devtunnelStats.ts) — the DevTunnel-native counterpart to
 * `fetchContributionMonth`. No "account not linked" state here: every
 * signed-in user can query their own DevTunnel activity, so a
 * `ProfileApiError` from this call is always a real failure (network,
 * `rate_limited`, `internal_error`), never an expected "not connected"
 * state.
 */
export async function fetchDevTunnelContributionMonth(
  month?: string,
): Promise<DevTunnelContributionMonth> {
  const url = new URL(`${API_BASE_URL}/users/me/contributions/devtunnel`);
  if (month) url.searchParams.set("month", month);

  const res = await fetch(url.toString(), {
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ProfileApiError(
      message ?? `Failed to load DevTunnel contributions (${res.status})`,
      res.status,
      code,
    );
  }

  const body = (await res.json()) as { data: DevTunnelContributionMonth };
  return body.data;
}

/** `GET /users/me/contributions/devtunnel/summary` — rolling 365-day DevTunnel-native total. */
export async function fetchDevTunnelContributionSummary(): Promise<ContributionSummary> {
  const res = await fetch(`${API_BASE_URL}/users/me/contributions/devtunnel/summary`, {
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ProfileApiError(
      message ?? `Failed to load DevTunnel contribution summary (${res.status})`,
      res.status,
      code,
    );
  }

  const body = (await res.json()) as { data: ContributionSummary };
  return body.data;
}

/**
 * `GET /users/me/devtunnel-stats` (devtunnel-backend
 * src/routes/devtunnelStats.ts) — projects created/maintained, tasks
 * completed, pull requests merged. Backs the profile page's "Projects" /
 * "Tasks done" / "Pull requests" stat cards.
 */
export async function fetchDevTunnelStats(): Promise<DevTunnelStats> {
  const res = await fetch(`${API_BASE_URL}/users/me/devtunnel-stats`, {
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ProfileApiError(
      message ?? `Failed to load DevTunnel stats (${res.status})`,
      res.status,
      code,
    );
  }

  const body = (await res.json()) as { data: DevTunnelStats };
  return body.data;
}