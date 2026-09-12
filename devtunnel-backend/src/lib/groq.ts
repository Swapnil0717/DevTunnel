import type { ValidatedEnv } from "../config/env";
import { logger } from "./logger";
import { reserveGroqRequest, estimateTokens } from "./groqQuota";

/**
 * Minimal Groq function-calling client (OpenAI-compatible
 * `/openai/v1/chat/completions` endpoint). Calls the REST API directly
 * (no SDK dependency — keeps the Workers bundle small, same reasoning
 * this codebase already applies to every other lib/ file). Groq
 * decides which tools to call and how many times; this file only
 * executes the loop and returns whatever final text Groq produces.
 *
 * Replaces the previous Gemini-based client (src/lib/gemini.ts). Gemini's
 * free tier (5 RPM / 20 RPD on the model this project used) could not
 * sustain a single discovery run — see geminiQuota.ts's git history for
 * the numbers. Groq's free tier on a tool-calling-capable model
 * (openai/gpt-oss-120b: 30 RPM / 1,000 RPD / 8,000 TPM / 200,000 TPD) is
 * comfortably enough on request count, but its TOKENS-per-minute cap is
 * tight relative to this agent's payloads (READMEs, issue bodies, growing
 * conversation history) — see groqQuota.ts for how that's rationed, and
 * the trims in aiDiscoveryTools.ts / githubDiscovery.ts that shrink those
 * payloads to fit.
 *
 * NOTE: groq/compound and groq/compound-mini are NOT usable here — Groq's
 * compound systems only support their own built-in tools (web search, code
 * execution) and explicitly do not support custom user-provided tools, so
 * GROQ_MODEL must stay pointed at a plain chat-completion model such as
 * openai/gpt-oss-120b.
 */

export interface GroqFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type GroqToolDispatcher = (name: string, args: Record<string, unknown>) => Promise<unknown>;

interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
}

const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
// Kept low for the same reason the old Gemini client kept MAX_TURNS at 6:
// every turn re-sends the full growing conversation, and Groq's TPM cap
// on tool-calling models (8K on openai/gpt-oss-120b) is the binding
// constraint, not request count.
const MAX_TURNS = 6;
const MAX_RATE_LIMIT_RETRIES = 3;

/** Sleeps for `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Groq's 429 response carries a `Retry-After` header (unlike Gemini,
 * which embedded the hint inside the message body) — prefer that, fall
 * back to exponential backoff if it's missing.
 */
function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get("retry-after");
  if (header) {
    const seconds = Number.parseFloat(header);
    if (!Number.isNaN(seconds)) return Math.ceil(seconds * 1000) + 250;
  }
  return 2 ** attempt * 1000;
}

function toGroqTools(tools: GroqFunctionDeclaration[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/**
 * Runs an agentic loop: sends `systemPrompt` + `userPrompt`, lets Groq
 * call any of `tools` as many times as it wants (dispatched via
 * `dispatch`), and returns the model's final plain-text answer. The
 * caller is expected to instruct the model (in the prompt) to end with a
 * strict JSON payload and nothing else — this function does not parse
 * JSON itself, callers do, so a malformed response is a caller-level
 * concern (rule 37/38: never fabricate a parse result).
 */
export async function runGroqAgent(
  env: ValidatedEnv,
  kv: KVNamespace,
  systemPrompt: string,
  userPrompt: string,
  tools: GroqFunctionDeclaration[],
  dispatch: GroqToolDispatcher,
): Promise<string> {
  const messages: GroqMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  const groqTools = toGroqTools(tools);

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let data:
      | { choices?: Array<{ message: GroqMessage; finish_reason?: string }> }
      | undefined;

    const requestBody = JSON.stringify({
      model: env.GROQ_MODEL,
      messages,
      tools: groqTools.length ? groqTools : undefined,
      temperature: 0.4,
    });
    // Groq's TPM limit is the binding constraint (see groqQuota.ts) —
    // estimate this request's token footprint so the reservation can wait
    // out a tight minute window instead of firing straight into a 429.
    const estimatedTokens = estimateTokens(requestBody);

    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      // Reserve budget for this exact physical call BEFORE making it.
      // Throws GroqQuotaExceededError("rpd" | "tpd", ...) immediately (no
      // retry) once today's daily budget is gone — callers
      // (aiDiscoveryAgent.ts) catch that specifically and stop early
      // instead of treating it as a generic failure to retry.
      await reserveGroqRequest(kv, estimatedTokens);

      const res = await fetch(GROQ_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: requestBody,
      });

      if (res.ok) {
        data = await res.json();
        break;
      }

      const body = await res.text().catch(() => "");

      if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        const delayMs = retryDelayMs(res, attempt);
        logger.warn("groq_rate_limited_retrying", { turn, attempt, delayMs });
        await sleep(delayMs);
        continue;
      }

      logger.error("groq_request_failed", { status: res.status, body: body.slice(0, 500), turn });
      throw new Error(`Groq API ${res.status}`);
    }

    if (!data) {
      throw new Error("Groq API request failed after retries");
    }

    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error("Groq returned no choices");
    }

    const message = choice.message;
    const toolCalls = message.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return (message.content ?? "").trim();
    }

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: toolCalls });

    for (const call of toolCalls) {
      let result: unknown;
      try {
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        result = await dispatch(call.function.name, args);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  throw new Error("Groq agent exceeded max turns without a final answer");
}

/** Strips ``` json fences the model sometimes wraps its final answer in, then parses it. */
export function parseGroqJson<T>(raw: string): T {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned) as T;
}