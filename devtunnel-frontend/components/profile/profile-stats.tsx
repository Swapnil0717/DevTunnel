import type { ContributionSummary, DevTunnelStats } from "@/lib/profile/types";
import {
  GitCommitIcon,
  FolderIcon,
  ChecklistIcon,
  GitPullRequestIcon,
} from "@/components/layout/nav-icons";

/**
 * Contributions / Projects / Tasks done / Pull requests stat cards
 * (5_devtunnel_profile_page.html), now entirely backed by real data:
 *
 * - "Contributions" shows two numbers side by side rather than one:
 *   the GitHub rolling-365-day total (`githubSummary`, from
 *   `GET /users/me/contributions/summary` — devtunnel-backend
 *   src/routes/contributions.ts) next to the DevTunnel-native rolling
 *   total (`devtunnelSummary`, from
 *   `GET /users/me/contributions/devtunnel/summary` —
 *   src/routes/devtunnelStats.ts). These are two genuinely different
 *   numbers — "everything on GitHub" vs. "what happened specifically
 *   through DevTunnel" — so both are shown rather than picking one.
 * - "Projects" shows projects created, plus "maintaining N" underneath
 *   when this user maintains at least one project (a contributor can
 *   also be a maintainer — see profile-tags.tsx for the badge version of
 *   the same fact).
 * - "Tasks done" and "Pull requests" are `devtunnelStats.tasksCompleted`
 *   / `pullRequestsMerged`, both from `GET /users/me/devtunnel-stats`.
 *
 * Every card still falls back to an honest "—" (not a guessed 0) when
 * its source failed to load server-side — never invent a number
 * (Frontend_Development_Rules.txt rule 58/59).
 *
 * Each card carries a small icon chip (git-commit / folder / checklist /
 * pull-request) using colors already in the theme (tailwind.config.ts —
 * status.success, tag-interest, status.info, tag-skill) rather than a
 * new palette. Every icon is `aria-hidden` and sits next to a text label
 * that carries the same meaning on its own, so nothing here is
 * communicated by color or icon alone (rule 43).
 */
export function ProfileStats({
  githubSummary,
  devtunnelSummary,
  devtunnelStats,
}: {
  githubSummary: ContributionSummary | null;
  devtunnelSummary: ContributionSummary | null;
  devtunnelStats: DevTunnelStats | null;
}) {
  return (
    <div
      className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4"
      aria-label="Contribution stats"
    >
      <div className="col-span-2 rounded-lg bg-surface px-3.5 py-3 sm:col-span-1">
        <StatCardIcon
          icon={GitCommitIcon}
          bgClassName="bg-status-success-bg"
          colorClassName="text-status-success-label"
        />
        <p className="m-0 mb-1 mt-2 text-[11px] text-text-dim">Contributions</p>
        <div className="flex items-baseline gap-3">
          <div>
            {githubSummary ? (
              <p className="m-0 text-xl font-medium text-text">
                {githubSummary.totalContributions}
              </p>
            ) : (
              <p className="m-0 text-xl font-medium text-text-faint" aria-hidden="true">
                —
              </p>
            )}
            <p className="m-0 text-[10px] text-text-faint">GitHub</p>
          </div>

          <div aria-hidden="true" className="h-6 w-px bg-border" />

          <div>
            {devtunnelSummary ? (
              <p className="m-0 text-xl font-medium text-text">
                {devtunnelSummary.totalContributions}
              </p>
            ) : (
              <p className="m-0 text-xl font-medium text-text-faint" aria-hidden="true">
                —
              </p>
            )}
            <p className="m-0 text-[10px] text-text-faint">via DevTunnel</p>
          </div>
        </div>
        {!githubSummary && !devtunnelSummary ? (
          <span className="sr-only">Not available yet</span>
        ) : null}
      </div>

      <div className="rounded-lg bg-surface px-3.5 py-3">
        <StatCardIcon
          icon={FolderIcon}
          bgClassName="bg-tag-interest-bg"
          colorClassName="text-tag-interest-text"
        />
        <p className="m-0 mb-1 mt-2 text-[11px] text-text-dim">Projects</p>
        {devtunnelStats ? (
          <>
            <p className="m-0 text-xl font-medium text-text">{devtunnelStats.projectsCreated}</p>
            {devtunnelStats.isMaintainer ? (
              <p className="m-0 text-[10px] text-text-faint">
                Maintaining {devtunnelStats.projectsMaintaining}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="m-0 text-xl font-medium text-text-faint" aria-hidden="true">
              —
            </p>
            <span className="sr-only">Not available yet</span>
          </>
        )}
      </div>

      <div className="rounded-lg bg-surface px-3.5 py-3">
        <StatCardIcon
          icon={ChecklistIcon}
          bgClassName="bg-status-info-bg"
          colorClassName="text-status-info-text"
        />
        <p className="m-0 mb-1 mt-2 text-[11px] text-text-dim">Tasks done</p>
        {devtunnelStats ? (
          <p className="m-0 text-xl font-medium text-text">{devtunnelStats.tasksCompleted}</p>
        ) : (
          <>
            <p className="m-0 text-xl font-medium text-text-faint" aria-hidden="true">
              —
            </p>
            <span className="sr-only">Not available yet</span>
          </>
        )}
      </div>

      <div className="rounded-lg bg-surface px-3.5 py-3">
        <StatCardIcon
          icon={GitPullRequestIcon}
          bgClassName="bg-tag-skill-bg"
          colorClassName="text-tag-skill-text"
        />
        <p className="m-0 mb-1 mt-2 text-[11px] text-text-dim">Pull requests</p>
        {devtunnelStats ? (
          <p className="m-0 text-xl font-medium text-text">{devtunnelStats.pullRequestsMerged}</p>
        ) : (
          <>
            <p className="m-0 text-xl font-medium text-text-faint" aria-hidden="true">
              —
            </p>
            <span className="sr-only">Not available yet</span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The small rounded icon chip shared by all four cards above. A tiny
 * local component rather than four copies of the same markup (rule 51).
 * Always decorative — see the file header for why.
 */
function StatCardIcon({
  icon: Icon,
  bgClassName,
  colorClassName,
}: {
  icon: (props: { className?: string }) => JSX.Element;
  bgClassName: string;
  colorClassName: string;
}) {
  return (
    <div
      className={`flex h-7 w-7 items-center justify-center rounded-md ${bgClassName} ${colorClassName}`}
    >
      <Icon className="h-4 w-4" />
    </div>
  );
}
