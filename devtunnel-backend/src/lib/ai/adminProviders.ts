// devtunnel-backend/src/lib/ai/adminProviders.ts
import type { ValidatedEnv } from "../../config/env";
import { getSupabase } from "../supabase";
import { aiFeaturesEnabled } from "./client";
import { envString, PROVIDERS, type ProviderId } from "./providers";
import { dayKeyFor, exhaustedForMs, flushAiUsage, msUntilDailyReset } from "./usage";

/**
 * Read-only snapshot behind `GET /admin/ai/providers` (Part 7): for every AI
 * provider — today's requests and estimated tokens, whether it is available or
 * exhausted (and until when), and the last error class.
 *
 * WHERE THE NUMBERS COME FROM (none of it is KV):
 *  - requests / estimated tokens / per-class error counts: Supabase
 *    `ai_usage_daily` (rows scoped '' = provider, 'model:<id>' = one model,
 *    'err:<class>' = failures). Pending increments in THIS isolate are
 *    flushed first so they are not missing from the read.
 *  - exhausted-until and last error: Supabase `ai_provider_status` (sql/042),
 *    written by usage.ts whenever a provider fails — so the panel sees what any
 *    isolate observed. This isolate's in-memory map is merged in as well.
 *
 * Honest limits, also shown to the admin as-is:
 *  - `tokensEstToday` is the provider's reported total when it sent one,
 *    otherwise a chars/3.5 estimate (see usage.ts).
 *  - Requests are counted per SUCCESSFUL call; a failed attempt shows up under
 *    `errorsToday`, not `requestsToday`.
 *  - Providers report their own remaining quota only in some response headers;
 *    "available" means "not known to be exhausted", not "has quota left".
 *  - Secrets are never returned: `missing` names the variable to set, never a value.
 */

export type AdminProviderStatus = "available" | "exhausted" | "not_configured";

export interface AdminProviderModel {
  model: string;
  /** Which job the model is for, when the same provider serves several (Groq only). */
  role: string | null;
  requestsToday: number;
  tokensEstToday: number;
  status: "available" | "exhausted";
  exhaustedUntil: string | null;
  exhaustedReason: string | null;
}

export interface AdminProviderRow {
  id: ProviderId;
  label: string;
  configured: boolean;
  /** Human-readable list of what is missing, e.g. ["API key (MISTRAL_API_KEY)"]. Empty when configured. */
  missing: string[];
  status: AdminProviderStatus;
  /** Soonest time a fully exhausted provider is usable again (ISO), else null. */
  exhaustedUntil: string | null;
  requestsToday: number;
  tokensEstToday: number;
  /** When this provider's daily counters roll over (Google: midnight Pacific; others: UTC). */
  dailyResetsAt: string;
  lastError: { errorClass: string; at: string; model: string } | null;
  errorsToday: Record<string, number>;
  models: AdminProviderModel[];
}

export interface AdminProvidersSnapshot {
  generatedAt: string;
  featuresEnabled: boolean;
  providers: AdminProviderRow[];
}

/** Model env vars per provider. Only the shared Groq keys run several models (discovery / search / secondary). */
const MODEL_VARS: Record<ProviderId, Array<{ envVar: keyof ValidatedEnv; role: string | null }>> = {
  groq: [{ envVar: "GROQ_MODEL", role: "discovery (dedicated key)" }],
  groq_search: [{ envVar: "GROQ_SEARCH_MODEL", role: "search (dedicated key)" }],
  groq_summary: [{ envVar: "GROQ_SECONDARY_MODEL", role: "summary (dedicated key)" }],
  groq_explain: [{ envVar: "GROQ_SECONDARY_MODEL", role: "explain (dedicated key)" }],
  groq_insights: [{ envVar: "GROQ_SECONDARY_MODEL", role: "insights (dedicated key)" }],
  groq_backup: [
    { envVar: "GROQ_MODEL", role: "discovery backup" },
    { envVar: "GROQ_SEARCH_MODEL", role: "search backup" },
    { envVar: "GROQ_SECONDARY_MODEL", role: "summary / explain / insights backup" },
  ],
  groq_b: [
    { envVar: "GROQ_MODEL", role: "discovery backup 2" },
    { envVar: "GROQ_SEARCH_MODEL", role: "search backup 2" },
    { envVar: "GROQ_SECONDARY_MODEL", role: "summary / explain / insights backup 2" },
  ],
  cerebras: [{ envVar: "CEREBRAS_MODEL", role: null }],
  gemini: [{ envVar: "GEMINI_MODEL", role: null }],
  mistral: [{ envVar: "MISTRAL_MODEL", role: null }],
  openrouter: [{ envVar: "OPENROUTER_MODEL", role: null }],
  github_models: [{ envVar: "GITHUB_MODELS_MODEL", role: null }],
  workers_ai: [{ envVar: "CF_AI_MODEL", role: null }],
};

interface UsageDbRow {
  provider: string;
  day: string;
  scope: string;
  requests: number;
  tokens_est: number;
}

interface StatusDbRow {
  key: string;
  provider: string;
  model: string;
  exhausted_until: string | null;
  exhausted_reason: string | null;
  last_error_class: string | null;
  last_error_at: string | null;
}

