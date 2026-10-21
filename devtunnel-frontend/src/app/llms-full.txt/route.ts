import {
  CONTACT_EMAIL,
  OPERATOR_NAME,
  PROJECT_GITHUB_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/lib/config";
import { LANDING_FAQ } from "@/lib/landing-faq";

// Plain text, built once at deploy time.
export const dynamic = "force-static";

/**
 * `/llms-full.txt` — everything an AI assistant needs to describe DevTunnel
 * accurately, in one file: what it is, how it works, the exact commands, the
 * limits, and the same FAQ the homepage shows (`lib/landing-faq.ts`). Facts
 * only; keep it in step with the About page and the homepage.
 */
export function GET() {
  const faq = LANDING_FAQ.map((item) => `### ${item.question}\n\n${item.answer.replace(/`/g, "")}`).join("\n\n");

  const body = `# ${SITE_NAME}: full details

> ${SITE_DESCRIPTION}

## What it is

${SITE_NAME} is a free, open source (MIT) platform for people who want to contribute to open source software. It has two parts: a public catalog of projects, tasks and tools, and a command line tool called \`dev\` that automates the GitHub contribution workflow. Site: ${SITE_URL}. Source code: ${PROJECT_GITHUB_URL}.

## Who it is for

Developers looking for a first open source contribution, and anyone who wants open source tasks that fit their skills. Roles covered include frontend, backend, full stack, documentation, testing and DevOps. Task levels are beginner, intermediate and advanced.

## How it works

1. Browse tasks at ${SITE_URL}/tasks. Each task lists a role, a level and a tech stack, and can be filtered by them. Browsing needs no account.
2. Install the CLI: \`npm install -g @devtunnelcli/cli\` (Node.js 18.18 or newer), or run commands with \`npx @devtunnelcli/cli\`.
3. \`dev login\` signs in with GitHub and stores the token locally.
4. \`dev start owner/repo#123\` forks, clones and checks out a branch for any public GitHub issue. For a DevTunnel task use \`dev start <task-id>\`; for a whole project use \`dev start <project-id> --project\`.
5. \`dev test\` pulls the latest changes and runs the project's own tests.
6. \`dev submit\` commits, pushes and opens the pull request, using the repository's PR template if it has one. For a task use \`dev submit <task-id>\`.

Pull requests are opened with the contributor's own GitHub token. ${SITE_NAME} cannot merge into any repository; merge authority stays with the repository owner. AI help for explaining tasks is available and always labeled as AI.

## Facts

- Cost: the core platform is free. Paid tasks and premium infrastructure are on the roadmap and not available yet.
- License: MIT.
- Status: Phase 1, building and validating the idea. The catalog is still growing.
- Operator: ${OPERATOR_NAME}, India. Contact: ${CONTACT_EMAIL}.

## Pages

- ${SITE_URL}/ : homepage and FAQ
- ${SITE_URL}/about : about ${SITE_NAME}
- ${SITE_URL}/tasks : open source tasks and good first issues
- ${SITE_URL}/projects : open source projects
- ${SITE_URL}/opensource-tools : open source developer tools
- ${SITE_URL}/guides/first-open-source-contribution : guide to a first contribution
- ${SITE_URL}/guides/find-good-first-issues : guide to finding good first issues

## FAQ

${faq}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
