// devtunnel-backend/src/lib/ai/chain.ts
import type { ValidatedEnv } from "../../config/env";
import { resolveTarget, PROVIDERS, type ProviderId, type Target } from "./providers";

/**
 * job -> ordered provider list (the provider map from the AI build plan).
 *
 * A provider with no key/binding or no model configured is skipped, so the
 * chain degrades to whatever the operator has actually set up. A job with no
 * dedicated key and no backup key configured simply has no Groq candidate and
 * falls through to the other providers (callers surface an honest
 * "AI unavailable" if none remain).
 */
export type AiJob = "discovery" | "search" | "summary" | "explain" | "insights";

interface ChainEntry {
  provider: ProviderId;
  /** Use this env var as the model instead of the provider's default one. */
  modelVar?: keyof ValidatedEnv;
}

/**
 * Which job each DEDICATED Groq key belongs to. A key listed here is used by
 * that job and by NO other job — not even as a last resort — so one busy
 * feature can never drain another feature's Groq budget. Groq providers not
 * listed (`groq_backup`, `groq_b`) are shared backups usable by every job.
 */
const GROQ_SLOT_JOB: Partial<Record<ProviderId, AiJob>> = {
  groq: "discovery",
  groq_search: "search",
  groq_summary: "summary",
  groq_explain: "explain",
  groq_insights: "insights",
};

/**
 * Order for every job: its own dedicated Groq key -> the shared Groq backups
 * (groq_backup, then groq_b) -> the job's other providers -> the global
 * last-resort list (which includes Gemini and OpenRouter).
 */
const JOB_CHAINS: Record<AiJob, ChainEntry[]> = {
  // Discovery agent (tool calling): Groq gpt-oss-120b on its own key.
  discovery: [{ provider: "groq" }, { provider: "groq_backup" }, { provider: "groq_b" }, { provider: "cerebras" }],
  // Search bar: small fast Groq model on the search key.
  search: [
    { provider: "groq_search" },
    { provider: "groq_backup", modelVar: "GROQ_SEARCH_MODEL" },
    { provider: "groq_b", modelVar: "GROQ_SEARCH_MODEL" },
    { provider: "cerebras" },
    { provider: "workers_ai" },
  ],
  // Summaries: own Groq key (secondary model), Groq backups, then Gemini Flash-Lite, Mistral.
  summary: [
    { provider: "groq_summary" },
    { provider: "groq_backup", modelVar: "GROQ_SECONDARY_MODEL" },
    { provider: "groq_b", modelVar: "GROQ_SECONDARY_MODEL" },
    { provider: "gemini" },
    { provider: "mistral" },
  ],
  // Issue explanations: own Groq key (secondary model), Groq backups, then Cerebras, Mistral.
  explain: [
    { provider: "groq_explain" },
    { provider: "groq_backup", modelVar: "GROQ_SECONDARY_MODEL" },
    { provider: "groq_b", modelVar: "GROQ_SECONDARY_MODEL" },
    { provider: "cerebras" },
    { provider: "mistral" },
  ],
  // Issue insights: own Groq key (secondary model), Groq backups, then Mistral, Workers AI.
  insights: [
    { provider: "groq_insights" },
    { provider: "groq_backup", modelVar: "GROQ_SECONDARY_MODEL" },
    { provider: "groq_b", modelVar: "GROQ_SECONDARY_MODEL" },
    { provider: "mistral" },
    { provider: "workers_ai" },
  ],
};

/**
 * Global last-resort order once a job's own list is exhausted. Shared Groq
 * backups first, then the named backup providers (Gemini, OpenRouter), then
 * the rest. Dedicated Groq keys are NOT here: they only ever serve their own
 * job (see GROQ_SLOT_JOB).
 */
const LAST_RESORT: ProviderId[] = [
  "groq_backup",
  "groq_b",
  "cerebras",
  "gemini",
  "openrouter",
  "mistral",
  "workers_ai",
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
 * Groq rules:
 *  - a dedicated key (GROQ_SLOT_JOB) is only ever added to its own job's chain;
 *  - the shared backups use GROQ_MODEL for discovery only. Every other job
 *    uses its own model (search model for search, secondary model otherwise)
 *    and NEVER GROQ_MODEL: its daily budget belongs to the discovery agent
 *    (25/25/50 phase split), and a user-facing fallback must not burn it.
 */
export function buildChain(env: ValidatedEnv, job: AiJob, needs: ChainNeeds): Target[] {
  const excluded = new Set(EXCLUDED[job] ?? []);
  const targets: Target[] = [];
  const seen = new Set<string>();

  const push = (provider: ProviderId, modelVar?: keyof ValidatedEnv) => {
    if (excluded.has(provider)) return;
    // A dedicated Groq key serves only its own job.
    const slotJob = GROQ_SLOT_JOB[provider];
    if (slotJob && slotJob !== job) return;
    const def = PROVIDERS[provider];
    if (needs.needsTools && !def.toolCalling) return;
    const target = resolveTarget(env, provider, modelVar);
    if (!target || seen.has(target.key)) return;
    seen.add(target.key);
    targets.push(target);
  };

  for (const entry of JOB_CHAINS[job]) push(entry.provider, entry.modelVar);
  for (const provider of LAST_RESORT) {
    // Shared Groq backups: discovery uses the discovery model, every other job the secondary model.
    if ((provider === "groq_backup" || provider === "groq_b") && job !== "discovery") {
      push(provider, job === "search" ? "GROQ_SEARCH_MODEL" : "GROQ_SECONDARY_MODEL");
    } else push(provider);
  }
  return targets;
}