import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/content/content-page";
import { JsonLd } from "@/components/seo/json-ld";
import { CONTACT_EMAIL, OPERATOR_NAME, PROJECT_GITHUB_URL } from "@/lib/config";
import { buildMetadata } from "@/lib/seo";
import { aboutPageJsonLd } from "@/lib/structured-data";

const DESCRIPTION =
  "DevTunnel is a free, open source (MIT) platform that matches developers with open source tasks by role, level and tech stack, and a CLI that opens the pull request.";

export const metadata: Metadata = buildMetadata({
  title: "About DevTunnel: Find Open Source Tasks",
  description: DESCRIPTION,
  path: "/about",
  keywords: ["what is DevTunnel", "open source contribution platform"],
});

export default function AboutPage() {
  return (
    <>
      <JsonLd data={aboutPageJsonLd({ description: DESCRIPTION })} />
      <ContentPage
        title="About DevTunnel"
        intro="DevTunnel is a free, open source platform that helps developers find open source tasks they can finish, and a command line tool that turns the work into a pull request."
      >
        <h2>What DevTunnel does</h2>
        <ul>
          <li>
            <strong>Matches work to you.</strong> Every <Link href="/tasks">task</Link> comes with a role, a level
            (beginner, intermediate or advanced) and a tech stack, so you can tell whether you can do it before you
            start. Roles include frontend, backend, full stack, documentation, testing and DevOps.
          </li>
          <li>
            <strong>Explains each task in plain words.</strong> AI help is available and always labeled as AI.
          </li>
          <li>
            <strong>Opens the pull request for you.</strong> The <code>dev</code> CLI forks, clones and branches,
            runs the project&rsquo;s own tests, then commits, pushes and opens the pull request using the
            repository&rsquo;s template if it has one.
          </li>
          <li>
            <strong>Works on any public GitHub issue.</strong> You don&rsquo;t need a DevTunnel task. Work started from
            any public issue still counts as a DevTunnel contribution.
          </li>
          <li>
            <strong>Builds your profile from things that happened.</strong> Progress is recorded from real events such
            as a task started or a pull request opened, not from self-reported skills.
          </li>
        </ul>

        <h2>Quick facts</h2>
        <dl>
          <div>
            <dt>What it is</dt>
            <dd>An open source contribution platform: a catalog of projects, tasks and tools, plus the dev CLI.</dd>
          </div>
          <div>
            <dt>Cost</dt>
            <dd>The core platform is free. Paid tasks and premium infrastructure are on the roadmap and not available yet.</dd>
          </div>
          <div>
            <dt>License</dt>
            <dd>
              MIT. The code is on <a href={PROJECT_GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>.
            </dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd>Browsing projects, tasks and tools needs no account. Sign in with GitHub to start work or use the AI help.</dd>
          </div>
          <div>
            <dt>Install the CLI</dt>
            <dd>
              <code>npm install -g @devtunnelcli/cli</code> (Node.js 18.18 or newer), or run commands with{" "}
              <code>npx @devtunnelcli/cli</code>.
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>Phase 1: building and validating the idea. The catalog of projects, tasks and tools is still growing.</dd>
          </div>
          <div>
            <dt>Operated by</dt>
            <dd>
              {OPERATOR_NAME}, India. Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </dd>
          </div>
        </dl>

        <h2>What DevTunnel does not do</h2>
        <ul>
          <li>It can&rsquo;t merge into any repository. Merge authority stays with the repository owner.</li>
          <li>It opens pull requests with your own GitHub token, not a shared account.</li>
        </ul>

        <h2>Where to start</h2>
        <ul>
          <li>
            New to open source? Read{" "}
            <Link href="/guides/first-open-source-contribution">how to make your first open source contribution</Link>{" "}
            and <Link href="/guides/find-good-first-issues">how to find good first issues</Link>.
          </li>
          <li>
            Browse <Link href="/tasks">open source tasks</Link>, <Link href="/projects">projects</Link> and{" "}
            <Link href="/opensource-tools">tools</Link>.
          </li>
          <li>
            Questions? See the <Link href="/#faq">FAQ</Link> or <Link href="/contact">contact us</Link>.
          </li>
        </ul>
      </ContentPage>
    </>
  );
}
