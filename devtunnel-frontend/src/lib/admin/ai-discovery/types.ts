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
 * Response body of `POST /admin/ai/run` (devtunnel-backend/src/types.ts
 * `AiDiscoveryRunSummary`). `candidatesDropped` counts candidates the
 * agent evaluated but did not save — duplicates or ones that failed
 * validation (see the backend type's own doc comment) — distinct from
 * `errors`, which is for run-level failures, not per-candidate rejections.
 *
 * `geminiQuotaExceeded` is true when the run stopped early because the
 * shared Gemini free-tier daily budget ran out partway through — the
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
  geminiQuotaExceeded: boolean;
}

/**
 * Response body of `GET /admin/ai/gemini-quota` (devtunnel-backend
 * `GeminiQuotaSnapshot`) — how much of the shared Gemini request budget
 * is left this minute and today. Backs `GeminiQuotaPanel`.
 */
export interface GeminiQuotaSnapshot {
  limitPerMinute: number;
  usedThisMinute: number;
  remainingThisMinute: number;
  limitPerDay: number;
  usedToday: number;
  remainingToday: number;
  /** ISO timestamp of the next UTC midnight, when the daily counter resets. */
  dailyResetsAt: string;
}