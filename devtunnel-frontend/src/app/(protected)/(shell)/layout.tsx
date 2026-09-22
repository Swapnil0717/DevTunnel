import { AppShell } from "@/components/layout/app-shell";

/**
 * Applies the app shell (`AppSidebar` + `AppBottomNav`, fixed, via
 * `AppShell`) to every protected route that needs it: /home, /profile,
 * /settings, /dashboard, /submissions/new, /submissions/:slug/edit.
 *
 * This used to be a runtime `if (pathname === "/onboarding")` branch inside
 * `(protected)/layout.tsx`, skipping `AppShell` for onboarding only. That
 * layout is shared by every page in the group, and Next.js can reuse an
 * already-rendered layout segment across a client-side navigation between
 * sibling pages under it — so a layout whose JSX *shape* depends on the
 * exact current pathname (rather than only on its own segment + children)
 * could end up showing whichever chrome an earlier page in the group
 * rendered, until a full page reload forced a fresh server render. That's
 * what caused the sidebar to vanish when navigating between /home and
 * /onboarding on the client, and to reappear again after a refresh.
 *
 * The fix is structural instead of pathname-based: /onboarding lives in its
 * own sibling segment (`onboarding/layout.tsx`, no `AppShell`) and every
 * other protected page lives here, under `(shell)`. Which layout renders is
 * now decided by Next.js's own routing — the same as any other route
 * group — so it can't go stale across a client-side navigation the way a
 * `headers()`-read pathname check inside a single shared layout could.
 *
 * Auth/session checks (sign-in required, admin redirect, onboarding
 * redirect) still live one level up in `(protected)/layout.tsx`, which
 * wraps this layout's output in `AuthProvider` — this layout only adds the
 * visual shell.
 */
export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
