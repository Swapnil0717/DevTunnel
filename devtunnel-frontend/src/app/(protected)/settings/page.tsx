import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
import { LogoutButton } from "@/components/auth/logout-button";

export const metadata: Metadata = buildMetadata({
  title: "Settings",
  description: "Manage your DevTunnel account settings.",
  path: "/settings",
  noIndex: true,
});

// Private, authenticated-only page — same pattern as (protected)/profile:
// server-fetch the session user again for display, no client loading
// flash, and no private fields beyond what AuthUser already exposes.
// Navigation comes from the shared AppSidebar / AppBottomNav, so this
// page doesn't render its own header/nav (would duplicate the sidebar's
// new "Settings" entry).
export default async function SettingsPage() {
  const user = await getServerUser();

  return (
    <main className="px-4 py-5 sm:px-[26px] sm:py-[22px]">
      <div className="mx-auto w-full max-w-[640px]">
        <h1 className="m-0 mb-6 text-xl font-medium text-text">Settings</h1>

        {user ? (
          <div className="flex flex-col gap-6">
            <section className="rounded-[10px] border border-border bg-surface p-5">
              <h2 className="m-0 mb-3 text-sm font-medium text-text">
                Account
              </h2>
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
                <dt className="text-text-muted">Email</dt>
                <dd className="m-0 text-text">{user.email}</dd>

                <dt className="text-text-muted">Username</dt>
                <dd className="m-0 text-text">{user.username}</dd>
              </dl>
            </section>

            <section className="rounded-[10px] border border-border bg-surface p-5">
              <h2 className="m-0 mb-3 text-sm font-medium text-text">
                Session
              </h2>
              <p className="m-0 mb-3 text-[13px] text-text-muted">
                Sign out of DevTunnel on this device.
              </p>
              <LogoutButton />
            </section>
          </div>
        ) : (
          <p className="text-[14px] text-text-muted">
            We couldn&apos;t load your account right now. Try refreshing the
            page.
          </p>
        )}
      </div>
    </main>
  );
}