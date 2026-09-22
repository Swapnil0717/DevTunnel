import { TrainFooter } from "@/components/layout/train-footer";

/**
 * Open Source Tool Onboarding wizard: full-bleed, no
 * `AdminSidebar`/`AdminHeader` — the wizard has its own sidebar, so
 * stacking it inside the admin shell would double up the chrome.
 * Structurally sibling to `(shell)/layout.tsx` rather than a runtime
 * pathname check — see the comment on `admin/(protected)/layout.tsx`.
 */
export default function OpensourceToolsNewLayout({
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
