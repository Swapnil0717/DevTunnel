export type AiDiscoveryStatus = "PENDING" | "APPROVED" | "REJECTED";
export type AiDiscoveryDifficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export interface AiDiscoveryCounters {
  discoveryDate: string;
  projectsBeginner: number;
  projectsIntermediate: number;
  projectsAdvanced: number;
  toolsFound: number;
  toolCategoriesFound: string[];
  tasksFound: number;
  projectsRemaining: { beginner: number; intermediate: number; advanced: number };
  toolCategoriesRemaining: string[];
}

export interface AiDiscoveredProject {
  id: string;
  repositoryUrl: string;
  githubFullName: string;
  githubDescription: string | null;
  primaryLanguage: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  description: string;
  category: string;
  difficulty: AiDiscoveryDifficulty;
  aiReasoning: string;
  status: AiDiscoveryStatus;
  createdAt: string;
}

export interface AiDiscoveredTool {
  id: string;
  sourceUrl: string;
  name: string;
  fetchedDescription: string | null;
  primaryLanguage: string | null;
  category: string;
  labels: string[];
  description: string;
  setupGuide: string;
  aiReasoning: string;
  status: AiDiscoveryStatus;
  createdAt: string;
}

export interface AiDiscoveredTask {
  id: string;
  projectName: string;
  projectSlug: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  issueLabels: string[];
  suggestedRoles: string[];
  suggestedDifficulty: string | null;
  taskSummary: string;
  aiReasoning: string;
  status: AiDiscoveryStatus;
  createdAt: string;
}

export interface AiConfirmationQueue {
  projects: AiDiscoveredProject[];
  tools: AiDiscoveredTool[];
  tasks: AiDiscoveredTask[];
}

/**
 * `groqQuotaExceeded` is true when the run stopped early because the
 * shared Groq free-tier daily budget ran out partway through — the
 * run button shows a distinct "limit hit" banner for this, separate
 * from the generic error state.
 */
export interface AiDiscoveryRunSummary {
  date: string;
  projectsProposed: number;
  toolsProposed: number;
  tasksProposed: number;
  candidatesDropped: number;
  errors: string[];
  groqQuotaExceeded: boolean;
}

/**
 * Response body of both `GET` and `PUT /admin/ai/budget`
 * (devtunnel-backend `groqQuota.ts` getPhaseBudgetShares /
 * setPhaseBudgetShares) — the admin-configured split of the shared daily
 * Groq budget across the three discovery phases, as whole percentages
 * that always add up to 100. Defaults to 25/25/50 (projects/tools/tasks)
 * until an admin sets a custom split.
 */
export interface PhaseBudgetShares {
  projects: number;
  tools: number;
  tasks: number;
}

/**
 * Response body of `GET /admin/ai/groq-quota` (devtunnel-backend
 * `GroqQuotaSnapshot`) — how much of the shared Groq request/token
 * budget is left this minute and today. Backs `GroqQuotaPanel`.
 */
export interface GroqQuotaSnapshot {
  limitPerMinute: number;
  usedThisMinute: number;
  remainingThisMinute: number;
  limitPerDay: number;
  usedToday: number;
  remainingToday: number;
  tokenLimitPerMinute: number;
  tokensUsedThisMinute: number;
  tokensRemainingThisMinute: number;
  tokenLimitPerDay: number;
  tokensUsedToday: number;
  tokensRemainingToday: number;
  dailyResetsAt: string;
  /**
   * The daily budget above, split by discovery phase — 25% projects,
   * 25% tools, 50% tasks (devtunnel-backend `groqQuota.ts`
   * PHASE_BUDGET_SHARE), listed in the order the phases actually run
   * (projects -> tools -> tasks — projects and tools always spend their
   * share before tasks/issues gets a turn). Lets the panel show, e.g.,
   * "tasks" already exhausted for today while "projects" still has
   * room, which the account-wide numbers above can't distinguish.
   */
  phases: Array<{
    phase: "projects" | "tools" | "tasks";
    sharePct: number;
    limitPerDay: number;
    usedToday: number;
    remainingToday: number;
    tokenLimitPerDay: number;
    tokensUsedToday: number;
    tokensRemainingToday: number;
  }>;
}

// ---------------------------------------------------------------------------
// Multi-provider usage (Part 7) — `GET /admin/ai/providers`
// (devtunnel-backend `src/lib/ai/adminProviders.ts`). Backs `ProviderUsageTable`.
// ---------------------------------------------------------------------------

export type AiProviderId = "groq" | "groq_b" | "cerebras" | "gemini" | "mistral" | "openrouter" | "github_models" | "workers_ai";

/** `not_configured` = a key/binding or model variable is missing, so the provider is skipped entirely. */
export type AiProviderStatusKind = "available" | "exhausted" | "not_configured";

/** What kind of failure a provider last had (set by the backend AI client, one per failed attempt). */
export type AiProviderErrorClass = "quota" | "too_large" | "auth" | "server" | "timeout" | "network" | "bad_request";

export interface AiProviderModelUsage {
  model: string;
  /** Which job the model serves when a provider runs several (Groq only), e.g. "discovery", "search". */
  role: string | null;
  requestsToday: number;
  /** The provider's reported total when it sent one, otherwise a chars/3.5 estimate. */
  tokensEstToday: number;
  status: "available" | "exhausted";
  exhaustedUntil: string | null;
  exhaustedReason: string | null;
}

export interface AiProviderUsage {
  id: AiProviderId;
  label: string;
  configured: boolean;
  /** What to set to enable it, e.g. `API key (MISTRAL_API_KEY)` — names a variable, never a value. */
  missing: string[];
  status: AiProviderStatusKind;
  /** Soonest time a fully exhausted provider is usable again. */
  exhaustedUntil: string | null;
  requestsToday: number;
  tokensEstToday: number;
  dailyResetsAt: string;
  lastError: { errorClass: AiProviderErrorClass | string; at: string; model: string } | null;
  /** Today's failure counts by class, e.g. `{ quota: 2 }`. */
  errorsToday: Record<string, number>;
  models: AiProviderModelUsage[];
}

export interface AiProvidersSnapshot {
  generatedAt: string;
  /** Mirrors AI_FEATURES_ENABLED. When false, user-facing AI is switched off (discovery is unaffected). */
  featuresEnabled: boolean;
  providers: AiProviderUsage[];
}