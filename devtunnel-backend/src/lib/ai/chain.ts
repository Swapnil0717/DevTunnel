// devtunnel-backend/src/lib/ai/chain.ts
import type { ValidatedEnv } from "../../config/env";
import { resolveTarget, PROVIDERS, type ProviderId, type Target } from "./providers";

/**
 * job -> ordered provider list (the provider map from the AI build plan).
 *
 * A provider with no key/binding or no model configured is skipped, so the
 * chain degrades to whatever the operator has actually set up. With only
 * GROQ_API_KEY present, every job that can use Groq works and the rest
 * simply have no candidates (callers surface an honest "AI unavailable").
 */
export type AiJob = "discovery" | "search" | "summary" | "explain" | "insights";

interface ChainEntry {
  provider: ProviderId;
  /** Use this env var as the model instead of the provider's default one. */
  modelVar?: keyof ValidatedEnv;
}

const JOB_CHAINS: Record<AiJob, ChainEntry[]> = {
  // Existing agent: Groq gpt-oss-120b, then Cerebras, then Gemini.
  discovery: [{ provider: "groq" }, { provider: "groq_b" }, { provider: "cerebras" }, { provider: "gemini" }],
  // Search bar: a small fast Groq model (its own per-model budget, separate
  // from discovery's), then Cerebras, then Workers AI.
  search: [
    { provider: "groq", modelVar: "GROQ_SEARCH_MODEL" },
    { provider: "groq_b", modelVar: "GROQ_SEARCH_MODEL" },
    { provider: "cerebras" },
    { provider: "workers_ai" },
  ],
  // Summaries: Gemini Flash-Lite, then Mistral, then OpenRouter.
  summary: [{ provider: "gemini" }, { provider: "mistral" }, { provider: "openrouter" }],
  // Issue explanations: Cerebras, then a second Groq model, then Mistral.
  explain: [
    { provider: "cerebras" },
    { provider: "groq", modelVar: "GROQ_SECONDARY_MODEL" },
    { provider: "groq_b", modelVar: "GROQ_SECONDARY_MODEL" },
    { provider: "mistral" },
  ],
  // Issue insights: Mistral (reserved for this job), then second Groq model, OpenRouter, Workers AI.
  insights: [
    { provider: "mistral" },
    { provider: "groq", modelVar: "GROQ_SECONDARY_MODEL" },
    { provider: "groq_b", modelVar: "GROQ_SECONDARY_MODEL" },
    { provider: "openrouter" },
    { provider: "workers_ai" },
  ],
};

/** Global last-resort order once a job's own list is exhausted. */
const LAST_RESORT: ProviderId[] = [
  "groq",
  "groq_b",
  "cerebras",
  "gemini",
  "mistral",
  "workers_ai",
  "openrouter",
  "github_models",
];

/**
 * Data-terms exclusions. The search job carries USER-TYPED prompts.
 * Google's free tier has a data-use condition and Mistral's free plan
 * requires opting into training, so neither may ever see user text —
 * not even as a last resort. (Summaries/explanations/insights only send
 * public GitHub content, so they have no exclusions.)
 */
const EXCLUDED: Partial<Record<AiJob, ProviderId[]>> = {
  search: ["gemini", "mistral"],
};

export interface ChainNeeds {
  needsTools: boolean;
  needsJson: boolean;
}

/**
 * Builds the ordered, de-duplicated list of callable targets for a job.
 *
 * Last-resort Groq rule: for every job except discovery, the Groq
 * last-resort slot uses GROQ_SECONDARY_MODEL and NEVER GROQ_MODEL.
 * GROQ_MODEL's daily budget belongs to the discovery agent (25/25/50
 * phase split); a user-facing fallback must not silently burn it.
 */
export function buildChain(env: ValidatedEnv, job: AiJob, needs: ChainNeeds): Target[] {
  const excluded = new Set(EXCLUDED[job] ?? []);
  const targets: Target[] = [];
  const seen = new Set<string>();

  const push = (provider: ProviderId, modelVar?: keyof ValidatedEnv) => {
    if (excluded.has(provider)) return;
    const def = PROVIDERS[provider];
    if (needs.needsTools && !def.toolCalling) return;
    const target = resolveTarget(env, provider, modelVar);
    if (!target || seen.has(target.key)) return;
    seen.add(target.key);
    targets.push(target);
  };

  for (const entry of JOB_CHAINS[job]) push(entry.provider, entry.modelVar);
  for (const provider of LAST_RESORT) {
    if ((provider === "groq" || provider === "groq_b") && job !== "discovery") push(provider, "GROQ_SECONDARY_MODEL");
    else push(provider);
  }
  return targets;
}