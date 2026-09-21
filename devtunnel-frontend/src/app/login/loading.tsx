import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill } from "@/components/ui/blueprint-kit";

/** `/login` — calls `getServerUser()` to redirect an already-signed-in contributor straight through. Matches the real page's wide wordmark logo + bordered `LoginCard` (title, subtitle, GitHub button, divider, terms). */
export default function LoginLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 00 — Sign in"
      revLabel="Rev — checking your session"
      contentClassName="w-full flex min-h-[70vh] flex-col items-center justify-center gap-9 px-6 py-16"
    >
      <BlueprintFill className="h-6 w-[150px]" />
      <div className="w-full max-w-[340px] rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] px-[26px] py-7">
        <BlueprintFill className="mx-auto mb-2 h-3.5 w-40" />
        <BlueprintFill className="mx-auto mb-6 h-3 w-56" />
        <BlueprintFill className="h-10 w-full" />
        <div className="my-[18px] flex items-center gap-2">
          <div className="h-px flex-1 bg-blueprint/25" />
          <BlueprintFill className="h-2 w-24" />
          <div className="h-px flex-1 bg-blueprint/25" />
        </div>
        <BlueprintFill className="mx-auto h-2.5 w-48" />
      </div>
    </BlueprintSheet>
  );
}