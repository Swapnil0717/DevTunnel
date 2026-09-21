import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintDetailHeader } from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for
 * `/projects/:projectSlug/tasks/:taskId`. Same shimmer-skeleton
 * convention as `/admin/tasks/:id/loading.tsx`, trimmed to match this
 * page's own layout: the two header actions (Contribute + View issue),
 * then the two-column body — three stacked description sections (project,
 * task, issue) on the left and the Details / Tech stack rail on the right.
 * Between the header and the body sits a full-width block matching the
 * progress tracker: four stage columns and the one-sentence summary.
 */
export default function TaskDetailLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 05.3 — Task"
      revLabel="Rev — loading task"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintDetailHeader
        meta={
          <>
            <BlueprintFill className="h-3 w-28" />
            <span className="text-white/50">·</span>
            <BlueprintFill className="h-3 w-36" />
            <span className="text-white/50">·</span>
            <BlueprintFill className="h-4 w-16 rounded-full" />
          </>
        }
        actions={
          <>
            <BlueprintFill className="h-9 w-[170px]" />
            <BlueprintFill className="h-9 w-[130px]" />
          </>
        }
      />

      <div className="mb-6 rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
        <BlueprintFill className="mb-4 h-2.5 w-16" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index}>
              <BlueprintFill className="mb-2 h-1 w-full rounded-full" />
              <BlueprintFill className="mb-1.5 h-3 w-20" />
              <BlueprintFill className="h-2.5 w-28" />
            </div>
          ))}
        </div>
        <BlueprintFill className="mt-4 h-3 w-3/5" />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
            <BlueprintFill className="mb-3 h-2.5 w-28" />
            <div className="flex items-start gap-3">
              <BlueprintFill className="h-10 w-10 shrink-0 rounded-[10px]" />
              <div className="flex flex-1 flex-col gap-2">
                <BlueprintFill className="h-3.5 w-40" />
                <BlueprintFill className="h-3 w-48" />
                <BlueprintFill className="mt-2 h-3 w-full" />
                <BlueprintFill className="h-3 w-4/5" />
              </div>
            </div>
          </div>

          <div className="rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
            <BlueprintFill className="mb-3 h-2.5 w-28" />
            <BlueprintFill className="h-[140px] w-full" />
          </div>

          <div className="rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
            <BlueprintFill className="mb-3 h-2.5 w-28" />
            <BlueprintFill className="mb-3 h-3.5 w-3/5" />
            <BlueprintFill className="h-[220px] w-full" />
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
          <div className="rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
            <BlueprintFill className="mb-3 h-2.5 w-16" />
            <div className="grid grid-cols-[92px_1fr] gap-x-4 gap-y-3">
              <BlueprintFill className="h-2.5 w-12" />
              <BlueprintFill className="h-2.5 w-20" />
              <BlueprintFill className="h-2.5 w-10" />
              <BlueprintFill className="h-2.5 w-24" />
              <BlueprintFill className="h-2.5 w-16" />
              <BlueprintFill className="h-2.5 w-20" />
              <BlueprintFill className="h-2.5 w-20" />
              <BlueprintFill className="h-2.5 w-28" />
            </div>
          </div>
          <div className="rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
            <BlueprintFill className="mb-3 h-2.5 w-20" />
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 5 }).map((_, index) => (
                <BlueprintFill key={index} className="h-5 w-16 rounded-md" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </BlueprintSheet>
  );
}
