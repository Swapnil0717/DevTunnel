// devtunnel-backend/src/lib/ai/providers.ts
import type { ValidatedEnv } from "../../config/env";

/**
 * Provider registry + the one HTTP adapter every AI job goes through.
 *
 * WHY one adapter: Groq, Cerebras, Gemini (via its OpenAI-compatible
 * endpoint), Mistral, OpenRouter and GitHub Models all speak the OpenAI
 * `/chat/completions` dialect, so a single request/response shape covers
 * them. Cloudflare Workers AI is the exception (it is a binding, not an
 * HTTP endpoint) and has its own small branch below. No SDKs — same
 * reasoning as the rest of this codebase (small Workers bundle).
 *
 * WHY model names are env vars and never hard-coded (Part 1 rule 7): free
 * model lists change often. A provider with no key OR no model configured
 * is silently skipped by chain.ts, so adding a provider later is "set two
 * variables", not a code change. Verify current free-tier limits and model
 * names in each provider's dashboard before setting them.
 *
 * Endpoint URLs below are the providers' documented OpenAI-compatible
 * routes as of writing — they could not be re-verified from the build
 * sandbox (no network), so confirm them when you first enable a provider.
 */

export type ProviderId =
  | "groq"
  | "groq_search"
  | "groq_summary"
  | "groq_explain"
  | "groq_insights"
  | "groq_backup"
  | "groq_b"
  | "cerebras"
  | "gemini"
  | "mistral"
  | "openrouter"
  | "github_models"
  | "workers_ai";

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ProviderDef {
  id: ProviderId;
  label: string;
  /** Absent for Workers AI (binding, not HTTP). */
  endpoint?: string;
  /** Env var holding the secret. Absent for Workers AI (needs the `AI` binding instead). */
  keyVar?: keyof ValidatedEnv;
  /** Env var holding the DEFAULT model id for this provider. */
  modelVar: keyof ValidatedEnv;
  toolCalling: boolean;
  jsonMode: boolean;
  /** Time zone in which this provider's DAILY quota resets (Google resets at midnight Pacific). */
  resetTz: "UTC" | "America/Los_Angeles";
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  groq: {
    id: "groq",
    label: "Groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    keyVar: "GROQ_API_KEY",
    modelVar: "GROQ_MODEL",
    toolCalling: true,
    jsonMode: true,
    resetTz: "UTC",
  },
  // ---- Dedicated Groq keys: ONE KEY PER FUNCTIONALITY -----------------------
  // Each key below is used ONLY by its own job (see GROQ_SLOT_JOB in chain.ts),
  // so one busy feature can never drain another feature's Groq budget. Each is
  // its own provider id so it keeps its own in-memory exhaustion state, its own
  // usage rows and its own 401/403 "disabled for this run" flag.
  //
  // NOTE: Groq enforces limits per ORGANIZATION, not per key. Separate budgets
  // only exist if these keys come from separate Groq accounts/organizations;
  // several keys from one account all draw on that one account's limits.
  //
  // `groq` (GROQ_API_KEY) is the DISCOVERY key and the only discovery-guard
  // target: the 25/25/50 phase budgets govern it alone (groqQuota.ts).
  groq_search: {
    id: "groq_search",
    label: "Groq (search key)",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    keyVar: "GROQ_API_KEY_SEARCH",
    modelVar: "GROQ_SEARCH_MODEL",
    toolCalling: true,
    jsonMode: true,
    resetTz: "UTC",
  },
  groq_summary: {
    id: "groq_summary",
    label: "Groq (summary key)",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    keyVar: "GROQ_API_KEY_SUMMARY",
    modelVar: "GROQ_SECONDARY_MODEL",
    toolCalling: true,
    jsonMode: true,
    resetTz: "UTC",
  },
  groq_explain: {
    id: "groq_explain",
    label: "Groq (explain key)",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    keyVar: "GROQ_API_KEY_EXPLAIN",
    modelVar: "GROQ_SECONDARY_MODEL",
    toolCalling: true,
    jsonMode: true,
    resetTz: "UTC",
  },
  groq_insights: {
    id: "groq_insights",
    label: "Groq (insights key)",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    keyVar: "GROQ_API_KEY_INSIGHTS",
    modelVar: "GROQ_SECONDARY_MODEL",
    toolCalling: true,
    jsonMode: true,
    resetTz: "UTC",
  },
  // ---- Shared Groq BACKUP keys: usable by EVERY job once its own key (if any)
  // is exhausted or failing. Tried before Cerebras / Gemini / OpenRouter.
  groq_backup: {
    id: "groq_backup",
    label: "Groq (backup key)",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    keyVar: "GROQ_API_KEY_BACKUP",
    modelVar: "GROQ_MODEL",
    toolCalling: true,
    jsonMode: true,
    resetTz: "UTC",
  },
  // Second backup (kept under its original id/env name GROQ_API_KEY_2 so an
  // existing deployment's secret keeps working).
  groq_b: {
    id: "groq_b",
    label: "Groq (backup key 2)",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    keyVar: "GROQ_API_KEY_2",
    modelVar: "GROQ_MODEL",
    toolCalling: true,
    jsonMode: true,
    resetTz: "UTC",
  },
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    endpoint: "https://api.cerebras.ai/v1/chat/completions",
    keyVar: "CEREBRAS_API_KEY",
    modelVar: "CEREBRAS_MODEL",
    toolCalling: true,
    jsonMode: true,
    resetTz: "UTC",
  },
  gemini: {
    id: "gemini",
    label: "Google AI Studio (Gemini)",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyVar: "GEMINI_API_KEY",
    modelVar: "GEMINI_MODEL",
    toolCalling: true,
    jsonMode: true,
    resetTz: "America/Los_Angeles",
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    keyVar: "MISTRAL_API_KEY",
    modelVar: "MISTRAL_MODEL",
    toolCalling: true,
    jsonMode: true,
    resetTz: "UTC",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    keyVar: "OPENROUTER_API_KEY",
    modelVar: "OPENROUTER_MODEL",
    // Depends on the specific (free) model routed to — treated as capable;
    // a model that rejects tools/json fails with a 400 which is logged.
    toolCalling: true,
    jsonMode: true,
    resetTz: "UTC",
  },
  github_models: {
    id: "github_models",
    label: "GitHub Models",
    endpoint: "https://models.github.ai/inference/chat/completions",
    keyVar: "GITHUB_MODELS_TOKEN",
    modelVar: "GITHUB_MODELS_MODEL",
    toolCalling: true,
    jsonMode: true,
    resetTz: "UTC",
  },
  workers_ai: {
    id: "workers_ai",
    label: "Cloudflare Workers AI",
    modelVar: "CF_AI_MODEL",
    // Kept conservative: not every Workers AI model supports tools/JSON mode.
    toolCalling: false,
    jsonMode: false,
    resetTz: "UTC",
  },
};

