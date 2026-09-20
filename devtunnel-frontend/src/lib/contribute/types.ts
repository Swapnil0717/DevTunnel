/**
 * Frontend-only shapes for the **Contribute** page
 * (`/projects/:projectSlug/contribute` and
 * `/opensource-tools/:toolSlug/contribute`) — the destination the
 * "Contribute to this project" / "Contribute to this tool" button on the
 * two detail pages sends a contributor to once they've joined.
 *
 * Nothing here is a new API call. `ContributeTarget` is a *view model*:
 * the page's server component builds one out of the payload the detail
 * page already fetches (`DevtunnelProjectDetail` in `lib/projects/types.ts`,
 * `OpenSourceToolDetail` in `lib/opensource-tools/types.ts`), so the two
 * routes can share one set of components instead of growing two
 * near-identical Contribute pages that drift apart
 * (Frontend_Development_Rules.txt rule 51).
 *
 * The distinction the view model has to preserve is the same one
 * `ContributeToToolButton` already draws: DevTunnel tasks hang off a
 * *project*, never a tool (sql/017). So `tasks` is always present in the
 * shape but is legitimately empty for a tool, and the Tasks tab says why
 * rather than pretending a tool has a task list nobody has filled in yet
 * (rule 58 — don't invent data, and don't dress an absence up as one).
 */

 import type { Task } from "@/lib/tasks/types";

 export type ContributeTargetKind = "project" | "tool";
 
 /**
  * Everything the Contribute page needs about the thing being contributed
  * to, normalized across a DevTunnel project and an open source tool.
  *
  * Every field is either already carried by the detail payload the parent
  * route fetched, or is derived from one of those fields in the page
  * component (`cloneCommand`, `detailHref`). No field here implies a
  * second request.
  */
 export interface ContributeTarget {
   kind: ContributeTargetKind;
   slug: string;
   /**
    * The project's DevTunnel id (a UUID) — what `dev start`/`dev submit --project`
    * take. NOT the slug: `POST /projects/:id/start` rejects anything that isn't
    * the UUID ("Invalid project id"). `null` for a tool: tools live in a
    * different table and have no project-claim route, so there's no id the
    * CLI could accept (rule 58 — don't print a command that can't work).
    */
   projectId: string | null;
   name: string;
   /** Curated description, or GitHub's. `null` when neither exists. */
   description: string | null;
 
   /**
    * The repository the work actually happens in. `null` for a tool whose
    * `sourceUrl` isn't a GitHub repository — in that case every
    * repository-shaped affordance on this page (clone command, "good first
    * issue" search, fork instructions) is hidden rather than pointed at a
    * URL that won't behave like a repo.
    */
   repositoryUrl: string | null;
   /** e.g. `vercel/next.js`. `null` whenever `repositoryUrl` is. */
   repositoryFullName: string | null;
   /** `https://github.com/owner/repo.git`, derived from `repositoryUrl`. */
   cloneUrl: string | null;
 
   /** Flat display tags — `techStack` on a project, `labels` on a tool. */
   techStack: string[];
   license: string | null;
   /** Open issues on GitHub. `null` when there's no repository to count them on. */
   openIssuesCount: number | null;
 
   /** Back to the detail page this contributor came from. */
   detailHref: string;
   /** Back to the list page above that, plus its own label for the crumb. */
   listHref: string;
   listLabel: string;
 
   /** Drives the header state — a contributor who already joined isn't re-invited. */
   viewerIsContributing: boolean;
 
   /**
    * DevTunnel tasks curated on this project. Always `[]` for a tool —
    * see this file's doc comment.
    */
   tasks: Task[];
 }
 
 /**
  * The four buckets a contribution falls into. Kept as data rather than
  * four hardcoded sections so the panel can filter across them with one
  * predicate, and so adding a way later is a one-line edit to
  * `contribution-ways.ts` instead of new JSX.
  */
 export type ContributionCategoryId = "code" | "non-code" | "process" | "community";
 
 /**
  * Which icon a category renders with. Stored as an id, not a component,
  * so this file and `contribution-ways.ts` stay plain `.ts` data modules
  * with no JSX in them — the id→component lookup lives in the panel that
  * actually renders it.
  */
 export type ContributionIconId =
   | "code"
   | "docs"
   | "process"
   | "community"
   | "test"
   | "review"
   | "design"
   | "triage"
   | "issue"
   | "release";
 
 export interface ContributionCategory {
   id: ContributionCategoryId;
   label: string;
   /** One line on what this bucket is, shown under the group heading. */
   summary: string;
   iconId: ContributionIconId;
 }
 
 export interface ContributionWay {
   id: string;
   category: ContributionCategoryId;
   label: string;
   /** What the contributor would actually be doing, in plain terms. */
   description: string;
   iconId: ContributionIconId;
   /**
    * Whether this way requires writing code. Drives the "No coding
    * needed" filter — the single most useful cut for someone landing here
    * from a non-engineering background, and the reason the non-code ways
    * are listed at all rather than buried under a code-first page.
    */
   needsCode: boolean;
   /**
    * Rough size of a first contribution of this kind. A word, never a
    * color or an icon alone (rule 43).
    */
   effort: "Small" | "Medium" | "Ongoing";
   /**
    * Path appended to the repository URL for this way's "Start here"
    * link, when there's a real destination on GitHub for it. Omitted when
    * there isn't one — the card then renders without a link rather than
    * with a plausible-looking dead end.
    */
   repoPath?: string;
   /** Label for that link. Required whenever `repoPath` is set. */
   linkLabel?: string;
 }
 
 /**
  * One step of the "fork → branch → change → commit → push → PR" flow, as
  * shown on the How to submit tab.
  *
  * `commands` are the literal git/gh lines for that step, rendered in a
  * copyable block. `placeholders` documents the parts a contributor has to
  * substitute themselves (their own fork, their own branch name), so the
  * commands can stay concrete and copyable without implying DevTunnel
  * knows their GitHub username.
  */
 export interface WorkflowStep {
   id: string;
   title: string;
   detail: string;
   commands?: string[];
   note?: string;
 }