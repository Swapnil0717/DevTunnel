import { SkeletonBlock } from "@/components/ui/skeleton";

/** `/login` — calls `getServerUser()` to redirect an already-signed-in contributor straight through. Matches the real page's wide wordmark logo + bordered `LoginCard` (title, subtitle, GitHub button, divider, terms). */
export default function LoginLoading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-9 px-6 py-16" aria-hidden="true">
      <SkeletonBlock className="h-6 w-[150px]" />
      <div className="w-full max-w-[340px] rounded-[10px] border border-border bg-surface px-[26px] py-7">
        <SkeletonBlock className="mx-auto mb-2 h-3.5 w-40" />
        <SkeletonBlock className="mx-auto mb-6 h-3 w-56" />
        <SkeletonBlock className="h-10 w-full" />
        <div className="my-[18px] flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <SkeletonBlock className="h-2 w-24" />
          <div className="h-px flex-1 bg-border" />
        </div>
        <SkeletonBlock className="mx-auto h-2.5 w-48" />
      </div>
    </main>
  );
}