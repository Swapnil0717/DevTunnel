import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContributionCalendar, DevTunnelStats } from "../types";
import { buildDevtunnelMonthCalendar, monthBoundsISO } from "../lib/devtunnelActivity";

/**
 * Whether this user maintains at least one project
 * (`devtunnel.project_maintainers` — sql/004_add_devtunnel_contributions.sql).
 * A user can be both a CONTRIBUTOR-role account and a maintainer of a
 * specific project at the same time — this is a separate, real fact from
 * `users.role`, not derived from it (see db/users.ts `toAuthUser` and
 * devtunnel-frontend components/profile/profile-tags.tsx, which shows
 * both badges when both are true).
 */
export async function getIsMaintainer(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("project_maintainers")
    .select("project_id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to check maintainer status: ${error.message}`);
  return (count ?? 0) > 0;
}

/**
 * Projects created, projects maintained, tasks completed, and pull
 * requests merged — every count here comes from a real table
 * (sql/004_add_devtunnel_contributions.sql), never invented. Backs
 * `GET /users/me/devtunnel-stats` (routes/devtunnelStats.ts) and the
 * profile page's "Projects" / "Tasks done" / "Pull requests" stat cards.
 */
export async function getDevTunnelStats(
  supabase: SupabaseClient,
  userId: string,
): Promise<DevTunnelStats> {
  const [projectsCreated, projectsMaintaining, tasksCompleted, pullRequestsMerged] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("created_by", userId),
    supabase
      .from("project_maintainers")
      .select("project_id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assignee_id", userId)
      .eq("status", "DONE"),
    supabase
      .from("pull_requests")
      .select("id", { count: "exact", head: true })
      .eq("author_id", userId)
      .eq("status", "MERGED"),
  ]);

  for (const result of [projectsCreated, projectsMaintaining, tasksCompleted, pullRequestsMerged]) {
    if (result.error) throw new Error(`Failed to load DevTunnel stats: ${result.error.message}`);
  }

  return {
    projectsCreated: projectsCreated.count ?? 0,
    projectsMaintaining: projectsMaintaining.count ?? 0,
    tasksCompleted: tasksCompleted.count ?? 0,
    pullRequestsMerged: pullRequestsMerged.count ?? 0,
    isMaintainer: (projectsMaintaining.count ?? 0) > 0,
  };
}

/**
 * One calendar month of DevTunnel-native activity
 * (`devtunnel.activity_log`), shaped identically to
 * `fetchContributionCalendar` in lib/githubGraphql.ts. Backs
 * `GET /users/me/contributions/devtunnel`.
 */
export async function getDevTunnelMonthCalendar(
  supabase: SupabaseClient,
  userId: string,
  month: string,
): Promise<ContributionCalendar> {
  const { fromISO, toISO } = monthBoundsISO(month);

  const { data, error } = await supabase
    .from("activity_log")
    .select("occurred_at")
    .eq("user_id", userId)
    .gte("occurred_at", fromISO)
    .lte("occurred_at", toISO);

  if (error) throw new Error(`Failed to load DevTunnel activity: ${error.message}`);

  const dailyCounts = new Map<string, number>();
  for (const row of (data ?? []) as { occurred_at: string }[]) {
    const date = row.occurred_at.slice(0, 10);
    dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + 1);
  }

  return buildDevtunnelMonthCalendar(dailyCounts, month);
}

/**
 * Rolling 365-day DevTunnel-native contribution total — the number shown
 * next to the GitHub total on the profile page's "Contributions" stat
 * card. Backs `GET /users/me/contributions/devtunnel/summary`.
 */
export async function getDevTunnelContributionSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ totalContributions: number; fromISO: string; toISO: string }> {
  const to = new Date();
  const from = new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000);
  const fromISO = from.toISOString();
  const toISO = to.toISOString();

  const { count, error } = await supabase
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("occurred_at", fromISO)
    .lte("occurred_at", toISO);

  if (error) throw new Error(`Failed to load DevTunnel contribution summary: ${error.message}`);

  return { totalContributions: count ?? 0, fromISO, toISO };
}