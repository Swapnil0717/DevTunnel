// devtunnel-backend/src/lib/ai/json.ts
import type { z } from "zod";
import type { ValidatedEnv } from "../../config/env";
import { logger } from "../logger";
import type { AiJob } from "./chain";
import type { ChatMessage } from "./providers";
import { AiExhaustedError, AiNotConfiguredError, runChat, type AiCallOptions } from "./client";

/**
 * Strict JSON extraction + zod validation (Part 1 rules 5 and 6: AI output
 * is untrusted data; validate it, drop anything invalid, never fabricate a
 * parse result).
 */
export class AiJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiJsonError";
  }
}

/**
 * Pulls a JSON value out of a model reply. Handles ```json fences and
 * stray prose around the payload by slicing from the first `{`/`[` to the
 * last matching closer. Throws AiJsonError if nothing parses.
 */
export function extractJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through to slice-based recovery
  }
  const firstObj = cleaned.indexOf("{");
  const firstArr = cleaned.indexOf("[");
  const start = firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start === -1) throw new AiJsonError("No JSON found in model reply");
  const closer = cleaned[start] === "{" ? "}" : "]";
  const end = cleaned.lastIndexOf(closer);
  if (end <= start) throw new AiJsonError("Unterminated JSON in model reply");
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new AiJsonError("Model reply was not valid JSON");
  }
}

export interface JsonResult<T> {
  data: T;
  provider: string;
  model: string;
  repaired: boolean;
}

/**
 * runChat + extractJson + zod, with PROVIDER FAILOVER on unusable output:
 * when a model's reply is empty, truncated or fails validation, that provider
 * is skipped and the SAME prompt goes to the next provider in the job's chain
 * (Groq keys first, then the backups, then Gemini / OpenRouter / the rest), up
 * to MAX_PROVIDER_ATTEMPTS providers. Only when no other provider is available
 * does it fall back to the old single "repair" retry on the first provider
 * (the model is shown a truncated copy of its own invalid reply and the
 * validation problem). Still failing -> AiJsonError — callers fall back to a
 * non-AI result or an honest error, never a guess. Prompts and full model
 * output are never logged (rule 8).
 */
const MAX_PROVIDER_ATTEMPTS = 3;

export async function runJson<S extends z.ZodTypeAny>(
  env: ValidatedEnv,
  job: AiJob,
  messages: ChatMessage[],
  schema: S,
  options: AiCallOptions = {},
): Promise<JsonResult<z.infer<S>>> {
  const attempt = (raw: string): { ok: true; data: z.infer<S> } | { ok: false; problem: string } => {
    try {
      const parsed = schema.safeParse(extractJson(raw));
      if (parsed.success) return { ok: true, data: parsed.data };
      return { ok: false, problem: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    } catch (err) {
      return { ok: false, problem: err instanceof Error ? err.message : "invalid JSON" };
    }
  };

  const skipTargets: string[] = [...(options.skipTargets ?? [])];
  let first: { content: string; provider: string; model: string } | null = null;
  let firstProblem = "";

  for (let n = 0; n < MAX_PROVIDER_ATTEMPTS; n++) {
    let res: Awaited<ReturnType<typeof runChat>>;
    try {
      res = await runChat(env, job, messages, { ...options, json: true, skipTargets });
    } catch (err) {
      // No further provider left to try: stop failing over (the first reply, if any, gets one repair below).
      if (n > 0 && (err instanceof AiExhaustedError || err instanceof AiNotConfiguredError)) break;
      throw err;
    }
    const tried = attempt(res.content);
    if (tried.ok) return { data: tried.data, provider: res.provider, model: res.model, repaired: false };

    logger.warn("ai_json_invalid_trying_next_provider", {
      job,
      provider: res.provider,
      model: res.model,
      replyChars: res.content.length,
    });
    if (!first) {
      first = res;
      firstProblem = tried.problem;
    }
    skipTargets.push(`${res.provider}:${res.model}`);
  }

  if (first) {
    // Last chance: ONE repair retry on the first provider (no skip list).
    const repairMessages: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: first.content.slice(0, 4000) },
      {
        role: "user",
        content: `Your previous reply was rejected (${firstProblem.slice(0, 300)}). Reply again with ONLY the corrected JSON, no prose, no code fences.`,
      },
    ];
    try {
      const second = await runChat(env, job, repairMessages, { ...options, json: true });
      const secondTry = attempt(second.content);
      if (secondTry.ok) return { data: secondTry.data, provider: second.provider, model: second.model, repaired: true };
      logger.error("ai_json_invalid_giving_up", { job, provider: second.provider, replyChars: second.content.length });
    } catch (err) {
      if (!(err instanceof AiExhaustedError || err instanceof AiNotConfiguredError)) throw err;
    }
  }
  throw new AiJsonError("Model did not return valid JSON from any provider");
}