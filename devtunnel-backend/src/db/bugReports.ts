import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Bug reports — `devtunnel.bug_reports` (sql/050).
 *
 * Backs `POST /bug-reports` (src/routes/bugReports.ts), the "Found a bug"
 * popup in the app header, and the admin list `GET /admin/bug-reports`
 * (src/routes/admin/bugReports.ts).
 *
 * A row is a message from a visitor, never delivered work. Nothing here
 * stores an email, IP address or other personal data; the reporter is only
 * linked through `user_id` when they were signed in.
 *
 * Supabase calls per function: exactly one each.
 */

const TABLE = "bug_reports";

export const BUG_AREAS = ["projects", "tasks", "cli", "profile", "other"] as const;
export const BUG_SEVERITIES = ["minor", "broken", "blocked"] as const;

export type BugArea = (typeof BUG_AREAS)[number];
export type BugSeverity = (typeof BUG_SEVERITIES)[number];

export interface BugReportInput {
  title: string;
  area: BugArea;
  severity: BugSeverity;
  description: string;
  steps: string | null;
  expected: string | null;
  pageUrl: string | null;
  userAgent: string | null;
}

/** Inserts one report. `userId` is `null` for a signed-out visitor. */
export async function createBugReport(
  supabase: SupabaseClient,
  userId: string | null,
  input: BugReportInput,
): Promise<void> {
  const { error } = await supabase.from(TABLE).insert({
    user_id: userId,
    title: input.title,
    area: input.area,
    severity: input.severity,
    description: input.description,
    steps: input.steps,
    expected: input.expected,
    page_url: input.pageUrl,
    user_agent: input.userAgent,
  });
  if (error) throw new Error(`Failed to insert into ${TABLE}: ${error.message}`);
}

/* ---------------------------------------------------------------------------
 * Admin list
 * ------------------------------------------------------------------------- */

const ADMIN_COLUMNS =
  "id, title, area, severity, description, steps, expected, page_url, user_agent, created_at, reporter:users(username)";

export interface AdminBugReport {
  id: string;
  title: string;
  area: BugArea;
  severity: BugSeverity;
  description: string;
  steps: string | null;
  expected: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  /** DevTunnel username, or `null` for a signed-out visitor / deleted account. */
  reporterUsername: string | null;
  createdAt: string;
}

interface BugReportRow {
  id: string;
  title: string;
  area: BugArea;
  severity: BugSeverity;
  description: string;
  steps: string | null;
  expected: string | null;
  page_url: string | null;
  user_agent: string | null;
  created_at: string;
  reporter: { username: string } | { username: string }[] | null;
}

function toAdminBugReport(row: BugReportRow): AdminBugReport {
  // A to-one embed is an object, but be tolerant of the array shape too.
  const reporter = Array.isArray(row.reporter) ? row.reporter[0] ?? null : row.reporter;
  return {
    id: row.id,
    title: row.title,
    area: row.area,
    severity: row.severity,
    description: row.description,
    steps: row.steps,
    expected: row.expected,
    pageUrl: row.page_url,
    userAgent: row.user_agent,
    reporterUsername: reporter?.username ?? null,
    createdAt: row.created_at,
  };
}

export interface AdminBugReportsPage {
  reports: AdminBugReport[];
  /** Pass as `before` on the next request. `null` when there are no more rows. */
  nextCursor: string | null;
}

/**
 * Newest first by `created_at`, keyset-paginated like `listAdminAuditLog`:
 * one extra row tells us whether another page exists, with no COUNT query.
 */
export async function listAdminBugReports(
  supabase: SupabaseClient,
  options: { limit: number; before: string | null },
): Promise<AdminBugReportsPage> {
  let query = supabase
    .from(TABLE)
    .select(ADMIN_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(options.limit + 1);

  if (options.before) query = query.lt("created_at", options.before);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list ${TABLE}: ${error.message}`);

  const rows = (data ?? []) as unknown as BugReportRow[];
  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;

  return {
    reports: page.map(toAdminBugReport),
    nextCursor: hasMore ? page[page.length - 1]!.created_at : null,
  };
}
