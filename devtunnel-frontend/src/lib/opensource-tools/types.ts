/**
 * Local, frontend-only shape for the contributor-facing **Open Source
 * Tools on Devtunnel** page (`/opensource-tools` — "Open Source Tools on
 * Devtunnel" in `AppSidebar`).
 *
 * Distinct from `AdminToolSummary` (`lib/admin/opensource-tools/types.ts`,
 * the Admin's own grid with View/Edit/Delete actions): this is the
 * read-only, contributor-facing shape — the fields a contributor
 * deciding whether a tool is worth using actually needs, trimmed of
 * anything admin-only (`id`-as-primary-key aside, there's no edit
 * affordance, no `descriptionChoice`/`setupGuide` here). Same
 * relationship `ProjectSummary` (`lib/home/types.ts`) has to
 * `AdminProjectSummary`.
 *
 * `GET /opensource-tools/available` is NOT confirmed anywhere —
 * `docs/devtunnel-workflow.md` only spec's `GET /projects/available` and
 * `GET /contributor/tasks` for contributor-facing catalogs (Module 3).
 * Same documented-assumption convention `lib/home/api.ts`'s
 * `getActiveProjects` already uses for its own unconfirmed
 * `/contributor/active-projects` path: a plausible, clearly-flagged
 * shape built directly from the published `devtunnel.opensource_tools`
 * columns (sql/017) rather than invented from nothing
 * (Frontend_Development_Rules.txt rule 58), but not yet backed by a real
 * spec'd route — get it confirmed with backend before relying on it.
 */
 export interface OpenSourceToolSummary {
    id: string;
    slug: string;
    name: string;
    /** Resolved description (custom, falling back to the fetched repo description) — or `null` if neither exists yet. */
    description: string | null;
    sourceUrl: string;
    primaryLanguage: string | null;
    /** Step 3 of onboarding — roles/fields this tool is relevant to (sql/017 `labels`). */
    labels: string[];
    createdAt: string;
  }