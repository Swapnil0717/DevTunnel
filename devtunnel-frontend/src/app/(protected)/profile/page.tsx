import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
import { getServerContributionsSummary } from "@/lib/profile/get-server-contributions-summary";
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
// codebase. The "Contributions" stat and the contribution-history tab's
// calendar are now backed by real data from
// GET /users/me/contributions(/summary) (devtunnel-backend
// src/routes/contributions.ts) — see the comments in ProfileStats and
// ProfileTabs for why "Projects"/"Pull requests" still render honest
// empty states instead of invented figures
// (Frontend_Development_Rules.txt rule 58).
export default async function ProfilePage() {
  const [user, contributionsSummary] = await Promise.all([
    getServerUser(),
    getServerContributionsSummary(),
  ]);

  return (
    <main className="px-4 py-5 sm:px-[26px] sm:py-[22px]">
      <h1 className="sr-only">Your profile</h1>

      {user ? (
        <div className="mx-auto w-full max-w-[720px] rounded-xl border border-border bg-bg">
          <div className="p-[22px]">
            <ProfileHeader user={user} />
            <ProfileTags user={user} />
            <ProfileStats contributions={contributionsSummary} />
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