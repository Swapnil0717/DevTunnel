// devtunnel-backend/src/lib/ai/issueInsights.ts
import { z } from "zod";
import type { ValidatedEnv } from "../../config/env";
import { getSupabase } from "../supabase";
import { logger } from "../logger";
import { GitHubRepoError, fetchRepositoryCatalogSummary, fetchRepositoryIssueListing, fetchRepositoryIssues } from "../githubRepo";
import { runJson } from "./json";
import {
  INSIGHTS_FETCH_LIMIT,
  INSIGHTS_MAX_ISSUES,
  INSIGHTS_MAX_OUTPUT_TOKENS,
  INSIGHTS_PROMPT_VERSION,
  buildInsightsMessages,
  insightsSchema,
  mergeInsights,
  sanitizeInsights,
  type AiIssueInsights,
  type InsightsIssueInput,
  type InsightsPromptInput,
} from "./prompts/insights";

/**
 * Generate once, store, reuse (Part 1 rule 3) — the heart of Part 6.
 * Deliberately the same shape as issueExplanations.ts (Part 5), but keyed by
 * repository instead of by issue, and reading a whole issue list instead of
 * one issue.
 *
 * ---------------------------------------------------------------------
 * One request, step by step
 * ---------------------------------------------------------------------
 *   1. Read the stored row for `repo_full_name`.
 *   2. If it was CHECKED against the live issue list in the last 24 h →
 *      return it. No GitHub call, no model call. This is what a second visit
 *      to the same repository takes.
 *   3. Otherwise fetch the repository's most recently updated open issues
 *      (ONE GitHub call, pull requests filtered out, capped at
 *      `INSIGHTS_MAX_ISSUES`) and fingerprint them: a hash of the prompt
 *      version and the sorted (number, updated_at) list.
 *      - Same fingerprint → still right. Stamp `checked_at` (off the request
 *        path) and return it. An unchanged repository NEVER causes a model
 *        call, however old the stored result is.
 *      - Different fingerprint but the stored insights were generated less
 *        than 6 hours ago → return the old ones anyway. `checked_at` is NOT
 *        stamped in that case, so the next visit compares again once the
 *        6 hours are up (one GitHub call, still no model call until then).
 *      - Different fingerprint AND older than 6 hours, or no usable row → generate.
 *   4. Generate: ONE call for the repository's public metadata (a private
 *      repository is refused here), ONE model call (job "insights": Mistral →
 *      second Groq model → OpenRouter → Workers AI, then the global
 *      last-resort list), zod-validate, sanitise, upsert. If the model's
 *      answer is unusable nothing is stored.
 *
 * Worst case: 2 GitHub subrequests + 1 model call (+ 1 repair retry) + ~3
 * Supabase calls — far under the Workers Free limit of 50 subrequests.
 *
 * ---------------------------------------------------------------------
 * Free-plan notes (Part 1 rule 1)
 * ---------------------------------------------------------------------
 *  - No Workers KV writes: durable data is in Supabase (`ai_issue_insights`,
 *    sql/041). KV is not touched at all here.
 *  - Duplicate work: an in-memory in-flight map makes concurrent requests for
 *    the same repository in ONE isolate share one generation. Across
 *    isolates two people can both generate the first result; the primary-key
 *    upsert keeps the table consistent (last write wins) and the cost is at
 *    most one wasted call, once per repository. No KV lock — a lock is a KV
 *    write.
 *  - If the table can't be READ (migration not run, Supabase down) this
 *    throws instead of falling through to the model: generating something
 *    that can't be stored would spend a free-tier call on every visit.
 *  - If GitHub fails while a stored result exists, the stored result is
 *    returned rather than an error.
 *
 * ---------------------------------------------------------------------
 * Filling the gaps ("extended" requests)
 * ---------------------------------------------------------------------
 * The default request above only ever covers the newest `INSIGHTS_MAX_ISSUES`
 * open issues. When a visitor loads the repository's complete issue list, the
 * browser asks for the issues that have no insight yet by number
 * (`requestedNumbers`, at most `INSIGHTS_MAX_ISSUES` per request):
 *   1. Numbers that are already stored are skipped. If nothing is missing the
 *      stored result is returned with no GitHub call and no model call.
 *   2. The open-issue list is read from GitHub by the SERVER (the browser only
 *      sends numbers, never text, so nobody can feed the model or the stored
 *      row their own "issue" content) and the missing issues are taken from it.
 *      Numbers that aren't open issues (closed, pull requests) are ignored.
 *   3. ONE model call classifies just those issues; the result is merged into
 *      the stored row (`mergeInsights`), and the stored row is re-read right
 *      before the write so two batches finishing together don't erase each
 *      other. The stored fingerprint and `checked_at` are left alone, so the
 *      normal "did the newest issues change?" flow keeps working.
 * A default request that regenerates the newest issues also MERGES into the
 * stored row instead of replacing it, so extended entries aren't thrown away.
 *
 * The insights describe a repository, not a page: GitHub-catalog pages and
 * DevTunnel project / tool pages share one row. Only PUBLIC repositories are
 * analysed (never the server token's private view of one).
 */

