import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { TrainTrack } from "@/components/layout/train-track";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/config";

/**
 * Every link here is a real, public route that already exists in the app
 * (see `(public)/layout.tsx` for the list), written as a plain `<a>` via
 * `next/link` so a crawler can follow it (rules 10–12). Labels match the
 * sidebar's naming, and nothing is claimed that the site can't back up —
 * no legal, pricing or social links appear because those pages don't exist
 * (rules 58, 59).
 */
const EXPLORE_LINKS = [
  { href: "/projects", label: "Projects" },
  { href: "/tasks", label: "Tasks" },
  { href: "/issues", label: "Issues" },
  { href: "/opensource-tools", label: "Open source tools" },
  { href: "/submissions", label: "Community" },
] as const;

const GITHUB_LINKS = [
  { href: "/github-projects", label: "GitHub projects" },
  { href: "/github-open-source-tools", label: "GitHub open source tools" },
] as const;

const LINK_CLASSES =
  "text-[13px] text-text-muted transition-colors hover:text-text focus-visible:text-text";

function FooterLinks({
  id,
  title,
  links,
}: {
  id: string;
  title: string;
  links: readonly { href: string; label: string }[];
}) {
  return (
    <nav aria-labelledby={id}>
      <h2 id={id} className="m-0 mb-3 text-[12px] font-medium text-text-dim">
        {title}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={LINK_CLASSES}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The site-wide footer, mounted once in the root layout so it appears on
 * every page — public catalog, contributor app, admin portal, sign-in and
 * 404 alike. Above it the page's own shell (sidebar + content) has already
 * ended, so it always sits below everything and spans the full width; the
 * sticky sidebar stops at the shell's edge and never runs down the footer.
 *
 * Server component: static text, links and a CSS-only train (`TrainTrack`),
 * so it adds no client JavaScript (rule 38). The description reuses
 * `SITE_DESCRIPTION` from `lib/config.ts` so the organization's name and
 * blurb read the same here as in metadata and structured data (rules 15, 44).
 *
 * `pb-[calc(4rem+…)]` on the bottom bar keeps the copyright line clear of
 * the fixed mobile tab bar (`AppBottomNav`, `sm:hidden`) that overlays the
 * bottom of the viewport on the contributor and catalog pages.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-[#1F1F1F] bg-bg">
      <div className="mx-auto grid w-full max-w-[1040px] gap-10 px-4 pb-10 pt-10 sm:grid-cols-[1.6fr_1fr_1fr] sm:px-7">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="m-0 max-w-[340px] text-[13px] leading-[1.6] text-text-muted">
            {SITE_DESCRIPTION}
          </p>
        </div>
        <FooterLinks id="footer-explore" title="Explore" links={EXPLORE_LINKS} />
        <FooterLinks id="footer-github" title="On GitHub" links={GITHUB_LINKS} />
      </div>

      <TrainTrack />

      <div className="mx-auto w-full max-w-[1040px] px-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-4 sm:px-7 sm:pb-5">
        <p className="m-0 font-mono text-[11.5px] text-text-dim">
          © {new Date().getFullYear()} {SITE_NAME}
        </p>
      </div>
    </footer>
  );
}
