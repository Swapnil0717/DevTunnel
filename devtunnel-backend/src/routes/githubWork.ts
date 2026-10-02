import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { getValidGithubAccessToken } from "../db/githubTokens";
import { findExistingFork, forkRepositoryForUser, GitHubForkError } from "../lib/githubFork";
import { fetchRepositoryIssue, GitHubRepoError } from "../lib/githubRepo";
import {
  createPullRequest,
  fetchDefaultBranch,
  findOpenPullRequest,
  GitHubPullRequestError,
} from "../lib/githubPullRequest";
import { COMMIT_TYPE_VALUES } from "./tasks";
import { buildExternalPullRequestBody, fetchPullRequestTemplate } from "../lib/githubPrBody";
import { recordExternalStart, recordExternalSubmit } from "../db/externalContributions";

/**
 * `dev start` / `dev submit` for ANY public GitHub repository and issue —
 * not just ones onboarded into DevTunnel.
 *
 *   POST /github/start   { repo: "owner/name", issue?: 123 }
 *   POST /github/submit  { repo, issue?, branch, title, type, commits, testedNote? }
 *
 * These are the siblings of `POST /tasks/:id/start` and
 * `POST /tasks/:id/submit` (src/routes/tasks.ts). Those need a DevTunnel
 * task row (claim, assignee, status). A random GitHub repo has none, so
 * nothing is claimed; GitHub itself is the source of truth for the work.
 *   - start  = fork (or reuse the user's existing fork) + pick a branch name.
 *   - submit = open (or find) the PR from that fork's branch to upstream,
 *              using the repo's OWN pull request template when it has one
 *              (src/lib/githubPrBody.ts).
 *
 * Both record a row in `devtunnel.external_contributions` (sql/046,
 * src/db/externalContributions.ts) so the work counts as a DevTunnel
 * contribution: `start` is intent only; `submit` writes a
 * PULL_REQUEST_SUBMITTED activity row; the merge is picked up later by
 * lib/prSync.ts. A failure to record never fails the request — the fork and
 * the PR on GitHub are what the contributor asked for.
 *
 * Everything runs with the contributor's own stored OAuth token
 * (`public_repo` scope — see GITHUB_OAUTH_SCOPES in src/lib/github.ts), so
 * it works on any public repo without DevTunnel being installed on it.
 * Private repositories are out of scope for that token and answer 404.
 *
 * Safety: `submit` never trusts the client about which fork to use. It
 * asks GitHub for the caller's own fork of `repo` (`findExistingFork`,
 * which also checks the repo really is a fork of it) and uses that.
 */
export const githubWork = new Hono<{ Bindings: Env; Variables: Variables }>();

const repoSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/, "repo must look like owner/name");

const startBodySchema = z.object({
  repo: repoSchema,
  issue: z.number().int().positive().max(100_000_000).optional(),
});

const submitBodySchema = z.object({
  repo: repoSchema,
  issue: z.number().int().positive().max(100_000_000).optional(),
  branch: z.string().trim().min(1).max(250),
  title: z.string().trim().min(1).max(200),
  type: z.enum(COMMIT_TYPE_VALUES),
  commits: z.array(z.string().trim().min(1).max(300)).min(1).max(30),
  testedNote: z.string().trim().max(500).optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

/** Same four prefixes as CONTRIBUTING.md; picked from the issue's labels, defaulting to `feature`. */
function branchPrefix(labels: string[]): "feature" | "fix" | "docs" {
  const joined = labels.join(" ").toLowerCase();
  if (/\bbug\b|\bfix\b/.test(joined)) return "fix";
  if (/\bdoc/.test(joined)) return "docs";
  return "feature";
}

githubWork.post("/github/start", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) return errorResponse(c, 401, "unauthenticated", "Sign-in required");

  const body = startBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return errorResponse(c, 400, "invalid_body", body.error.issues[0]?.message ?? "Invalid request");
  }
  const { repo: fullName, issue } = body.data;
  const [owner, repo] = fullName.split("/") as [string, string];

  const withinLimit = await checkRateLimit(c, { bucket: "github-work-start", limit: 10, windowSeconds: 60 });
  if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");

  try {
    const supabase = getSupabase(env);
    const accessToken = await getValidGithubAccessToken(supabase, env, user.id);
    if (!accessToken) {
      return errorResponse(c, 403, "github_reauth_required", "Reconnect your GitHub account (run `dev login`)");
    }

    let branch: string;
    let issueTitle: string | null = null;
    if (issue !== undefined) {
      const found = await fetchRepositoryIssue(accessToken, owner, repo, issue);
      if (!found) {
        return errorResponse(c, 404, "issue_not_found", `Issue #${issue} doesn't exist in ${fullName}`);
      }
      if (found.state !== "OPEN") {
        return errorResponse(c, 409, "issue_not_open", `Issue #${issue} in ${fullName} isn't open`);
      }
      issueTitle = found.title;
      branch = `${branchPrefix(found.labels)}/${issue}-${slugify(found.title) || "work"}`;
    } else {
      branch = `feature/devtunnel-${Date.now().toString(36)}`;
    }

    const fork =
      (await findExistingFork(accessToken, owner, repo)) ??
      (await forkRepositoryForUser(accessToken, owner, repo));

    // Lets `dev start` branch from upstream's CURRENT default branch instead
    // of whatever a possibly stale fork has. Best-effort: the CLI works it
    // out itself from the `upstream` remote when this is missing.
    const upstreamDefaultBranch = await fetchDefaultBranch(accessToken, owner, repo).catch(() => null);

    await recordExternalStart(supabase, {
      userId: user.id,
      repositoryFullName: fullName,
      issueNumber: issue ?? null,
      issueTitle,
      forkFullName: fork.fullName,
      branch,
    }).catch((err) =>
      logger.error("external_contribution_start_record_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      }),
    );

    return c.json(
      {
        data: {
          taskId: null,
          status: "IN_PROGRESS",
          fork: { fullName: fork.fullName, cloneUrl: fork.cloneUrl, htmlUrl: fork.htmlUrl },
          upstream: { fullName, cloneUrl: `https://github.com/${fullName}.git`, defaultBranch: upstreamDefaultBranch },
          branch,
          issueNumber: issue ?? null,
          issueTitle,
          startedAt: new Date().toISOString(),
        },
      },
      200,
    );
  } catch (err) {
    if (err instanceof GitHubForkError || err instanceof GitHubRepoError) {
      const status = err.reason === "rate_limited" ? 429 : err.reason === "unauthorized" ? 403 : err.reason === "not_found" ? 404 : 502;
      return errorResponse(c, status, `github_${err.reason}`, err.message);
    }
    logger.error("github_work_start_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't start this right now");
  }
});

