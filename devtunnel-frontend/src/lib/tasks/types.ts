/**
 * Local, frontend-only shapes for the contributor-facing **Tasks** page
 * (`/tasks` — "Tasks" in `AppSidebar` / `AppBottomNav`).
 *
 * "This page shows all tasks/issues that DevTunnel currently provides
 * to contributors" (admin_workflow.txt section 8/13) describes the
 * Admin's own Tasks page, but the underlying list — every active
 * `devtunnel.tasks` row — is exactly what a contributor deciding what
 * to work on needs to browse too. This mirrors `AdminTaskSummary`
 * (`lib/admin/tasks/types.ts`) field-for-field where the field is
 * something a contributor should see, and drops what's admin-only:
 *
 *  - No `id`-keyed edit/delete affordance (`AdminTaskUpdatePayload` has
 *    no contributor-facing counterpart on this page).
 *  - No soft-deleted tasks at all — `deletedAt` isn't carried over here,
 *    since this type only ever represents a task DevTunnel still
 *    actively provides (a soft-deleted task's GitHub issue may still
 *    exist, per section 15, but it is no longer something to pick up).
 *  - No `submissionCount` — a completion-tracking metric more relevant
 *    to an admin auditing throughput than to a contributor choosing a
 *    task; `activeContributorCount` / `completedContributorCount` are
 *    kept since "N people already working on this" is a genuinely
 *    useful signal when picking a task.
 *
 * `slug` is kept (nullable, same as `AdminTaskSummary.slug`) even though
 * no `/tasks/:slug` detail route exists in this app yet — Frontend_
 * Development_Rules.txt rule 45 favors a stable identifier existing
 * ahead of the URL that will eventually use it, over inventing one
 * later once a task is already being linked to by its list-page id.
 *
 * `roles`, `difficulty`, and `techStack` are deliberately the three
 * fields `TasksExplorer`'s filter bar exposes as filters — they're the
 * same three categories the onboarding form itself asks a contributor
 * about (`lib/onboarding/types.ts`: `developerRoles`, `experienceLevel`,
 * `technologies`/`interests`), so filtering the Tasks list by them lets
 * a contributor narrow down to tasks that match the profile they already
 * gave DevTunnel — not a new, separately-invented set of filter
 * categories.
 */
 import type { DeveloperRole, ExperienceLevel } from "@/lib/onboarding/types";
 import type { OnboardingGithubIdentity } from "@/lib/admin/project-onboarding/types";
 import type { GithubIssueState } from "@/lib/admin/task-onboarding/types";
 import type { AdminTaskStatus } from "@/lib/admin/tasks/types";
 
 /**
  * `devtunnel.task_status` — reused verbatim from
  * `lib/admin/tasks/types.ts` rather than redeclared, since a task's
  * DevTunnel lifecycle status means exactly the same thing on this page
  * as it does on the Admin Tasks page.
  */
 export type TaskStatus = AdminTaskStatus;
 
 /**
  * The project a task belongs to, trimmed to what `TasksTable` and
  * `TasksExplorer`'s filter bar need — same fields `IssueProjectRef`
  * (`lib/issues/types.ts`) already carries for the same reason.
  */
 export interface TaskProjectRef {
   slug: string;
   name: string;
   repositoryFullName: string;
   repositoryUrl: string;
   techStack: string[];
 }
 
 /**
  * The GitHub issue a task was onboarded from — same shape
  * `AdminTaskGithubIssueRef` carries. "Do not modify the original GitHub
  * issue" (admin_workflow.txt section 10) applies here too: this is a
  * read-only reference a contributor can open, not an editable field.
  */
 export interface TaskGithubIssueRef {
   number: number;
   title: string;
   url: string;
   state: GithubIssueState;
   author: OnboardingGithubIdentity;
 }
 
 /**
  * A single row of the Tasks table/list. See this file's own doc comment
  * above for exactly how this differs from `AdminTaskSummary`.
  */
 export interface Task {
   id: string;
   slug: string | null;
   title: string;
   project: TaskProjectRef;
   githubIssue: TaskGithubIssueRef | null;
   /** Multi-select — a task can be relevant to more than one role at once (e.g. Frontend + Docs). */
   roles: DeveloperRole[];
   difficulty: ExperienceLevel | null;
   techStack: string[];
   status: TaskStatus;
   activeContributorCount: number;
   completedContributorCount: number;
 }

 /**
  * `GET /projects/:projectSlug/tasks/:taskId` — the "View Task" page
  * `TaskRow` and `TasksTable` link to. Extends `Task` with the task's own
  * curated description, the same two detail-only fields
  * `AdminTaskDetail` (`lib/admin/tasks/types.ts`) adds over
  * `AdminTaskSummary` — a contributor deciding whether to pick up a task
  * needs to actually read it, not just see the summary row.
  */
 export interface TaskDetail extends Task {
   /** Only set when the task was onboarded/edited with a DevTunnel-specific description layered on the issue. */
   customDescription: string | null;
   /** The original GitHub issue body, exactly as imported — never rewritten. */
   githubIssueBody: string | null;
 }