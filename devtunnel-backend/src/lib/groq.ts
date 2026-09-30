import type { ValidatedEnv } from "../config/env";
import { AiExhaustedError, runAgent, type ToolDeclaration, type ToolDispatcher } from "./ai/client";
import { extractJson } from "./ai/json";
import { GroqQuotaExceededError, type DiscoveryPhase } from "./groqQuota";

/**
 * Compatibility shim over the shared AI client (src/lib/ai/client.ts).
 *
 * The Groq-only function-calling loop that used to live here — including
 * the six-KV-counter quota reservation that caused Workers KV write
 * blocking — has moved into `runAgent`, which is provider-agnostic: it
 * tries Groq first for the "discovery" job and falls through to Cerebras
 * and Gemini (when keys are configured) on quota/5xx/auth failures.
 *
 * The exports below keep their old names and signatures so
 * aiDiscoveryAgent.ts and aiDiscoveryTools.ts keep working untouched. The
 * `kv` parameter is retained only for source compatibility: it is no
 * longer written to (zero KV writes), and is used read-only to honour an
 * admin's old custom budget split until it is re-saved (groqQuota.ts).
 *
 * NOTE: groq/compound and groq/compound-mini are NOT usable here — Groq's
 * compound systems only support their own built-in tools, not custom ones,
 * so GROQ_MODEL must stay a plain chat-completion model such as
 * openai/gpt-oss-120b.
 */

export type GroqFunctionDeclaration = ToolDeclaration;
export type GroqToolDispatcher = ToolDispatcher;

/**
 * Runs the discovery agent loop and returns the model's final text.
 * Throws `GroqQuotaExceededError` when the phase's budget — or every
 * configured provider — is out of quota, which discovery catches to stop
 * early (unchanged contract).
 */
export async function runGroqAgent(
  env: ValidatedEnv,
  kv: KVNamespace,
  systemPrompt: string,
  userPrompt: string,
  tools: GroqFunctionDeclaration[],
  dispatch: GroqToolDispatcher,
  phase: DiscoveryPhase,
): Promise<string> {
  try {
    const result = await runAgent(
      env,
      "discovery",
      { system: systemPrompt, user: userPrompt, tools, dispatch },
      { phase, legacyKv: kv },
    );
    return result.content;
  } catch (err) {
    if (err instanceof AiExhaustedError) {
      // Long waits mean a daily cap; short ones a per-minute window.
      throw new GroqQuotaExceededError(err.retryAfterMs > 30 * 60_000 ? "rpd" : "rpm", err.retryAfterMs);
    }
    throw err;
  }
}

/** Strips ``` json fences the model sometimes wraps its final answer in, then parses it (throws if it can't). */
export function parseGroqJson<T>(raw: string): T {
  return extractJson(raw) as T;
}
