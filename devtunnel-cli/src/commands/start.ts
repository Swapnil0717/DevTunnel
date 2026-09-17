import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { simpleGit } from "simple-git";
import pc from "picocolors";
import { readCredentials } from "../lib/credentials";
import { apiPost, ApiError } from "../lib/api";

interface StartTaskResponse {
  data: {
    taskId: string;
    status: "OPEN" | "IN_PROGRESS" | "DONE";
    fork: {
      fullName: string;
      cloneUrl: string;
      htmlUrl: string;
    };
    upstream: {
      fullName: string;
      cloneUrl: string;
    };
    branch: string;
    startedAt: string;
  };
}

export interface StartCommandOptions {
  /** Treat `id` as a projectId, hitting `POST /projects/:id/start` instead of `POST /tasks/:id/start`. */
  project?: boolean;
  /** Write a `git archive` zip of the checked-out branch instead of leaving a working clone on disk. */
  zip?: boolean;
  /** Directory to clone into (or to write the zip alongside). Defaults to the fork's repo name in the current directory. */
  dir?: string;
}

/**
 * `dev start <taskId>` (or `dev start <projectId> --project`) — claims a
 * DevTunnel task, or with `--project` a whole project, and gets a
 * contributor from "I want to work on this" to an open, ready-to-edit
 * local checkout in one command.
 *
 * 1. `POST /tasks/:id/start` or, with `--project`, `POST /projects/:id/start`
 *    (devtunnel-backend/src/routes/tasks.ts /
 *    devtunnel-backend/src/routes/projects.ts) — forks the target's
 *    project on the contributor's own GitHub account (server-side, using
 *    their stored OAuth token — never this CLI handling a GitHub token
 *    directly) and atomically claims the task or project, returning the
 *    fork, the upstream repo, and the branch name the backend picked per
 *    CONTRIBUTING.md's naming convention. Both endpoints return the same
 *    response shape, so everything below this point runs identically
 *    either way.
 * 2. `git clone` the fork locally with `simple-git`, add `upstream` as a
 *    second remote pointing at the original project (so `dev test`, in a
 *    later module, can `git fetch upstream` to check for updates), and
 *    check out the branch — creating it locally if this is the first
 *    `dev start` for this task/project, or just switching to it if
 *    `dev start` is being re-run (see the backend route's own
 *    idempotency notes).
 * 3. Print a `vscode://file/<path>` deep link so the contributor can
 *    jump straight into the checkout in VS Code, or (`--zip`) write a
 *    `git archive` zip of the branch instead of leaving a working clone
 *    on disk — for handing the code to an IDE/environment that wants an
 *    archive rather than a git checkout.
 */
export async function startCommand(id: string, options: StartCommandOptions): Promise<void> {
  const credentials = readCredentials();
  if (!credentials) {
    console.error(`${pc.red("✗")} Not signed in. Run ${pc.cyan("dev login")} first.`);
    process.exitCode = 1;
    return;
  }

  const kind = options.project ? "project" : "task";
  console.log(`${pc.cyan("→")} Claiming ${kind} and preparing your fork…`);

  const endpoint = options.project ? `/projects/${id}/start` : `/tasks/${id}/start`;

  let response: StartTaskResponse;
  try {
    response = await apiPost<StartTaskResponse>(endpoint, {}, { token: credentials.token });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : String(err);
    console.error(`${pc.red("✗")} Couldn't start this ${kind}: ${message}`);
    process.exitCode = 1;
    return;
  }

  const { fork, upstream, branch } = response.data;
  const repoName = fork.fullName.split("/")[1] ?? "repo";
  const targetDir = resolve(process.cwd(), options.dir ?? repoName);

  if (options.zip) {
    await writeZip({ fork, branch, targetDir });
    return;
  }

  await cloneAndCheckout({ fork, upstream, branch, targetDir });
}

