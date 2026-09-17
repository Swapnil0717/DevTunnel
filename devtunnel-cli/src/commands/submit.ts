import { resolve } from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import prompts, { type PromptObject } from "prompts";
import pc from "picocolors";
import { readCredentials } from "../lib/credentials";
import { apiPost, ApiError } from "../lib/api";

const COMMIT_TYPES = ["feat", "fix", "docs", "chore"] as const;
type CommitType = (typeof COMMIT_TYPES)[number];

export interface SubmitCommandOptions {
  /** Treat `id` as a projectId, hitting `POST /projects/:id/submit` instead of `POST /tasks/:id/submit`. */
  project?: boolean;
  /** Directory the checkout lives in. Defaults to the current working directory (what `dev start` cloned you into). */
  dir?: string;
  /** Skip the interactive commit prompt and use this as the commit description. */
  message?: string;
  /** Skip the interactive type prompt (`feat`/`fix`/`docs`/`chore`). */
  type?: string;
  /** Free-text note on how this was tested, dropped into the PR's "How Has This Been Tested?" section. */
  tested?: string;
}

interface SubmitTaskResponse {
  data: {
    taskId: string;
    status: "IN_PROGRESS" | "IN_REVIEW" | "DONE";
    pullRequest: {
      id: string;
      number: number | null;
      url: string;
      isNew: boolean;
    };
  };
}

/**
 * `dev submit <taskId>` (or `dev submit <projectId> --project`) — the
 * last leg of the loop `dev start` began and `dev test` verified: get
 * whatever's on disk into an open pull request, with as little ceremony
 * as CONTRIBUTING.md's own manual workflow (fork → branch → commit →
 * push → PR) allows.
 *
 * 1. Make sure there's actually something to submit: if the working tree
 *    has uncommitted changes, run a short interactive prompt (commit
 *    type + one-line description, mirroring CONTRIBUTING.md's own
 *    `feat: …` / `fix: …` examples) and commit everything. If it's clean,
 *    fall through to whatever's already committed on this branch.
 * 2. Work out which commits are actually new — everything on this branch
 *    that isn't on `upstream`'s default branch yet (the same `upstream`
 *    remote `dev start` added) — so the PR body's changelog reflects the
 *    real diff, not just the most recent commit. Refuses to submit an
 *    empty diff (rule: don't open a PR with nothing in it).
 * 3. `git push` the branch to `origin` (the fork).
 * 4. `POST /tasks/:id/submit`, or with `--project` `POST /projects/:id/submit`
 *    (devtunnel-backend/src/routes/tasks.ts /
 *    devtunnel-backend/src/routes/projects.ts) — opens the PR server-side,
 *    using the contributor's own stored GitHub token (never this CLI
 *    handling a GitHub token directly, same posture `dev start` already
 *    established), fills in the repo's own PR template, links the task's
 *    GitHub issue if it has one (project-level submissions have none),
 *    and marks the task/project `IN_REVIEW`.
 */
export async function submitCommand(id: string, options: SubmitCommandOptions): Promise<void> {
  const credentials = readCredentials();
  if (!credentials) {
    console.error(`${pc.red("✗")} Not signed in. Run ${pc.cyan("dev login")} first.`);
    process.exitCode = 1;
    return;
  }

  const kind = options.project ? "project" : "task";

  const rootDir = resolve(process.cwd(), options.dir ?? ".");
  const git = simpleGit(rootDir);

  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    console.error(
      `${pc.red("✗")} ${rootDir} isn't a git repository — run this from a ${pc.cyan("dev start")} checkout.`,
    );
    process.exitCode = 1;
    return;
  }

  const status = await git.status();
  const branch = status.current;
  if (!branch) {
    console.error(`${pc.red("✗")} Couldn't determine the current branch in ${rootDir}.`);
    process.exitCode = 1;
    return;
  }

  if (!status.isClean()) {
    const committed = await commitEverything(git, options);
    if (!committed) {
      console.log(`${pc.yellow("!")} Nothing committed — ${pc.cyan("dev submit")} cancelled.`);
      return;
    }
  }

  console.log(`${pc.cyan("→")} Checking what's new on ${pc.bold(branch)}…`);
  const commits = await resolveNewCommits(git, branch);
  if (commits.length === 0) {
    console.log(
      `${pc.yellow("!")} No commits ahead of upstream's default branch — nothing to submit yet.`,
    );
    return;
  }

  const title = commits[0]!;
  const type = detectCommitType(title, options.type);

  console.log(`${pc.cyan("→")} Pushing ${pc.bold(branch)} to your fork…`);
  try {
    await git.push(["-u", "origin", branch]);
  } catch (err) {
    console.error(`${pc.red("✗")} Push failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  console.log(`${pc.cyan("→")} Opening the pull request…`);
  const endpoint = options.project ? `/projects/${id}/submit` : `/tasks/${id}/submit`;
  let response: SubmitTaskResponse;
  try {
    response = await apiPost<SubmitTaskResponse>(
      endpoint,
      {
        branch,
        title,
        type,
        commits: [...commits].reverse(), // oldest first, for a changelog that reads top-to-bottom
        testedNote: options.tested,
      },
      { token: credentials.token },
    );
  } catch (err) {
    const message = err instanceof ApiError ? err.message : String(err);
    console.error(`${pc.red("✗")} Couldn't submit this ${kind}: ${message}`);
    process.exitCode = 1;
    return;
  }

  const { pullRequest } = response.data;
  console.log(
    `${pc.green("✓")} Pull request ${pullRequest.isNew ? "opened" : "updated"}: ${pc.bold(pullRequest.url)}`,
  );
  console.log(`  A CLA bot will prompt you to sign it if this is your first PR here.`);
}

