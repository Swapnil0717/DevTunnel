/**
 * Local, frontend-only shapes for the Admin **New Issues** page
 * (admin_workflow.txt, section 16 — "New Issues Section" / A15 in the
 * final page list, section 29).
 *
 * Same convention as `lib/admin/tasks/types.ts`: `GET /admin/new-issues`
 * is listed in section 22's Admin Backend API Map but isn't built on the
 * backend yet (only `/admin/auth`, `/admin/activity`,
 * `/admin/projects/onboarding` and `/admin/tasks/onboarding` are mounted
 * today — see `devtunnel-backend/src/routes/admin/index.ts`). This is a
 * documented assumption built directly from:
 *  - section 16's "Frontend" column list ("Issue #, Issue Title, Project,
 *    GitHub Author, Labels, Created, Updated") and its action list
 *    ("View, Create Task, Ignore" — "Only include actions supported by
 *    the actual workflow"),
 *  - section 9's algorithm ("Compare Issue IDs… use the GitHub issue
 *    ID/number plus repository identity rather than only the title"),
 *    and
 *  - shapes already defined for Task Onboarding's own issue list
 *    (`GithubIssueSummary`, `OnboardingGithubIdentity` in
 *    `lib/admin/task-onboarding/types.ts` / `project-onboarding/types.ts`)
 *    — reused here rather than re-declared, since a "new" issue and an
 *    "onboarded" issue are the same GitHub object in two different
 *    DevTunnel states (section 9: "GitHub Issues ├── Covered by
 *    DevTunnel … └── Not covered → New Issues").
 *
 * A New Issue is explicitly *not* a DevTunnel resource yet — "DevTunnel
 * does not need to represent every GitHub issue as a DevTunnel task"
 * (section 9) — so nothing here models onboarding-draft state
 * (`TaskOnboardingStepState` etc.); that only starts once "Create Task"
 * is pressed and Task Onboarding's own Step 1/2 take over.
 */
 import type { OnboardingGithubIdentity } from "@/lib/admin/project-onboarding/types";
 import type { GithubIssueState } from "@/lib/admin/task-onboarding/types";
 
 /**
  * The project a new issue's repository belongs to, trimmed to what the
  * table and filter bar need. `techStack` is the project's own
  * already-validated tech stack from Project Onboarding (section 3 —
  * "Project Tech Stack") — a GitHub issue has no tech stack of its own,
  * so filtering "by tech stack" (as requested) means filtering by the
  * tech stack of the project the issue belongs to, same inheritance
  * `AdminTaskSummary.techStack` documents for onboarded tasks.
  */
 export interface AdminNewIssueProjectRef {
   id: string;
   slug: string;
   name: string;
   repositoryFullName: string;
   repositoryUrl: string;
   techStack: string[];
 }
 
 /**
  * A single row of the New Issues table (section 16 ▸ Frontend):
  * "Issue #, Issue Title, Project, GitHub Author, Labels, Created,
  * Updated". `id` identifies the DevTunnel-side record of "this GitHub
  * issue is new" (what `POST .../ignore` below acts on) — it is
  * deliberately not a task id, since no task exists yet.
  *
  * `state` is kept even though section 16's column list doesn't name it
  * explicitly: an issue can be closed on GitHub before Admin gets to it,
  * and silently offering "Create Task" for a closed issue would curate a
  * DevTunnel task for something no longer actionable — surfacing the
  * real, already-fetched GitHub state here is exposing existing data, not
  * inventing a new fact (Frontend_Development_Rules.txt rule 58).
  */
 export interface AdminNewIssue {
   id: string;
   number: number;
   title: string;
   url: string;
   state: GithubIssueState;
   project: AdminNewIssueProjectRef;
   /** The GitHub user who opened the issue — the "GitHub Author" column. */
   author: OnboardingGithubIdentity;
   labels: string[];
   createdAt: string;
   updatedAt: string;
 }