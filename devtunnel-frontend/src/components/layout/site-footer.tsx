// devtunnel-frontend/src/components/layout/site-footer.tsx
import Link from "next/link";
import { TrainFooter } from "./train-footer";
import { Logo } from "./logo";
import { CookieSettingsLink } from "@/components/consent/cookie-settings-link";
import { CONTACT_EMAIL, GITHUB_REPO_URL, OPERATOR_NAME, SPONSOR_URL } from "@/lib/config";

/**
 * Site footer = the existing `TrainFooter` (unchanged) on top, with the link
 * columns on a dashed grid underneath it.
 *
 *  - `variant="full"`  — brand cell + four link columns on a dashed grid,
 *    below the train. Used on the landing page, the legal pages, and the
 *    error / callback / onboarding screens.
 *  - `variant="slim"`  — one row (Privacy · Terms · Cookie settings · Contact)
 *    below the train.
 *    Used inside the app shell (catalog, signed-in pages) and the login
 *    pages, so the legal links and cookie settings are reachable everywhere
 *    without adding height to long pages.
 *
 * The admin portal keeps the bare `TrainFooter`.
 */

type FooterLink = { label: string; href: string; external?: boolean };

const linkClass =
  "text-[12.5px] text-text-muted underline-offset-2 transition-colors hover:text-text hover:underline";

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
      {/* The train sits first; the link grid is the ground it stands on. */}
      <TrainFooter />
      <div className="w-full">
        {/* Dashed grid, edge to edge: brand cell + four link columns. */}
        <div className="grid grid-cols-2 border-t border-dashed border-border sm:grid-cols-4 lg:grid-cols-5">
          <div className="col-span-2 flex flex-col items-center gap-3 px-4 py-8 text-center sm:col-span-4 lg:col-span-1 lg:items-center">
            <Logo />
            <p className="m-0 max-w-[220px] text-[12px] leading-[1.5] text-text-muted">
              Find open-source projects and tasks that fit your skills, and ship your first pull
              request.
            </p>
            <p className="m-0 text-[11px] leading-[1.5] text-text-dim">
              © {new Date().getFullYear()} DevTunnel
              <br />
              Operated by {OPERATOR_NAME}, India
            </p>
            {GITHUB_REPO_URL || SPONSOR_URL ? (
              <div className="flex flex-wrap justify-center gap-2">
                {GITHUB_REPO_URL ? (
                  <a
                    href={GITHUB_REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-[12px] text-text transition-colors hover:border-text-dim"
                  >
                    Star on GitHub
                  </a>
                ) : null}
                {SPONSOR_URL ? (
                  <a
                    href={SPONSOR_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-[12px] text-text transition-colors hover:border-text-dim"
                  >
                    Sponsor
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          {columns.map((column) => (
            <nav
              key={column.title}
              aria-label={column.title}
              className="flex flex-col items-center gap-2.5 border-t border-dashed border-border px-3 py-8 text-center sm:border-t-0 lg:border-l"
            >
              <h2 className="m-0 mb-1 text-[13px] font-medium text-text">{column.title}</h2>
              {column.links.map((link) => (
                <FooterAnchor key={link.label} link={link} />
              ))}
              {column.title === "Legal" ? (
                <CookieSettingsLink
                  className={`${linkClass} w-fit bg-transparent p-0 text-accent hover:text-accent`}
                />
              ) : null}
              {column.title === "Support" ? (
                <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
                  {CONTACT_EMAIL}
                </a>
              ) : null}
            </nav>
          ))}
        </div>
        <p className="m-0 border-t border-dashed border-border px-4 py-2 text-center text-[11px] text-text-dim">
          Not affiliated with or endorsed by GitHub.
        </p>
      </div>
    </footer>
  );
}

/** The train, then one row of legal links. */
function SlimFooter() {
  return (
    <footer className="w-full bg-bg">
      <TrainFooter />
      <nav
        aria-label="Legal"
        className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-dashed border-border px-4 py-3 sm:px-6"
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