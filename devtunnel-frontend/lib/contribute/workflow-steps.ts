/**
 * The fork → branch → change → commit → push → pull request flow shown on
 * the Contribute page's "How to submit" tab.
 *
 * Built per-target rather than stored flat, because half the value of
 * showing the commands at all is that they're the *real* ones for this
 * repository — `git clone https://github.com/owner/repo.git`, not
 * `git clone <url>`. The parts DevTunnel genuinely doesn't know stay as
 * visible placeholders (`<your-username>`, `<branch-name>`): guessing a
 * contributor's fork URL would produce a command that looks copyable and
 * then fails (rule 58).
 *
 * `null` is returned for a target with no repository behind it — a tool
 * whose source URL isn't a GitHub repo has no fork to make, and the tab
 * says so instead of printing git commands that can't apply.
 */

 import type { WorkflowStep } from "@/lib/contribute/types";

 export function buildWorkflowSteps({
   repositoryUrl,
   repositoryFullName,
   cloneUrl,
 }: {
   repositoryUrl: string | null;
   repositoryFullName: string | null;
   cloneUrl: string | null;
 }): WorkflowStep[] | null {
   if (!repositoryUrl || !repositoryFullName || !cloneUrl) return null;
 
   const repoName = repositoryFullName.split("/")[1] ?? repositoryFullName;
 
   return [
     {
       id: "read-first",
       title: "Read the contributing guide first",
       detail:
         "CONTRIBUTING.md and the code of conduct set the rules this project actually reviews against — commit format, branch naming, whether an issue is required before a PR. Five minutes here saves a rewrite later.",
     },
     {
       id: "claim",
       title: "Claim the work before you write it",
       detail:
         "Comment on the issue saying you're picking it up, and wait for a maintainer to confirm. This is what stops two people building the same thing, and it's where scope gets agreed.",
     },
     {
       id: "fork",
       title: "Fork, then clone your fork",
       detail:
         "You push to your own copy, never to the upstream repository. Add the original as a remote called upstream so you can pull in changes while you work.",
       commands: [
         `git clone https://github.com/<your-username>/${repoName}.git`,
         `cd ${repoName}`,
         `git remote add upstream ${cloneUrl}`,
       ],
       note: "Replace <your-username> with your GitHub username after you fork.",
     },
     {
       id: "branch",
       title: "Create a branch for the change",
       detail:
         "One branch per change, named for what it does. Keeping the default branch clean means you can start a second contribution without untangling the first.",
       commands: ["git switch -c fix/<branch-name>"],
     },
     {
       id: "build",
       title: "Set up, change, and test locally",
       detail:
         "Get the project running before you edit anything, so you can tell your change apart from a broken setup. Run the test suite and the linter before you commit — CI will run them anyway.",
     },
     {
       id: "commit",
       title: "Commit with a message that explains the change",
       detail:
         "Follow whatever convention the log already shows. Reference the issue number so the two link up automatically.",
       commands: ["git add .", 'git commit -m "fix: <what changed> (#<issue-number>)"'],
     },
     {
       id: "push",
       title: "Push and open the pull request",
       detail:
         "Describe what you changed and why, link the issue, and add screenshots for anything visual. Keep the PR focused on one thing.",
       commands: ["git push -u origin fix/<branch-name>"],
       note: `Then open the PR against ${repositoryFullName}.`,
     },
     {
       id: "review",
       title: "Respond to review until it merges",
       detail:
         "Expect changes to be requested — it's normal, not a rejection. Push follow-up commits to the same branch; the PR updates itself.",
     },
   ];
 }