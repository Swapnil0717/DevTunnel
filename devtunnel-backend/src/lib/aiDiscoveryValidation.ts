import { PROJECT_CATEGORIES } from "../db/aiDiscovery";

/**
 * "Save one complete, ready-to-approve record" (spec point 3).
 *
 * Every candidate Gemini proposes is validated here BEFORE it is ever
 * passed to an insert function. A candidate that fails any check here is
 * dropped in full by the caller — never partially inserted, never
 * patched with a placeholder or a "closest guess" value. This is the one
 * place that decides what "complete" means for each item type, so
 * aiDiscoveryAgent.ts never has to improvise a coercion (e.g. defaulting
 * an unrecognized category to "Other") that would let a malformed
 * candidate slip into the review queue looking valid.
 *
 * Fixed-choice fields (difficulty, category, roles) are checked against
 * the exact same enum values used everywhere else in the codebase — an
 * out-of-vocabulary value here is a validation failure, not something to
 * round off to the nearest valid option.
 */

export const VALID_DIFFICULTIES = new Set<string>(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
export const VALID_ROLES = new Set<string>(["FRONTEND", "BACKEND", "FULL_STACK", "DOCUMENTATION", "TESTING", "DEVOPS"]);
const VALID_PROJECT_CATEGORIES = new Set<string>(PROJECT_CATEGORIES as readonly string[]);
const GITHUB_REPO_URL_RE = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/i;
const OWNER_REPO_RE = /^[^/\s]+\/[^/\s]+$/;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isNullableString(v: unknown): v is string | null {
  return v === null || isNonEmptyString(v);
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface ProjectCandidateInput {
  fullName?: unknown;
  url?: unknown;
  owner?: unknown;
  repo?: unknown;
  githubDescription?: unknown;
  primaryLanguage?: unknown;
  stars?: unknown;
  forks?: unknown;
  openIssues?: unknown;
  difficulty?: unknown;
  category?: unknown;
  description?: unknown;
  reasoning?: unknown;
  techStack?: unknown;
}

/** Returns a list of problem field names. Empty array = complete and valid. */
export function validateProjectCandidate(c: ProjectCandidateInput): string[] {
  const problems: string[] = [];

  if (!isNonEmptyString(c.fullName) || !OWNER_REPO_RE.test(c.fullName)) problems.push("fullName");
  if (!isNonEmptyString(c.url) || !GITHUB_REPO_URL_RE.test(c.url)) problems.push("url");
  if (!isNonEmptyString(c.owner)) problems.push("owner");
  if (!isNonEmptyString(c.repo)) problems.push("repo");
  if (!isNullableString(c.githubDescription)) problems.push("githubDescription");
  if (!isNullableString(c.primaryLanguage)) problems.push("primaryLanguage");
  if (!isNonNegativeInt(c.stars)) problems.push("stars");
  if (!isNonNegativeInt(c.forks)) problems.push("forks");
  if (!isNonNegativeInt(c.openIssues)) problems.push("openIssues");
  if (typeof c.difficulty !== "string" || !VALID_DIFFICULTIES.has(c.difficulty)) problems.push("difficulty");
  if (typeof c.category !== "string" || !VALID_PROJECT_CATEGORIES.has(c.category)) problems.push("category");
  if (!isNonEmptyString(c.description)) problems.push("description");
  if (!isNonEmptyString(c.reasoning)) problems.push("reasoning");

  const ts = c.techStack as { languages?: unknown; frameworks?: unknown; libraries?: unknown } | undefined;
  if (
    !ts ||
    !Array.isArray(ts.languages) ||
    !Array.isArray(ts.frameworks) ||
    !Array.isArray(ts.libraries) ||
    [...ts.languages, ...ts.frameworks, ...ts.libraries].some((v) => typeof v !== "string")
  ) {
    problems.push("techStack");
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface ToolCandidateInput {
  sourceUrl?: unknown;
  name?: unknown;
  fetchedDescription?: unknown;
  primaryLanguage?: unknown;
  labels?: unknown;
  description?: unknown;
  setupGuide?: unknown;
  reasoning?: unknown;
}

export function validateToolCandidate(c: ToolCandidateInput): string[] {
  const problems: string[] = [];

  if (!isNonEmptyString(c.sourceUrl) || !/^https:\/\//i.test(c.sourceUrl)) problems.push("sourceUrl");
  if (!isNonEmptyString(c.name)) problems.push("name");
  if (!isNullableString(c.fetchedDescription)) problems.push("fetchedDescription");
  if (!isNullableString(c.primaryLanguage)) problems.push("primaryLanguage");
  if (!Array.isArray(c.labels) || c.labels.length === 0 || c.labels.some((l) => typeof l !== "string" || !l.trim())) {
    problems.push("labels");
  }
  if (!isNonEmptyString(c.description)) problems.push("description");

  if (!isNonEmptyString(c.setupGuide)) {
    problems.push("setupGuide");
  } else {
    const bulletCount = c.setupGuide
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("-") || l.startsWith("*")).length;
    // "keep it simple, small and in points" — require it actually be points,
    // not a paragraph with a stray dash in it.
    if (bulletCount < 2) problems.push("setupGuide:not_enough_bullets");
  }

  if (!isNonEmptyString(c.reasoning)) problems.push("reasoning");

  return problems;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface TaskCandidateInput {
  issueNumber?: unknown;
  title?: unknown;
  url?: unknown;
  body?: unknown;
  labels?: unknown;
  author?: unknown;
  suggestedRoles?: unknown;
  suggestedDifficulty?: unknown;
  summary?: unknown;
  reasoning?: unknown;
}

export function validateTaskCandidate(c: TaskCandidateInput): string[] {
  const problems: string[] = [];

  if (!isNonNegativeInt(c.issueNumber) || (c.issueNumber as number) <= 0) problems.push("issueNumber");
  if (!isNonEmptyString(c.title)) problems.push("title");
  if (!isNonEmptyString(c.url) || !/^https:\/\/github\.com\//i.test(c.url)) problems.push("url");
  if (c.body !== null && typeof c.body !== "string") problems.push("body");
  if (!Array.isArray(c.labels) || c.labels.some((l) => typeof l !== "string")) problems.push("labels");

  if (c.author !== null) {
    const a = c.author as { username?: unknown; avatarUrl?: unknown; profileUrl?: unknown } | undefined;
    if (
      !a ||
      !isNonEmptyString(a.username) ||
      !isNonEmptyString(a.profileUrl) ||
      !isNullableString(a.avatarUrl)
    ) {
      problems.push("author");
    }
  }

  // At least one valid role is required — an empty/all-invalid roles list
  // means "drop the candidate", not "publish it with no role curated".
  if (
    !Array.isArray(c.suggestedRoles) ||
    c.suggestedRoles.length === 0 ||
    c.suggestedRoles.some((r) => typeof r !== "string" || !VALID_ROLES.has(r))
  ) {
    problems.push("suggestedRoles");
  }

  if (c.suggestedDifficulty !== null && (typeof c.suggestedDifficulty !== "string" || !VALID_DIFFICULTIES.has(c.suggestedDifficulty))) {
    problems.push("suggestedDifficulty");
  }

  if (!isNonEmptyString(c.summary)) problems.push("summary");
  if (!isNonEmptyString(c.reasoning)) problems.push("reasoning");

  return problems;
}