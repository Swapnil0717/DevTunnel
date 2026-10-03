// devtunnel-frontend/src/lib/admin/bug-reports/types.ts
// Wire shapes of `GET /admin/bug-reports` (devtunnel-backend src/routes/admin/bugReports.ts).

export const ADMIN_BUG_REPORTS_PAGE_SIZE = 20;

export interface AdminBugReport {
  id: string;
  title: string;
  area: "projects" | "tasks" | "cli" | "profile" | "other";
  severity: "minor" | "broken" | "blocked";
  description: string;
  steps: string | null;
  expected: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  /** DevTunnel username, or `null` for a signed-out visitor / deleted account. */
  reporterUsername: string | null;
  createdAt: string;
}

export interface AdminBugReportsPage {
  reports: AdminBugReport[];
  /** Pass as `before` for the next (older) page; `null` when there are no more. */
  nextCursor: string | null;
}
