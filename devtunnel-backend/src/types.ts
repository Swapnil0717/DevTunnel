/**
 * Cloudflare Worker bindings + environment variables.
 *
 * Non-secret values are declared in wrangler.toml `[vars]`. Secrets
 * (marked below) are never put in wrangler.toml — they're set with
 * `wrangler secret put <name>` in production and `.dev.vars` locally
 * (Backend_Development_Rules.txt rules 6–7).
 */
 export interface Env {
  // --- KV ---
  // Also doubles as a lightweight JSON response cache (see src/lib/cache.ts)
  // for the GitHub contribution-calendar endpoints — see that file for why
  // a second KV namespace wasn't introduced for that.
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
  GITHUB_TOKEN_ENCRYPTION_KEY: string;
}

/** Values attached to the Hono context by middleware. */
export interface Variables {
  requestId: string;
  user: AuthUser | null;
}

export type UserRole = "CONTRIBUTOR" | "MAINTAINER" | "ADMIN";

/**
 * Onboarding wizard enums (devtunnel_workflow.txt, Module C1 — "User
 * onboarding" screen). Mirror the identically-named types in
 * devtunnel-frontend/src/lib/onboarding/types.ts exactly.
 */
export type DeveloperRole =
  | "FRONTEND"
  | "BACKEND"
  | "FULL_STACK"
  | "DOCUMENTATION"
  | "TESTING"
  | "DEVOPS";
export type ExperienceLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type ContributorIntent = "START_PROJECT" | "FIND_PROJECT";

/**
 * Validated payload for `PATCH /auth/onboarding`. Mirrors `OnboardingData`
 * in devtunnel-frontend/src/lib/onboarding/types.ts. Unlike the frontend
 * type (which allows `null` while the wizard is in progress), the fields
 * required by the wizard's own step-gating (`developerRole`,
 * `experienceLevel`, `intent`) are non-nullable here — see the Zod schema
 * in routes/auth.ts, which is the actual source of truth for what the
 * backend accepts.
 */
export interface OnboardingData {
  bio: string;
  skills: string[];
  technologies: string[];
  developerRole: DeveloperRole;
  experienceLevel: ExperienceLevel;
  interests: string[];
  intent: ContributorIntent;
}

/**
 * Frontend-safe user shape. Mirrors `AuthUser` in
 * devtunnel-frontend/src/lib/auth/types.ts exactly — every field the
 * frontend reads must be present, and nothing more sensitive (no
 * githubId, no encrypted tokens, no internal flags) is ever included
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
  onboardingCompleted: boolean;
}

/**
 * Full row shape as stored in `devtunnel.users` (includes private fields).
 * `github_*_token_encrypted` columns hold AES-256-GCM ciphertext only
 * (src/lib/crypto.ts) — the raw token is never stored, logged, or
 * returned to any client (rules 6, 8, 59). Only src/db/githubTokens.ts
 * ever selects these columns; every other query in this codebase selects
 * an explicit column list that omits them (rule 23: avoid SELECT *).
 */
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
  skills: string[];
  technologies: string[];
  developer_role: DeveloperRole | null;
  experience_level: ExperienceLevel | null;
  interests: string[];
  intent: ContributorIntent | null;
  onboarding_completed: boolean;
  github_access_token_encrypted: string | null;
  github_access_token_expires_at: string | null;
  github_refresh_token_encrypted: string | null;
  github_refresh_token_expires_at: string | null;
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

/** One day's contribution count from GitHub's contribution calendar. */
export interface ContributionDay {
  date: string; // YYYY-MM-DD, UTC
  count: number;
}

export interface ContributionWeek {
  days: ContributionDay[];
}

/** Cached/returned shape for a single month's calendar. */
export interface ContributionCalendar {
  totalContributions: number;
  weeks: ContributionWeek[];
}