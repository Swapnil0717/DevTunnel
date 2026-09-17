import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { getConfigDir, getCredentialsPath } from "./config";

export interface StoredUser {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface Credentials {
  /** Raw CLI bearer token — sent as `Authorization: Bearer <token>` on every authenticated call. */
  token: string;
  /** The API base URL this token belongs to, so switching DEVTUNNEL_API_URL can't accidentally reuse it. */
  apiBaseUrl: string;
  user: StoredUser;
  createdAt: string;
}

/**
 * Reads `~/.devtunnel/credentials.json`. Returns `null` if the user has
 * never run `dev login`, or the file is missing/corrupt — every caller
 * treats that the same way ("not logged in"), never as a crash.
 */
export function readCredentials(): Credentials | null {
  const path = getCredentialsPath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<Credentials>;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.apiBaseUrl !== "string" ||
      !parsed.user ||
      typeof parsed.user.id !== "string"
    ) {
      return null;
    }
    return parsed as Credentials;
  } catch {
    return null;
  }
}

/**
 * Writes credentials to `~/.devtunnel/credentials.json`, creating the
 * directory if needed. File mode is restricted to the owner only (0600) —
 * this file holds a live bearer token, same trust level as an SSH private
 * key or a `.netrc` entry.
 */
export function writeCredentials(credentials: Credentials): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const path = getCredentialsPath();
  writeFileSync(path, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}

/** Deletes the local credentials file, if any. Never throws — `dev logout` must always succeed locally. */
export function clearCredentials(): void {
  const path = getCredentialsPath();
  try {
    if (existsSync(path)) rmSync(path);
  } catch {
    // Best-effort — a leftover file with a server-revoked token is inert,
    // not a security problem, so this is not worth failing `dev logout` over.
  }
}