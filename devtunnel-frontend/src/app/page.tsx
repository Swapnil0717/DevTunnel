import Link from "next/link";
import type { Metadata } from "next";
import { GithubIcon } from "@/components/auth/github-icon";
import { CliTabs } from "@/components/landing/cli-tabs";
import { HeroStats } from "@/components/landing/hero-stats";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingShell } from "@/components/landing/landing-shell";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE_DESCRIPTION } from "@/lib/config";
import { buildMetadata } from "@/lib/seo";
import { organizationJsonLd, websiteJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = buildMetadata({
  title: "DevTunnel — Build open source, together",
  description: SITE_DESCRIPTION,
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
    description: "Curated tools, filterable by language and label.",
  },
  {
    href: "/submissions",
    label: "Community",
    description: "Projects and tools submitted by contributors.",
  },
] as const;

const GITHUB_LINKS = [
  { href: "/github-projects", label: "GitHub Projects" },
  { href: "/github-open-source-tools", label: "GitHub Open Source Tools" },
  { href: "/issues", label: "All Issues" },
] as const;

const FAQ = [
  {
    q: "What is DevTunnel?",
    a: (
      <>
        A platform that connects contributors with open source projects.
        Contributors find tasks that match their skills, then use the{" "}
        <code>dev</code> CLI to start the work and open the pull request.
      </>
    ),
    open: true,
  },
  {
    q: "What is the dev CLI?",
    a: (
      <>
        A command line tool that automates the GitHub contribution workflow:{" "}
        <code>dev login</code>, <code>dev start</code>, <code>dev test</code>{" "}
        and <code>dev submit</code>. Install it with{" "}
        <code>npm install -g @devtunnelcli/cli</code>, or prefix commands with{" "}
        <code>npx @devtunnelcli/cli</code>.
      </>
    ),
  },
  {
    q: "Do I need a DevTunnel task to contribute?",
    a: (
      <>
        No. <code>dev start owner/repo#123</code> works on any public GitHub
        issue, and the work still counts as a DevTunnel contribution.
      </>
    ),
  },
  {
    q: "Is DevTunnel open source?",
    a: (
      <>
        No. The source is available to read and you can submit pull requests,
        but all rights are reserved. See the license in the repository before
        reusing any code.
      </>
    ),
  },
  {
    q: "What does it cost?",
    a: (
      <>
        The core platform is free. Paid tasks and premium infrastructure are on
        the roadmap and are not available yet.
      </>
    ),
  },
] as const;

export default function HomePage() {
  return (
    <LandingShell>
      {/* This page owns the site-wide Organization + WebSite structured data
          (rules 15 and 53) — no other component emits them. */}
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />

      <div className="lp-hero-stage">
        <LandingHeader />

        <div className="lp-hero">
          <div
            className="lp-trust lp-anim"
            role="img"
            aria-label="Works with GitHub, the npm registry and Node.js"
          >
            <span className="lp-av lp-av-gh">
              <span>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                </svg>
              </span>
            </span>
            <span className="lp-av lp-av-npm">
              <span>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M0 0v16h16V0H0zm13 13h-2.5V5.5H8V13H3V3h10v10z" />
                </svg>
              </span>
            </span>
            <span className="lp-av lp-av-node">
              <span>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 .5 14.5 4.25v7.5L8 15.5 1.5 11.75v-7.5L8 .5zm0 2.3L3.5 5.4v5.2L8 13.2l4.5-2.6V5.4L8 2.8z" />
                </svg>
              </span>
            </span>
            <span className="lp-tpill">Works with any public GitHub repo</span>
          </div>

          <h1 className="lp-headline">
            <span>Pick an issue.</span>
            <span>Ship the pull request.</span>
          </h1>
          <p className="lp-sub lp-anim">{SITE_DESCRIPTION}</p>
          <Link href="/login" className="lp-cta">
            <GithubIcon className="lp-cta-icon" />
            Sign in with GitHub
          </Link>
        </div>

        <HeroStats />
      </div>

      <main className="lp-wrap">
        <section id="lifecycle" aria-labelledby="h-life" className="lp-section">
          <div className="lp-sec-head">
            <h2 id="h-life">Progress that DevTunnel actually recorded</h2>
            <p>
              Every task moves through four stages. Each stage comes from
              something that happened, such as a{" "}
              <code className="lp-code">dev start</code> or a pull request
              opened by <code className="lp-code">dev submit</code>, never from
              a box someone ticked.
            </p>
          </div>
          <div className="lp-stages">
            <div className="lp-stage">
              <span className="lp-num" aria-hidden="true">1</span>
              <code>OPEN</code>
              <h3>Open</h3>
              <p>A curated task nobody has claimed yet, with its role, difficulty and tech stack.</p>
            </div>
            <div className="lp-stage">
              <span className="lp-num" aria-hidden="true">2</span>
              <code>IN_PROGRESS</code>
              <h3>In progress</h3>
              <p>You started it. The branch is named for the task.</p>
              <span className="lp-cmd">dev start</span>
            </div>
            <div className="lp-stage">
              <span className="lp-num" aria-hidden="true">3</span>
              <code>IN_REVIEW</code>
              <h3>PR submitted</h3>
              <p>A pull request is open and linked to the task&apos;s issue.</p>
              <span className="lp-cmd">dev submit</span>
            </div>
            <div className="lp-stage">
              <span className="lp-num" aria-hidden="true">4</span>
              <code>DONE</code>
              <h3>Done</h3>
              <p>The task is complete. DevTunnel only says &ldquo;merged&rdquo; at this stage.</p>
            </div>
          </div>
          <p className="lp-fine">
            &ldquo;PR submitted&rdquo; means a pull request was opened, not
            merged. DevTunnel does not watch the merge itself.
          </p>
        </section>

        <section id="cli" aria-labelledby="h-cli" className="lp-section">
          <div className="lp-sec-head">
            <h2 id="h-cli">Three ways in, one set of commands</h2>
            <p>
              Start from a DevTunnel task, a whole project, or any public
              GitHub issue. These are the exact commands the Contribute pages
              show.
            </p>
          </div>
          <CliTabs />
        </section>

        <section id="features" aria-labelledby="h-feat" className="lp-section">
          <div className="lp-sec-head">
            <h2 id="h-feat">Find work that fits the skills you have</h2>
            <p>
              Filter by tech stack, role and experience level. Examples below
              are layouts, not live data.
            </p>
          </div>
          <div className="lp-bento">
            <article className="lp-cell lp-c-a">
              <span className="lp-glyph" aria-hidden="true">@</span>
              <h3>Projects curated on DevTunnel</h3>
              <p>Each project page carries its description, tech stack, repository and tasks. Filter the catalog by tech.</p>
              <div className="lp-mock" aria-label="Example project card">
                <div className="lp-row">
                  <span className="lp-name">Example project</span>
                  <span className="lp-tag lp-t-tech">TypeScript</span>
                </div>
                <div className="lp-row">
                  <span style={{ color: "var(--lp-muted)" }}>Short description of what the project does.</span>
                </div>
                <div className="lp-row">
                  <span className="lp-match">Backend Developer — 87% match</span>
                  <span style={{ color: "var(--lp-faint)" }}>View project</span>
                </div>
              </div>
              <Link href="/projects" className="lp-more">Browse projects</Link>
            </article>

            <article className="lp-cell lp-c-b">
              <span className="lp-glyph" aria-hidden="true">#</span>
              <h3>Tasks with a role, level and stack</h3>
              <p>Six roles and three experience levels, the same ones you pick in onboarding, so the list narrows to your profile.</p>
              <div className="lp-mock" aria-label="Example task filters">
                <div className="lp-chips">
                  {["Frontend", "Backend", "Full stack", "Documentation", "Testing", "DevOps"].map((r) => (
                    <span key={r} className="lp-tag lp-t-skill">{r}</span>
                  ))}
                </div>
                <div className="lp-chips">
                  {["Beginner", "Intermediate", "Advanced"].map((l) => (
                    <span key={l} className="lp-tag lp-t-int">{l}</span>
                  ))}
                </div>
              </div>
              <Link href="/tasks" className="lp-more">Browse tasks</Link>
            </article>

            <article className="lp-cell lp-c-c">
              <span className="lp-glyph" aria-hidden="true">+</span>
              <h3>Open source tools</h3>
              <p>Tools curated on DevTunnel, filterable by language and label, each with a setup guide.</p>
              <Link href="/opensource-tools" className="lp-more">See tools</Link>
            </article>

            <article className="lp-cell lp-c-d">
              <span className="lp-glyph" aria-hidden="true">*</span>
              <h3>
                AI help, always labeled <span className="lp-ai">AI-generated</span>
              </h3>
              <p>Ask in plain words to search the catalog, get a summary, or have an issue explained: what needs doing, skills needed, difficulty and first steps. Sign-in required, and the text is rendered as plain text.</p>
              <div className="lp-mock" aria-label="Example AI search">
                <div className="lp-row">
                  <span style={{ color: "var(--lp-muted)" }}>Ask AI: beginner-friendly React issues with docs work</span>
                  <span className="lp-ai">AI-generated</span>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section id="explore" aria-labelledby="h-exp" className="lp-section">
          <div className="lp-sec-head">
            <h2 id="h-exp">Explore DevTunnel</h2>
          </div>
          <nav aria-label="Explore DevTunnel">
            <ul className="lp-explore">
              {EXPLORE_LINKS.map(({ href, label, description }) => (
                <li key={href}>
                  <Link href={href}>
                    <strong>
                      {label} <em aria-hidden="true">→</em>
                    </strong>
                    <span>{description}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="lp-gh">
              Also browse live GitHub data:{" "}
              {GITHUB_LINKS.map(({ href, label }, index) => (
                <span key={href}>
                  {index > 0 ? " · " : null}
                  <Link href={href}>{label}</Link>
                </span>
              ))}
            </p>
          </nav>
        </section>

        <section id="faq" aria-labelledby="h-faq" className="lp-section">
          <div className="lp-sec-head">
            <h2 id="h-faq">Questions</h2>
          </div>
          <div className="lp-faq">
            {FAQ.map((item) => (
              <details key={item.q} open={"open" in item ? item.open : undefined}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="lp-final">
          <h2>Your first pull request is one command away</h2>
          <p>
            Sign in with GitHub, pick a task, and run{" "}
            <code className="lp-code" style={{ color: "var(--lp-text-2)" }}>dev start</code>.
          </p>
          <div className="lp-final-actions">
            <Link href="/login" className="lp-cta">
              <GithubIcon className="lp-cta-icon" />
              Sign in with GitHub
            </Link>
            <Link href="/tasks" className="lp-ghost">Browse tasks</Link>
          </div>
        </div>
      </main>
    </LandingShell>
  );
}
