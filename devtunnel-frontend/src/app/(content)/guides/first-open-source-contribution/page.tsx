import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/content/content-page";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo";
import { articleJsonLd } from "@/lib/structured-data";

const PATH = "/guides/first-open-source-contribution";
const TITLE = "Make Your First Open Source Contribution";
const DESCRIPTION =
  "A step-by-step guide to your first open source contribution: pick a project, choose a small issue, set up, make the change and open a pull request. Free, no account needed.";

export const metadata: Metadata = buildMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  keywords: [
    "how to make your first open source contribution",
    "first pull request",
    "how to contribute to open source",
    "open source for beginners",
  ],
});

export default function FirstContributionGuidePage() {
  return (
    <>
      <JsonLd data={articleJsonLd({ headline: `How to ${TITLE.toLowerCase()}`, description: DESCRIPTION, path: PATH })} />
      <ContentPage
        title="How to make your first open source contribution"
        intro="Your first contribution doesn’t have to be big. A fixed typo, a clearer error message or a small bug is a real contribution. Here is the whole path from choosing a project to an open pull request."
      >
        <h2>1. Pick a project you can understand</h2>
        <p>
          Start with software you already use, or in a language you already write. You will read the code before you
          change it, and that is much easier in a stack you know. You can browse{" "}
          <Link href="/projects">open source projects</Link> on DevTunnel and filter by tech stack.
        </p>

        <h2>2. Choose a small, clear issue</h2>
        <p>
          Look for an issue that says exactly what is wrong and what done looks like. Labels such as{" "}
          <code>good first issue</code> or <code>help wanted</code> usually mark work the maintainers consider
          approachable. Check that nobody else is already working on it, and that the project has had activity
          recently. The guide to <Link href="/guides/find-good-first-issues">finding good first issues</Link> covers
          this in detail. On DevTunnel, every <Link href="/tasks">task</Link> lists its role, level and tech stack.
        </p>

        <h2>3. Read the README and CONTRIBUTING guide</h2>
        <p>
          Most projects explain how to run the code, how to run the tests and what a good pull request looks like. If
          the repository has a <code>CONTRIBUTING.md</code> file or a pull request template, follow it. A change that
          follows the rules is far more likely to be reviewed quickly.
        </p>

        <h2>4. Set up your copy and make the change</h2>
        <p>
          The usual manual path is: fork the repository, clone your fork, create a branch for the issue, make the
          change and run the tests. The DevTunnel CLI does the repetitive parts for you:
        </p>
        <pre>
          <code>{`npm install -g @devtunnelcli/cli   # Node.js 18.18 or newer
dev login                          # sign in with GitHub
dev start owner/repo#123           # fork, clone and branch for the issue
# ...make your change...
dev test                           # pull the latest changes, run the project's tests
dev submit                         # commit, push and open the pull request`}</code>
        </pre>
        <p>
          <code>dev start owner/repo#123</code> works on any public GitHub issue. To start from a DevTunnel task, use{" "}
          <code>dev start &lt;task-id&gt;</code> and <code>dev submit &lt;task-id&gt;</code> instead.
        </p>

        <h2>5. Open the pull request</h2>
        <p>
          Write a short description of what you changed and why, and link the issue. <code>dev submit</code> uses the
          repository&rsquo;s pull request template when there is one. DevTunnel can&rsquo;t merge into any repository, so
          the maintainers decide what happens next.
        </p>

        <h2>6. Respond to review</h2>
        <p>
          Reviewers often ask for changes, and that is normal. Answer politely, push the fixes to the same branch and
          the pull request updates itself. Once it is merged, you have made your first open source contribution.
        </p>

        <h2>Common questions</h2>
        <h3>Do I need a DevTunnel account?</h3>
        <p>
          Not to browse. Sign in with GitHub when you want to start work. Everything on the{" "}
          <Link href="/about">About page</Link> is free today.
        </p>
        <h3>What if I get stuck?</h3>
        <p>
          Comment on the issue and ask the maintainers a specific question. Say what you tried and what happened.
          DevTunnel&rsquo;s task pages can also explain a task in plain words, labeled as AI help.
        </p>
      </ContentPage>
    </>
  );
}
