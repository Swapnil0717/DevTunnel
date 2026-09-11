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
 */
export interface AiDiscoveryRunSummary {
  date: string;
  projectsProposed: number;
  toolsProposed: number;
  tasksProposed: number;
  candidatesDropped: number;
  errors: string[];
}