import { redirect } from "next/navigation";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { GuestNotice } from "@/components/layout/guest-notice";
import { getServerUser } from "@/lib/auth/get-server-user";
import { needsOnboarding } from "@/lib/onboarding/needs-onboarding";

/**
 * Shell for the routes anyone can open without signing in: the DevTunnel
 * project catalog (`/projects`, `/projects/:slug`, `/projects/:slug/tasks/:id`
 * and their `/contribute` guides), `/tasks`, `/opensource-tools`, the
 * GitHub-wide catalogs (`/github-projects`, `/github-open-source-tools`),
 * `/issues` and the Community pages (`/submissions`, `/submissions/:slug`).
 *
 * These used to live under `(protected)`, whose layout redirects every
 * request without a session to `/login` on the server — so a crawler (or a
 * first-time visitor following a shared link) never saw the content, only a
 * login page. The catalog is the part of DevTunnel meant to be discovered
 * (Frontend_Development_Rules.txt rules 2, 16, 27), so it can't sit behind
 * that gate.
 *
 * What this layout deliberately does NOT do is redirect a signed-out
 * request. Instead it asks the backend who (if anyone) is signed in and:
 *
 *  - nobody → render the same app shell in guest mode (`AppSidebar` /
 *    `AppBottomNav` drop the account-only links and show "Sign in with
 *    GitHub"; `GuestNotice` explains what an account adds; action buttons
 *    become sign-in links).
 *  - somebody → a half-finished signup still goes to `/onboarding`.
 *
 * This layout deliberately does NOT bounce an `ADMIN` to `/admin`. It used
 * to, whenever the `dt_view_mode` cookie wasn't exactly "user" — but that
 * cookie is shared by every tab and is only a hint, so an admin browsing the
 * contributor sidebar could be thrown into the Admin Portal by any click
 * (another tab flipping the cookie, a cookie that didn't reach the request,
 * a prefetched redirect). Which portal an admin lands in is decided once, at
 * sign-in (`/login` chooser, OAuth callback); after that, navigating inside
 * the user view never re-decides it. Admins reach `/admin` on purpose, via
 * "Switch to Admin" in the sidebar.
 *
 * Pages that genuinely need an account — `/home`, `/profile`, `/settings`,
 * `/onboarding`, `/submissions/new`, `/submissions/:slug/edit` — stay in
 * `(protected)`, and the backend remains the real authority on who may
 * write anything (rule 18: hiding a page is never access control).
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();

  if (user) {
    if (needsOnboarding(user)) {
      redirect("/onboarding");
    }
  }

  return (
    <AuthProvider initialUser={user} anonymous={!user}>
      {/* Fixed sidebar + content column + train footer (inside the content
          column only) all live in AppShell — see app-shell.tsx. */}
      <AppShell banner={user ? null : <GuestNotice />}>{children}</AppShell>
    </AuthProvider>
  );
}
