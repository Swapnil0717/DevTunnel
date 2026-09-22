import { TrainFooter } from "@/components/layout/train-footer";

/**
 * `/onboarding` is a full-bleed wizard (devtunnel_user_home_redesign.html),
 * not a shell page — no `AppSidebar`/`AppBottomNav`, just the train footer
 * at the bottom of the page, same as every other protected route gets from
 * `AppShell` (see `(shell)/layout.tsx`).
 *
 * This is its own sibling segment specifically so that "does this route get
 * the sidebar" is decided by Next.js's routing (this file existing, vs.
 * `(shell)/layout.tsx` existing for everything else) rather than a runtime
 * pathname check inside one shared layout — see the comment on
 * `(shell)/layout.tsx` for why that used to make the sidebar disappear on
 * client-side navigation between /home and /onboarding.
 *
 * Auth/session checks still live in `(protected)/layout.tsx`, one level up,
 * which wraps this layout's output in `AuthProvider`.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <TrainFooter />
    </>
  );
}
