#!/usr/bin/env node
import { Command } from "commander";
import { loginCommand } from "./commands/login";
import { logoutCommand } from "./commands/logout";
import { startCommand } from "./commands/start";
import { testCommand } from "./commands/test";

const program = new Command();

program
  .name("dev")
  .description(
    "DevTunnel CLI — automates the GitHub contribution workflow.\n" +
      "Currently implemented: dev login, dev logout, dev start, dev test. More commands (dev submit) land in later modules.",
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
  .command("start <taskId>")
  .description("Claim a DevTunnel task, fork it, and check out a working branch")
  .option("--zip", "write a zip archive of the branch instead of a working clone")
  .option("--dir <path>", "directory to clone into (defaults to the repo name)")
  .action(async (taskId: string, opts: { zip?: boolean; dir?: string }) => {
    await startCommand(taskId, opts);
  });

program
  .command("test")
  .description(
    "Pull the latest from upstream, then compile/build/test every project in the repo " +
      "(backend, frontend, etc. run concurrently)",
  )
  .option("--dir <path>", "directory to run in (defaults to the current directory)")
  .option("--skip-update", "don't fetch/rebase onto upstream first")
  .action(async (opts: { dir?: string; skipUpdate?: boolean }) => {
    await testCommand(opts);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});