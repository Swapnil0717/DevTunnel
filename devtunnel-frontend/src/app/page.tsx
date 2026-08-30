import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "DevTunnel — Build open source, together",
  description:
    "DevTunnel connects contributors with open source projects to build, and helps maintainers organize tasks, roles, and pull requests.",
  path: "/",
});

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <Logo />
      <div className="max-w-[520px]">
        <h1 className="m-0 mb-3 text-2xl font-medium tracking-[-0.02em] text-text">
          Build open source, together
        </h1>
        <p className="m-0 text-[15px] leading-[1.6] text-text-muted">
          DevTunnel connects contributors with open source projects to build,
          and helps maintainers organize tasks, roles, and pull requests.
        </p>
      </div>
      <Link
        href="/login"
        className="inline-flex items-center justify-center rounded-md bg-text px-5 py-2.5 text-[13px] font-medium text-bg transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Sign in with GitHub
      </Link>
    </main>
  );
}
