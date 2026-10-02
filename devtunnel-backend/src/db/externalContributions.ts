import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `devtunnel.external_contributions` (sql/046) — work done through the CLI on
 * a public GitHub repository that is NOT a DevTunnel project or task.
 *
 * A row is created by `dev start owner/repo#123` (status STARTED), gets its PR
 * recorded by `dev submit` (OPEN), and is moved to MERGED / CLOSED by
 * `syncSubmittedPullRequests` (lib/prSync.ts). The database trigger in
 * sql/046 turns the submit and the merge into `activity_log` rows, which is
 * what the contribution calendar and totals read — this module never writes
 * `activity_log` itself.
 */

export type ExternalContributionStatus = "STARTED" | "OPEN" | "MERGED" | "CLOSED";

export interface ExternalContributionStart {
  userId: string;
  /** GitHub's casing, e.g. `facebook/react`. */
  repositoryFullName: string;
  issueNumber: number | null;
  issueTitle: string | null;
  forkFullName: string;
  branch: string;
}

/**
 * Idempotent: `dev start` run twice for the same repo + branch leaves one row
 * and never downgrades a row that has already been submitted or merged.
 */
export async function recordExternalStart(
  supabase: SupabaseClient,
  start: ExternalContributionStart,
): Promise<void> {
  const { error } = await supabase.from("external_contributions").upsert(
    {
      user_id: start.userId,
      repository_key: start.repositoryFullName.toLowerCase(),
      repository_full_name: start.repositoryFullName,
      repository_url: `https://github.com/${start.repositoryFullName}`,
      issue_number: start.issueNumber,
      issue_title: start.issueTitle,
      fork_full_name: start.forkFullName,
      branch: start.branch,
    },
    { onConflict: "user_id,repository_key,branch", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Failed to record external start: ${error.message}`);
}

export interface ExternalContributionSubmit {
  userId: string;
  repositoryFullName: string;
  issueNumber: number | null;
  forkFullName: string;
  branch: string;
  prUrl: string;
  prNumber: number;
  prTitle: string;
}

/**
 * Records the PR against the (user, repo, branch) row, creating the row if
 * `dev start` was never run through this backend (e.g. the contributor forked
 * and branched by hand, then ran `dev submit`). A PR that was previously
 * CLOSED and is opened again on the same branch goes back to OPEN.
 */
export async function recordExternalSubmit(
  supabase: SupabaseClient,
  submit: ExternalContributionSubmit,
): Promise<void> {
  const key = submit.repositoryFullName.toLowerCase();

  const { data: existing, error: readError } = await supabase
    .from("external_contributions")
    .select("id, status, github_pr_url, submitted_at")
    .eq("user_id", submit.userId)
    .eq("repository_key", key)
    .eq("branch", submit.branch)
    .maybeSingle<{ id: string; status: ExternalContributionStatus; github_pr_url: string | null; submitted_at: string | null }>();
  if (readError) throw new Error(`Failed to read external contribution: ${readError.message}`);

  const now = new Date().toISOString();

  if (!existing) {
    const { error } = await supabase.from("external_contributions").insert({
      user_id: submit.userId,
      repository_key: key,
      repository_full_name: submit.repositoryFullName,
      repository_url: `https://github.com/${submit.repositoryFullName}`,
      issue_number: submit.issueNumber,
      fork_full_name: submit.forkFullName,
      branch: submit.branch,
      status: "OPEN",
      github_pr_url: submit.prUrl,
      github_pr_number: submit.prNumber,
      pr_title: submit.prTitle,
      submitted_at: now,
    });
    if (error) throw new Error(`Failed to record external submit: ${error.message}`);
    return;
  }

  // Already merged: GitHub is the source of truth, never reopen it from here.
  if (existing.status === "MERGED") return;

  const { error } = await supabase
    .from("external_contributions")
    .update({
      status: "OPEN",
      github_pr_url: submit.prUrl,
      github_pr_number: submit.prNumber,
      pr_title: submit.prTitle,
      fork_full_name: submit.forkFullName,
      // First submit stamps the time; a re-submit keeps the original.
      submitted_at: existing.submitted_at ?? now,
      ...(submit.issueNumber !== null ? { issue_number: submit.issueNumber } : {}),
    })
    .eq("id", existing.id);
  if (error) throw new Error(`Failed to update external submit: ${error.message}`);
}

export interface OpenExternalRow {
  id: string;
  github_pr_url: string | null;
  github_pr_number: number | null;
}

/** Open PRs the merge-sync job should look at, oldest first. */
export async function listOpenExternalContributions(
  supabase: SupabaseClient,
  limit: number,
): Promise<OpenExternalRow[]> {
  const { data, error } = await supabase
    .from("external_contributions")
    .select("id, github_pr_url, github_pr_number")
    .eq("status", "OPEN")
    .not("github_pr_url", "is", null)
    .order("submitted_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to load open external contributions: ${error.message}`);
  return (data ?? []) as OpenExternalRow[];
}

/** OPEN -> MERGED / CLOSED. Conditional on `status = 'OPEN'` so concurrent runs can't double-apply. Returns whether this call made the change. */
export async function settleExternalContribution(
  supabase: SupabaseClient,
  id: string,
  outcome: { status: "MERGED"; mergedAt: string | null } | { status: "CLOSED" },
): Promise<boolean> {
  const patch =
    outcome.status === "MERGED"
      ? { status: "MERGED", merged_at: outcome.mergedAt ?? new Date().toISOString() }
      : { status: "CLOSED" };

  const { data, error } = await supabase
    .from("external_contributions")
    .update(patch)
    .eq("id", id)
    .eq("status", "OPEN")
    .select("id");
  if (error) throw new Error(`Failed to settle external contribution: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Counts for the profile stat cards: PRs submitted (any status past STARTED) and PRs merged. */
export async function getExternalContributionCounts(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ submitted: number; merged: number }> {
  const [submitted, merged] = await Promise.all([
    supabase
      .from("external_contributions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("github_pr_url", "is", null),
    supabase
      .from("external_contributions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "MERGED"),
  ]);
  for (const result of [submitted, merged]) {
    if (result.error) throw new Error(`Failed to count external contributions: ${result.error.message}`);
  }
  return { submitted: submitted.count ?? 0, merged: merged.count ?? 0 };
}
