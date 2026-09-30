// devtunnel-backend/src/lib/ai/issueExplanations.ts
import { z } from "zod";
import type { ValidatedEnv } from "../../config/env";
import { getSupabase } from "../supabase";
import { logger } from "../logger";
import {
  GitHubRepoError,
  fetchRepositoryCatalogSummary,
  fetchRepositoryIssueWithComments,
  fetchRepositoryReadme,
} from "../githubRepo";
import { runJson } from "./json";
import {
  EXPLAIN_MAX_COMMENTS,
  EXPLAIN_MAX_OUTPUT_TOKENS,
  EXPLAIN_PROMPT_VERSION,
  EXPLAIN_README_MAX_CHARS,
  buildExplainMessages,
  buildIssueFingerprintText,
  explanationSchema,
  sanitizeExplanation,
  type AiIssueExplanation,
  type ExplainPromptInput,
} from "./prompts/explain";

/**
 * Generate once, store, reuse (Part 1 rule 3) — the heart of Part 5.
 * Deliberately the same shape as summaries.ts (Part 4).
 *
 * ---------------------------------------------------------------------
 * One request, step by step
 * ---------------------------------------------------------------------
 *   1. Read the stored row for (source, repo_full_name, issue_number).
 *   2. If it was CHECKED against the live issue in the last 24 h → return
 *      it. No GitHub call, no model call. This is the path a second click
 *      on the same issue takes ("instant, no AI call").
 *   3. Otherwise fetch the issue (+ its first comments; 1-2 GitHub calls)
 *      and hash what the model would see about it.
 *      - Same hash → still right. Stamp `checked_at` (off the request
 *        path) and return it.
 *      - Different hash but the explanation was generated less than 3
 *        days ago → return the old one anyway (and stamp). A busy issue
 *        thread must not burn a model call per new comment.
 *      - Different hash AND older than 3 days, or no row yet → generate.
 *   4. Generate: fetch the repo's public metadata + README excerpt (2 more
 *      GitHub calls; a private repo is refused here), ONE model call (job
 *      "explain": Cerebras → second Groq model → Mistral, then the global
 *      last-resort list), zod-validate, sanitise, upsert. If the model's
 *      answer is unusable nothing is stored.
 *
 * Worst case is 4 GitHub subrequests + 1 model call + ~3 Supabase calls,
 * far under the Workers Free limit of 50 subrequests per invocation.
 *
 * ---------------------------------------------------------------------
 * Free-plan notes (Part 1 rule 1)
 * ---------------------------------------------------------------------
 *  - No Workers KV writes: durable data is in Supabase
 *    (`ai_issue_explanations`, sql/040). KV is not touched at all here.
 *  - Duplicate work: an in-memory in-flight map makes concurrent requests
 *    for the same issue in ONE isolate share one generation. Across
 *    isolates two people can both generate the very first explanation; the
 *    `unique` upsert keeps the table consistent (last write wins) and the
 *    cost is at most one wasted call, once per issue. No KV lock — a lock
 *    is a KV write.
 *  - If the table can't be READ (migration not run, Supabase down) this
 *    throws instead of falling through to the model: generating something
 *    that can't be stored would spend a free-tier call on every click.
 *
 * `source` ("github" | "devtunnel") only says which kind of page the click
 * came from and namespaces the stored row; it is NOT checked against
 * DevTunnel's own tables. What IS enforced is that the repository is public
 * (never explain a private repo's issue with the server token).
 */

/** How long a stored explanation is trusted without re-comparing it with the live issue. */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** A changed issue only triggers regeneration once the explanation is at least this old. */
const MIN_REGEN_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/** Per-call model budget: a visitor is watching a spinner. */
const EXPLAIN_TIMEOUT_MS = 25_000;

/** Below this there is nothing real to explain; the model would only invent something. */
const MIN_ISSUE_TEXT_CHARS = 25;

export const EXPLANATION_SOURCES = ["github", "devtunnel"] as const;
export type ExplanationSource = (typeof EXPLANATION_SOURCES)[number];

export interface ExplanationResult {
  explanation: AiIssueExplanation;
  provider: string;
  model: string;
  /** ISO time the explanation text was generated. */
  generatedAt: string;
  /** True when no model was called for this request. */
  cached: boolean;
}

/** The issue doesn't exist, is a pull request, or its repository is private/missing — the route answers 404. */
export class ExplainIssueNotFoundError extends Error {
  constructor() {
    super("Issue not found");
    this.name = "ExplainIssueNotFoundError";
  }
}

