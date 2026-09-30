// devtunnel-backend/src/lib/ai/client.ts
import type { ValidatedEnv } from "../../config/env";
import { logger } from "../logger";
import {
  GroqQuotaExceededError,
  GROQ_TPM_LIMIT,
  estimateTokens,
  reserveGroqRequest,
  type DiscoveryPhase,
} from "../groqQuota";
import { buildChain, type AiJob } from "./chain";
import {
  callProvider,
  type ChatMessage,
  type ProviderRequest,
  type Target,
  type ToolDeclaration,
} from "./providers";
import {
  exhaustedForMs,
  flushAiEvents,
  markExhausted,
  msUntilDailyReset,
  noteResponseHeaders,
  recordAiError,
  recordUsage,
  retryAfterMs,
} from "./usage";

/**
 * The one place any AI job talks to a model. Generalises the old Groq-only
 * function-calling loop (src/lib/groq.ts is now a thin shim over this).
 *
 * FAILURE HANDLING (per physical call, per provider):
 *   429 / 402 ........ quota: mark that provider+model exhausted (using
 *                      Retry-After / rate-limit headers when present) and
 *                      fall through to the next provider.
 *   413 ............... request too large for this provider (Groq returns it
 *                      when a single request exceeds its TPM): try the next
 *                      provider, which may accept it.
 *   5xx / timeout /
 *   network error ..... one retry after a short pause, then cool the
 *                      provider down for 2 minutes and try the next.
 *   401 / 403 ......... bad or revoked key: disable that provider for the
 *                      rest of THIS run, log it, try the next.
 *   any other 4xx ..... a bug in our request (bad body, unsupported param):
 *                      do NOT fall back — it would fail the same way
 *                      everywhere and hide the bug. Log it and throw
 *                      AiRequestError.
 * Exception: a 400 on a request that asked for JSON mode is retried once
 * without `response_format` (some models reject it) and remembered.
 *
 * Every failed provider attempt above is also reported to usage.ts
 * (recordAiError / markExhausted) so the admin panel can show each provider's
 * status and last error class. Those events are flushed to Supabase after the
 * call, throttled — never on the success path, never to KV.
 *
 * When every candidate is exhausted the client waits (at most
 * `maxInlineWaitMs`, only if the soonest reset is within it) and re-checks,
 * then throws AiExhaustedError. Nothing here writes to Workers KV.
 */

export type { ToolDeclaration };
export type ToolDispatcher = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export interface AiCallOptions {
  temperature?: number;
  maxTokens?: number;
  /** Request JSON-object output (runChat only; ignored when tools are present). */
  json?: boolean;
  /** Per-physical-call timeout. Default 30s (chat) / 60s (agent). */
  timeoutMs?: number;
  /** Max time to sleep waiting for an exhausted provider to reset. Default 2s (chat) / 65s (agent). */
  maxInlineWaitMs?: number;
  /** Lets usage flushes run after the response is sent. */
  ctx?: ExecutionContext;
  /** Discovery phase — enables the Groq 25/25/50 phase-budget guard (groqQuota.ts). */
  phase?: DiscoveryPhase;
  /** Read-only legacy KV, only used to honour an old admin budget split (groqQuota.ts). */
  legacyKv?: KVNamespace;
}

export interface AiResult {
  content: string;
  provider: string;
  model: string;
}

/** Every configured provider is out of quota / unavailable right now. */
export class AiExhaustedError extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "AiExhaustedError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** No provider is configured (no key / model) for this job. */
export class AiNotConfiguredError extends Error {
  constructor(job: string) {
    super(`No AI provider is configured for job "${job}"`);
    this.name = "AiNotConfiguredError";
  }
}

/** A non-quota 4xx: our request was wrong. Never falls back. */
export class AiRequestError extends Error {
  status: number;
  constructor(status: number, provider: string) {
    super(`AI provider ${provider} rejected the request (${status})`);
    this.name = "AiRequestError";
    this.status = status;
  }
}

/** User-facing AI is switched off via AI_FEATURES_ENABLED=false. */
export class AiDisabledError extends Error {
  constructor() {
    super("AI features are disabled");
    this.name = "AiDisabledError";
  }
}

