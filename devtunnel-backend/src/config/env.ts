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
