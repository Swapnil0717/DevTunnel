import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
import { LogoutButton } from "@/components/auth/logout-button";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { SkillsBackgroundCard } from "@/components/settings/skills-background-card";
import { ConnectedAccountCard } from "@/components/settings/connected-account-card";
import { DeleteAccountButton } from "@/components/settings/delete-account-button";
import RouteLoading from "./loading";
import { BlueprintReveal } from "@/components/ui/blueprint-reveal";

export const metadata: Metadata = buildMetadata({
  title: "Settings",
  description: "Manage your DevTunnel account settings.",
  path: "/settings",
  noIndex: true,
});

// Private, authenticated-only page — same pattern as (protected)/profile:
// server-fetch the session user again for display, no client loading
// flash. Navigation comes from the shared AppSidebar / AppBottomNav, so
// this page doesn't render its own header/nav (would duplicate the
// sidebar's "Settings" entry).
//
// Layout: a profile "hero" card up top (ProfileSettingsForm — avatar,
// name, experience badge, bio, its own edit toggle), then a full-width
// "Skills and background" card (SkillsBackgroundCard — developer role,
// experience level, skills, technologies, interests, its own edit
// toggle), then Connected account + Session side by side, then Danger
// zone spanning the full width. Notifications has been removed from this
// page (no longer surfaced here) — `NotificationPreferencesForm` and the
// `/settings/notifications` endpoints still exist but aren't rendered.
export default async function SettingsPage() {
  const user = await getServerUser();

  return (
    <BlueprintReveal skeleton={<RouteLoading />}>
      <main className="px-4 py-5 sm:px-[26px] sm:py-[22px]">
        <div className="mx-auto w-full max-w-[680px]">
          <h1 className="m-0 mb-1 text-xl font-medium text-text">Settings</h1>
          <p className="m-0 mb-6 text-[13px] text-text-muted">
            Manage your profile, skills, and connected accounts.
          </p>

          {user ? (
            <div className="flex flex-col gap-4">
              <ProfileSettingsForm user={user} />

              <SkillsBackgroundCard user={user} />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ConnectedAccountCard user={user} />

                <section className="rounded-[10px] border border-border bg-surface p-5">
                  <h2 className="m-0 mb-3 text-sm font-medium text-text">Session</h2>
                  <p className="m-0 mb-3 text-[13px] text-text-muted">
                    Sign out of DevTunnel on this device.
                  </p>
                  <LogoutButton />
                </section>
              </div>

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
    </BlueprintReveal>
  );
}