/** AI_FEATURES_ENABLED defaults to ON; only the literal "false" (any case) turns it off. */
export function aiFeaturesEnabled(env: ValidatedEnv): boolean {
  return (env.AI_FEATURES_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

const MAX_WAIT_ROUNDS = 3;
const SERVER_ERROR_COOLDOWN_MS = 120_000;
const QUOTA_BODY_DAILY = /per day|daily|requests per day|tokens per day|RPD|TPD/i;

/** Providers/models that rejected JSON mode with a 400 — skip `response_format` for them from now on. */
const noJsonMode = new Set<string>();

/** State shared by every physical call inside one runChat / runAgent invocation. */
interface RunState {
  disabled: Set<string>;
  lastProvider?: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface CallOutcome {
  message: ChatMessage;
  target: Target;
}

async function callWithFallback(
  env: ValidatedEnv,
  job: AiJob,
  request: ProviderRequest,
  opts: AiCallOptions,
  run: RunState,
  defaults: { timeoutMs: number; maxInlineWaitMs: number },
): Promise<CallOutcome> {
  try {
    return await callWithFallbackInner(env, job, request, opts, run, defaults);
  } finally {
    // Only does anything when a failure/exhaustion was queued during this call.
    await flushAiEvents(env, opts.ctx);
  }
}

async function callWithFallbackInner(
  env: ValidatedEnv,
  job: AiJob,
  request: ProviderRequest,
  opts: AiCallOptions,
  run: RunState,
  defaults: { timeoutMs: number; maxInlineWaitMs: number },
): Promise<CallOutcome> {
  const targets = buildChain(env, job, { needsTools: !!request.tools?.length, needsJson: !!request.json });
  if (targets.length === 0) throw new AiNotConfiguredError(job);

  const timeoutMs = opts.timeoutMs ?? defaults.timeoutMs;
  const maxInlineWaitMs = opts.maxInlineWaitMs ?? defaults.maxInlineWaitMs;
  const estimated = estimateTokens(JSON.stringify(request.messages) + JSON.stringify(request.tools ?? []));
  let guardError: GroqQuotaExceededError | null = null;

  for (let round = 0; round <= MAX_WAIT_ROUNDS; round++) {
    const candidates = targets.filter((t) => !run.disabled.has(t.provider));
    for (let i = 0; i < candidates.length; i++) {
      const target = candidates[i] as Target;
      if (exhaustedForMs(target.key) > 0) continue;
      const hasFallback = candidates.slice(i + 1).some((o) => exhaustedForMs(o.key) === 0);

      // Discovery's Groq model is governed by the 25/25/50 phase budgets.
      if (target.discoveryGuard && opts.phase) {
        try {
          await reserveGroqRequest(env, estimated, opts.phase, {
            // With a fallback available, don't sleep on the minute window — just move on.
            maxWaitAttempts: hasFallback ? 0 : 2,
            legacyKv: opts.legacyKv,
          });
        } catch (err) {
          if (!(err instanceof GroqQuotaExceededError)) throw err;
          // A phase used its own share: that phase is DONE for the day. Never
          // spill it onto other providers' budgets.
          if (err.reason === "rpd_phase" || err.reason === "tpd_phase") throw err;
          guardError = err;
          // Daily caps are marked so the rest of the run skips Groq. Minute
          // limits are only marked when another provider can take over (with
          // none, reserveGroqRequest already waited internally — marking
          // would make us wait twice). A request too big for ANY minute
          // window is never marked: it fails fast, exactly as before.
          const oversize = err.reason === "tpm" && estimated > GROQ_TPM_LIMIT;
          const daily = err.reason === "rpd" || err.reason === "tpd";
          if (daily || (!oversize && hasFallback)) markExhausted(target.key, err.retryAfterMs, `guard:${err.reason}`);
          continue;
        }
      }

      const result = await attemptTarget(env, target, request, timeoutMs, run);
      if (result) {
        await recordUsage(
          env,
          {
            provider: target.provider,
            model: target.model,
            tokens: result.tokens ?? estimated + estimateTokens(result.message.content ?? ""),
            phase: target.discoveryGuard ? opts.phase : undefined,
          },
          opts.ctx,
        );
        if (run.lastProvider && run.lastProvider !== target.provider) {
          logger.info("ai_provider_fallback", { job, from: run.lastProvider, to: target.provider });
        }
        run.lastProvider = target.provider;
        return { message: result.message, target };
      }
    }

    // Nothing answered. If the soonest reset is close enough, wait for it and re-check.
    const live = targets.filter((t) => !run.disabled.has(t.provider));
    const waits = live.map((t) => exhaustedForMs(t.key)).filter((ms) => ms > 0);
    const soonest = waits.length ? Math.min(...waits) : 0;
    if (round < MAX_WAIT_ROUNDS && soonest > 0 && soonest <= maxInlineWaitMs) {
      logger.warn("ai_waiting_for_reset", { job, waitMs: soonest, round });
      await sleep(soonest + 250);
      continue;
    }
    if (guardError) throw guardError;
    throw new AiExhaustedError(`All AI providers are exhausted for job "${job}"`, soonest);
  }
  throw new AiExhaustedError(`All AI providers are exhausted for job "${job}"`, 0);
}

/** One provider, up to two tries. Returns the answer, or null to move on to the next provider. */
async function attemptTarget(
  env: ValidatedEnv,
  target: Target,
  request: ProviderRequest,
  timeoutMs: number,
  run: RunState,
): Promise<{ message: ChatMessage; tokens?: number } | null> {
  let serverTries = 0;
  for (let guard = 0; guard < 4; guard++) {
    const useJson = !!request.json && !noJsonMode.has(target.key);
    const res = await callProvider(env, target, request, { json: useJson, timeoutMs });
    noteResponseHeaders(target.key, target.provider, res.headers);

    if (res.status === 200 && res.message) return { message: res.message, tokens: res.totalTokens };

    const status = res.status;
    if (status === 429 || status === 402) {
      const hinted = retryAfterMs(res.headers);
      const daily = status === 402 || QUOTA_BODY_DAILY.test(res.errorText ?? "");
      const waitMs = hinted ?? (daily ? msUntilDailyReset(target.provider) : 60_000);
      markExhausted(target.key, waitMs, `http:${status}`);
      recordAiError(target.provider, target.model, "quota");
      return null;
    }
    if (status === 413) {
      logger.warn("ai_request_too_large_for_provider", { provider: target.provider, model: target.model });
      markExhausted(target.key, 5_000, "http:413");
      recordAiError(target.provider, target.model, "too_large");
      return null;
    }
    if (status === 401 || status === 403) {
      logger.error("ai_provider_auth_failed", { provider: target.provider, status });
      run.disabled.add(target.provider);
      recordAiError(target.provider, target.model, "auth");
      return null;
    }
    if (status === 400 && useJson) {
      logger.warn("ai_json_mode_rejected_retrying_without", { provider: target.provider, model: target.model });
      noJsonMode.add(target.key);
      continue;
    }
    if (status === 0 || status >= 500) {
      if (serverTries === 0) {
        serverTries++;
        await sleep(500);
        continue;
      }
      logger.warn("ai_provider_unavailable", { provider: target.provider, status, timedOut: !!res.timedOut });
      markExhausted(target.key, SERVER_ERROR_COOLDOWN_MS, `http:${status}`);
      recordAiError(target.provider, target.model, res.timedOut ? "timeout" : status === 0 ? "network" : "server");
      return null;
    }
    // A model id the provider doesn't know (404, or a 400/422 that names the
    // model) is a CONFIGURATION fault of this one target, not of the request:
    // cool that target down and let the next provider answer. Logged loudly so
    // the bad id gets fixed.
    if (status === 404 || ((status === 400 || status === 422) && /model/i.test(res.errorText ?? ""))) {
      logger.error("ai_model_rejected", {
        provider: target.provider,
        model: target.model,
        status,
        detail: (res.errorText ?? "").slice(0, 300),
      });
      markExhausted(target.key, 10 * 60_000, `http:${status}`);
      recordAiError(target.provider, target.model, "bad_request");
      return null;
    }
    // Any other 4xx: our request is wrong. Falling back would hide the bug.
    logger.error("ai_request_rejected", {
      provider: target.provider,
      model: target.model,
      status,
      detail: (res.errorText ?? "").slice(0, 300),
    });
    recordAiError(target.provider, target.model, "bad_request");
    throw new AiRequestError(status, target.provider);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * One prompt in, one answer out (no tools). Used by every user-facing AI
 * feature. Throws AiDisabledError when AI_FEATURES_ENABLED=false,
 * AiNotConfiguredError / AiExhaustedError / AiRequestError otherwise —
 * callers map those to an honest message or a non-AI fallback.
 */
export async function runChat(
  env: ValidatedEnv,
  job: AiJob,
  messages: ChatMessage[],
  options: AiCallOptions = {},
): Promise<AiResult> {
  if (job !== "discovery" && !aiFeaturesEnabled(env)) throw new AiDisabledError();
  const { message, target } = await callWithFallback(
    env,
    job,
    { messages, temperature: options.temperature, maxTokens: options.maxTokens, json: options.json },
    options,
    { disabled: new Set() },
    { timeoutMs: 30_000, maxInlineWaitMs: 2_000 },
  );
  return { content: (message.content ?? "").trim(), provider: target.provider, model: target.model };
}

export interface AgentInput {
  system: string;
  user: string;
  tools: ToolDeclaration[];
  dispatch: ToolDispatcher;
  /** Default 12 — see the note in groq.ts's history: room to finish even when several turns wait out a minute window. */
  maxTurns?: number;
}

export interface AgentResult extends AiResult {
  turns: number;
}

/**
 * Function-calling loop (the old runGroqAgent, generalised): the model
 * decides which tools to call and how often; this executes them via
 * `dispatch` and returns the model's final text. Callers parse that text
 * (json.ts) — a malformed answer is the caller's concern, never fabricated.
 * Fallback can switch providers between turns; the OpenAI-format history
 * carries over as-is (cross-provider tool-call replay is untested — see the
 * Part 1 "not done / risks" notes).
 */
export async function runAgent(
  env: ValidatedEnv,
  job: AiJob,
  input: AgentInput,
  options: AiCallOptions = {},
): Promise<AgentResult> {
  if (job !== "discovery" && !aiFeaturesEnabled(env)) throw new AiDisabledError();
  const messages: ChatMessage[] = [
    { role: "system", content: input.system },
    { role: "user", content: input.user },
  ];
  const run: RunState = { disabled: new Set() };
  const maxTurns = input.maxTurns ?? 12;

  for (let turn = 0; turn < maxTurns; turn++) {
    const sizeEstimate = estimateTokens(JSON.stringify(messages) + JSON.stringify(input.tools));
    // Diagnostic only: which part of an oversized request is the culprit. Lengths, never content.
    // Logged as requestSizeEstimate — logger.ts redacts any field whose name contains "token".
    if (sizeEstimate > GROQ_TPM_LIMIT * 0.5) {
      logger.warn("ai_request_size_breakdown", {
        turn,
        job,
        requestSizeEstimate: sizeEstimate,
        toolsSchemaChars: JSON.stringify(input.tools).length,
        messageCharsByIndex: messages.map((m, i) => ({
          index: i,
          role: m.role,
          contentChars: typeof m.content === "string" ? m.content.length : 0,
          toolCallsChars: m.tool_calls ? JSON.stringify(m.tool_calls).length : 0,
        })),
      });
    }

    const { message, target } = await callWithFallback(
      env,
      job,
      { messages, tools: input.tools, temperature: options.temperature ?? 0.4, maxTokens: options.maxTokens },
      options,
      run,
      { timeoutMs: 60_000, maxInlineWaitMs: 65_000 },
    );

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return { content: (message.content ?? "").trim(), provider: target.provider, model: target.model, turns: turn + 1 };
    }

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: toolCalls });
    for (const call of toolCalls) {
      let result: unknown;
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        result = await input.dispatch(call.function.name, args);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      const resultContent = JSON.stringify(result);
      // Diagnostic only: no known tool should legitimately return anything near this size.
      if (resultContent.length > 20000) {
        logger.warn("ai_tool_result_oversized", {
          turn,
          toolName: call.function.name,
          toolArgs: args,
          resultChars: resultContent.length,
        });
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: resultContent });
    }
  }

  throw new Error("AI agent exceeded max turns without a final answer");
}