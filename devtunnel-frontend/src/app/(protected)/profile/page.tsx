import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
import { getServerContributionsSummary } from "@/lib/profile/get-server-contributions-summary";
import { getServerDevTunnelContributionsSummary } from "@/lib/profile/get-server-devtunnel-contributions-summary";
import { getServerDevTunnelStats } from "@/lib/profile/get-server-devtunnel-stats";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileTags } from "@/components/profile/profile-tags";
import { ProfileStats } from "@/components/profile/profile-stats";
import { ProfileTabs } from "@/components/profile/profile-tabs";

export const metadata: Metadata = buildMetadata({
  title: "Your profile",
  description: "Your DevTunnel contributor profile.",
  path: "/profile",
  noIndex: true,
});

// The (protected) layout already guarantees a valid session by the time
// this page renders, so it's safe to fetch the user again here (server
// side, same as the layout) purely to render profile fields — no client
// loading flash, and no private fields beyond what AuthUser exposes.
//
// Navigation comes from the shared app-shell sidebar rendered in
// (protected)/layout.tsx, so this page doesn't render its own header/nav
// — that would produce a duplicate nav landmark.
//
// Visual redesign per 5_devtunnel_profile_page.html. Split into
// components/profile/* (header, tags, stats, tabs) rather than one big
// file, matching the components/home/* convention elsewhere in this
// codebase.
//
// The profile page's stats now pull from FOUR real backend sources,
// fetched here in parallel:
//   - getServerUser() — GET /auth/me (devtunnel-backend src/routes/auth.ts),
//     now including every onboarding field + `isMaintainer` (see
//     ProfileTags).
//   - getServerContributionsSummary() — GET /users/me/contributions/summary
//     (src/routes/contributions.ts), the GitHub rolling-365-day total.
//   - getServerDevTunnelContributionsSummary() —
//     GET /users/me/contributions/devtunnel/summary
//     (src/routes/devtunnelStats.ts), the DevTunnel-native rolling total —
//     shown next to the GitHub number in ProfileStats' "Contributions" card.
//   - getServerDevTunnelStats() — GET /users/me/devtunnel-stats
//     (src/routes/devtunnelStats.ts) — projects created/maintained, tasks
//     completed, pull requests merged, all backed by real tables
//     (devtunnel-backend/sql/004_add_devtunnel_contributions.sql).
// Each fetcher independently returns `null` on failure so one source
// going down never blocks the rest of the page — see the comments on
// each fetcher for why (Frontend_Development_Rules.txt rule 58: never
// invent a number, always render an honest "not available" state
// instead).
export default async function ProfilePage() {
  const [user, githubSummary, devtunnelSummary, devtunnelStats] = await Promise.all([
    getServerUser(),
    getServerContributionsSummary(),
    getServerDevTunnelContributionsSummary(),
    getServerDevTunnelStats(),
  ]);

  return (
    <main className="px-4 py-5 sm:px-[26px] sm:py-[22px]">
      <h1 className="sr-only">Your profile</h1>

      {user ? (
        <div className="mx-auto w-full max-w-[720px] rounded-xl border border-border bg-bg">
          <div className="p-[22px]">
            <ProfileHeader user={user} />
            <ProfileTags user={user} />
            <ProfileStats
              githubSummary={githubSummary}
              devtunnelSummary={devtunnelSummary}
              devtunnelStats={devtunnelStats}
            />
            <ProfileTabs />
          </div>
        </div>
      ) : (
        <p className="text-[14px] text-text-muted">
          We couldn&apos;t load your profile right now. Try refreshing the
          page.
        </p>
      )}
    </main>
  );
}