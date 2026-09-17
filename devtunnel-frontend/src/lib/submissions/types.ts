/**
 * Frontend shapes for **Community submissions** — `/submissions`
 * ("Community" in `AppSidebar`), the list of projects and tools
 * contributors have submitted themselves, and the 3-step wizard at
 * `/submissions/new` that adds to it.
 *
 * Mirrors the backend contract in devtunnel-backend
 * `src/db/submissions.ts` and `src/routes/submissions.ts` field for
 * field.
 *
 * Distinct from `DevtunnelProjectDetail` (`lib/projects/types.ts`) and
 * `OpenSourceToolDetail` (`lib/opensource-tools/types.ts`): those
 * describe things DevTunnel onboarded and curated, with tasks and
 * maintainers attached. A submission is something a contributor pointed
 * at, and every row carries `submittedBy` so the page can say so rather
 * than letting it read as curated.
 */

 export type SubmissionKind = "PROJECT" | "TOOL";

 /**
  * The three sorts, and exactly what each one means — worth stating here
  * too, because "trending" is the kind of word that drifts:
  *  - `new`      newest first.
  *  - `trending` most upvotes in the last 7 days.
  *  - `popular`  most upvotes all time.
  */
 export type SubmissionSort = "new" | "trending" | "popular";
 
 /**
  * The category cut. Project-vs-tool and "replaces something paid" are
  * orthogonal — a paid alternative is usually a tool, but not always —
  * so they share one control rather than pretending to be a hierarchy.
  */
 export type SubmissionCategory = "ALL" | "PROJECT" | "TOOL" | "PAID_ALTERNATIVE";
 
 export interface SubmissionAuthor {
   id: string;
   username: string;
   name: string | null;
   avatarUrl: string | null;
   profileUrl: string | null;
 }
 
 export interface Submission {
   id: string;
   slug: string;
   kind: SubmissionKind;
   name: string;
   /** What the card shows — the custom description when there is one, else what GitHub returned. */
   description: string | null;
   /** Always GitHub's own, even when a custom description is showing. */
   fetchedDescription: string | null;
   sourceUrl: string;
   repositoryFullName: string | null;
   primaryLanguage: string | null;
   techStack: string[];
   isPaidAlternative: boolean;
   /** Products this replaces, e.g. ["Figma"]. Never empty when `isPaidAlternative` is true. */
   alternativeTo: string[];
   submittedBy: SubmissionAuthor;
   createdAt: string;
   upvoteCount: number;
   recentUpvoteCount: number;
   upvotedByViewer: boolean;
 }
 
 export interface SubmissionListFilters {
   sort: SubmissionSort;
   category: SubmissionCategory;
   /** AND, not OR — a submission must carry every selected tag. */
   techStack: string[];
   query: string;
 }
 
 export const DEFAULT_SUBMISSION_FILTERS: SubmissionListFilters = {
   sort: "new",
   category: "ALL",
   techStack: [],
   query: "",
 };
 
 export const SUBMISSION_SORT_LABEL: Record<SubmissionSort, string> = {
   new: "New",
   trending: "Trending",
   popular: "Popular",
 };
 
 /** One line each, shown under the sort control — so nobody has to guess what "trending" counts. */
 export const SUBMISSION_SORT_HINT: Record<SubmissionSort, string> = {
   new: "Most recently submitted.",
   trending: "Most upvoted in the last 7 days.",
   popular: "Most upvoted of all time.",
 };
 
 export const SUBMISSION_CATEGORY_LABEL: Record<SubmissionCategory, string> = {
   ALL: "Everything",
   PROJECT: "Projects",
   TOOL: "Tools",
   PAID_ALTERNATIVE: "Alternative to paid software",
 };
 
 /* -------------------------------------------------------------------------
  * The submit wizard — `/submissions/new`.
  * ---------------------------------------------------------------------- */
 
 /**
  * Step 1 result. Every field here comes back from GitHub via the
  * backend; none has a hand-typed counterpart, the same "the repository
  * is the source of truth" shape `OnboardingToolSource` documents for
  * admin tool onboarding.
  */
 export interface SubmissionDraftSource {
   url: string;
   name: string;
   repositoryFullName: string | null;
   fetchedDescription: string | null;
   readme: string | null;
   primaryLanguage: string | null;
   /** Detected from the repository — the starting point step 2 edits, not a fixed answer. */
   detectedTechStack: string[];
 }
 
 export type SubmissionDescriptionChoice = "EXISTING" | "CUSTOM";
 
 /**
  * Step 2. Same two-choice description shape as both admin onboarding
  * flows: the fetched description is never rewritten, a custom one is
  * layered alongside it.
  */
 export interface SubmissionDraftDetails {
   descriptionSource: SubmissionDescriptionChoice;
   customDescription: string | null;
   techStack: string[];
   isPaidAlternative: boolean;
   alternativeTo: string[];
 }
 
 /** Backend-owned completion flags — the wizard reads these, it doesn't decide them. */
 export interface SubmissionDraftSteps {
   sourceCompleted: boolean;
   detailsCompleted: boolean;
 }
 
 export interface SubmissionDraft {
   id: string;
   kind: SubmissionKind;
   source: SubmissionDraftSource | null;
   details: SubmissionDraftDetails;
   steps: SubmissionDraftSteps;
   /** Set once published — the wizard treats a draft carrying this as done. */
   completedSubmissionId: string | null;
 }
 
 export interface CreatedSubmission {
   id: string;
   slug: string;
   name: string;
 }
 
 export const EMPTY_SUBMISSION_DETAILS: SubmissionDraftDetails = {
   descriptionSource: "EXISTING",
   customDescription: null,
   techStack: [],
   isPaidAlternative: false,
   alternativeTo: [],
 };