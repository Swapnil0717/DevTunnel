/**
 * Cloudflare Worker bindings + environment variables.
 *
 * Non-secret values are declared in wrangler.toml `[vars]`. Secrets
 * (marked below) are never put in wrangler.toml — they're set with
 * `wrangler secret put <NAME>` in production and `.dev.vars` locally
 * (Backend_Development_Rules.txt rules 6–7).
 */
export interface Env {
  // --- KV ---
  RATE_LIMIT_KV: KVNamespace;

  // --- Non-secret config (wrangler.toml [vars]) ---
  ENVIRONMENT: "production" | "staging" | "development";
  GITHUB_CALLBACK_URL: string;
  FRONTEND_URL: string;
  ALLOWED_ORIGINS: string;
  COOKIE_DOMAIN?: string;
  SUPABASE_URL: string;
  SUPABASE_DB_SCHEMA: string;
  GITHUB_CLIENT_ID: string;
  SESSION_TTL_DAYS: string;

  // --- Secrets (wrangler secret put / .dev.vars) ---
  GITHUB_CLIENT_SECRET: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SESSION_HMAC_SECRET: string;
}

/** Values attached to the Hono context by middleware. */
export interface Variables {
  requestId: string;
  user: AuthUser | null;
}

export type UserRole = "CONTRIBUTOR" | "MAINTAINER" | "ADMIN";

/**
 * Frontend-safe user shape. Mirrors `AuthUser` in
 * devtunnel-frontend/src/lib/auth/types.ts exactly — every field the
 * frontend reads must be present, and nothing more sensitive (no
 * githubId, no internal flags) is ever included
 * (Backend_Development_Rules.txt rule 9).
 */
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  githubUsername: string | null;
  githubProfileUrl: string | null;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Full row shape as stored in `devtunnel.users` (includes private fields). */
export interface UserRow {
  id: string;
  email: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  github_id: string;
  github_username: string | null;
  github_profile_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  last_used_at: string;
  user_agent: string | null;
}
