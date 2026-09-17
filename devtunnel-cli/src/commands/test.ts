import { resolve } from "node:path";
import { simpleGit } from "simple-git";
import pc from "picocolors";
import { detectProjects } from "../lib/testRunners";
import { runAllProjects, type StepResult } from "../lib/processRunner";

export interface TestCommandOptions {
  /** Directory to run in. Defaults to the current working directory (what `dev start` cloned you into). */
  dir?: string;
  /** Skip the "pull the latest from upstream" step entirely. */
  skipUpdate?: boolean;
}

/**
 * `dev test` — the second half of the loop `dev start` began: make sure
 * the checkout is current, then compile/build/test it exactly the way
 * the repo owner set it up, without the contributor having to remember
 * which of `npm test`, `pytest`, `cargo test`, etc. this particular
 * project uses.
 *
 * 1. If `upstream` (the remote `dev start` added — see
 *    devtunnel-cli/src/commands/start.ts) is behind, fetch and rebase
 *    onto it, so tests run against the current state of the project, not
 *    a stale fork. Skipped quietly (not an error) when there's no
 *    `upstream` remote at all — this directory wasn't necessarily set up
 *    by `dev start`, and `dev test` should still be useful standalone.
 * 2. Detect every testable/buildable package under the repo root — a
 *    single-package repo is one project; a monorepo with e.g.
 *    `backend/` and `frontend/` folders is several (see
 *    `lib/testRunners.ts`'s own doc comment for the detection rules).
 * 3. Run every detected project's install → typecheck → test → build
 *    pipeline, with different projects running concurrently (`backend`
 *    and `frontend` "at the same time", as asked for) and each
 *    project's own steps running in order.
 * 4. Print a pass/fail summary and exit non-zero if anything failed —
 *    `dev submit` (a later module) can then refuse to open a PR on a
 *    failing `dev test`.
 */
export async function testCommand(options: TestCommandOptions): Promise<void> {
  const rootDir = resolve(process.cwd(), options.dir ?? ".");

  if (!options.skipUpdate) {
    await pullFromUpstreamIfBehind(rootDir);
  }

  console.log(`${pc.cyan("→")} Looking for test/build targets in ${pc.bold(rootDir)}…`);
  const projects = detectProjects(rootDir);

  if (projects.length === 0) {
    console.log(
      `${pc.yellow("!")} Couldn't find anything to test or build here — no package.json, ` +
        `pyproject.toml/requirements.txt, Cargo.toml, go.mod, Gemfile, or pom.xml/build.gradle found.`,
    );
    return;
  }

  console.log(
    `${pc.cyan("→")} Found ${pc.bold(String(projects.length))} project${projects.length === 1 ? "" : "s"}: ` +
      `${projects.map((p) => pc.bold(p.name)).join(", ")} — running concurrently…\n`,
  );

  const resultsByProject = await runAllProjects(projects);
  printSummary(projects.map((p) => p.name), resultsByProject);

  const anyFailed = resultsByProject.some((steps) => steps.some((s) => !s.success));
  if (anyFailed) process.exitCode = 1;
}

/**
 * Fetches `upstream` and, if the current branch is behind its default
 * branch, rebases onto it. Never fails `dev test` outright over a git
 * problem — a fetch failure (offline, remote renamed) or a rebase
 * conflict is reported and the command falls through to running
 * tests/build against whatever is already checked out, since that's
 * still useful signal even if it isn't perfectly current. A rebase
 * conflict is automatically aborted (`git rebase --abort`) rather than
 * left half-finished, so the working tree is never left in a broken
 * state the contributor didn't ask for.
 */
async function pullFromUpstreamIfBehind(rootDir: string): Promise<void> {
  const git = simpleGit(rootDir);

  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) return;

  const remotes = await git.getRemotes().catch(() => []);
  if (!remotes.some((r) => r.name === "upstream")) {
    return; // Not a `dev start` checkout (or upstream was removed) — nothing to update against.
  }

  console.log(`${pc.cyan("→")} Checking upstream for updates…`);
  try {
    await git.fetch("upstream");
  } catch (err) {
    console.log(`${pc.yellow("!")} Couldn't reach upstream — skipping update check: ${String(err)}`);
    return;
  }

  let defaultBranch: string | null = null;
  try {
    const symref = await git.raw(["ls-remote", "--symref", "upstream", "HEAD"]);
    const match = symref.match(/ref:\s*refs\/heads\/(\S+)\s+HEAD/);
    defaultBranch = match?.[1] ?? null;
  } catch {
    defaultBranch = null;
  }
  if (!defaultBranch) {
    console.log(`${pc.yellow("!")} Couldn't determine upstream's default branch — skipping update check.`);
    return;
  }

  const behindCountRaw = await git
    .raw(["rev-list", "--count", `HEAD..upstream/${defaultBranch}`])
    .catch(() => null);
  const behindCount = behindCountRaw ? Number.parseInt(behindCountRaw.trim(), 10) : 0;

  if (!behindCount) {
    console.log(`${pc.green("✓")} Already up to date with upstream/${defaultBranch}.`);
    return;
  }

  console.log(
    `${pc.cyan("→")} ${behindCount} commit${behindCount === 1 ? "" : "s"} behind upstream/${defaultBranch} — rebasing…`,
  );
  try {
    await git.raw(["rebase", `upstream/${defaultBranch}`]);
    console.log(`${pc.green("✓")} Rebased onto upstream/${defaultBranch}.`);
  } catch (err) {
    await git.raw(["rebase", "--abort"]).catch(() => undefined);
    console.log(
      `${pc.yellow("!")} Rebase hit a conflict and was aborted — resolve it manually ` +
        `(${pc.dim(`git rebase upstream/${defaultBranch}`)}), then re-run ${pc.cyan("dev test")}. ` +
        `Continuing with tests against your current branch for now.`,
    );
    void err;
  }
}

function printSummary(projectNames: string[], resultsByProject: StepResult[][]): void {
  console.log(`\n${pc.bold("Summary")}`);
  for (let i = 0; i < projectNames.length; i++) {
    const name = projectNames[i]!;
    const steps = resultsByProject[i]!;
    const failed = steps.find((s) => !s.success);

    if (failed) {
      console.log(`  ${pc.red("✗")} ${pc.bold(name)} — ${failed.label} failed (${failed.command})`);
      if (failed.errorTail) {
        for (const line of failed.errorTail.split("\n").slice(-10)) {
          console.log(`      ${pc.dim(line)}`);
        }
      }
    } else {
      const labels = steps.map((s) => s.label).join(", ");
      console.log(`  ${pc.green("✓")} ${pc.bold(name)} — ${labels || "nothing to run"} passed`);
    }
  }

  const anyFailed = resultsByProject.some((steps) => steps.some((s) => !s.success));
  console.log(
    anyFailed
      ? `\n${pc.red("✗")} One or more projects failed.`
      : `\n${pc.green("✓")} Everything passed.`,
  );
}