import type { ValidatedEnv } from "../config/env";
import { logger } from "./logger";

/**
 * Minimal Gemini function-calling client. Calls the REST API directly
 * (no SDK dependency — keeps the Workers bundle small, same reasoning
 * this codebase already applies to every other lib/ file). Gemini
 * decides which tools to call and how many times; this file only
 * executes the loop and returns whatever final text Gemini produces.
 */

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type GeminiToolDispatcher = (name: string, args: Record<string, unknown>) => Promise<unknown>;

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: { result: unknown } };
}

interface GeminiContent {
  role: "user" | "model" | "function";
  parts: GeminiPart[];
}

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TURNS = 12;

/**
 * Runs an agentic loop: sends `systemPrompt` + `userPrompt`, lets Gemini
 * call any of `tools` as many times as it wants (dispatched via
 * `dispatch`), and returns the model's final plain-text answer. The
 * caller is expected to instruct Gemini (in the prompt) to end with a
 * strict JSON payload and nothing else — this function does not parse
 * JSON itself, callers do, so a malformed response is a caller-level
 * concern (rule 37/38: never fabricate a parse result).
 */
export async function runGeminiAgent(
  env: ValidatedEnv,
  systemPrompt: string,
  userPrompt: string,
  tools: GeminiFunctionDeclaration[],
  dispatch: GeminiToolDispatcher,
): Promise<string> {
  const contents: GeminiContent[] = [{ role: "user", parts: [{ text: userPrompt }] }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch(`${GEMINI_API}/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: tools.length ? [{ functionDeclarations: tools }] : undefined,
        generationConfig: { temperature: 0.4 },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error("gemini_request_failed", { status: res.status, body: body.slice(0, 500), turn });
      throw new Error(`Gemini API ${res.status}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content: { role: string; parts: GeminiPart[] }; finishReason?: string }>;
    };

    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new Error("Gemini returned no candidates");
    }

    const parts = candidate.content.parts ?? [];
    const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);

    if (functionCalls.length === 0) {
      return parts.map((p) => p.text ?? "").join("").trim();
    }

    contents.push({ role: "model", parts });

    const functionResponseParts: GeminiPart[] = [];
    for (const call of functionCalls) {
      let result: unknown;
      try {
        result = await dispatch(call.name, call.args ?? {});
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      functionResponseParts.push({ functionResponse: { name: call.name, response: { result } } });
    }
    contents.push({ role: "function", parts: functionResponseParts });
  }

  throw new Error("Gemini agent exceeded max turns without a final answer");
}

/** Strips ``` json fences Gemini sometimes wraps its final answer in, then parses it. */
export function parseGeminiJson<T>(raw: string): T {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned) as T;
}