import { SkeletonBlock } from "@/components/ui/skeleton";

/** `/settings` — one `getServerUser()` fetch, rendered as the Account section. */
export default function SettingsLoading() {
  return (
    <main className="px-4 py-5 sm:px-[26px] sm:py-[22px]" aria-hidden="true">
      <div className="mx-auto w-full max-w-[640px]">
        <SkeletonBlock className="mb-6 h-6 w-28" />
        <div className="flex flex-col gap-6">
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <SkeletonBlock className="mb-3 h-4 w-20" />
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
              <SkeletonBlock className="h-3 w-12" />
              <SkeletonBlock className="h-3 w-40" />
              <SkeletonBlock className="h-3 w-16" />
              <SkeletonBlock className="h-3 w-32" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}