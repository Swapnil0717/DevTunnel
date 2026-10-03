// devtunnel-frontend/src/components/layout/app-shell.tsx
import type { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { AppBottomNav } from "./app-bottom-nav";
import { TrainFooter } from "./train-footer";

/**
 * The contributor app shell, shared by `(public)/layout.tsx` and
 * `(protected)/layout.tsx` so the two can't drift apart.
 *
 * Layout contract:
 *
 *  - `AppSidebar` is `position: fixed` (sm and up), so it is taken out of
 *    the document flow entirely: it never scrolls with the page and nothing
 *    below the content — the footer included — can move it.
 *  - Because it's out of flow, the content column reserves its width
 *    itself with `sm:ml-[240px]`. Keep that in step with `AppSidebar`'s
 *    `w-[240px]`.
 *  - `TrainFooter` is the last child *inside* the content column, so it
 *    spans the page area only — never the sidebar. `children` sit in a
 *    `flex-1` wrapper so the footer rests at the bottom of the viewport on
 *    short pages and follows the content on long ones.
 *  - `AppHeader` is the first child of the content column: a `sticky` top bar
 *    with Guide, Found a bug and Sponsor us. It sits beside the sidebar, not
 *    across it, so the sidebar keeps its full height.
 *  - `banner` (the guest notice) sits under the header, above the page content.
 *  - `pb-16` on mobile keeps the footer clear of the fixed bottom nav.
 */
export function AppShell({
  children,
  banner,
}: {
  children: ReactNode;
  banner?: ReactNode;
}) {
  return (
    <>
      <div className="min-h-screen bg-bg">
        <AppSidebar />
        <div className="flex min-h-screen min-w-0 flex-col pb-16 sm:ml-[240px] sm:pb-0">
          <AppHeader />
          {banner}
          <div className="flex min-w-0 flex-1 flex-col [&>main]:w-full">{children}</div>
          <TrainFooter />
        </div>
      </div>
      <AppBottomNav />
    </>
  );
}
