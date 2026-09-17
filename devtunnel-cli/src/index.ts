#!/usr/bin/env node
import { Command } from "commander";
import { loginCommand } from "./commands/login";
import { logoutCommand } from "./commands/logout";

const program = new Command();

program
  .name("dev")
  .description(
    "DevTunnel CLI — automates the GitHub contribution workflow.\n" +
      "Currently implemented: dev login, dev logout. More commands (dev start, dev test, dev submit) land in later modules.",
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

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});