// devtunnel-backend/src/lib/ai/prompts/search.ts
import { z } from "zod";
import type { ChatMessage } from "../providers";
import { UNTRUSTED_INPUT_NOTICE, wrapUntrusted } from "./untrusted";

/**
 * Prompt + output schema for the "search" AI job (Part 2: AI search on
 * GitHub Projects / GitHub Open Source Tools; Part 3 reuses it for the
 * DevTunnel-side lists).
 *
 * The model does ONE thing: turn a free-text request ("a tool that helps
 * with frontend design") into search terms. It never sees the catalog and
 * never picks repositories — ranking is done by our own deterministic
 * scoring (lib/ai/scoring.ts) over rows we already hold, so the model can
 * not invent a repository that doesn't exist (Part 1 rule 6).
 *
 * The user's prompt is UNTRUSTED (rule 5): it goes in a delimited block and
 * the system prompt says to ignore instructions inside it. The schema below
 * is deliberately lenient (plain string arrays); `sanitizeInterpretation`
 * in lib/githubCatalogAiSearch.ts then drops anything malformed one item at
 * a time, so one bad keyword doesn't throw away an otherwise good answer.
 */

export const SEARCH_MAX_OUTPUT_TOKENS = 300;

export const searchInterpretationSchema = z.object({
  keywords: z.array(z.string()).max(30).default([]),
  techStack: z.array(z.string()).max(30).default([]),
  languages: z.array(z.string()).max(30).default([]),
  intent: z.string().max(600).default(""),
});

export type RawSearchInterpretation = z.infer<typeof searchInterpretationSchema>;

const SYSTEM_PROMPT = [
  "You turn a developer's plain-English request into search terms for a catalog of open-source GitHub repositories.",
  "You do NOT choose repositories and you do not know what is in the catalog. Output search terms only.",
  "",
  "Reply with ONE JSON object and nothing else, exactly this shape:",
  '{"keywords": string[], "techStack": string[], "languages": string[], "intent": string}',
  "",
  "Rules:",
  "- keywords: up to 8 lowercase words or short terms likely to appear in a repository's name or description. Include close synonyms and related terms (for \"frontend design\": ui, css, design-system, components, styling). No filler words (tool, project, app, help, want, need).",
  "- techStack: only well-known technology names the request clearly implies or names (for example react, typescript, tailwind, docker). Empty array if none. Do not guess.",
  "- languages: only programming languages the request names or clearly implies (for example rust, python, go). Empty array if none.",
  "- intent: ONE short plain-text sentence (max 20 words) restating what the person is looking for. No markdown, no HTML.",
  "- Never invent repository names. Never output URLs.",
  "",
  UNTRUSTED_INPUT_NOTICE,
].join("\n");

/** Builds the chat messages for one search request. `prompt` is the user's already-trimmed text. */
export function buildSearchMessages(prompt: string): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Convert this search request into the JSON described above.\n\n${wrapUntrusted("USER SEARCH REQUEST", prompt, 300)}`,
    },
  ];
}