async function cloneAndCheckout(args: {
  fork: StartTaskResponse["data"]["fork"];
  upstream: StartTaskResponse["data"]["upstream"];
  branch: string;
  targetDir: string;
}): Promise<void> {
  const { fork, upstream, branch, targetDir } = args;

  if (existsSync(targetDir)) {
    // Re-running `dev start` on a task already cloned locally — the
    // backend already treated this as a resume (same fork, same branch),
    // so the CLI side just makes sure the right branch is checked out
    // rather than re-cloning into an existing directory (which `git
    // clone` would refuse to do anyway).
    console.log(`${pc.yellow("!")} ${targetDir} already exists — checking out ${pc.bold(branch)} there.`);
    const git = simpleGit(targetDir);
    try {
      await git.fetch("origin");
      await git.checkout(branch).catch(() => git.checkoutLocalBranch(branch));
    } catch (err) {
      console.error(`${pc.red("✗")} Couldn't check out ${branch} in ${targetDir}: ${String(err)}`);
      process.exitCode = 1;
      return;
    }
    printSuccess(targetDir, branch);
    return;
  }

  console.log(`${pc.cyan("→")} Cloning ${pc.bold(fork.fullName)}…`);
  const git = simpleGit();
  try {
    await git.clone(fork.cloneUrl, targetDir);
    const repoGit = simpleGit(targetDir);
    await repoGit.addRemote("upstream", upstream.cloneUrl);

    // The branch may already exist on the fork (a resumed `dev start`)
    // or may need to be created fresh off whatever the clone checked out
    // by default — try switching to it first, fall back to creating it.
    await repoGit.checkout(branch).catch(() => repoGit.checkoutLocalBranch(branch));
  } catch (err) {
    console.error(`${pc.red("✗")} Clone failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  printSuccess(targetDir, branch);
}

async function writeZip(args: {
  fork: StartTaskResponse["data"]["fork"];
  branch: string;
  targetDir: string;
}): Promise<void> {
  const { fork, branch, targetDir } = args;
  const tmpClone = `${targetDir}.dev-start-tmp`;
  const zipPath = `${targetDir}.zip`;

  console.log(`${pc.cyan("→")} Preparing archive of ${pc.bold(fork.fullName)}@${branch}…`);
  try {
    await mkdir(resolve(tmpClone, ".."), { recursive: true }).catch(() => undefined);
    const git = simpleGit();
    await git.clone(fork.cloneUrl, tmpClone, ["--depth", "1", "--branch", branch]).catch(async () => {
      // Branch doesn't exist on the fork yet (first-ever `dev start` for
      // this task) — clone the default branch, then create it locally so
      // the archive still reflects the branch name the backend recorded.
      await simpleGit().clone(fork.cloneUrl, tmpClone, ["--depth", "1"]);
      await simpleGit(tmpClone).checkoutLocalBranch(branch);
    });

    const repoGit = simpleGit(tmpClone);
    await repoGit.raw(["archive", "--format=zip", "-o", zipPath, "HEAD"]);
  } catch (err) {
    console.error(`${pc.red("✗")} Couldn't create archive: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  } finally {
    // Best-effort cleanup of the throwaway clone `git archive` needed —
    // never worth failing the command over if this doesn't succeed (a
    // leftover `<dir>.dev-start-tmp` folder is harmless clutter, not a
    // correctness problem).
    await rm(tmpClone, { recursive: true, force: true }).catch(() => undefined);
  }

  console.log(`${pc.green("✓")} Archive ready: ${pc.bold(zipPath)}`);
  console.log(`  Unzip it into your IDE of choice to get started.`);
}

function printSuccess(targetDir: string, branch: string): void {
  const deepLink = `vscode://file/${targetDir}`;
  console.log(`${pc.green("✓")} Ready at ${pc.bold(targetDir)} on branch ${pc.bold(branch)}.`);
  console.log(`  Open in VS Code: ${pc.cyan(deepLink)}`);
  console.log(`  Or: ${pc.dim(`code ${targetDir}`)}`);
}