import { z } from "zod";
import type { Env } from "../types";

const envSchema = z.object({
  ENVIRONMENT: z.enum(["production", "staging", "development"]),
  GITHUB_CALLBACK_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().min(1),
  COOKIE_DOMAIN: z.string().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_DB_SCHEMA: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  SESSION_TTL_DAYS: z.string().regex(/^\d+$/),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SESSION_HMAC_SECRET: z.string().min(16, "SESSION_HMAC_SECRET must be at least 16 characters"),
  // Encrypts each user's stored GitHub user-to-server access/refresh
  // token at rest (src/lib/crypto.ts encryptSecret/decryptSecret,
  // src/db/githubTokens.ts). This is NOT a GitHub credential — it's a
  // key this backend alone controls. Generate with `openssl rand -base64
  // 32` and set via `wrangler secret put GITHUB_TOKEN_ENCRYPTION_KEY`.
  // Rotating it invalidates every stored token (users simply need to
  // sign in again — not a data-loss event, just a re-auth prompt).
  GITHUB_TOKEN_ENCRYPTION_KEY: z.string().refine((value) => {
    try {
      return Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0)).length === 32;
    } catch {
      return false;
    }
  }, "GITHUB_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key (generate with `openssl rand -base64 32`)"),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

/**
 * Parses and validates `Env` bindings once per isolate. Throws immediately
 * (caught by the global error handler, surfaced as a 500 with no internal
 * detail) rather than letting a missing secret fail silently deep inside a
 * request (Backend_Development_Rules.txt rules 5–7, 16).
 */
let cached: ValidatedEnv | null = null;

export function getEnv(raw: Env): ValidatedEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    // Never leak this detail to a client — only ever logged server-side.
    throw new Error(`Invalid/missing environment configuration: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}

export function allowedOrigins(env: ValidatedEnv): string[] {
  return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
}

export function sessionTtlSeconds(env: ValidatedEnv): number {
  return Number(env.SESSION_TTL_DAYS) * 24 * 60 * 60;
}