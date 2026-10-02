import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import pc from "picocolors";
import { readCredentials } from "../lib/credentials";
import { apiPost, ApiError } from "../lib/api";
import { parseTarget } from "../lib/repoRef";

interface StartTaskResponse {
  data: {
    taskId: string | null;
    status: "OPEN" | "IN_PROGRESS" | "DONE";
    fork: {
      fullName: string;
      cloneUrl: string;
      htmlUrl: string;
    };
    upstream: {
      fullName: string;
      cloneUrl: string;
      /** Only sent by `POST /github/start`; otherwise worked out from the `upstream` remote. */
      defaultBranch?: string | null;
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

  const target = parseTarget(id);
  if (!target) {
    console.error(
      `${pc.red("✗")} Couldn't understand "${id}". Use a DevTunnel task id, or a GitHub repo like ` +
        `${pc.cyan("owner/repo")}, ${pc.cyan("owner/repo#123")} or a github.com URL.`,
    );
    process.exitCode = 1;
    return;
  }

  // Any GitHub repo / issue -> the stateless backend route; a UUID -> the
  // original DevTunnel task/project route (unchanged).
  const kind = target.kind === "github" ? "repository" : options.project ? "project" : "task";
  console.log(`${pc.cyan("→")} ${target.kind === "github" ? "Preparing your fork…" : `Claiming ${kind} and preparing your fork…`}`);

  const endpoint =
    target.kind === "github"
      ? "/github/start"
      : options.project
        ? `/projects/${target.id}/start`
        : `/tasks/${target.id}/start`;
  const requestBody =
    target.kind === "github" ? { repo: target.repo, ...(target.issue ? { issue: target.issue } : {}) } : {};

  let response: StartTaskResponse;
  try {
    response = await apiPost<StartTaskResponse>(endpoint, requestBody, { token: credentials.token });
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
      await checkoutBranch(git, branch, upstream.defaultBranch ?? null);
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

    // The branch may already exist on the fork (a resumed `dev start`).
    // If not, it is created from upstream's CURRENT default branch rather
    // than from the fork's default branch, which can be months behind.
    await checkoutBranch(repoGit, branch, upstream.defaultBranch ?? null);
  } catch (err) {
    console.error(`${pc.red("✗")} Clone failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  printSuccess(targetDir, branch);
}

/**
 * Puts `branch` in place in `git`'s working tree:
 *  1. it exists locally            -> switch to it;
 *  2. it exists on the fork        -> check it out tracking `origin/<branch>`;
 *  3. it is new                    -> create it from `upstream/<default>`,
 *                                     so the work starts on top of the
 *                                     project's latest code, not a stale fork.
 * Falls back to branching from the current HEAD when there is no `upstream`
 * remote or its default branch can't be determined (DevTunnel tasks, which
 * `dev start` has always handled this way).
 */
async function checkoutBranch(git: SimpleGit, branch: string, knownDefault: string | null): Promise<void> {
  const local = await git.branchLocal();
  if (local.all.includes(branch)) {
    await git.checkout(branch);
    return;
  }

  const remoteBranches = await git.raw(["ls-remote", "--heads", "origin", branch]).catch(() => "");
  if (remoteBranches.trim()) {
    await git.fetch("origin", branch).catch(() => undefined);
    await git.checkout(["-b", branch, "--track", `origin/${branch}`]);
    return;
  }

  const remotes = await git.getRemotes().catch(() => []);
  if (remotes.some((r) => r.name === "upstream")) {
    const base = knownDefault ?? (await upstreamDefaultBranch(git));
    if (base) {
      try {
        await git.fetch("upstream", base);
        await git.checkout(["-b", branch, "--no-track", `upstream/${base}`]);
        console.log(`${pc.green("✓")} Branch ${pc.bold(branch)} created from ${pc.bold(`upstream/${base}`)}.`);
        return;
      } catch {
        console.log(`${pc.yellow("!")} Couldn't branch from upstream/${base} — using your fork's current code instead.`);
      }
    }
  }

  await git.checkoutLocalBranch(branch);
}

async function upstreamDefaultBranch(git: SimpleGit): Promise<string | null> {
  const symref = await git.raw(["ls-remote", "--symref", "upstream", "HEAD"]).catch(() => null);
  return symref?.match(/ref:\s*refs\/heads\/(\S+)\s+HEAD/)?.[1] ?? null;
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