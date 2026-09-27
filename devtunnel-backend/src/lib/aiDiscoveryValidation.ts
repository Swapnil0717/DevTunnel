import { PROJECT_CATEGORIES } from "../db/aiDiscovery";

/**
 * "Save one complete, ready-to-approve record" (spec point 3).
 *
 * Every candidate the discovery agent proposes is validated here BEFORE it is ever
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

/**
 * Judgment-only shape the model actually has to author for a task
 * candidate. Deliberately does NOT include `title`/`url`/`body`/`labels`/
 * `author` — those are real, already-verified GitHub facts the model
 * fetched via a tool call earlier in the same turn (see
 * aiDiscoveryTools.ts `IssueCache`), and retyping them back into this
 * JSON used to be exactly what broke: any escaping slip in a re-typed
 * issue body corrupted the whole candidates array. Now the model only
 * ever has to produce short strings it's actually authoring itself, and
 * the caller (aiDiscoveryAgent.ts `runTaskDiscovery`) looks the real
 * fields up from the IssueCache by `issueNumber` afterward — a number
 * that doesn't match anything fetched this run is dropped as a validation
 * failure below (`issueNumber:not_found`), not trusted at face value.
 */
export interface TaskCandidateInput {
  issueNumber?: unknown;
  /**
   * Short (5-10 word), meaningful title written FOR THE CONTRIBUTOR — what
   * approve_ai_discovered_task (sql/037) uses as the task's real title,
   * instead of the raw GitHub issue title (which is often vague, jargon-y,
   * or just references an issue/PR number and tells a contributor nothing
   * about what to actually do).
   */
  taskTitle?: unknown;
  suggestedRoles?: unknown;
  suggestedDifficulty?: unknown;
  summary?: unknown;
  reasoning?: unknown;
}

const MAX_TASK_TITLE_CHARS = 120;

export function validateTaskCandidate(c: TaskCandidateInput): string[] {
  const problems: string[] = [];

  if (!isNonNegativeInt(c.issueNumber) || (c.issueNumber as number) <= 0) problems.push("issueNumber");

  if (!isNonEmptyString(c.taskTitle)) {
    problems.push("taskTitle");
  } else if (c.taskTitle.trim().length > MAX_TASK_TITLE_CHARS) {
    problems.push("taskTitle:too_long");
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