export async function getProvidersSnapshot(env: ValidatedEnv): Promise<AdminProvidersSnapshot> {
  // Make this isolate's own not-yet-flushed increments and failures visible to the reads below.
  await flushAiUsage(env);

  const ids = Object.keys(PROVIDERS) as ProviderId[];
  const supabase = getSupabase(env);
  const days = [...new Set(ids.map((id) => dayKeyFor(id)))];

  const [usageRes, statusRes] = await Promise.all([
    supabase.from("ai_usage_daily").select("provider, day, scope, requests, tokens_est").in("day", days),
    supabase.from("ai_provider_status").select("key, provider, model, exhausted_until, exhausted_reason, last_error_class, last_error_at"),
  ]);
  // Unlike the request path, an admin looking at accounting wants to KNOW when it could not be read.
  if (usageRes.error) throw new Error(`ai_usage_daily read failed: ${usageRes.error.message}`);
  if (statusRes.error) throw new Error(`ai_provider_status read failed: ${statusRes.error.message}`);

  const usageRows = (usageRes.data ?? []) as UsageDbRow[];
  const statusRows = (statusRes.data ?? []) as StatusDbRow[];
  const now = Date.now();

  const providers: AdminProviderRow[] = ids.map((id) => {
    const def = PROVIDERS[id];
    const ownDay = dayKeyFor(id);
    const rows = usageRows.filter((r) => r.provider === id && r.day === ownDay);
    const totals = rows.find((r) => r.scope === "");
    const dailyResetsAt = new Date(now + msUntilDailyReset(id)).toISOString();

    const errorsToday: Record<string, number> = {};
    for (const r of rows) {
      if (r.scope.startsWith("err:")) errorsToday[r.scope.slice(4)] = Number(r.requests);
    }

    // --- configuration ---------------------------------------------------
    const missing: string[] = [];
    if (def.keyVar) {
      if (!envString(env, def.keyVar)) missing.push(`API key (${String(def.keyVar)})`);
    } else if (!env.AI) {
      missing.push("Workers AI binding ([ai] in wrangler.toml)");
    }
    const configuredModels = MODEL_VARS[id].filter((m) => envString(env, m.envVar));
    if (configuredModels.length === 0) missing.push(`model (${String(MODEL_VARS[id][0]?.envVar ?? def.modelVar)})`);
    const configured = missing.length === 0;

    // --- per model --------------------------------------------------------
    const seen = new Set<string>();
    const models: AdminProviderModel[] = [];
    if (configured) {
      for (const m of configuredModels) {
        const model = envString(env, m.envVar) as string;
        if (seen.has(model)) continue; // two roles pointing at the same model share one budget
        seen.add(model);
        const key = `${id}:${model}`;
        const usage = rows.find((r) => r.scope === `model:${model}`);
        const dbUntil = Date.parse(statusRows.find((s) => s.key === key)?.exhausted_until ?? "");
        const memUntil = now + exhaustedForMs(key);
        const until = Math.max(Number.isNaN(dbUntil) ? 0 : dbUntil, exhaustedForMs(key) > 0 ? memUntil : 0);
        const exhausted = until > now;
        const roles = MODEL_VARS[id].filter((o) => envString(env, o.envVar) === model).map((o) => o.role).filter(Boolean);
        models.push({
          model,
          role: roles.length ? roles.join(", ") : null,
          requestsToday: Number(usage?.requests ?? 0),
          tokensEstToday: Number(usage?.tokens_est ?? 0),
          status: exhausted ? "exhausted" : "available",
          exhaustedUntil: exhausted ? new Date(until).toISOString() : null,
          exhaustedReason: exhausted ? (statusRows.find((s) => s.key === key)?.exhausted_reason ?? null) : null,
        });
      }
    }

    // --- provider-level status -------------------------------------------
    const allExhausted = models.length > 0 && models.every((m) => m.status === "exhausted");
    const status: AdminProviderStatus = !configured ? "not_configured" : allExhausted ? "exhausted" : "available";
    const exhaustedUntil = allExhausted
      ? new Date(Math.min(...models.map((m) => Date.parse(m.exhaustedUntil as string)))).toISOString()
      : null;

    // --- last error (most recent across this provider's models) -----------
    let lastError: AdminProviderRow["lastError"] = null;
    for (const s of statusRows) {
      if (s.provider !== id || !s.last_error_class || !s.last_error_at) continue;
      if (!lastError || Date.parse(s.last_error_at) > Date.parse(lastError.at)) {
        lastError = { errorClass: s.last_error_class, at: s.last_error_at, model: s.model };
      }
    }

    return {
      id,
      label: def.label,
      configured,
      missing,
      status,
      exhaustedUntil,
      requestsToday: Number(totals?.requests ?? 0),
      tokensEstToday: Number(totals?.tokens_est ?? 0),
      dailyResetsAt,
      lastError,
      errorsToday,
      models,
    };
  });

  return { generatedAt: new Date(now).toISOString(), featuresEnabled: aiFeaturesEnabled(env), providers };
}