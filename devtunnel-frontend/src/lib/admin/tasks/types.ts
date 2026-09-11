/**
 * Local, frontend-only shapes for the Admin **Tasks** pages
 * (admin_workflow.txt, section 13 — "Task Page" / A12 in the final page
 * list, and section 18 — "Project Detail Page"'s task-count sibling).
 *
 * Same convention as `lib/admin/projects/types.ts`: `GET /admin/tasks`
 * and `GET /admin/tasks/:id` are listed in section 22's Admin Backend API
 * Map but aren't built on the backend yet (only `/admin/auth`,
 * `/admin/activity`, `/admin/projects/onboarding` and
 * `/admin/tasks/onboarding` are mounted today — see
 * `devtunnel-backend/src/routes/admin/index.ts`). This is a documented
 * assumption built directly from:
 *  - section 13's table columns ("Task, Project, GitHub Issue,
 *    Difficulty, Active Contributors, Completed Contributors, Submission
 *    Count, Status"),
 *  - section 14's contributor counts ("Working / Completed / Submitted"),
 *  - section 15's soft-delete record ("Issue #, Issue Title, Project,
 *    Deleted At, Deletion Status"), and
 *  - the real columns Task Onboarding's Step 7 completion already writes
 *    to `devtunnel.tasks`
 *    (`devtunnel-backend/sql/012_add_task_onboarding_preview_validation.sql`:
 *    `role`, `difficulty`, `github_issue_number`,
 *    `github_issue_url`, `status` from `devtunnel.task_status`) — not
 *    from a fabricated schema.
 *
 * `role` and `techStack` aren't in section 13's table verbatim, but both
 * are real, already-curated data (`devtunnel.tasks.role` from Task
 * Onboarding Step 5; the project's own validated tech stack, section 18)
 * — surfacing them here is exposing existing curation, not inventing a
 * new fact about the task (Frontend_Development_Rules.txt rule 58).
 */
 import type { AdminProjectAuthor } from "../projects/types";
 import type { OnboardingGithubIdentity } from "../project-onboarding/types";
 import type { GithubIssueState } from "../task-onboarding/types";
 import type { DeveloperRole, ExperienceLevel } from "@/lib/onboarding/types";
 
 /**
  * `devtunnel.task_status` (`devtunnel-backend/sql/004_add_devtunnel_contributions.sql`)
  * — the task's own DevTunnel lifecycle, distinct from a contributor's
  * personal progress on it (`lib/home/types.ts`'s `TaskStatus`,
  * "TODO" | "IN_PROGRESS" | "IN_REVIEW", which is a different,
  * per-contributor concept).
  */
 export type AdminTaskStatus = "OPEN" | "IN_PROGRESS" | "DONE";
 
 /**
  * The project a task belongs to, trimmed to exactly what the Tasks table
  * and filter bar need — not the full `AdminProjectSummary` row (section
  * 26: "DevTunnel Task" hangs off "DevTunnel Project", not the other way
  * around, so this stays a lightweight reference).
  */
 export interface AdminTaskProjectRef {
   id: string;
   slug: string;
   name: string;
   repositoryFullName: string;
   repositoryUrl: string;
   author: AdminProjectAuthor;
 }
 
 /**
  * The GitHub issue a task was onboarded from — same shape Task Onboarding
  * already fetches (`GithubIssueSummary` in
  * `lib/admin/task-onboarding/types.ts`), trimmed to what a list/detail
  * row actually renders. "Do not modify the original GitHub issue"
  * (section 10) applies here too — this is a read-only reference, not an
  * editable field.
  */
 export interface AdminTaskGithubIssueRef {
   number: number;
   title: string;
   url: string;
   state: GithubIssueState;
   author: OnboardingGithubIdentity;
 }
 
 /**
  * A single row of the Tasks table (section 13 ▸ Frontend) plus the
  * section 14 contributor breakdown. `activeContributorCount` /
  * `completedContributorCount` / `submissionCount` are kept as three
  * separate numbers, matching the spec's own worked example exactly
  * ("Working: 4, Completed: 2, Submitted: 3") rather than one combined
  * figure.
  *
  * `techStack` is the flattened tag list the task inherits from its
  * project's already-validated tech stack (same flattening
  * `TaskPreviewStep` already does for the onboarding preview) — a task
  * has no tech stack of its own, so this is never a second, independent
  * source of truth from the project's.
  *
  * `deletedAt` is `null` for every task that still exists in DevTunnel.
  * Non-null marks a soft-deleted task whose GitHub issue still exists
  * (section 15) — "Prefer a soft-delete/archive record rather than
  * physically destroying the relationship."
  */
 export interface AdminTaskSummary {
   id: string;
   slug: string | null;
   title: string;
   project: AdminTaskProjectRef;
   githubIssue: AdminTaskGithubIssueRef | null;
   /**
    * Multi-select — a task can be relevant to more than one role at once
    * (e.g. Frontend + Docs), same convention as
    * `lib/admin/task-onboarding/types.ts` `TaskCuration.roles`. Empty
    * when no role has been curated yet.
    */
   roles: DeveloperRole[];
   difficulty: ExperienceLevel | null;
   techStack: string[];
   status: AdminTaskStatus;
   activeContributorCount: number;
   completedContributorCount: number;
   submissionCount: number;
   deletedAt: string | null;
 }
 
 /**
  * `GET /admin/tasks/:id` (section 22 — Admin Backend API Map, "Tasks";
  * A14 — "Task Details" in the final page list, section 29: "Task +
  * contributor/submission data"). Extends the list-row summary with the
  * task's full curated description — the same "existing GitHub issue vs.
  * existing + custom" choice Task Onboarding's Step 3 already models
  * (`TaskIssueInformation` in `lib/admin/task-onboarding/types.ts`), read
  * back for an already-created task rather than an in-progress draft.
  */
 export interface AdminTaskDetail extends AdminTaskSummary {
   /** Only set when the task was onboarded with a DevTunnel-specific description layered on the issue. */
   customDescription: string | null;
   /** The original GitHub issue body, exactly as imported — never rewritten. */
   githubIssueBody: string | null;
 }
 
 /**
  * `PATCH /admin/tasks/:id` (section 22 — Admin Backend API Map, "Tasks").
  * Deliberately limited to the fields Task Onboarding itself hands the
  * Admin curation control over (role, difficulty, the custom description
  * layered on the GitHub issue) plus the task's own DevTunnel `status` —
  * same restriction `AdminProjectUpdatePayload` applies to projects.
  * Project, GitHub issue, contributors and submission counts are
  * derived/GitHub-sourced and have no writable counterpart here.
  */
 export interface AdminTaskUpdatePayload {
   roles?: DeveloperRole[];
   difficulty?: ExperienceLevel;
   customDescription?: string | null;
   status?: AdminTaskStatus;
 }