githubWork.post("/github/submit", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) return errorResponse(c, 401, "unauthenticated", "Sign-in required");

  const body = submitBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return errorResponse(c, 400, "invalid_body", body.error.issues[0]?.message ?? "Invalid submit request");
  }
  const { repo: fullName, issue, branch, title, type, commits, testedNote } = body.data;
  const [upstreamOwner, upstreamRepo] = fullName.split("/") as [string, string];

  const withinLimit = await checkRateLimit(c, { bucket: "github-work-submit", limit: 10, windowSeconds: 60 });
  if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");

  try {
    const supabase = getSupabase(env);
    const accessToken = await getValidGithubAccessToken(supabase, env, user.id);
    if (!accessToken) {
      return errorResponse(c, 403, "github_reauth_required", "Reconnect your GitHub account (run `dev login`)");
    }

    const fork = await findExistingFork(accessToken, upstreamOwner, upstreamRepo);
    if (!fork) {
      return errorResponse(c, 409, "fork_not_found", `You have no fork of ${fullName} — run \`dev start\` first`);
    }
    const [forkOwner] = fork.fullName.split("/");
    if (!forkOwner) return errorResponse(c, 422, "invalid_fork", "Malformed fork reference");

    const baseBranch = await fetchDefaultBranch(accessToken, upstreamOwner, upstreamRepo);
    const existing = await findOpenPullRequest(accessToken, upstreamOwner, upstreamRepo, forkOwner, branch);

    // Only needed when a new PR is opened; an existing PR keeps its body.
    const template = existing ? null : await fetchPullRequestTemplate(accessToken, upstreamOwner, upstreamRepo);

    const pr =
      existing ??
      (
        await createPullRequest(accessToken, {
          baseOwner: upstreamOwner,
          baseRepo: upstreamRepo,
          baseBranch,
          headOwner: forkOwner,
          headBranch: branch,
          title,
          body: buildExternalPullRequestBody({
            type,
            commits,
            testedNote: testedNote ?? null,
            issueNumber: issue ?? null,
            template,
          }),
        })
      ).pr;

    await recordExternalSubmit(supabase, {
      userId: user.id,
      repositoryFullName: fullName,
      issueNumber: issue ?? null,
      forkFullName: fork.fullName,
      branch,
      prUrl: pr.htmlUrl,
      prNumber: pr.number,
      prTitle: title,
    }).catch((err) =>
      logger.error("external_contribution_submit_record_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      }),
    );

    return c.json(
      {
        data: {
          taskId: null,
          status: "IN_REVIEW",
          pullRequest: { id: null, number: pr.number, url: pr.htmlUrl, isNew: !existing },
        },
      },
      200,
    );
  } catch (err) {
    if (err instanceof GitHubPullRequestError || err instanceof GitHubForkError) {
      const status =
        err.reason === "rate_limited" ? 429
        : err.reason === "unauthorized" ? 403
        : err.reason === "not_found" ? 404
        : err.reason === "validation" ? 422
        : 502;
      return errorResponse(c, status, `github_${err.reason}`, err.message);
    }
    logger.error("github_work_submit_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't submit this right now");
  }
});
