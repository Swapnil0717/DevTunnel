import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValidatedEnv } from "../config/env";
import { getSupabase } from "./supabase";
import { logger } from "./logger";
import { listOpenExternalContributions, settleExternalContribution } from "../db/externalContributions";

/**
 * Keeps DevTunnel's task / project status in step with the real pull
 * request on GitHub — invoked from `src/index.ts`'s `scheduled` handler on
 * the 15-minute cron, never from a request handler.
 *
 * `dev submit` moves a task (or, with `--project`, a project claim) to
 * `IN_REVIEW` and records an `OPEN` row in `devtunnel.pull_requests`.
 * Nothing used to look at that PR again, so a merged PR stayed at "PR
 * submitted" until an admin marked the task `DONE` by hand. This job closes
 * that loop:
 *
 *  - PR merged                -> pull_requests = MERGED (+ merged_at), and
 *                                the task / project claim -> DONE. The
 *                                existing `log_task_completed` trigger
 *                                (sql/004) then stamps `completed_at` and
 *                                writes the TASK_COMPLETED activity row.
 *  - PR closed, not merged    -> pull_requests = CLOSED, and the task /
 *                                project claim goes back to IN_PROGRESS so
 *                                the contributor can push again and re-run
 *                                `dev submit` (a new OPEN row is allowed
 *                                once this one is no longer OPEN).
 *  - PR still open / GitHub   -> nothing changes; the next run tries again.
 *    unreachable / PR deleted
 *
 * Reads PR state with the backend's own `GITHUB_DISCOVERY_TOKEN` — the
 * upstream repositories are public, so no contributor token is needed and a
 * contributor who never signs in again still gets their task closed out.
 *
 * Every write is conditional (`status = 'OPEN'` on the PR row,
 * `status = 'IN_REVIEW'` on the task / project), so running twice, racing an
 * admin who changed the status by hand, or racing `dev submit` is harmless.
 */

const GITHUB_API_BASE = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT = "devtunnel-backend";

/**
 * Pull requests checked per run. Keeps one run well inside the Worker's
 * subrequest budget (each PR costs one GitHub call plus a few database
 * calls). When more PRs are open than this, the window rotates every run
 * (see `pickWindow`) so none are starved.
 */
const MAX_PRS_PER_RUN = 20;
const MAX_OPEN_ROWS_SCANNED = 1000;
const RUN_INTERVAL_MS = 15 * 60 * 1000;

interface OpenPullRequestRow {
  id: string;
  task_id: string | null;
  project_id: string | null;
  github_pr_url: string | null;
  github_pr_number: number | null;
}

const githubPrSchema = z.object({
  state: z.enum(["open", "closed"]),
  merged: z.boolean().optional(),
  merged_at: z.string().nullable().optional(),
});

interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

function parsePrUrl(row: OpenPullRequestRow): PrRef | null {
  if (!row.github_pr_url) return null;
  const match = row.github_pr_url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
  if (!match) return null;
  const number = row.github_pr_number ?? Number(match[3]);
  if (!Number.isInteger(number) || number <= 0) return null;
  return { owner: match[1]!, repo: match[2]!, number };
}

/** Rotates through the open rows so a backlog larger than one run still gets fully checked. */
function pickWindow<T>(rows: T[]): T[] {
  if (rows.length <= MAX_PRS_PER_RUN) return rows;
  const run = Math.floor(Date.now() / RUN_INTERVAL_MS);
  const start = (run * MAX_PRS_PER_RUN) % rows.length;
  const window = rows.slice(start, start + MAX_PRS_PER_RUN);
  if (window.length < MAX_PRS_PER_RUN) window.push(...rows.slice(0, MAX_PRS_PER_RUN - window.length));
  return window;
}