/** A fully-resolved, callable (provider, model) pair. */
export interface Target {
  provider: ProviderId;
  model: string;
  /** Stable key for in-memory quota state: one budget per provider+model (Groq budgets are per model). */
  key: string;
  /** True only for the Groq discovery model — the one the 25/25/50 phase budgets govern (groqQuota.ts). */
  discoveryGuard: boolean;
}

export interface ProviderRequest {
  messages: ChatMessage[];
  tools?: ToolDeclaration[];
  temperature?: number;
  maxTokens?: number;
  /** Ask for a JSON-object response (ignored where the provider lacks JSON mode). */
  json?: boolean;
}

export interface ProviderResponse {
  /** HTTP status; 0 = network error/timeout (no response); 200 for a successful Workers AI call. */
  status: number;
  headers: Headers;
  message?: ChatMessage;
  totalTokens?: number;
  /** Truncated error body, for server-side logs only — never returned to a client. */
  errorText?: string;
  timedOut?: boolean;
}

/** Returns a trimmed, non-empty string env value, else undefined (an empty secret counts as "not set"). */
export function envString(env: ValidatedEnv, name: keyof ValidatedEnv): string | undefined {
  const value = (env as Record<string, unknown>)[name as string];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Resolves a provider into a callable target, or null when its key/binding or model is not configured. */
export function resolveTarget(
  env: ValidatedEnv,
  provider: ProviderId,
  modelVar?: keyof ValidatedEnv,
): Target | null {
  const def = PROVIDERS[provider];
  if (def.keyVar) {
    if (!envString(env, def.keyVar)) return null;
  } else if (!env.AI) {
    return null;
  }
  const model = envString(env, modelVar ?? def.modelVar);
  if (!model) return null;
  return {
    provider,
    model,
    key: `${provider}:${model}`,
    discoveryGuard: provider === "groq" && (modelVar ?? def.modelVar) === "GROQ_MODEL",
  };
}

interface RawChoiceMessage {
  content?: string | null;
  tool_calls?: ToolCall[];
}

/**
 * One physical call. Never throws for HTTP-level failures — those come
 * back as `status` so client.ts can decide fall-through vs. bug (see the
 * failure table in client.ts). Network errors and timeouts come back as
 * status 0.
 */
export async function callProvider(
  env: ValidatedEnv,
  target: Target,
  req: ProviderRequest,
  opts: { json: boolean; timeoutMs: number },
): Promise<ProviderResponse> {
  const def = PROVIDERS[target.provider];

  if (target.provider === "workers_ai") {
    try {
      // The Workers AI binding has no per-call abort; timeouts are enforced by the Worker's own limits.
      const out = (await (env.AI as unknown as { run: (m: string, i: unknown) => Promise<unknown> }).run(target.model, {
        messages: req.messages,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
      })) as { response?: string; usage?: { total_tokens?: number } } | null;
      return {
        status: 200,
        headers: new Headers(),
        message: { role: "assistant", content: (out?.response ?? "").toString() },
        totalTokens: out?.usage?.total_tokens,
      };
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      // Neuron-allowance exhaustion surfaces as a thrown error, not an HTTP code.
      const quota = /limit|quota|neuron|capacity|too many/i.test(text);
      return { status: quota ? 429 : 500, headers: new Headers(), errorText: text.slice(0, 300) };
    }
  }

  const apiKey = envString(env, def.keyVar as keyof ValidatedEnv);
  const body: Record<string, unknown> = {
    model: target.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.4,
  };
  if (req.maxTokens) body.max_tokens = req.maxTokens;
  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
  if (opts.json && def.jsonMode && !req.tools?.length) body.response_format = { type: "json_object" };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (target.provider === "openrouter") {
    headers["HTTP-Referer"] = env.FRONTEND_URL;
    headers["X-Title"] = "DevTunnel";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(def.endpoint as string, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errorText = (await res.text().catch(() => "")).slice(0, 500);
      return { status: res.status, headers: res.headers, errorText };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: RawChoiceMessage }>;
      usage?: { total_tokens?: number };
    };
    const raw = data.choices?.[0]?.message;
    if (!raw) return { status: 502, headers: res.headers, errorText: "no choices in response" };
    return {
      status: 200,
      headers: res.headers,
      message: { role: "assistant", content: raw.content ?? null, tool_calls: raw.tool_calls },
      totalTokens: data.usage?.total_tokens,
    };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return {
      status: 0,
      headers: new Headers(),
      timedOut,
      errorText: timedOut ? "timeout" : err instanceof Error ? err.message.slice(0, 200) : "network error",
    };
  } finally {
    clearTimeout(timer);
  }
}