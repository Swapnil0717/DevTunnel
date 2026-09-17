import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Every backend call the CLI makes (starting the `dev login` loopback
 * flow, redeeming the login code, `dev logout`) goes through this one
 * base URL. Overridable via `DEVTUNNEL_API_URL` so the CLI can be pointed
 * at `http://localhost:4000` while developing devtunnel-backend itself,
 * without touching any source file.
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.DEVTUNNEL_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return "https://api.devtunnel.tech";
}

/** `~/.devtunnel` — the CLI's own config directory, created on first `dev login`. */
export function getConfigDir(): string {
  return join(homedir(), ".devtunnel");
}

/** `~/.devtunnel/credentials.json` — see src/lib/credentials.ts for the shape stored here. */
export function getCredentialsPath(): string {
  return join(getConfigDir(), "credentials.json");
}