/**
 * Runs the interactive commit prompt and commits every change in the
 * working tree. Returns `false` (without committing anything) if the
 * contributor cancels (Ctrl-C) or leaves the description empty.
 */
async function commitEverything(git: SimpleGit, options: SubmitCommandOptions): Promise<boolean> {
  let type = COMMIT_TYPES.find((value) => value === options.type);
  let description = options.message?.trim();
  let cancelled = false;

  const questions: PromptObject[] = [];
  if (!type) {
    questions.push({
      type: "select",
      name: "type",
      message: "What kind of change is this?",
      choices: COMMIT_TYPES.map((value) => ({ title: value, value })),
    });
  }
  if (!description) {
    questions.push({
      type: "text",
      name: "description",
      message: "Short description (used as the commit + PR title):",
      validate: (value: string) => (value.trim().length > 0 ? true : "Required"),
    });
  }

  if (questions.length > 0) {
    const answers = await prompts(questions, { onCancel: () => (cancelled = true) });
    if (cancelled) return false;
    type = type ?? (answers.type as CommitType);
    description = description ?? (answers.description as string | undefined)?.trim();
  }

  if (!type || !description) return false;

  const subject = `${type}: ${description}`;
  console.log(`${pc.cyan("→")} Committing everything as ${pc.bold(subject)}…`);
  await git.add(["-A"]);
  await git.commit(subject);
  return true;
}

/**
 * Finds every commit on this branch that isn't on `upstream`'s default
 * branch yet — the same "how far ahead are we" question `dev test`
 * already answers for itself (src/commands/test.ts's
 * `pullFromUpstreamIfBehind`), computed independently here since
 * `dev submit` needs the actual list of subjects, not just a count.
 * Falls back to the last 20 commits on `HEAD` if there's no `upstream`
 * remote, or its default branch can't be determined — still useful
 * signal for the PR body, just not a guaranteed-exact diff.
 */
async function resolveNewCommits(git: SimpleGit, branch: string): Promise<string[]> {
  const remotes = await git.getRemotes().catch(() => []);
  if (remotes.some((r) => r.name === "upstream")) {
    await git.fetch("upstream").catch(() => undefined);

    const symref = await git.raw(["ls-remote", "--symref", "upstream", "HEAD"]).catch(() => null);
    const defaultBranch = symref?.match(/ref:\s*refs\/heads\/(\S+)\s+HEAD/)?.[1] ?? null;

    if (defaultBranch) {
      const log = await git
        .raw(["log", "--pretty=%s", `upstream/${defaultBranch}..${branch}`])
        .catch(() => null);
      if (log !== null) {
        return log.split("\n").map((line) => line.trim()).filter(Boolean);
      }
    }
  }

  const fallback = await git.raw(["log", "--pretty=%s", "-n", "20"]).catch(() => "");
  return fallback.split("\n").map((line) => line.trim()).filter(Boolean);
}

/** Reads a conventional-commit type off the front of a subject line (`feat: …`), falling back to an explicit `--type` or `chore`. */
function detectCommitType(subject: string, explicit?: string): CommitType {
  const fromExplicit = COMMIT_TYPES.find((value) => value === explicit);
  if (fromExplicit) return fromExplicit;

  const match = subject.match(/^(feat|fix|docs|chore)(\(.+\))?:/);
  const found = match?.[1] as CommitType | undefined;
  return found ?? "chore";
}