/** The issue is closed and has no stored explanation — nothing worth spending a model call on. */
export class ExplainIssueClosedError extends Error {
  constructor() {
    super("Issue is closed");
    this.name = "ExplainIssueClosedError";
  }
}

/** The issue has no description or comments to explain. */
export class ExplainNotEnoughContentError extends Error {
  constructor() {
    super("Not enough content to explain");
    this.name = "ExplainNotEnoughContentError";
  }
}

/** The model answered, but nothing usable survived validation. */
export class ExplainUnusableError extends Error {
  constructor() {
    super("The AI's explanation couldn't be used");
    this.name = "ExplainUnusableError";
  }
}

/** The per-user generation limit said no. */
export class ExplainRateLimitedError extends Error {
  constructor() {
    super("Issue explanation generation rate limited");
    this.name = "ExplainRateLimitedError";
  }
}

const storedExplanationSchema = z.object({
  plainSummary: z.string(),
  whatNeedsToBeDone: z.array(z.string()),
  skillsNeeded: z.array(z.string()),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).nullable(),
  firstSteps: z.array(z.string()),
  caveats: z.array(z.string()),
});

interface StoredRow {
  content_hash: string;
  explanation: unknown;
  provider: string;
  model: string;
  updated_at: string;
  checked_at: string;
}

const STORED_COLUMNS = "content_hash, explanation, provider, model, updated_at, checked_at";

/** Concurrent requests for one issue, in this isolate, share a single unit of work. */
const inFlight = new Map<string, Promise<ExplanationResult>>();

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function ageMs(iso: string): number {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? Date.now() - time : Number.POSITIVE_INFINITY;
}

/** A stored row as a result, or `null` when its JSON no longer matches the current shape (it is then regenerated). */
function rowToResult(row: StoredRow): ExplanationResult | null {
  const parsed = storedExplanationSchema.safeParse(row.explanation);
  if (!parsed.success) return null;
  return { explanation: parsed.data, provider: row.provider, model: row.model, generatedAt: row.updated_at, cached: true };
}

export interface GetExplanationParams {
  env: ValidatedEnv;
  ctx: ExecutionContext;
  source: ExplanationSource;
  owner: string;
  repo: string;
  issueNumber: number;
  /** Called only right before a model call; return false when the caller is over its generation limit. */
  allowGeneration: () => Promise<boolean>;
}

/** The canonical, lower-cased `owner/repo` used as the stored key. */
export function repoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase();
}

export async function getOrCreateIssueExplanation(params: GetExplanationParams): Promise<ExplanationResult> {
  const { env, source, owner, repo, issueNumber } = params;
  const key = repoKey(owner, repo);
  const supabase = getSupabase(env);

  const { data, error } = await supabase
    .from("ai_issue_explanations")
    .select(STORED_COLUMNS)
    .eq("source", source)
    .eq("repo_full_name", key)
    .eq("issue_number", issueNumber)
    .maybeSingle<StoredRow>();
  if (error) throw new Error(`Failed to read stored AI issue explanation: ${error.message}`);

  const stored = data ?? null;
  const storedResult = stored ? rowToResult(stored) : null;

  // Step 2: recently verified — the common case, and the only one that is free.
  if (stored && storedResult && ageMs(stored.checked_at) < CHECK_INTERVAL_MS) return storedResult;

  const flightKey = `${source}:${key}#${issueNumber}`;
  const running = inFlight.get(flightKey);
  if (running) return running;

  const work = refreshExplanation(params, stored, storedResult).finally(() => {
    inFlight.delete(flightKey);
  });
  inFlight.set(flightKey, work);
  return work;
}

async function stampChecked(env: ValidatedEnv, source: ExplanationSource, key: string, issueNumber: number): Promise<void> {
  try {
    const { error } = await getSupabase(env)
      .from("ai_issue_explanations")
      .update({ checked_at: new Date().toISOString() })
      .eq("source", source)
      .eq("repo_full_name", key)
      .eq("issue_number", issueNumber);
    if (error) throw error;
  } catch (err) {
    logger.warn("ai_issue_explanation_stamp_checked_failed", { source, error: err instanceof Error ? err.message : String(err) });
  }
}

