import { CONTACT_EMAIL, PROJECT_GITHUB_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/config";

// Plain text, built once at deploy time.
export const dynamic = "force-static";

/**
 * `/llms.txt` — a short, plain-language map of the site for AI assistants and
 * other automated readers (the llms.txt convention). It only restates what the
 * public pages already say and links to the pages that are meant to be found;
 * private areas are not listed. Not a ranking signal for Google, but it gives
 * AI search tools an accurate summary to quote.
 */
export function GET() {
  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

${SITE_NAME} helps people make their first open source contributions. Contributors tell it their role, level and tech stack, and it shows open source tasks they can finish. Each task is explained in plain words. The \`dev\` command line tool (\`npm install -g @devtunnelcli/cli\`) starts the work and opens the pull request with the contributor's own GitHub token. It works on any public GitHub issue, and DevTunnel cannot merge into any repository. The platform is free to use and released under the MIT License.

## Browse (no account needed)

- [Open source tasks and good first issues](${SITE_URL}/tasks): filter by role, difficulty, tech stack and project
- [Open source projects](${SITE_URL}/projects): projects curated on DevTunnel, filterable by tech stack
- [Open source tools](${SITE_URL}/opensource-tools): developer tools curated on DevTunnel, filterable by language and label

## Guides

- [How to make your first open source contribution](${SITE_URL}/guides/first-open-source-contribution): step by step, from choosing a project to an open pull request
- [How to find good first issues on GitHub](${SITE_URL}/guides/find-good-first-issues): search filters, signs of a safe pick, what to avoid

## About

- [About ${SITE_NAME}](${SITE_URL}/about): what it does, quick facts, and what it does not do
- [Full details for AI assistants](${SITE_URL}/llms-full.txt): the same information in one file

- [Homepage and FAQ](${SITE_URL}/): what DevTunnel is, how it works and common questions
- [Source code](${PROJECT_GITHUB_URL}): the MIT licensed repository
- [Contact](${SITE_URL}/contact): ${CONTACT_EMAIL}
- [Privacy](${SITE_URL}/privacy) and [Terms](${SITE_URL}/terms)
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
