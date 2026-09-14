import { SkeletonBlock } from "@/components/ui/skeleton";

/** `/login` — calls `getServerUser()` to redirect an already-signed-in contributor straight through. */
export default function LoginLoading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-16" aria-hidden="true">
      <SkeletonBlock className="h-8 w-8 rounded-full" />
      <SkeletonBlock className="h-[180px] w-full max-w-[360px] rounded-[10px]" />
    </main>
  );
}