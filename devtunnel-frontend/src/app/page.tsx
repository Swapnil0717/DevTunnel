import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo";
import { organizationJsonLd, websiteJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = buildMetadata({
  title: "DevTunnel — Build open source, together",
  description:
    "DevTunnel connects contributors with open source projects to build, and helps maintainers organize tasks, roles, and pull requests.",
  path: "/",
});

/**
 * Real, crawlable links to every public section (Frontend_Development_Rules.txt
 * rules 10-12): the homepage is where crawlers and first-time visitors start,
 * so a page that only offered "Sign in" would leave the whole catalog with no
 * inbound link. Descriptions restate what each page itself says it contains —
 * nothing here claims a count, a feature or a number the site can't back up
 * (rules 58 and 59).
 */
const EXPLORE_LINKS = [
  {
    href: "/projects",
    label: "Projects",
    description: "Projects curated on DevTunnel, filterable by tech stack.",
  },
  {
    href: "/tasks",
    label: "Tasks",
    description: "Every task DevTunnel currently provides to contributors.",
  },
  {
    href: "/opensource-tools",
    label: "Open source tools",
    description: "Open source tools curated on DevTunnel, filterable by language and label.",
  },
  {
    href: "/submissions",
    label: "Community",
    description: "Projects and tools submitted by DevTunnel contributors.",
  },
] as const;

const GITHUB_LINKS = [
  { href: "/github-projects", label: "GitHub Projects" },
  { href: "/github-open-source-tools", label: "GitHub Open Source Tools" },
  { href: "/issues", label: "All Issues" },
] as const;

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      {/* This page owns the site-wide Organization + WebSite structured data
          (rules 15 and 53) — no other component emits them. */}
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />
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

      <nav aria-labelledby="explore-heading" className="w-full max-w-[720px]">
        <h2
          id="explore-heading"
          className="m-0 mb-4 text-[13px] font-medium uppercase tracking-wide text-text-faint"
        >
          Explore DevTunnel
        </h2>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 text-left sm:grid-cols-2">
          {EXPLORE_LINKS.map(({ href, label, description }) => (
            <li key={href}>
              <Link
                href={href}
                className="block h-full rounded-[10px] border border-border bg-surface px-4 py-3.5 transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="block text-[14px] font-medium text-text">{label}</span>
                <span className="mt-1 block text-[12.5px] leading-[1.5] text-text-muted">
                  {description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="m-0 mt-4 text-[12.5px] text-text-muted">
          Also browse live GitHub data:{" "}
          {GITHUB_LINKS.map(({ href, label }, index) => (
            <span key={href}>
              {index > 0 ? " · " : null}
              <Link href={href} className="text-text underline-offset-2 hover:text-accent hover:underline">
                {label}
              </Link>
            </span>
          ))}
        </p>
      </nav>
    </main>
  );
}
