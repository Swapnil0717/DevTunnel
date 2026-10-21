import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/content/content-page";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo";
import { articleJsonLd } from "@/lib/structured-data";

const PATH = "/guides/find-good-first-issues";
const TITLE = "How to Find Good First Issues on GitHub";
const DESCRIPTION =
  "How to find good first issues on GitHub: the search filters that work, signs an issue is a safe pick, what to avoid, and how DevTunnel matches tasks to your role and level.";

const SEARCH_URL =
  "https://github.com/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22+no%3Aassignee+language%3Apython";

export const metadata: Metadata = buildMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  keywords: ["good first issues", "good first issue GitHub", "beginner friendly open source issues"],
});

export default function FindGoodFirstIssuesPage() {
  return (
    <>
      <JsonLd data={articleJsonLd({ headline: TITLE, description: DESCRIPTION, path: PATH })} />
      <ContentPage
        title="How to find good first issues on GitHub"
        intro="A good first issue is small, clear and safe for someone new to the codebase. Finding one is mostly about filtering well and checking a few signs before you commit time."
      >
        <h2>Search GitHub for beginner-friendly issues</h2>
        <p>
          GitHub&rsquo;s issue search accepts filters. This query finds open Python issues labeled{" "}
          <code>good first issue</code> that nobody is assigned to; change <code>language:python</code> to your own
          language:
        </p>
        <pre>
          <code>is:open is:issue label:&quot;good first issue&quot; no:assignee language:python</code>
        </pre>
        <p>
          <a href={SEARCH_URL} target="_blank" rel="noopener noreferrer">
            Open this search on GitHub
          </a>
          . Also try the label <code>help wanted</code>.
        </p>

        <h2>Signs an issue is a safe pick</h2>
        <ul>
          <li>
            <strong>The problem is specific.</strong> It says what is wrong and what the fix should do.
          </li>
          <li>
            <strong>The project is active.</strong> Recent commits and maintainers who answer comments.
          </li>
          <li>
            <strong>Nobody else has claimed it.</strong> No linked pull request and no recent &ldquo;I&rsquo;ll take
            this&rdquo; comment.
          </li>
          <li>
            <strong>It is small.</strong> Ideally one file or one behavior, not a rewrite.
          </li>
          <li>
            <strong>The repository explains how to contribute.</strong> A README, a <code>CONTRIBUTING.md</code> file
            and working tests.
          </li>
        </ul>

        <h2>What to avoid</h2>
        <ul>
          <li>Issues that haven&rsquo;t had a reply in months. The project may not review your pull request.</li>
          <li>Vague requests such as &ldquo;improve performance&rdquo; with no target.</li>
          <li>Large refactors and new features that the maintainers haven&rsquo;t agreed to.</li>
        </ul>

        <h2>Claim it politely, then start</h2>
        <p>
          Comment that you would like to work on it and, if you are unsure, ask one specific question. Then follow the
          steps in{" "}
          <Link href="/guides/first-open-source-contribution">how to make your first open source contribution</Link>.
        </p>

        <h2>How DevTunnel helps</h2>
        <p>
          Reading issue lists doesn&rsquo;t tell you whether you can do the work. On DevTunnel, every{" "}
          <Link href="/tasks">task</Link> comes with a role, a level (beginner, intermediate or advanced) and a tech
          stack, and you can filter by any of them. You can also run <code>dev start owner/repo#123</code> on any public
          GitHub issue you found yourself. Browsing needs no account.
        </p>
      </ContentPage>
    </>
  );
}
