// devtunnel-backend/src/lib/ai/summarySource.ts
import type { Env } from "../../types";
import type { ValidatedEnv } from "../../config/env";
import { getSupabase } from "../supabase";
import { getCachedSWR } from "../cache";
import { fetchRepositoryCatalogSummary, fetchRepositoryReadme, GitHubRepoError } from "../githubRepo";
import { mapGithubTopicsToTechStack } from "../techTopics";
import { getProjectDetailBySlug } from "../../db/projects";
import { getOpenSourceToolDetailBySlug } from "../../db/openSourceTools";
import { getSubmissionDetail } from "../../db/submissions";
import type { SummaryPromptInput } from "./prompts/summary";

/**
 * "What text do we summarise?" for each of the five page types (Part 4).
 *
 *   devtunnel_project  a DevTunnel project — the README/description/tech
 *                      stack stored at onboarding (Supabase). No GitHub call.
 *   devtunnel_tool     a DevTunnel open-source tool — same, from Supabase,
 *                      plus the admin-written setup guide as extra context.
 *   community_project  a Submissions entry — its stored README, the
 *                      description the page shows, tech stack, "alternative to".
 *   github_project /   a raw GitHub catalog repository. The detail page
 *   github_tool        already caches `{ readme, description, techStack, … }`
 *                      in KV for 10–30 minutes; that slot is READ (never
 *                      written) and only on a miss do we ask GitHub directly
 *                      (repo metadata + README = 2 subrequests).
 *
 * Nothing here writes to Workers KV (Part 1 rule 1). Everything that comes
 * back is UNTRUSTED text; the prompt builder wraps and truncates it.
 */

export const SUMMARY_KINDS = [
  "devtunnel_project",
  "devtunnel_tool",
  "github_project",
  "github_tool",
  "community_project",
] as const;

export type SummaryKind = (typeof SUMMARY_KINDS)[number];

/** The subject doesn't exist (or isn't public) — the route answers 404. */
export class SummarySubjectNotFoundError extends Error {
  constructor() {
    super("Summary subject not found");
    this.name = "SummarySubjectNotFoundError";
  }
}

const GITHUB_KEY = /^[A-Za-z0-9_.-]{1,100}--[A-Za-z0-9_.-]{1,100}$/;
const SLUG_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

export function isGithubKind(kind: SummaryKind): kind is "github_project" | "github_tool" {
  return kind === "github_project" || kind === "github_tool";
}

/**
 * Validates the client-supplied `key` and returns the canonical
 * `subject_key` stored in `ai_summaries` — or `null` for a key that can't be
 * a real page. GitHub keys are lower-cased (the catalog's own slug rule), so
 * `Facebook--React` and `facebook--react` share one stored summary.
 */
export function normalizeSubjectKey(kind: SummaryKind, key: string): string | null {
  const trimmed = key.trim();
  if (isGithubKind(kind)) return GITHUB_KEY.test(trimmed) ? trimmed.toLowerCase() : null;
  return SLUG_KEY.test(trimmed) ? trimmed : null;
}

/** Reverses the catalog's slug encoding (`owner--repo`): split on the FIRST `--`, exactly like the detail routes. */
function splitGithubKey(subjectKey: string): { owner: string; repo: string } {
  const at = subjectKey.indexOf("--");
  return { owner: subjectKey.slice(0, at), repo: subjectKey.slice(at + 2) };
}

/** Same soft TTL the detail routes use; irrelevant here (fresh and stale are both fine to read). */
const DETAIL_SOFT_TTL_SECONDS = 10 * 60;

/** KV slots the two GitHub detail routes fill — READ-ONLY here. Keep in sync with routes/githubProjects.ts and routes/githubOpenSourceTools.ts. */
function githubDetailCacheKey(kind: "github_project" | "github_tool", subjectKey: string): string {
  return kind === "github_project"
    ? `github-project-detail:${subjectKey}:v1`
    : `github-open-source-tool-detail:${subjectKey}:v1`;
}

interface CachedGithubDetail {
  name: string;
  description: string | null;
  primaryLanguage: string | null;
  techStack: string[];
  readme: string | null;
}

