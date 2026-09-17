/**
 * The `dev` CLI's command surface, as shown on the Contribute page's
 * "Submit via DevTunnel CLI" tab.
 *
 * This documents a planned workflow, not a shipped one — there's no
 * `/auth/cli/*` route and no installable `dev` binary yet. The tab says
 * so plainly (see `ContributeCliPanel`) rather than presenting these as
 * commands a contributor can run today (rule 58 — don't dress a plan up
 * as a feature).
 *
 * Kept as plain data, not JSX, for the same reason `workflow-steps.ts`
 * and `contribution-ways.ts` are: the command surface can grow by one
 * entry here without touching the component that renders it.
 *
 * `backendStatus` distinguishes a route DevTunnel would have to build
 * (`new`), one that already exists and just gets called from the CLI
 * (`reused`), and a command that never leaves the contributor's machine
 * (`none`) — `dev test` runs entirely against the repo it's in, so no
 * DevTunnel endpoint is involved at all.
 */

 export type CliBackendStatus = "new" | "reused" | "none";

 export interface CliCommand {
   id: string;
   /** The literal command, e.g. `dev start <task-or-project>`. */
   command: string;
   /** What runs on the contributor's machine. */
   local: string;
   /** What happens on the DevTunnel backend, if anything. */
   backend: string;
   backendStatus: CliBackendStatus;
 }
 
 export const CLI_COMMANDS: CliCommand[] = [
   {
     id: "login",
     command: "dev login",
     local: "Opens a loopback OAuth flow in the browser and stores the resulting token locally.",
     backend: "new — /auth/cli/*",
     backendStatus: "new",
   },
   {
     id: "logout",
     command: "dev logout",
     local: "Deletes the local token.",
     backend: "new — DELETE /auth/cli/tokens/:id",
     backendStatus: "new",
   },
   {
     id: "start",
     command: "dev start <task-or-project>",
     local:
       "Clones the fork, adds the upstream remote, checks out a branch named per the project's CONTRIBUTING.md convention, and prints a vscode:// deep link (or a --zip archive instead).",
     backend:
       "new — POST /tasks/:id/start. Forks the repository server-side using your stored GitHub token, marks the task IN_PROGRESS, and returns the fork URL.",
     backendStatus: "new",
   },
   {
     id: "test",
     command: "dev test",
     local:
       "Runs git fetch upstream, then pulls or rebases if the branch is behind. Auto-detects and runs the repo's own test/build command (npm test, pytest, cargo test, etc.).",
     backend: "None required for v1 — this command never talks to DevTunnel.",
     backendStatus: "none",
   },
   {
     id: "submit",
     command: "dev submit",
     local: "Walks through an interactive conventional-commit prompt, then pushes to the fork.",
     backend:
       "new — POST /tasks/:id/submit. Opens the pull request server-side (using the stored GitHub token), fills in the PR template, links the issue, and marks the task IN_REVIEW.",
     backendStatus: "new",
   },
 ];