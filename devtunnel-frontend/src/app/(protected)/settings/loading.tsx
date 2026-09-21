import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill } from "@/components/ui/blueprint-kit";

/** `/settings` — one `getServerUser()` fetch, rendered as the Account section plus the Session (sign-out) section below it. */
export default function SettingsLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 04 — Settings"
      revLabel="Rev — loading your settings"
      contentClassName="w-full px-4 pb-5 pt-9 sm:px-[26px] sm:pb-[22px]"
    >
      <div className="mx-auto w-full max-w-[640px]">
        <BlueprintFill className="mb-6 h-6 w-28" />
        <div className="flex flex-col gap-6">
          <div className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-5">
            <BlueprintFill className="mb-3 h-4 w-20" />
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
              <BlueprintFill className="h-3 w-12" />
              <BlueprintFill className="h-3 w-40" />
              <BlueprintFill className="h-3 w-16" />
              <BlueprintFill className="h-3 w-32" />
            </div>
          </div>
          <div className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-5">
            <BlueprintFill className="mb-3 h-4 w-16" />
            <BlueprintFill className="mb-3 h-3 w-56" />
            <BlueprintFill className="h-9 w-24" />
          </div>
        </div>
      </div>
    </BlueprintSheet>
  );
}