function asCachedGithubDetail(value: unknown): CachedGithubDetail | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string") return null;
  const str = (x: unknown): string | null => (typeof x === "string" ? x : null);
  return {
    name: v.name,
    description: str(v.description),
    primaryLanguage: str(v.primaryLanguage),
    techStack: Array.isArray(v.techStack) ? v.techStack.filter((t): t is string => typeof t === "string") : [],
    readme: str(v.readme),
  };
}

async function loadGithubSource(
  rawEnv: Env,
  env: ValidatedEnv,
  kind: "github_project" | "github_tool",
  subjectKey: string,
): Promise<SummaryPromptInput> {
  // 1. The detail page's own KV cache (a read; a miss is normal).
  const cached = await getCachedSWR<unknown>(rawEnv, githubDetailCacheKey(kind, subjectKey), DETAIL_SOFT_TTL_SECONDS);
  if (cached.status !== "miss") {
    const detail = asCachedGithubDetail(cached.value);
    if (detail) {
      return {
        name: detail.name,
        description: detail.description,
        primaryLanguage: detail.primaryLanguage,
        techStack: detail.techStack,
        notes: null,
        readme: detail.readme,
      };
    }
  }

  // 2. Ask GitHub directly (same server-side token the detail routes use).
  const { owner, repo } = splitGithubKey(subjectKey);
  try {
    const [summary, readme] = await Promise.all([
      fetchRepositoryCatalogSummary(env.GITHUB_DISCOVERY_TOKEN, owner, repo),
      fetchRepositoryReadme(env.GITHUB_DISCOVERY_TOKEN, owner, repo),
    ]);
    // Never summarise a private repository, even if the server token could read it.
    if (summary.isPrivate) throw new SummarySubjectNotFoundError();
    return {
      name: summary.name,
      description: summary.description,
      primaryLanguage: summary.primaryLanguage,
      techStack: mapGithubTopicsToTechStack(summary.topics, summary.primaryLanguage),
      notes: null,
      readme,
    };
  } catch (err) {
    if (err instanceof GitHubRepoError && err.reason === "not_found") throw new SummarySubjectNotFoundError();
    throw err;
  }
}

/**
 * Loads the prompt input for one subject. Throws `SummarySubjectNotFoundError`
 * for a missing/unpublished subject; `GitHubRepoError` (rate limit / GitHub
 * down) and Supabase errors propagate for the route to map to an honest status.
 */
export async function loadSummarySource(
  rawEnv: Env,
  env: ValidatedEnv,
  kind: SummaryKind,
  subjectKey: string,
): Promise<SummaryPromptInput> {
  if (isGithubKind(kind)) return loadGithubSource(rawEnv, env, kind, subjectKey);

  const supabase = getSupabase(env);

  if (kind === "devtunnel_project") {
    // `null` profile: the summary is the same for every viewer, so no per-viewer match maths.
    const project = await getProjectDetailBySlug(supabase, subjectKey, null);
    if (!project) throw new SummarySubjectNotFoundError();
    return {
      name: project.name,
      description: project.description,
      primaryLanguage: project.primaryTech && project.primaryTech !== "General" ? project.primaryTech : null,
      techStack: project.techStack,
      notes: null,
      readme: project.readme,
    };
  }

  if (kind === "devtunnel_tool") {
    const tool = await getOpenSourceToolDetailBySlug(supabase, subjectKey);
    if (!tool) throw new SummarySubjectNotFoundError();
    return {
      name: tool.name,
      description: tool.description,
      primaryLanguage: tool.primaryLanguage,
      techStack: tool.labels,
      notes: tool.setupGuide,
      readme: tool.readme,
    };
  }

  // community_project (a Submissions entry)
  const submission = await getSubmissionDetail(supabase, subjectKey);
  if (!submission) throw new SummarySubjectNotFoundError();
  return {
    name: submission.name,
    description: submission.description,
    primaryLanguage: submission.primaryLanguage,
    techStack: submission.techStack,
    notes: submission.alternativeTo.length > 0 ? `Alternative to: ${submission.alternativeTo.join(", ")}` : null,
    readme: submission.readme,
  };
}