/** How long stored insights are trusted without re-comparing them with the live issue list. */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** A changed issue list only triggers regeneration once the stored insights are at least this old. */
const MIN_REGEN_AGE_MS = 6 * 60 * 60 * 1000;

/** Per-call model budget: a visitor is watching a spinner, and this call is longer than an explanation. */
const INSIGHTS_TIMEOUT_MS = 45_000;

export interface InsightsResult {
  insights: AiIssueInsights;
  /** How many open issues the insights cover (`insights.issues.length`). */
  analyzedIssueCount: number;
  provider: string;
  model: string;
  /** ISO time the insights were generated. */
  generatedAt: string;
  /** True when no model was called for this request. */
  cached: boolean;
}

/** The repository doesn't exist or is private — the route answers 404. */
export class InsightsRepoNotFoundError extends Error {
  constructor() {
    super("Repository not found");
    this.name = "InsightsRepoNotFoundError";
  }
}

/** The repository has no open issues — there is nothing to analyse. */
export class InsightsNoIssuesError extends Error {
  constructor() {
    super("No open issues to analyse");
    this.name = "InsightsNoIssuesError";
  }
}

/** The model answered, but nothing usable survived validation. */
export class InsightsUnusableError extends Error {
  constructor() {
    super("The AI's insights couldn't be used");
    this.name = "InsightsUnusableError";
  }
}

/** The per-user generation limit said no. */
export class InsightsRateLimitedError extends Error {
  constructor() {
    super("Issue insights generation rate limited");
    this.name = "InsightsRateLimitedError";
  }
}

// Spelled out (not built from the arrays in prompts/insights.ts) so zod infers exact literal types.
const roleEnum = z.enum(["FRONTEND", "BACKEND", "FULL_STACK", "DOCUMENTATION", "TESTING", "DEVOPS"]);
const levelEnum = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);

const storedInsightsSchema = z.object({
  overview: z.string(),
  byRole: z.record(roleEnum, z.number().int().nonnegative()),
  byLevel: z.record(levelEnum, z.number().int().nonnegative()),
  topTechStack: z.array(z.object({ name: z.string(), count: z.number().int().positive() })),
  bestFor: z.object({
    roles: z.array(roleEnum),
    levels: z.array(levelEnum),
    techStack: z.array(z.string()),
  }),
  issues: z.array(
    z.object({
      number: z.number().int().positive(),
      role: roleEnum,
      level: levelEnum,
      techStack: z.array(z.string()),
      oneLine: z.string(),
    }),
  ),
});

interface StoredRow {
  issues_fingerprint: string;
  insights: unknown;
  provider: string;
  model: string;
  generated_at: string;
  checked_at: string;
}

const STORED_COLUMNS = "issues_fingerprint, insights, provider, model, generated_at, checked_at";

/** Concurrent requests for one repository, in this isolate, share a single unit of work. */
const inFlight = new Map<string, Promise<InsightsResult>>();

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function ageMs(iso: string): number {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? Date.now() - time : Number.POSITIVE_INFINITY;
}

/** The canonical, lower-cased `owner/repo` used as the stored key. */
export function insightsRepoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase();
}

