import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill } from "@/components/ui/blueprint-kit";

/**
 * `/onboarding` — calls `getServerUser()` before it can decide whether
 * to redirect (already onboarded → `/home`, signed out → `/login`) or
 * render `OnboardingWizard`.
 */
export default function OnboardingLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 02 — Onboarding"
      revLabel="Rev — preparing your setup"
      contentClassName="mx-auto flex min-h-[70vh] w-full max-w-[560px] flex-col gap-6 px-6 py-12"
    >
      <div className="flex items-center gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <BlueprintFill key={index} className="h-1.5 flex-1 rounded-full" />
        ))}
      </div>
      <BlueprintFill className="h-6 w-56" />
      <BlueprintFill className="h-[320px] w-full" />
    </BlueprintSheet>
  );
}