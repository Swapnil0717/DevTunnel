#!/usr/bin/env node
import { Command } from "commander";
import { loginCommand } from "./commands/login";
import { logoutCommand } from "./commands/logout";
import { startCommand } from "./commands/start";
import { testCommand } from "./commands/test";
import { submitCommand } from "./commands/submit";

const program = new Command();

program
  .name("dev")
  .description(
    "DevTunnel CLI — automates the GitHub contribution workflow.\n" +
      "Implemented: dev login, dev logout, dev start, dev test, dev submit.\n" +
      "`dev start` and `dev submit` work on ANY public GitHub repo: `dev start owner/repo#123`, `dev submit`.\n" +
      "They also accept a DevTunnel task id, or --project for a whole DevTunnel project.",
  )
  .version("0.1.0");

program
  .command("login")
  .description("Sign in with GitHub (opens your browser)")
  .action(async () => {
    await loginCommand();
  });

program
  .command("logout")
  .description("Sign out and remove the local credentials")
  .action(async () => {
    await logoutCommand();
  });

program
  .command("start <id>")
  .description("Fork a GitHub repo (owner/repo, owner/repo#123, or a github.com URL) or claim a DevTunnel task/project, and check out a working branch")
  .option("--project", "treat <id> as a projectId instead of a taskId")
  .option("--zip", "write a zip archive of the branch instead of a working clone")
  .option("--dir <path>", "directory to clone into (defaults to the repo name)")
  .action(async (id: string, opts: { project?: boolean; zip?: boolean; dir?: string }) => {
    await startCommand(id, opts);
  });

program
  .command("test")
  .description(
    "Pull the latest from upstream, then run the repo's own CI commands (.github/workflows) or, failing that, compile/build/test every project in it " +
      "(backend, frontend, etc. run concurrently)",
  )
  .option("--dir <path>", "directory to run in (defaults to the current directory)")
  .option("--skip-update", "don't fetch/rebase onto upstream first")
  .option("--no-ci", "ignore the repo's .github/workflows and auto-detect what to run instead")
  .action(async (opts: { dir?: string; skipUpdate?: boolean; ci?: boolean }) => {
    await testCommand(opts);
  });

program
  .command("submit [id]")
  .description("Commit, push, and open (or update) the pull request. With no argument it uses this checkout's upstream repo and issue.")
  .option("--project", "treat <id> as a projectId instead of a taskId")
  .option("--dir <path>", "directory to run in (defaults to the current directory)")
  .option("-m, --message <text>", "commit description (skips the interactive prompt)")
  .option("--type <type>", "commit type: feat, fix, docs, or chore (skips the interactive prompt)")
  .option("--tested <note>", "how you tested this — included in the PR body")
  .action(
    async (
      id: string | undefined,
      opts: { project?: boolean; dir?: string; message?: string; type?: string; tested?: string },
    ) => {
      await submitCommand(id, opts);
    },
  );

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});