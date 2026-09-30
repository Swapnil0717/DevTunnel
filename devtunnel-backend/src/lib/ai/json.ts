// devtunnel-backend/src/lib/ai/json.ts
import type { z } from "zod";
import type { ValidatedEnv } from "../../config/env";
import { logger } from "../logger";
import type { AiJob } from "./chain";
import type { ChatMessage } from "./providers";
import { runChat, type AiCallOptions } from "./client";

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
 * runChat + extractJson + zod, with ONE repair retry: the model is shown
 * (a truncated copy of) its own invalid reply and the validation problem
 * and asked for corrected JSON only. A second failure throws AiJsonError —
 * callers fall back to a non-AI result or an honest error, never a guess.
 * Prompts and full model output are never logged (rule 8).
 */
export async function runJson<S extends z.ZodTypeAny>(
  env: ValidatedEnv,
  job: AiJob,
  messages: ChatMessage[],
  schema: S,
  options: AiCallOptions = {},
): Promise<JsonResult<z.infer<S>>> {
  const first = await runChat(env, job, messages, { ...options, json: true });
  const attempt = (raw: string): { ok: true; data: z.infer<S> } | { ok: false; problem: string } => {
    try {
      const parsed = schema.safeParse(extractJson(raw));
      if (parsed.success) return { ok: true, data: parsed.data };
      return { ok: false, problem: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    } catch (err) {
      return { ok: false, problem: err instanceof Error ? err.message : "invalid JSON" };
    }
  };

  const firstTry = attempt(first.content);
  if (firstTry.ok) return { data: firstTry.data, provider: first.provider, model: first.model, repaired: false };

  logger.warn("ai_json_invalid_retrying", { job, provider: first.provider, replyChars: first.content.length });
  const repairMessages: ChatMessage[] = [
    ...messages,
    { role: "assistant", content: first.content.slice(0, 4000) },
    {
      role: "user",
      content: `Your previous reply was rejected (${firstTry.problem.slice(0, 300)}). Reply again with ONLY the corrected JSON, no prose, no code fences.`,
    },
  ];
  const second = await runChat(env, job, repairMessages, { ...options, json: true });
  const secondTry = attempt(second.content);
  if (secondTry.ok) return { data: secondTry.data, provider: second.provider, model: second.model, repaired: true };

  logger.error("ai_json_invalid_giving_up", { job, provider: second.provider, replyChars: second.content.length });
  throw new AiJsonError("Model did not return valid JSON after one repair attempt");
}
