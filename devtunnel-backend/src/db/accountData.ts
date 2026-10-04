import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";
import type { UserRow } from "../types";

/** Rows per table in an export. A user will never hit this; it only bounds the response size. */
const MAX_ROWS_PER_TABLE = 5000;

/** Days a deleted account is kept (soft-deleted) before `purge_deleted_accounts` erases it. Matches the Privacy policy. */
export const ACCOUNT_PURGE_GRACE_DAYS = 30;

/**
 * Tables holding a user's own data, and the column that points at the user.
 * Any key whose name looks like a secret is dropped from exported rows below.
 */
const EXPORT_TABLES: ReadonlyArray<{ key: string; table: string; column: string }> = [
  { key: "projectMemberships", table: "project_contributors", column: "user_id" },
  { key: "toolMemberships", table: "opensource_tool_contributors", column: "user_id" },
  { key: "contributionProgress", table: "contribution_progress", column: "user_id" },
  { key: "taskViews", table: "task_views", column: "user_id" },
  { key: "githubRepoContributions", table: "github_repo_contributors", column: "user_id" },
  { key: "externalContributions", table: "external_contributions", column: "user_id" },
  { key: "contributionFeedback", table: "contribution_feedback", column: "user_id" },
  { key: "githubStars", table: "github_stars", column: "starred_by" },
  { key: "pullRequests", table: "pull_requests", column: "author_id" },
  { key: "activityLog", table: "activity_log", column: "user_id" },
  { key: "submissions", table: "user_submissions", column: "submitted_by" },
  { key: "submissionUpvotes", table: "user_submission_upvotes", column: "user_id" },
  { key: "submissionDrafts", table: "user_submission_drafts", column: "created_by" },
  { key: "githubProjectNominations", table: "github_project_nominations", column: "requested_by" },
  { key: "githubToolNominations", table: "github_open_source_tool_nominations", column: "requested_by" },
  { key: "bugReports", table: "bug_reports", column: "user_id" },
  { key: "notificationPreferences", table: "notification_preferences", column: "user_id" },
  { key: "cliTokens", table: "cli_tokens", column: "user_id" },
];

const SECRET_KEY = /(token|hash|secret|encrypted|password)/i;
// Metadata about a CLI token is fine to export; the token value itself never is.
const SECRET_KEY_ALLOWED = new Set(["token_label"]);

function stripSecrets(row: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (SECRET_KEY.test(key) && !SECRET_KEY_ALLOWED.has(key)) continue;
    clean[key] = value;
  }
  return clean;
}

export interface UserDataExport {
  exportedAt: string;
  notes: string;
  profile: Record<string, unknown>;
  data: Record<string, unknown[]>;
  /** Tables that couldn't be read (e.g. a migration not applied). Empty in a healthy deployment. */
  unavailable: string[];
}

/**
 * Everything DevTunnel stores about one user, for `GET /settings/export`.
 * GitHub tokens, session secrets and token hashes are never included.
 * A table that fails to load is listed under `unavailable` instead of failing
 * the whole export, so one missing migration can't block a user's access to
 * their data.
 */
export async function exportUserData(supabase: SupabaseClient, user: UserRow): Promise<UserDataExport> {
  const profile = {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    bio: user.bio,
    avatarUrl: user.avatar_url,
    githubUsername: user.github_username,
    githubProfileUrl: user.github_profile_url,
    role: user.role,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    onboardingCompleted: user.onboarding_completed,
    skills: user.skills,
    technologies: user.technologies,
    developerRoles: user.developer_roles,
    experienceLevel: user.experience_level,
    interests: user.interests,
    intent: user.intent,
  };

  const results = await Promise.all(
    EXPORT_TABLES.map(async ({ key, table, column }) => {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq(column, user.id)
        .limit(MAX_ROWS_PER_TABLE);
      if (error) {
        logger.warn("account_export_table_failed", { table, error: error.message });
        return { key, rows: null as unknown[] | null };
      }
      return { key, rows: (data ?? []).map((r) => stripSecrets(r as Record<string, unknown>)) };
    }),
  );

  const out: Record<string, unknown[]> = {};
  const unavailable: string[] = [];
  for (const { key, rows } of results) {
    if (rows === null) unavailable.push(key);
    else out[key] = rows;
  }

  return {
    exportedAt: new Date().toISOString(),
    notes:
      "A copy of the personal data DevTunnel holds about you. GitHub tokens and sign-in secrets are never included. Ids refer to DevTunnel records.",
    profile,
    data: out,
    unavailable,
  };
}

/**
 * Permanently erases / anonymises accounts deleted more than `graceDays` ago
 * (sql/052_account_purge.sql). Returns how many accounts were purged this run.
 * Runs from the daily 03:00 UTC cron; it never throws into the scheduler.
 */
export async function purgeDeletedAccounts(
  supabase: SupabaseClient,
  graceDays: number = ACCOUNT_PURGE_GRACE_DAYS,
): Promise<number> {
  const { data, error } = await supabase.rpc("purge_deleted_accounts", {
    p_grace_days: graceDays,
    p_limit: 50,
  });
  if (error) {
    throw new Error(`purge_deleted_accounts failed: ${error.message}`);
  }
  return typeof data === "number" ? data : 0;
}
