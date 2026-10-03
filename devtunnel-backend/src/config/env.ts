import { z } from "zod";
import type { Env } from "../types";

const envSchema = z.object({
  ENVIRONMENT: z.enum(["production", "staging", "development"]),
  GITHUB_CALLBACK_URL: z.string().url(),
  // Second registered callback URL for the SAME GitHub App, used only by
  // the `dev login` CLI loopback flow (src/routes/authCli.ts). A GitHub
  // App (unlike a classic OAuth App) supports multiple callback URLs —
  // add this one under Settings > Developer settings > GitHub Apps >
  // DevTunnel.tech > Identifying and authorizing users > "Callback URL",
  // alongside the existing web one. Kept separate from
  // GITHUB_CALLBACK_URL rather than reused because the two callbacks do
  // fundamentally different things with the same GitHub redirect: the
  // web one hands off to a browser cookie, this one hands off to a
  // localhost process (see GET /auth/cli/callback).
  GITHUB_CLI_CALLBACK_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().min(1),
  COOKIE_DOMAIN: z.string().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_DB_SCHEMA: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  SESSION_TTL_DAYS: z.string().regex(/^\d+$/),
  // Powers the AI Discovery agent (src/lib/groq.ts). Must be a plain
  // chat-completion model that supports custom tool calling — NOT
  // groq/compound or groq/compound-mini, which only support Groq's own
  // built-in tools. "openai/gpt-oss-120b" is the current default.
  GROQ_MODEL: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SESSION_HMAC_SECRET: z.string().min(16, "SESSION_HMAC_SECRET must be at least 16 characters"),
  // Powers the AI Discovery agent (src/lib/groq.ts). Free-tier key from
  // https://console.groq.com/keys — never logged, never returned to any
  // client.
  GROQ_API_KEY: z.string().min(1),
  // A GitHub Personal Access Token this backend controls (not a user's
  // OAuth token), used only by src/lib/githubDiscovery.ts to search
  // GitHub server-side at the AI Discovery agent's own initiative.
  GITHUB_DISCOVERY_TOKEN: z.string().min(1),
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

  // --- AI foundation (src/lib/ai/*) — ALL OPTIONAL ---------------------
  // A provider with no key (or no model) is silently skipped by
  // src/lib/ai/chain.ts. Deliberately z.string() with no .min(1): an empty
  // secret must mean "not configured", never crash every request.
  // Secrets (wrangler secret put): keys below. Non-secret vars go in
  // wrangler.toml. Get keys at console.groq.com/keys, cloud.cerebras.ai,
  // aistudio.google.com/apikey, console.mistral.ai, openrouter.ai/keys,
  // github.com/marketplace/models.
  // Dedicated Groq keys, one per AI functionality (src/lib/ai/chain.ts keeps
  // each one to its own job). GROQ_API_KEY above is the discovery key.
  // Groq limits are per ORGANIZATION: for truly separate budgets each key
  // must come from a different Groq account.
  GROQ_API_KEY_SEARCH: z.string().optional(),
  GROQ_API_KEY_SUMMARY: z.string().optional(),
  GROQ_API_KEY_EXPLAIN: z.string().optional(),
  GROQ_API_KEY_INSIGHTS: z.string().optional(),
  // Shared Groq backups: used by every job after its own key. _2 keeps its
  // original name so existing deployments don't need a new secret.
  GROQ_API_KEY_BACKUP: z.string().optional(),
  GROQ_API_KEY_2: z.string().optional(),
  CEREBRAS_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  GITHUB_MODELS_TOKEN: z.string().optional(),
  // Model ids (free model lists change often — never hard-coded).
  GROQ_SEARCH_MODEL: z.string().optional(),
  GROQ_SECONDARY_MODEL: z.string().optional(),
  CEREBRAS_MODEL: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  MISTRAL_MODEL: z.string().optional(),
  OPENROUTER_MODEL: z.string().optional(),
  GITHUB_MODELS_MODEL: z.string().optional(),
  CF_AI_MODEL: z.string().optional(),
  // "false" switches every USER-facing AI endpoint off (the admin
  // discovery agent is unaffected). Anything else / unset = on.
  AI_FEATURES_ENABLED: z.string().optional(),
  // --- Sponsors: Razorpay webhook (src/routes/razorpayWebhook.ts) — OPTIONAL ---
  // The secret you typed into Razorpay Dashboard > Account & Settings >
  // Webhooks. Deliberately z.string().optional() with no .min(1): empty or
  // unset means "webhook disabled" (POST /webhooks/razorpay answers 503) and
  // must never crash any other route. Set with
  //   npx wrangler secret put RAZORPAY_WEBHOOK_SECRET
  // Never logged, never returned to any client.
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Cloudflare Workers AI binding (wrangler.toml `[ai]`). Not a string, so
  // it needs an explicit passthrough — zod would otherwise strip it.
  AI: z.custom<Ai>().optional(),
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