async function fetchPrState(
  token: string,
  ref: PrRef,
): Promise<{ state: "open" | "closed"; merged: boolean; mergedAt: string | null } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${GITHUB_API_BASE}/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      // 404 = PR or repo gone; 403/429 = rate limited; 5xx = GitHub trouble.
      // None of these says anything about whether the PR was merged, so
      // leave the task alone and let the next run retry.
      logger.warn("pr_sync_github_lookup_failed", {
        pr: `${ref.owner}/${ref.repo}#${ref.number}`,
        status: res.status,
      });
      return null;
    }
    const parsed = githubPrSchema.safeParse(await res.json());
    if (!parsed.success) {
      logger.warn("pr_sync_unexpected_shape", { pr: `${ref.owner}/${ref.repo}#${ref.number}` });
      return null;
    }
    const mergedAt = parsed.data.merged_at ?? null;
    return { state: parsed.data.state, merged: parsed.data.merged === true || mergedAt !== null, mergedAt };
  } catch (err) {
    logger.warn("pr_sync_github_request_failed", {
      pr: `${ref.owner}/${ref.repo}#${ref.number}`,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function applyMerged(supabase: SupabaseClient, row: OpenPullRequestRow, mergedAt: string | null) {
  // Claim the transition first: only the run that flips OPEN -> MERGED goes
  // on to touch the task, so a concurrent run can't double-apply it.
  const { data: claimed, error } = await supabase
    .from("pull_requests")
    .update({ status: "MERGED", merged_at: mergedAt ?? new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "OPEN")
    .select("id");
  if (error) throw new Error(`Failed to mark pull request merged: ${error.message}`);
  if (!claimed || claimed.length === 0) return false;

  if (row.task_id) {
    const { error: taskError } = await supabase
      .from("tasks")
      .update({ status: "DONE" })
      .eq("id", row.task_id)
      .eq("status", "IN_REVIEW")
      .is("deleted_at", null);
    if (taskError) throw new Error(`Failed to mark task done: ${taskError.message}`);
  } else if (row.project_id) {
    const { error: projectError } = await supabase
      .from("projects")
      .update({ claim_status: "DONE" })
      .eq("id", row.project_id)
      .eq("claim_status", "IN_REVIEW");
    if (projectError) throw new Error(`Failed to mark project done: ${projectError.message}`);
  }
  return true;
}

async function applyClosedUnmerged(supabase: SupabaseClient, row: OpenPullRequestRow) {
  const { data: claimed, error } = await supabase
    .from("pull_requests")
    .update({ status: "CLOSED" })
    .eq("id", row.id)
    .eq("status", "OPEN")
    .select("id");
  if (error) throw new Error(`Failed to mark pull request closed: ${error.message}`);
  if (!claimed || claimed.length === 0) return false;

  if (row.task_id) {
    const { error: taskError } = await supabase
      .from("tasks")
      .update({ status: "IN_PROGRESS" })
      .eq("id", row.task_id)
      .eq("status", "IN_REVIEW")
      .is("deleted_at", null);
    if (taskError) throw new Error(`Failed to reopen task: ${taskError.message}`);
  } else if (row.project_id) {
    const { error: projectError } = await supabase
      .from("projects")
      .update({ claim_status: "IN_PROGRESS" })
      .eq("id", row.project_id)
      .eq("claim_status", "IN_REVIEW");
    if (projectError) throw new Error(`Failed to reopen project: ${projectError.message}`);
  }
  return true;
}

/**
 * Same merged / closed check for PRs opened by `dev submit` on repositories
 * that are not DevTunnel projects (`devtunnel.external_contributions`,
 * sql/046). There is no task or project to move — settling the row is the
 * whole job, and the sql/046 trigger writes the PULL_REQUEST_MERGED activity.
 */
async function syncExternalPullRequests(env: ValidatedEnv): Promise<void> {
  const supabase = getSupabase(env);
  const rows = await listOpenExternalContributions(supabase, MAX_OPEN_ROWS_SCANNED);
  if (rows.length === 0) return;

  let merged = 0;
  let closed = 0;
  let stillOpen = 0;
  let skipped = 0;

  for (const row of pickWindow(rows)) {
    const ref = parsePrUrl({
      id: row.id,
      task_id: null,
      project_id: null,
      github_pr_url: row.github_pr_url,
      github_pr_number: row.github_pr_number,
    });
    if (!ref) {
      skipped++;
      continue;
    }

    const pr = await fetchPrState(env.GITHUB_DISCOVERY_TOKEN, ref);
    if (!pr) {
      skipped++;
      continue;
    }

    try {
      if (pr.state === "open") {
        stillOpen++;
      } else if (pr.merged) {
        if (await settleExternalContribution(supabase, row.id, { status: "MERGED", mergedAt: pr.mergedAt })) merged++;
      } else if (await settleExternalContribution(supabase, row.id, { status: "CLOSED" })) {
        closed++;
      }
    } catch (err) {
      logger.error("pr_sync_external_apply_failed", {
        externalContributionId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("pr_sync_external_run_complete", { openRows: rows.length, merged, closed, stillOpen, skipped });
}

export async function syncSubmittedPullRequests(env: ValidatedEnv): Promise<void> {
  const supabase = getSupabase(env);

  // External (non-DevTunnel) PRs first, and isolated: a failure here must not
  // stop the DevTunnel task sync below, and the DevTunnel sync's early
  // `return` on "no open rows" must not skip this.
  await syncExternalPullRequests(env).catch((err) => {
    logger.error("pr_sync_external_failed", { error: err instanceof Error ? err.message : String(err) });
  });

  const { data, error } = await supabase
    .from("pull_requests")
    .select("id, task_id, project_id, github_pr_url, github_pr_number")
    .eq("status", "OPEN")
    .not("github_pr_url", "is", null)
    .order("created_at", { ascending: true })
    .limit(MAX_OPEN_ROWS_SCANNED);

  if (error) {
    logger.error("pr_sync_load_failed", { error: error.message });
    return;
  }

  const rows = (data ?? []) as OpenPullRequestRow[];
  if (rows.length === 0) return;

  let merged = 0;
  let closed = 0;
  let stillOpen = 0;
  let skipped = 0;

  for (const row of pickWindow(rows)) {
    const ref = parsePrUrl(row);
    if (!ref) {
      skipped++;
      continue;
    }

    const pr = await fetchPrState(env.GITHUB_DISCOVERY_TOKEN, ref);
    if (!pr) {
      skipped++;
      continue;
    }

    try {
      if (pr.state === "open") {
        stillOpen++;
      } else if (pr.merged) {
        if (await applyMerged(supabase, row, pr.mergedAt)) merged++;
      } else if (await applyClosedUnmerged(supabase, row)) {
        closed++;
      }
    } catch (err) {
      logger.error("pr_sync_apply_failed", {
        pullRequestId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("pr_sync_run_complete", { openRows: rows.length, merged, closed, stillOpen, skipped });
}