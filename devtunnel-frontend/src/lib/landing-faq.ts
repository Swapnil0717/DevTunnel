/**
 * The homepage FAQ, written once. `components/landing-page/faq.tsx` renders
 * it and `lib/structured-data.ts` turns the same list into FAQPage JSON-LD,
 * so the markup can never claim an answer the page doesn't show
 * (Frontend_Development_Rules.txt rule 14).
 *
 * Answers are plain text. Wrap a command or package name in `backticks` to
 * show it as code on the page; the backticks are dropped in the structured
 * data.
 *
 * Several questions are phrased the way people search ("how do I find open
 * source issues", "how do I make my first contribution"). Keep every answer
 * true to what the product does today.
 */

export interface LandingFaqItem {
  question: string;
  answer: string;
}

export const LANDING_FAQ: readonly LandingFaqItem[] = [
  {
    question: "What is DevTunnel?",
    answer:
      "A platform that connects contributors with open source projects. Contributors find tasks that match their skills, then use the `dev` CLI to start the work and open the pull request.",
  },
  {
    question: "How do I find open source issues to work on?",
    answer:
      "Browse DevTunnel tasks and filter them by role, difficulty, tech stack and project, or start from any public GitHub issue. Each task comes with a role, a level and a tech stack, so you can tell whether you can do it before you start.",
  },
  {
    question: "How do I make my first open source contribution?",
    answer:
      "Pick a task, or any public GitHub issue, that fits your level. Run `dev start owner/repo#123` to set up the work, make the change, check it with `dev test`, then run `dev submit` to open the pull request with your own GitHub token.",
  },
  {
    question: "What is the dev CLI?",
    answer:
      "A command line tool that automates the GitHub contribution workflow: `dev login`, `dev start`, `dev test` and `dev submit`. Install it with `npm install -g @devtunnelcli/cli`, or prefix commands with `npx @devtunnelcli/cli`.",
  },
  {
    question: "Do I need a DevTunnel task to contribute?",
    answer:
      "No. `dev start owner/repo#123` works on any public GitHub issue, and the work still counts as a DevTunnel contribution.",
  },
  {
    question: "Do I need an account to browse?",
    answer:
      "No. Projects, tasks, tools and issues are public. Sign in with GitHub when you want to start work or use the AI help.",
  },
  {
    question: "Can DevTunnel merge my pull request?",
    answer:
      "No. DevTunnel can’t merge into any repository. Pull requests are opened with your own GitHub token, and merge authority stays with the repository owner.",
  },
  {
    question: "Is DevTunnel open source?",
    answer:
      "Yes. DevTunnel is released under the MIT License. You can read the code and submit pull requests on GitHub.",
  },
  {
    question: "What does it cost?",
    answer:
      "The core platform is free. Paid tasks and premium infrastructure are on the roadmap and are not available yet.",
  },
  {
    question: "Is DevTunnel new?",
    answer:
      "Yes. It is in Phase 1, building and validating the idea, and the catalog of projects, tasks and tools is still growing.",
  },
];
