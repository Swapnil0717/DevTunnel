import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintProfileHeader,
  BlueprintProfileTags,
  BlueprintProfileStats,
  BlueprintMilestoneTrack,
  BlueprintProfileTabs,
} from "@/components/ui/blueprint-kit";

/**
 * Route-segment loading boundary for `/profile`.
 *
 * Mirrors `ProfilePage` section for section, inside the same shell: the
 * `main` padding (`px-3 py-4 sm:px-[26px] sm:py-[22px]`) and the
 * `max-w-[1100px]` rounded card (`p-4 sm:p-8`), then
 *
 *  1. `ProfileHeader` — avatar, name, `@username · GitHub`, bio, "Edit profile";
 *  2. `ProfileTags` — role / experience badges, tech tags, "Interested in";
 *  3. `ProfileStats` — the four stat cards (Contributions carries two figures);
 *  4. `MilestoneTrack` — label row, 30-day strip, five checkpoint cards, two goals;
 *  5. `ProfileTabs` — the four-tab strip over the GitHub and DevTunnel
 *     contribution calendars, the tab the page opens on.
 *
 * Each piece lives in `blueprint-kit.tsx` next to a note of which real
 * component it copies and the sizes it reproduces. Drawn for a profile
 * with a bio, onboarding details and a loaded milestone window; a
 * profile without those (or with a source that failed) is shorter.
 */
export default function ProfileLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 03 — Profile"
      revLabel="Rev — loading your profile"
      contentClassName="px-3 py-4 sm:px-[26px] sm:py-[22px]"
    >
      <div className="mx-auto w-full max-w-[1100px] overflow-hidden rounded-xl border border-blueprint/25">
        <div className="p-4 sm:p-8">
          <BlueprintProfileHeader />
          <BlueprintProfileTags />
          <BlueprintProfileStats />
          <BlueprintMilestoneTrack />
          <BlueprintProfileTabs />
        </div>
      </div>
    </BlueprintSheet>
  );
}
