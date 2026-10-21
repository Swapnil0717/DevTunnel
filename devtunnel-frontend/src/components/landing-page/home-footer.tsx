import Image from "next/image";
import Link from "next/link";
import { CookieSettingsLink } from "@/components/consent/cookie-settings-link";
import { CONTACT_EMAIL, LINKEDIN_URL, OPERATOR_NAME, PROJECT_GITHUB_URL } from "@/lib/config";
import { Ic } from "./icon";

export function HomeFooter() {
  return (
    <footer className="ft">
      <div className="ps-in">
        <div className="ft-top">
          <div className="ft-brand">
            <Link href="/" aria-label="DevTunnel home">
              <Image src="/logo.png" alt="DevTunnel" width={1643} height={262} />
            </Link>
            <p>Open source tasks matched to your role, level and stack, and a CLI that opens the pull request.</p>
            <div className="ft-soc">
              <a href={PROJECT_GITHUB_URL} target="_blank" rel="noopener noreferrer" className="ft-s" aria-label="DevTunnel on GitHub">
                <Ic id="gh" size={20} />
              </a>
              <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" className="ft-s" aria-label="Pranav Pathare on LinkedIn">
                <svg className="ic" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                  <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z"></path>
                </svg>
              </a>
              <a href={`mailto:${CONTACT_EMAIL}`} className="ft-s" aria-label="Email contact@devtunnel.tech">
                <Ic id="mail" />
              </a>
            </div>
          </div>
          <nav className="ft-col" aria-label="Explore">
            <span className="k">Explore</span>
            <ul>
              <li>
                <Link href="/projects">Projects</Link>
              </li>
              <li>
                <Link href="/tasks">Tasks</Link>
              </li>
              <li>
                <Link href="/opensource-tools">Open source tools</Link>
              </li>
              <li>
                <Link href="/submissions">Community</Link>
              </li>
            </ul>
          </nav>
          <nav className="ft-col" aria-label="Live from GitHub">
            <span className="k">Live from GitHub</span>
            <ul>
              <li>
                <Link href="/github-projects">GitHub Projects</Link>
              </li>
              <li>
                <Link href="/github-open-source-tools">GitHub Open Source Tools</Link>
              </li>
              <li>
                <Link href="/issues">All Issues</Link>
              </li>
            </ul>
          </nav>
          <nav className="ft-col" aria-label="Project">
            <span className="k">Project</span>
            <ul>
              <li>
                <Link href="/#cli">How it works</Link>
              </li>
              <li>
                <Link href="/#faq">FAQ</Link>
              </li>
              <li>
                <Link href="/about">About DevTunnel</Link>
              </li>
              <li>
                <Link href="/guides/first-open-source-contribution">First contribution guide</Link>
              </li>
              <li>
                <Link href="/guides/find-good-first-issues">Find good first issues</Link>
              </li>
              <li>
                <a href={`${PROJECT_GITHUB_URL}/blob/main/ROADMAP.md`} target="_blank" rel="noopener noreferrer">Roadmap</a>
              </li>
              <li>
                <a href={`${PROJECT_GITHUB_URL}/blob/main/CHANGELOG.md`} target="_blank" rel="noopener noreferrer">Changelog</a>
              </li>
              <li>
                <a href={`${PROJECT_GITHUB_URL}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer">Contributing guide</a>
              </li>
              <li>
                <a href={`${PROJECT_GITHUB_URL}/blob/main/SECURITY.md`} target="_blank" rel="noopener noreferrer">Security</a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="ft-bot">
          <p>© {new Date().getFullYear()} DevTunnel. Operated by {OPERATOR_NAME}, India. Not affiliated with or endorsed by GitHub.</p>
          <nav aria-label="Legal">
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms of service</Link>
            <Link href="/cookies">Cookie policy</Link>
            <Link href="/refunds">Refund policy</Link>
            <Link href="/contact">Contact</Link>
            <CookieSettingsLink className="ft-cb" />
          </nav>
          <a href="#top" className="ft-up">
            Back to top
            <svg className="ic" style={{ width: "15px", height: "15px" }} aria-hidden="true">
              <use href="#dti-arrow" transform="rotate(-90 12 12)"></use>
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
