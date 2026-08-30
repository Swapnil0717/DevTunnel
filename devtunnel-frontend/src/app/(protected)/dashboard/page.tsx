import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/app-header";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Dashboard",
  description: "Your DevTunnel contributor dashboard.",
  path: "/dashboard",
  noIndex: true,
});

export default function DashboardPage() {
  return (
    <>
      <AppHeader />
      <main className="px-6 py-12">
        <h1 className="m-0 mb-2 text-xl font-medium text-text">Dashboard</h1>
        <p className="m-0 max-w-[520px] text-[14px] leading-[1.6] text-text-muted">
          You&apos;re signed in. Project discovery, task management, and pull
          request tracking will land here in a later pass — this module
          covers authentication only.
        </p>
      </main>
    </>
  );
}
