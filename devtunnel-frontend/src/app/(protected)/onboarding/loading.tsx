import { SkeletonBlock } from "@/components/ui/skeleton";

/**
 * `/onboarding` — calls `getServerUser()` before it can decide whether
 * to redirect (already onboarded → `/home`, signed out → `/login`) or
 * render `OnboardingWizard`.
 */
export default function OnboardingLoading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col gap-6 px-6 py-12" aria-hidden="true">
      <div className="flex items-center gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-1.5 flex-1 rounded-full" />
        ))}
      </div>
      <SkeletonBlock className="h-6 w-56" />
      <SkeletonBlock className="h-[320px] w-full" />
    </main>
  );
}