import type { ContributionSummary } from "@/lib/profile/types";

/**
 * Contributions / Projects / Pull requests counts
 * (5_devtunnel_profile_page.html).
 *
 * "Contributions" is now real: `summary` comes from
 * `GET /users/me/contributions/summary` (devtunnel-backend
 * src/routes/contributions.ts — a rolling 365-day total pulled live from
 * GitHub), fetched server-side in profile/page.tsx and passed down here,
 * same pattern as `user` from getServerUser().
 *
 * "Projects" and "Pull requests" still have no backing aggregation
 * endpoint — devtunnel-backend has no Project/Task/PullRequest tables yet
 * (only users/sessions — see sql/001_create_schema.sql). Rendering a
 * number there without a real source would be inventing statistics
 * (Frontend_Development_Rules.txt rule 58/59), so those two cards keep
 * their honest "not available yet" state. Swap the "—" for a real count
 * as soon as that endpoint exists — the layout doesn't need to change,
 * just the value passed in.
 */
export function ProfileStats({
  contributions,
}: {
  contributions: ContributionSummary | null;
}) {
  return (
    <div className="mb-5 grid grid-cols-3 gap-3" aria-label="Contribution stats">
      <div className="rounded-lg bg-surface px-3.5 py-3">
        <p className="m-0 mb-1 text-[11px] text-text-dim">Contributions</p>
        {contributions ? (
          <p className="m-0 text-xl font-medium text-text">{contributions.totalContributions}</p>
        ) : (
          <>
            <p className="m-0 text-xl font-medium text-text-faint" aria-hidden="true">
              —
            </p>
            <span className="sr-only">Not available yet</span>
          </>
        )}
      </div>

      {(["Projects", "Pull requests"] as const).map((label) => (
        <div key={label} className="rounded-lg bg-surface px-3.5 py-3">
          <p className="m-0 mb-1 text-[11px] text-text-dim">{label}</p>
          <p className="m-0 text-xl font-medium text-text-faint" aria-hidden="true">
            —
          </p>
          <span className="sr-only">Not available yet</span>
        </div>
      ))}
    </div>
  );
}