/** A stored row as a result, or `null` when its JSON no longer matches the current shape (it is then regenerated). */
function rowToResult(row: StoredRow): InsightsResult | null {
  const parsed = storedInsightsSchema.safeParse(row.insights);
  if (!parsed.success) return null;
  const insights = parsed.data as unknown as AiIssueInsights;
  return {
    insights,
    analyzedIssueCount: insights.issues.length,
    provider: row.provider,
    model: row.model,
    generatedAt: row.generated_at,
    cached: true,
  };
}

/** The hash the "did the issue list change?" question is answered with: prompt version + sorted (number, updated_at). */
export async function issuesFingerprint(issues: Pick<InsightsIssueInput, "number" | "updatedAt">[]): Promise<string> {
  const lines = [...issues].sort((a, b) => a.number - b.number).map((issue) => `${issue.number}:${issue.updatedAt}`);
  return sha256Hex(`${INSIGHTS_PROMPT_VERSION}\n${lines.join("\n")}`);
}

export interface GetInsightsParams {
  env: ValidatedEnv;
  ctx: ExecutionContext;
  owner: string;
  repo: string;
  /** Called only right before a model call; return false when the caller is over its generation limit. */
  allowGeneration: () => Promise<boolean>;
  /**
   * Fill-the-gaps mode: analyse these open issues (those not stored yet) and
   * add them to the stored insights. Omit for the default "newest issues" flow.
   */
  requestedNumbers?: number[];
}

async function readStored(env: ValidatedEnv, key: string): Promise<{ stored: StoredRow | null; storedResult: InsightsResult | null }> {
  const { data, error } = await getSupabase(env)
    .from("ai_issue_insights")
    .select(STORED_COLUMNS)
    .eq("repo_full_name", key)
    .maybeSingle<StoredRow>();
  if (error) throw new Error(`Failed to read stored AI issue insights: ${error.message}`);
  const stored = data ?? null;
  return { stored, storedResult: stored ? rowToResult(stored) : null };
}

export async function getOrCreateIssueInsights(params: GetInsightsParams): Promise<InsightsResult> {
  const { env, owner, repo } = params;
  const key = insightsRepoKey(owner, repo);

  const { stored, storedResult } = await readStored(env, key);

  if (params.requestedNumbers && params.requestedNumbers.length > 0) {
    return extendInsights(params, key, stored, storedResult);
  }

  // Step 2: recently verified — the common case, and the only one that is free.
  if (stored && storedResult && ageMs(stored.checked_at) < CHECK_INTERVAL_MS) return storedResult;

  const running = inFlight.get(key);
  if (running) return running;

  const work = refreshInsights(params, stored, storedResult).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, work);
  return work;
}

