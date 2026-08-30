import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "DevTunnel — Build real software with real developers",
  description:
    "Discover open source projects on DevTunnel, backed by GitHub-integrated developer infrastructure.",
  alternates: {
    canonical: SITE_URL,
  },
};

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-24 text-center">
      <span className="mb-6 inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-status-brand" aria-hidden="true" />
        contributor network
      </span>
      <h1 className="mb-4 text-3xl font-medium tracking-tight text-ink-primary">
        Build real software with real developers.
      </h1>
      <p className="mb-10 max-w-xl text-sm leading-relaxed text-ink-muted">
        DevTunnel connects contributors and maintainers around real, active GitHub
        projects — open source projects with a shared task workflow and
        integrated developer infrastructure.
      </p>
      <Link
        href="/login"
        className="inline-flex h-[38px] items-center justify-center rounded-chip bg-ink-primary px-5 text-[13px] font-medium text-surface-0 transition-opacity hover:opacity-90"
      >
        Sign in to get started
      </Link>
    </main>
  );
}
