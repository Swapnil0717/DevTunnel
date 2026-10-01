import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintGhostText,
  BlueprintSettingsProfileCard,
  BlueprintSettingsSkillsCard,
  BlueprintSettingsConnectedCard,
  BlueprintSettingsSessionCard,
  BlueprintSettingsDangerCard,
} from "@/components/ui/blueprint-kit";

/**
 * Route-segment loading boundary for `/settings`.
 *
 * Mirrors `SettingsPage` in order, inside the real `max-w-[680px]`
 * column: the `h1` ("Settings", `text-xl`, `mb-1`) and its 13px
 * subtitle (`mb-6`), then the `gap-4` stack —
 *
 *  1. `ProfileSettingsForm` — avatar, name + experience badge, handle, bio, "Edit profile";
 *  2. `SkillsBackgroundCard` — roles, skills, technologies, interests, "Edit";
 *  3. `ConnectedAccountCard` and the Session card, side by side from `sm`;
 *  4. `DeleteAccountButton`'s "Danger zone".
 *
 * The page no longer renders Notifications (`NotificationPreferencesForm`
 * is unmounted), so this sheet doesn't draw it either. Drawn with all
 * three skill groups filled in and a bio; an empty group is absent from
 * the real card.
 */
export default function SettingsLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 04 — Settings"
      revLabel="Rev — loading your settings"
      contentClassName="w-full px-4 py-5 sm:px-[26px] sm:py-[22px]"
    >
      <div className="mx-auto w-full max-w-[680px]">
        <div className="mb-1 text-xl font-medium" aria-hidden="true">
          <BlueprintGhostText text="Settings" />
        </div>
        <div className="mb-6 text-[13px]" aria-hidden="true">
          <BlueprintGhostText text="Manage your profile, skills, and connected accounts." />
        </div>

        <div className="flex flex-col gap-4">
          <BlueprintSettingsProfileCard />
          <BlueprintSettingsSkillsCard />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <BlueprintSettingsConnectedCard />
            <BlueprintSettingsSessionCard />
          </div>
          <BlueprintSettingsDangerCard />
        </div>
      </div>
    </BlueprintSheet>
  );
}