async function refreshExplanation(
  params: GetExplanationParams,
  stored: StoredRow | null,
  storedResult: ExplanationResult | null,
): Promise<ExplanationResult> {
  const { env, ctx, source, owner, repo, issueNumber, allowGeneration } = params;
  const key = repoKey(owner, repo);

  // Step 3: the live issue (1-2 GitHub calls, server-side token, never the viewer's).
  const live = await fetchRepositoryIssueWithComments(env.GITHUB_DISCOVERY_TOKEN, owner, repo, issueNumber, EXPLAIN_MAX_COMMENTS);
  if (!live) {
    // Deleted, transferred, or turned out to be a pull request. Keep what we have rather than erroring.
    if (storedResult) return storedResult;
    throw new ExplainIssueNotFoundError();
  }

  const partial: ExplainPromptInput = {
    repoFullName: `${owner}/${repo}`,
    repoDescription: null,
    primaryLanguage: null,
    readmeExcerpt: null,
    issueNumber,
    issueTitle: live.issue.title,
    issueLabels: live.issue.labels,
    issueBody: live.issue.body,
    comments: live.comments.map((c) => ({ author: c.author, body: c.body })),
  };
  const fingerprintText = buildIssueFingerprintText(partial);
  const contentHash = await sha256Hex(`${EXPLAIN_PROMPT_VERSION}\n${fingerprintText}`);

  if (stored && storedResult) {
    const unchanged = stored.content_hash === contentHash;
    const tooYoungToRegenerate = ageMs(stored.updated_at) < MIN_REGEN_AGE_MS;
    if (unchanged || tooYoungToRegenerate || live.issue.state === "CLOSED") {
      ctx.waitUntil(stampChecked(env, source, key, issueNumber));
      return storedResult;
    }
  }

  // From here on a model call is likely — refuse the cheap cases first.
  if (live.issue.state === "CLOSED") throw new ExplainIssueClosedError();

  const issueTextLength = (live.issue.body?.trim().length ?? 0) + live.comments.reduce((sum, c) => sum + c.body.length, 0);
  if (issueTextLength < MIN_ISSUE_TEXT_CHARS) {
    if (storedResult) return storedResult;
    throw new ExplainNotEnoughContentError();
  }

  if (!(await allowGeneration())) throw new ExplainRateLimitedError();

  // Step 4: repo context. Private repositories are never explained.
  let repoSummary;
  try {
    repoSummary = await fetchRepositoryCatalogSummary(env.GITHUB_DISCOVERY_TOKEN, owner, repo);
  } catch (err) {
    if (err instanceof GitHubRepoError && err.reason === "not_found") throw new ExplainIssueNotFoundError();
    throw err;
  }
  if (repoSummary.isPrivate) throw new ExplainIssueNotFoundError();
  const readme = await fetchRepositoryReadme(env.GITHUB_DISCOVERY_TOKEN, owner, repo);

  const input: ExplainPromptInput = {
    ...partial,
    repoFullName: repoSummary.fullName,
    repoDescription: repoSummary.description,
    primaryLanguage: repoSummary.primaryLanguage,
    readmeExcerpt: readme ? readme.slice(0, EXPLAIN_README_MAX_CHARS) : null,
  };
  const messages = buildExplainMessages(input);
  const promptText = messages[1]?.content ?? "";

  const answer = await runJson(env, "explain", messages, explanationSchema, {
    ctx,
    maxTokens: EXPLAIN_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    timeoutMs: EXPLAIN_TIMEOUT_MS,
  });
  const explanation = sanitizeExplanation(answer.data, promptText, issueNumber);
  if (!explanation) {
    logger.warn("ai_issue_explanation_unusable_after_sanitising", { source, provider: answer.provider });
    throw new ExplainUnusableError();
  }

  const nowIso = new Date().toISOString();
  const { error } = await getSupabase(env)
    .from("ai_issue_explanations")
    .upsert(
      {
        source,
        repo_full_name: key,
        issue_number: issueNumber,
        content_hash: contentHash,
        explanation,
        provider: answer.provider,
        model: answer.model,
        updated_at: nowIso,
        checked_at: nowIso,
      },
      { onConflict: "source,repo_full_name,issue_number" },
    );
  if (error) {
    // The visitor still gets their explanation; the next click will regenerate.
    logger.error("ai_issue_explanation_store_failed", { source, error: error.message });
  }

  logger.info("ai_issue_explanation_generated", {
    source,
    provider: answer.provider,
    model: answer.model,
    repaired: answer.repaired,
    requestSizeEstimate: promptText.length,
  });

  return { explanation, provider: answer.provider, model: answer.model, generatedAt: nowIso, cached: false };
}
