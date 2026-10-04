import Image from "next/image";
import Link from "next/link";
import { GithubIcon } from "@/components/auth/github-icon";
import { LinkedinIcon } from "@/components/auth/linkedin-icon";
import { CookieSettingsLink } from "@/components/consent/cookie-settings-link";
import { CONTACT_EMAIL, LINKEDIN_URL, OPERATOR_NAME, PROJECT_GITHUB_URL } from "@/lib/config";

/**
 * Footer for the landing page and the login page only. The rest of the app
 * keeps `SiteFooter` (train + link grid).
 *
 * It continues the curtain: the fixed curtain shows through an empty band at
 * the top, fades to black, and the footer proper sits on that black — social
 * buttons, the big logo, the main links and a "Back to top" tile, then the
 * legal row. Only links the site can back up are shown: the GitHub and
 * LinkedIn buttons always appear (fixed links in `lib/config.ts`), and the cookie
 * link appears when analytics is configured.
 */

const MAIN_LINKS = [
  { href: "/projects", label: "Projects" },
  { href: "/tasks", label: "Tasks" },
  { href: "/opensource-tools", label: "Open-source tools" },
  { href: "/submissions", label: "Community" },
] as const;

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of service" },
  { href: "/cookies", label: "Cookie policy" },
  { href: "/refunds", label: "Refund policy" },
  { href: "/contact", label: "Contact" },
] as const;

function MailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function LandingFooter() {
  return (
    <footer className="lp-footer">
      {/* Empty band: the curtain above shows through, then fades to black. */}
      <div className="lp-footer-fade" aria-hidden="true" />

      <div className="lp-footer-bar">
        <div className="lp-footer-inner">
          <div className="lp-socials">
            <a
              href={PROJECT_GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="DevTunnel on GitHub"
              className="lp-social"
            >
              <GithubIcon className="lp-social-icon" />
            </a>
            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Pranav Pathare on LinkedIn"
              className="lp-social"
            >
              <LinkedinIcon className="lp-social-icon" />
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              aria-label={`Email ${CONTACT_EMAIL}`}
              className="lp-social"
            >
              <MailIcon />
            </a>
          </div>

          <div className="lp-footer-main">
            <Link href="/" aria-label="DevTunnel home" className="lp-footer-logo">
              <Image src="/logo.png" alt="DevTunnel" width={1643} height={262} />
            </Link>

            <nav aria-label="Explore" className="lp-footer-links">
              {MAIN_LINKS.map(({ href, label }) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
            </nav>

            <a href="#top" className="lp-top">
              <svg
                viewBox="0 0 16 16"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
              </svg>
              Back to top
            </a>
          </div>

          <div className="lp-footer-legal">
            <p>
              © {new Date().getFullYear()} DevTunnel. Operated by {OPERATOR_NAME}, India.
              <span> Not affiliated with or endorsed by GitHub.</span>
            </p>
            <nav aria-label="Legal">
              {LEGAL_LINKS.map(({ href, label }) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
              <CookieSettingsLink className="lp-cookie-btn" />
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
