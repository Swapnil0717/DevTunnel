import { redirect } from "next/navigation";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppBottomNav } from "@/components/layout/app-bottom-nav";
import { GuestNotice } from "@/components/layout/guest-notice";
import { getServerUser } from "@/lib/auth/get-server-user";
import { needsOnboarding } from "@/lib/onboarding/needs-onboarding";
import { isAdmin } from "@/lib/auth/is-admin";
import { getServerViewMode } from "@/lib/auth/view-mode.server";

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
 *  - somebody → keep every behaviour `(protected)/layout.tsx` had for these
 *    URLs before they moved: an `ADMIN` still lands in the Admin Portal
 *    unless they chose "Continue as User", and a half-finished signup still
 *    goes to `/onboarding`. Moving the routes must not change what a
 *    signed-in person experiences.
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
    if (isAdmin(user) && (await getServerViewMode()) !== "user") {
      redirect("/admin");
    }

    if (needsOnboarding(user)) {
      redirect("/onboarding");
    }
  }

  return (
    <AuthProvider initialUser={user} anonymous={!user}>
      <div className="flex min-h-screen bg-bg">
        <AppSidebar />
        {/* pb-16 keeps content clear of the fixed bottom nav on mobile */}
        <div className="flex min-w-0 flex-1 flex-col pb-16 sm:pb-0">
          {user ? null : <GuestNotice />}
          {children}
        </div>
      </div>
      <AppBottomNav />
    </AuthProvider>
  );
}
