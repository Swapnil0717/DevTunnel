import { SkeletonBlock, SkeletonDetailHeader, SkeletonStatCards } from "@/components/ui/skeleton";

export default function AdminTaskDetailLoading() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10" aria-hidden="true">
      <SkeletonDetailHeader
        meta={
          <>
            <SkeletonBlock className="h-3 w-28" />
            <span className="text-text-faint">·</span>
            <SkeletonBlock className="h-3 w-36" />
            <span className="text-text-faint">·</span>
            <SkeletonBlock className="h-4 w-16 rounded-full" />
          </>
        }
        actions={
          <>
            <SkeletonBlock className="h-9 w-[150px]" />
            <SkeletonBlock className="h-9 w-[92px]" />
          </>
        }
      />

      <div className="mb-8">
        <SkeletonBlock className="mb-2.5 h-2.5 w-44" />
        <SkeletonStatCards count={3} />
      </div>

      <div className="mb-8 rounded-[10px] border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <SkeletonBlock className="h-2.5 w-20" />
          <SkeletonBlock className="h-5 w-12" />
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[140px_1fr]">
          <SkeletonBlock className="h-2.5 w-14" />
          <SkeletonBlock className="h-2.5 w-24" />
          <SkeletonBlock className="h-2.5 w-16" />
          <SkeletonBlock className="h-2.5 w-20" />
          <SkeletonBlock className="h-2.5 w-14" />
          <SkeletonBlock className="h-4 w-16 rounded-full" />
          <SkeletonBlock className="h-2.5 w-20" />
          <SkeletonBlock className="h-3 w-full" />
        </div>
      </div>

      <div className="mb-8 rounded-[10px] border border-border bg-surface p-5">
        <SkeletonBlock className="mb-3 h-2.5 w-20" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-5 w-16 rounded-md" />
          ))}
        </div>
      </div>

      <div className="rounded-[10px] border border-border bg-surface p-5">
        <SkeletonBlock className="mb-2 h-2.5 w-24" />
        <SkeletonBlock className="mb-3 h-3.5 w-3/5" />
        <SkeletonBlock className="h-[260px] w-full" />
      </div>
    </main>
  );
}