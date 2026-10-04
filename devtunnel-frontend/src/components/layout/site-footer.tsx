// devtunnel-frontend/src/components/layout/site-footer.tsx
import Link from "next/link";
import { TrainFooter } from "./train-footer";
import { Logo } from "./logo";
import { CookieSettingsLink } from "@/components/consent/cookie-settings-link";
import { CONTACT_EMAIL, GITHUB_REPO_URL, OPERATOR_NAME, SPONSOR_URL } from "@/lib/config";

/**
 * Site footer = the existing `TrainFooter` (unchanged, it stays the visual
 * closing moment of the page) with the link columns and legal bar beneath it.
 *
 *  - `variant="full"`  — brand row, four link columns, legal bar. Used on the
 *    landing page, the legal pages, and the error / callback / onboarding
 *    screens.
 *  - `variant="slim"`  — one row (Privacy · Terms · Cookie settings · Contact).
 *    Used inside the app shell (catalog, signed-in pages) and the login
 *    pages, so the legal links and cookie settings are reachable everywhere
 *    without adding height to long pages.
 *
 * The admin portal keeps the bare `TrainFooter`.
 */

type FooterLink = { label: string; href: string; external?: boolean };

const linkClass =
  "text-[13px] text-text-muted underline-offset-2 transition-colors hover:text-text hover:underline";

function repoLink(path: string): string | null {
  return GITHUB_REPO_URL ? `${GITHUB_REPO_URL}${path}` : null;
}

function buildColumns(): Array<{ title: string; links: FooterLink[] }> {
  const community: Array<FooterLink | null> = [
    GITHUB_REPO_URL ? { label: "GitHub repository", href: GITHUB_REPO_URL, external: true } : null,
    repoLink("/blob/main/CONTRIBUTING.md")
      ? { label: "Contributing", href: repoLink("/blob/main/CONTRIBUTING.md")!, external: true }
      : null,
    repoLink("/blob/main/CODE_OF_CONDUCT.md")
      ? { label: "Code of conduct", href: repoLink("/blob/main/CODE_OF_CONDUCT.md")!, external: true }
      : null,
    SPONSOR_URL ? { label: "Sponsor", href: SPONSOR_URL, external: true } : null,
    repoLink("/blob/main/ROADMAP.md")
      ? { label: "Roadmap", href: repoLink("/blob/main/ROADMAP.md")!, external: true }
      : null,
  ];

  const support: Array<FooterLink | null> = [
    { label: "Contact", href: "/contact" },
    repoLink("/issues/new/choose")
      ? { label: "Report a bug", href: repoLink("/issues/new/choose")!, external: true }
      : null,
    repoLink("/security/policy")
      ? { label: "Security", href: repoLink("/security/policy")!, external: true }
      : null,
  ];

  return [
    {
      title: "Explore",
      links: [
        { label: "Projects", href: "/projects" },
        { label: "Tasks", href: "/tasks" },
        { label: "Open-source tools", href: "/opensource-tools" },
        { label: "GitHub projects", href: "/github-projects" },
        { label: "Issues", href: "/issues" },
        { label: "Submissions", href: "/submissions" },
      ],
    },
    { title: "Community", links: community.filter((l): l is FooterLink => l !== null) },
    {
      title: "Legal",
      links: [
        { label: "Privacy policy", href: "/privacy" },
        { label: "Terms of service", href: "/terms" },
        { label: "Cookie policy", href: "/cookies" },
        { label: "Refund policy", href: "/refunds" },
      ],
    },
    { title: "Support", links: support.filter((l): l is FooterLink => l !== null) },
  ];
}

function FooterAnchor({ link }: { link: FooterLink }) {
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={linkClass}>
      {link.label}
    </Link>
  );
}

export function SiteFooter({ variant = "full" }: { variant?: "full" | "slim" }) {
  if (variant === "slim") return <SlimFooter />;

  const columns = buildColumns();

  return (
    <footer className="w-full bg-bg">
      <TrainFooter />
      <div className="mx-auto w-full max-w-[1080px] px-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-t border-border py-6">
          <div className="max-w-[300px]">
            <Logo className="mb-2" />
            <p className="m-0 text-[13px] leading-[1.55] text-text-muted">
              Find open-source projects and tasks that fit your skills, and ship your first pull
              request.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {GITHUB_REPO_URL ? (
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-[13px] text-text transition-colors hover:border-text-dim"
              >
                Star on GitHub
              </a>
            ) : null}
            {SPONSOR_URL ? (
              <a
                href={SPONSOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-[13px] text-text transition-colors hover:border-text-dim"
              >
                Sponsor
              </a>
            ) : null}
          </div>
        </div>

        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-x-5 gap-y-6 pb-6 sm:grid-cols-4"
        >
          {columns.map((column) => (
            <div key={column.title} className="flex flex-col gap-2">
              <h2 className="m-0 mb-0.5 text-[12px] font-medium uppercase tracking-[0.06em] text-text-dim">
                {column.title}
              </h2>
              {column.links.map((link) => (
                <FooterAnchor key={link.label} link={link} />
              ))}
              {column.title === "Legal" ? (
                <CookieSettingsLink
                  className={`${linkClass} w-fit bg-transparent p-0 text-left text-accent hover:text-accent`}
                />
              ) : null}
              {column.title === "Support" ? (
                <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
                  {CONTACT_EMAIL}
                </a>
              ) : null}
            </div>
          ))}
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border py-4">
          <span className="text-[12px] text-text-dim">
            © {new Date().getFullYear()} DevTunnel · Operated by {OPERATOR_NAME}, India
          </span>
          <span className="text-[12px] text-text-dim">
            Not affiliated with or endorsed by GitHub.
          </span>
        </div>
      </div>
    </footer>
  );
}

/** Train + a single row of legal links. */
function SlimFooter() {
  return (
    <footer className="w-full bg-bg">
      <TrainFooter />
      <nav
        aria-label="Legal"
        className="mx-auto flex w-full max-w-[1080px] flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 sm:px-6"
      >
        <Link href="/privacy" className="text-[12px] text-text-dim transition-colors hover:text-text">
          Privacy
        </Link>
        <Link href="/terms" className="text-[12px] text-text-dim transition-colors hover:text-text">
          Terms
        </Link>
        <CookieSettingsLink className="bg-transparent p-0 text-[12px] text-text-dim transition-colors hover:text-text" />
        <Link href="/contact" className="text-[12px] text-text-dim transition-colors hover:text-text">
          Contact
        </Link>
      </nav>
    </footer>
  );
}
