import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill } from "@/components/ui/blueprint-kit";

/**
 * `/settings` — `getServerUser` + `getServerNotificationPreferences`,
 * rendered as 5 stacked `rounded-[10px] border p-5` sections: Profile
 * (name/bio fields), Connected account (read-only GitHub status),
 * Notifications (3 toggle rows), Session (sign out), and the Danger
 * zone (delete account) — previously only 2 of these 5 sections were
 * represented here, so the page grew noticeably taller the moment real
 * data replaced the skeleton. Outer padding matches the real page's
 * own `px-4 py-5 sm:px-[26px] sm:py-[22px]` main, with a real h1 +
 * subtitle line rather than a single title bar.
 */
export default function SettingsLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 04 — Settings"
      revLabel="Rev — loading your settings"
      contentClassName="w-full px-4 py-5 sm:px-[26px] sm:py-[22px]"
    >
      <div className="mx-auto w-full max-w-[640px]">
        <BlueprintFill className="mb-1 h-5 w-24" />
        <BlueprintFill className="mb-6 h-3 w-64" />

        <div className="flex flex-col gap-6">
          {/* Profile: name + bio fields. */}
          <div className="rounded-[10px] border border-blueprint/25 p-5">
            <BlueprintFill className="mb-4 h-4 w-16" />
            <div className="mb-3 flex flex-col gap-1.5">
              <BlueprintFill className="h-2.5 w-10" />
              <BlueprintFill className="h-9 w-full" />
            </div>
            <div className="flex flex-col gap-1.5">
              <BlueprintFill className="h-2.5 w-8" />
              <BlueprintFill className="h-16 w-full" />
            </div>
          </div>

          {/* Connected account: GitHub status row. */}
          <div className="rounded-[10px] border border-blueprint/25 p-5">
            <BlueprintFill className="mb-3 h-4 w-40" />
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <BlueprintFill className="h-3 w-14" />
                <BlueprintFill className="h-2.5 w-32" />
              </div>
              <BlueprintFill className="h-6 w-24 rounded-md" />
            </div>
          </div>

          {/* Notifications: 3 toggle rows. */}
          <div className="rounded-[10px] border border-blueprint/25 p-5">
            <BlueprintFill className="mb-3 h-4 w-28" />
            <div className="flex flex-col gap-3.5">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center justify-between gap-4">
                  <BlueprintFill className="h-3 w-48" delayMs={index * 60} />
                  <BlueprintFill className="h-5 w-9 rounded-full" delayMs={index * 60} />
                </div>
              ))}
            </div>
          </div>

          {/* Session: sign out. */}
          <div className="rounded-[10px] border border-blueprint/25 p-5">
            <BlueprintFill className="mb-3 h-4 w-16" />
            <BlueprintFill className="mb-3 h-3 w-56" />
            <BlueprintFill className="h-9 w-24" />
          </div>

          {/* Danger zone: delete account. */}
          <div className="rounded-[10px] border border-status-error-border/40 p-5">
            <BlueprintFill className="mb-3 h-4 w-24" />
            <BlueprintFill className="h-9 w-40" />
          </div>
        </div>
      </div>
    </BlueprintSheet>
  );
}
