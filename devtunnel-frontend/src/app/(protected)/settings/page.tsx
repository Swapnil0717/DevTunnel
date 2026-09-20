import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
import { getServerNotificationPreferences } from "@/lib/settings/get-server-notification-preferences";
import { LogoutButton } from "@/components/auth/logout-button";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { ConnectedAccountCard } from "@/components/settings/connected-account-card";
import { NotificationPreferencesForm } from "@/components/settings/notification-preferences-form";
import { DeleteAccountButton } from "@/components/settings/delete-account-button";

export const metadata: Metadata = buildMetadata({
  title: "Settings",
  description: "Manage your DevTunnel account settings.",
  path: "/settings",
  noIndex: true,
});

// Private, authenticated-only page — same pattern as (protected)/profile:
// server-fetch the session user (and now notification preferences) again
// for display, no client loading flash. Navigation comes from the shared
// AppSidebar / AppBottomNav, so this page doesn't render its own
// header/nav (would duplicate the sidebar's "Settings" entry).
//
// Sections, top to bottom: Profile (editable name/bio — see
// ProfileSettingsForm), Connected account (read-only GitHub status),
// Notifications (toggles, PATCH /settings/notifications), Session (sign
// out — unchanged from before this page grew the sections above/below
// it), Danger zone (account deletion, last on purpose).
export default async function SettingsPage() {
  const [user, notificationPreferences] = await Promise.all([
    getServerUser(),
    getServerNotificationPreferences(),
  ]);

  return (
    <main className="px-4 py-5 sm:px-[26px] sm:py-[22px]">
      <div className="mx-auto w-full max-w-[640px]">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">Settings</h1>
        <p className="m-0 mb-6 text-[13px] text-text-muted">
          Manage your profile, notifications, and connected accounts.
        </p>

        {user ? (
          <div className="flex flex-col gap-6">
            <ProfileSettingsForm user={user} />

            <ConnectedAccountCard user={user} />

            <NotificationPreferencesForm initialPreferences={notificationPreferences} />

            <section className="rounded-[10px] border border-border bg-surface p-5">
              <h2 className="m-0 mb-3 text-sm font-medium text-text">Session</h2>
              <p className="m-0 mb-3 text-[13px] text-text-muted">
                Sign out of DevTunnel on this device.
              </p>
              <LogoutButton />
            </section>

            <DeleteAccountButton />
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