async function stampChecked(env: ValidatedEnv, key: string): Promise<void> {
  try {
    const { error } = await getSupabase(env).from("ai_issue_insights").update({ checked_at: new Date().toISOString() }).eq("repo_full_name", key);
    if (error) throw error;
  } catch (err) {
    logger.warn("ai_issue_insights_stamp_checked_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

async function refreshInsights(params: GetInsightsParams, stored: StoredRow | null, storedResult: InsightsResult | null): Promise<InsightsResult> {
  const { env, ctx, owner, repo, allowGeneration } = params;
  const key = insightsRepoKey(owner, repo);

  // Step 3: the live issue list (1 GitHub call, server-side token, never the viewer's).
  let live;
  try {
    live = await fetchRepositoryIssues(env.GITHUB_DISCOVERY_TOKEN, owner, repo, INSIGHTS_FETCH_LIMIT);
  } catch (err) {
    if (storedResult) {
      // GitHub hiccup: the stored insights are better than an error.
      logger.warn("ai_issue_insights_github_failed_serving_stored", { reason: err instanceof GitHubRepoError ? err.reason : "unknown" });
      return storedResult;
    }
    if (err instanceof GitHubRepoError && err.reason === "not_found") throw new InsightsRepoNotFoundError();
    throw err;
  }

  const issues: InsightsIssueInput[] = live.slice(0, INSIGHTS_MAX_ISSUES).map((issue) => ({
    number: issue.number,
    title: issue.title,
    labels: issue.labels,
    body: issue.body,
    updatedAt: issue.updatedAt,
  }));
  if (issues.length === 0) throw new InsightsNoIssuesError();

  const fingerprint = await issuesFingerprint(issues);

  if (stored && storedResult) {
    if (stored.issues_fingerprint === fingerprint) {
      ctx.waitUntil(stampChecked(env, key));
      return storedResult;
    }
    if (ageMs(stored.generated_at) < MIN_REGEN_AGE_MS) return storedResult;
  }

  // From here on a model call is certain — apply the per-user limit first.
  if (!(await allowGeneration())) throw new InsightsRateLimitedError();

  // Step 4: repo context. Private repositories are never analysed.
  let repoSummary;
  try {
    repoSummary = await fetchRepositoryCatalogSummary(env.GITHUB_DISCOVERY_TOKEN, owner, repo);
  } catch (err) {
    if (err instanceof GitHubRepoError && err.reason === "not_found") throw new InsightsRepoNotFoundError();
    throw err;
  }
  if (repoSummary.isPrivate) throw new InsightsRepoNotFoundError();

  const input: InsightsPromptInput = {
    repoFullName: repoSummary.fullName,
    repoDescription: repoSummary.description,
    primaryLanguage: repoSummary.primaryLanguage,
    issues,
  };
  const messages = buildInsightsMessages(input);
  const promptText = messages[1]?.content ?? "";

  const answer = await runJson(env, "insights", messages, insightsSchema, {
    ctx,
    maxTokens: INSIGHTS_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    timeoutMs: INSIGHTS_TIMEOUT_MS,
  });
  const insights = sanitizeInsights(answer.data, input, promptText);
  if (!insights) {
    logger.warn("ai_issue_insights_unusable_after_sanitising", { provider: answer.provider });
    throw new InsightsUnusableError();
  }

  // Keep what earlier "fill the gaps" requests added; the newest issues' entries are replaced by the fresh ones.
  const merged = mergeInsights(storedResult?.insights ?? null, insights);

  const nowIso = new Date().toISOString();
  const { error } = await getSupabase(env).from("ai_issue_insights").upsert(
    {
      repo_full_name: key,
      issues_fingerprint: fingerprint,
      insights: merged,
      provider: answer.provider,
      model: answer.model,
      generated_at: nowIso,
      checked_at: nowIso,
    },
    { onConflict: "repo_full_name" },
  );
  if (error) {
    // The visitor still gets their insights; the next visit will regenerate.
    logger.error("ai_issue_insights_store_failed", { error: error.message });
  }

  logger.info("ai_issue_insights_generated", {
    provider: answer.provider,
    model: answer.model,
    repaired: answer.repaired,
    analyzedIssues: insights.issues.length,
    requestSizeEstimate: promptText.length,
  });

  return { insights: merged, analyzedIssueCount: merged.issues.length, provider: answer.provider, model: answer.model, generatedAt: nowIso, cached: false };
}

/**
 * "Fill the gaps": analyse the requested issues that have no stored insight
 * and merge them into the stored row. See the section in the file header.
 */
async function extendInsights(params: GetInsightsParams, key: string, stored: StoredRow | null, storedResult: InsightsResult | null): Promise<InsightsResult> {
  const wanted = [...new Set(params.requestedNumbers ?? [])].slice(0, INSIGHTS_MAX_ISSUES);
  const have = new Set(storedResult?.insights.issues.map((issue) => issue.number) ?? []);
  const missing = wanted.filter((number) => !have.has(number));

  // Nothing new to analyse: free.
  if (storedResult && missing.length === 0) return storedResult;

  const flightKey = `${key}|extend|${missing.join(",")}`;
  const running = inFlight.get(flightKey);
  if (running) return running;

  const work = performExtend(params, key, missing, stored, storedResult).finally(() => {
    inFlight.delete(flightKey);
  });
  inFlight.set(flightKey, work);
  return work;
}

async function performExtend(
  params: GetInsightsParams,
  key: string,
  missing: number[],
  stored: StoredRow | null,
  storedResult: InsightsResult | null,
): Promise<InsightsResult> {
  const { env, ctx, owner, repo, allowGeneration } = params;

  // The open-issue list, read server-side. One request per 100 issues (capped inside githubRepo.ts).
  let listing;
  try {
    listing = await fetchRepositoryIssueListing(env.GITHUB_DISCOVERY_TOKEN, owner, repo);
  } catch (err) {
    if (storedResult) {
      logger.warn("ai_issue_insights_extend_github_failed_serving_stored", { reason: err instanceof GitHubRepoError ? err.reason : "unknown" });
      return storedResult;
    }
    if (err instanceof GitHubRepoError && err.reason === "not_found") throw new InsightsRepoNotFoundError();
    throw err;
  }

  const openByNumber = new Map(listing.issues.map((issue) => [issue.number, issue] as const));
  const issues: InsightsIssueInput[] = [];
  for (const number of missing) {
    const issue = openByNumber.get(number);
    if (!issue) continue; // closed, a pull request, or not an issue of this repository
    issues.push({ number: issue.number, title: issue.title, labels: issue.labels, body: issue.body, updatedAt: issue.updatedAt });
    if (issues.length >= INSIGHTS_MAX_ISSUES) break;
  }
  if (issues.length === 0) {
    if (storedResult) return storedResult;
    throw new InsightsNoIssuesError();
  }

  // From here on a model call is certain — apply the per-user limit first.
  if (!(await allowGeneration())) throw new InsightsRateLimitedError();

  let repoSummary;
  try {
    repoSummary = await fetchRepositoryCatalogSummary(env.GITHUB_DISCOVERY_TOKEN, owner, repo);
  } catch (err) {
    if (err instanceof GitHubRepoError && err.reason === "not_found") throw new InsightsRepoNotFoundError();
    throw err;
  }
  if (repoSummary.isPrivate) throw new InsightsRepoNotFoundError();

  const input: InsightsPromptInput = {
    repoFullName: repoSummary.fullName,
    repoDescription: repoSummary.description,
    primaryLanguage: repoSummary.primaryLanguage,
    issues,
  };
  const messages = buildInsightsMessages(input);
  const promptText = messages[1]?.content ?? "";

  const answer = await runJson(env, "insights", messages, insightsSchema, {
    ctx,
    maxTokens: INSIGHTS_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    timeoutMs: INSIGHTS_TIMEOUT_MS,
  });
  const fresh = sanitizeInsights(answer.data, input, promptText);
  if (!fresh) {
    logger.warn("ai_issue_insights_extend_unusable_after_sanitising", { provider: answer.provider });
    throw new InsightsUnusableError();
  }

  // Re-read right before writing so a batch that finished meanwhile isn't overwritten.
  const latest = await readStored(env, key);
  const openNumbers = listing.truncated ? undefined : new Set(openByNumber.keys());
  const merged = mergeInsights(latest.storedResult?.insights ?? null, fresh, openNumbers);

  const nowIso = new Date().toISOString();
  const { error } = await getSupabase(env).from("ai_issue_insights").upsert(
    {
      repo_full_name: key,
      // A row created by this path has no "newest issues" fingerprint yet; the default flow refreshes it later.
      issues_fingerprint: latest.stored?.issues_fingerprint ?? stored?.issues_fingerprint ?? `extended:${INSIGHTS_PROMPT_VERSION}`,
      insights: merged,
      provider: answer.provider,
      model: answer.model,
      generated_at: nowIso,
      checked_at: latest.stored?.checked_at ?? nowIso,
    },
    { onConflict: "repo_full_name" },
  );
  if (error) {
    // The visitor still gets their insights; the next request will analyse them again.
    logger.error("ai_issue_insights_extend_store_failed", { error: error.message });
  }

  logger.info("ai_issue_insights_extended", {
    provider: answer.provider,
    model: answer.model,
    repaired: answer.repaired,
    requestedIssues: missing.length,
    analyzedIssues: fresh.issues.length,
    storedIssues: merged.issues.length,
    requestSizeEstimate: promptText.length,
  });

  return { insights: merged, analyzedIssueCount: merged.issues.length, provider: answer.provider, model: answer.model, generatedAt: nowIso, cached: false };
}