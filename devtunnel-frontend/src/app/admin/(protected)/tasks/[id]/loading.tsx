import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintDetailHeader, BlueprintStatCards } from "@/components/ui/blueprint-kit";

export default function AdminTaskDetailLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A3.1 — Task"
      revLabel="Rev — loading task"
      contentClassName="w-full mx-auto max-w-4xl px-6 py-10"
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
            <BlueprintFill className="h-9 w-[150px]" />
            <BlueprintFill className="h-9 w-[92px]" />
          </>
        }
      />

      <div className="mb-8">
        <BlueprintFill className="mb-2.5 h-2.5 w-44" />
        <BlueprintStatCards count={3} />
      </div>

      <div className="mb-8 rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <BlueprintFill className="h-2.5 w-20" />
          <BlueprintFill className="h-5 w-12" />
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[140px_1fr]">
          <BlueprintFill className="h-2.5 w-14" />
          <BlueprintFill className="h-2.5 w-24" />
          <BlueprintFill className="h-2.5 w-16" />
          <BlueprintFill className="h-2.5 w-20" />
          <BlueprintFill className="h-2.5 w-14" />
          <BlueprintFill className="h-4 w-16 rounded-full" />
          <BlueprintFill className="h-2.5 w-20" />
          <BlueprintFill className="h-3 w-full" />
        </div>
      </div>

      <div className="mb-8 rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
        <BlueprintFill className="mb-3 h-2.5 w-20" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <BlueprintFill key={index} className="h-5 w-16 rounded-md" />
          ))}
        </div>
      </div>

      <div className="rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
        <BlueprintFill className="mb-2 h-2.5 w-24" />
        <BlueprintFill className="mb-3 h-3.5 w-3/5" />
        <BlueprintFill className="h-[260px] w-full" />
      </div>
    </BlueprintSheet>
  );
}