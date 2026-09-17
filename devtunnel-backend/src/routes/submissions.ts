import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import {
  getSubmissionBySlug,
  listSubmissions,
  markViewerUpvotes,
  removeSubmissionUpvote,
  upvoteSubmission,
  type SubmissionCategory,
  type SubmissionSort,
} from "../db/submissions";
import {
  completeSubmissionDraft,
  getSubmissionDraft,
  saveSubmissionDraftDetails,
  saveSubmissionDraftSource,
} from "../db/submissionDrafts";
import {
  fetchRepositoryLanguages,
  fetchRepositoryMetadata,
  fetchRepositoryReadme,
  parseGithubRepoUrl,
  GitHubRepoError,
} from "../lib/githubRepo";
import { detectTechStack } from "../lib/techStack";

/**
 * Contributor — **Community submissions** (`/submissions` in
 * devtunnel-frontend, "Community" in `AppSidebar`).
 *
 * Mounted on the app root in src/index.ts (`app.route("/", submissions)`),
 * same convention as `/projects` and `/tasks`.
 *
 * ROUTE ORDER: `/submissions/draft/...` is declared before
 * `/submissions/:slug/...` so "draft" is never swallowed as a slug — the
 * same ordering rule src/routes/projects.ts documents for
 * `/projects/available`.
 *
 * ---------------------------------------------------------------------
 * WHAT THIS IS, AND WHAT IT ISN'T
 *
 * Every other catalog in this backend is curated: an admin onboards a
 * project or a tool, and DevTunnel stands behind the result. This one is
 * not. A contributor pastes a GitHub URL and it appears, with their name
 * on it. That difference is carried in the schema (a separate table,
 * sql/028) and in the payload (`submittedBy` on every row), so nothing
 * downstream can mistake a submission for something DevTunnel vetted.
 *
 * It also means the wizard collects less than admin onboarding does.
 * There's no setup guide, no maintainer resolution and no task
 * onboarding here — three steps, and the first one is a URL.
 * ---------------------------------------------------------------------
 */
export const submissions = new Hono<{ Bindings: Env; Variables: Variables }>();

const SORTS: SubmissionSort[] = ["new", "trending", "popular"];
const CATEGORIES: SubmissionCategory[] = ["ALL", "PROJECT", "TOOL", "PAID_ALTERNATIVE"];

/**
 * Bounds on the two writable steps.
 *
 * Every limit here is a real ceiling on stored size, not a style rule
 * (rule 67): a 2,000-character custom description is already far longer
 * than anything a card can show, and twelve tech tags is more than any
 * repository legitimately needs to be findable.
 */
const detailsSchema = z
  .object({
    descriptionSource: z.enum(["EXISTING", "CUSTOM"]),
    customDescription: z.string().trim().max(2_000).nullable().optional(),
    techStack: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
    isPaidAlternative: z.boolean(),
    alternativeTo: z.array(z.string().trim().min(1).max(60)).max(5).default([]),
  })
  .superRefine((value, ctx) => {
    // Choosing CUSTOM without writing anything would publish a row whose
    // stated description source doesn't match what it shows.
    if (value.descriptionSource === "CUSTOM" && !value.customDescription?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customDescription"],
        message: "Write a description, or choose the existing one.",
      });
    }
    // "Alternative to paid software" with nothing named is an unfilterable
    // claim — the card would have nothing to show and the filter nothing
    // to explain (rule 38).
    if (value.isPaidAlternative && value.alternativeTo.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["alternativeTo"],
        message: "Name at least one product this replaces.",
      });
    }
  });

const importSchema = z.object({
  url: z.string().trim().min(1).max(500),
  kind: z.enum(["PROJECT", "TOOL"]),
  /** Present when the contributor is correcting the URL inside an existing wizard. */
  draftId: z.string().uuid().optional(),
});

/**
 * `GET /submissions` — the community list.
 *
 * Query params, all optional and all defaulted rather than rejected: a
 * browsing page should never 400 because a stale bookmark carries an
 * unknown sort value. Anything unrecognised falls back to the default,
 * which is what the page renders anyway.
 *
 *   sort=new|trending|popular     (default new)
 *   category=ALL|PROJECT|TOOL|PAID_ALTERNATIVE  (default ALL)
 *   tech=Rust,WebAssembly         (AND, not OR — see db/submissions.ts)
 *   q=search                      (name only)
 *
 * Sorting and the category/tech filters run in Postgres, not the
 * browser, because the read is capped: re-sorting a truncated page
 * client-side would answer a different question than the one the filter
 * asks (see `listSubmissions`).
 *
 * Response body is the raw array — the same envelope exception every
 * other contributor list route here documents.
 */
submissions.get("/submissions", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  const withinLimit = await checkRateLimit(c, {
    bucket: "submissions-list",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const rawSort = c.req.query("sort") as SubmissionSort | undefined;
  const rawCategory = c.req.query("category") as SubmissionCategory | undefined;

  const sort: SubmissionSort = rawSort && SORTS.includes(rawSort) ? rawSort : "new";
  const category: SubmissionCategory =
    rawCategory && CATEGORIES.includes(rawCategory) ? rawCategory : "ALL";

  const techStack = (c.req.query("tech") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 12);

  try {
    const supabase = getSupabase(env);
    const list = await listSubmissions(supabase, {
      sort,
      category,
      techStack,
      query: c.req.query("q") ?? "",
    });

    return c.json(await markViewerUpvotes(supabase, list, user.id), 200);
  } catch (err) {
    logger.error("submissions_list_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load submissions right now");
  }
});

/**
 * `POST /submissions/draft/url` — step 1 of the submit wizard.
 *
 * The contributor supplies a URL and a kind. Name, description, README,
 * language and the detected tech stack are all resolved from GitHub —
 * none of them are hand-typed, the same "the source is the source of
 * truth" principle Project Onboarding's step 1 applies.
 *
 * GitHub-only for now, deliberately. Admin tool onboarding accepts any
 * URL because an admin is standing behind whatever comes back; here,
 * requiring a repository is what makes the fetched facts checkable by
 * anyone reading the list. A non-GitHub URL is rejected with a specific
 * code the wizard turns into a sentence, not a generic failure.
 *
 * `GITHUB_DISCOVERY_TOKEN`, not the contributor's own token: this reads
 * a public repository, and submitting something must not require having
 * connected GitHub.
 */
submissions.post("/submissions/draft/url", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  // Tighter than the list read: each call is several GitHub requests.
  const withinLimit = await checkRateLimit(c, {
    bucket: "submissions-import",
    limit: 15,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsed = importSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(c, 400, "invalid_body", "Enter the repository URL to fetch");
  }

  const repo = parseGithubRepoUrl(parsed.data.url);
  if (!repo) {
    return errorResponse(
      c,
      422,
      "not_a_github_repository",
      "That doesn't look like a GitHub repository URL",
    );
  }

  try {
    const supabase = getSupabase(env);
    const token = env.GITHUB_DISCOVERY_TOKEN;

    const metadata = await fetchRepositoryMetadata(token, repo.owner, repo.repo);

    // A private repository nobody else can open would list as a dead
    // link. Rejected at import rather than published and broken.
    if (metadata.isPrivate) {
      return errorResponse(
        c,
        422,
        "repository_not_public",
        "That repository isn't public, so nobody else could open it",
      );
    }

    const [readme, languageBytes] = await Promise.all([
      fetchRepositoryReadme(token, repo.owner, repo.repo),
      fetchRepositoryLanguages(token, repo.owner, repo.repo),
    ]);

    const detected = await detectTechStack(
      token,
      repo.owner,
      repo.repo,
      metadata.defaultBranch,
      metadata.primaryLanguage,
      languageBytes,
    );

    // The bucketed detection result is flattened here, once, because the
    // list only ever filters on a flat set of tags (sql/028). Deduped and
    // capped so an unusual repository can't seed step 2 with forty chips.
    const detectedTechStack = Array.from(
      new Set([
        ...detected.languages,
        ...detected.frameworks,
        ...detected.frontend,
        ...detected.backend,
        ...detected.databases,
      ]),
    ).slice(0, 12);

    const draft = await saveSubmissionDraftSource(
      supabase,
      user.id,
      parsed.data.kind,
      {
        url: metadata.htmlUrl,
        name: metadata.name,
        repositoryFullName: metadata.fullName,
        fetchedDescription: metadata.description,
        readme,
        primaryLanguage: metadata.primaryLanguage,
        detectedTechStack,
      },
      parsed.data.draftId,
    );

    return c.json(draft, 200);
  } catch (err) {
    if (err instanceof GitHubRepoError) {
      // "We couldn't find that" and "GitHub is down" are different
      // problems with different fixes, so they get different answers.
      const status = err.reason === "not_found" ? 404 : 502;
      const code = err.reason === "not_found" ? "repository_not_found" : "github_unavailable";
      return errorResponse(
        c,
        status,
        code,
        err.reason === "not_found"
          ? "We couldn't find that repository on GitHub"
          : "Couldn't reach GitHub right now",
      );
    }

    logger.error("submission_import_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't fetch that repository right now");
  }
});

/** `GET /submissions/draft/:id` — reads a draft back, scoped to its owner. */
submissions.get("/submissions/draft/:id", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  try {
    const draft = await getSubmissionDraft(getSupabase(env), c.req.param("id"), user.id);
    if (!draft) {
      return errorResponse(c, 404, "not_found", "This draft doesn't exist");
    }
    return c.json(draft, 200);
  } catch (err) {
    logger.error("submission_draft_read_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load this draft right now");
  }
});

/**
 * `PUT /submissions/draft/:id/details` — step 2.
 *
 * Description choice, tech stack, and whether this replaces something
 * paid. Replaces the whole set rather than patching fields, so saving
 * twice from two tabs converges rather than interleaving (rule 55).
 *
 * The zod schema above is the real gate; `complete_user_submission`
 * re-checks the same rules in SQL before anything is published, so a
 * client that skips this route entirely still can't publish a row with
 * an empty tech stack.
 */
submissions.put("/submissions/draft/:id/details", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  const withinLimit = await checkRateLimit(c, {
    bucket: "submissions-draft-write",
    limit: 30,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsed = detailsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(
      c,
      400,
      "invalid_body",
      parsed.error.issues[0]?.message ?? "Check the details on this step",
    );
  }

  try {
    const draft = await saveSubmissionDraftDetails(
      getSupabase(env),
      c.req.param("id"),
      user.id,
      {
        descriptionSource: parsed.data.descriptionSource,
        customDescription: parsed.data.customDescription?.trim() || null,
        techStack: parsed.data.techStack,
        isPaidAlternative: parsed.data.isPaidAlternative,
        alternativeTo: parsed.data.alternativeTo,
      },
    );

    if (!draft) {
      return errorResponse(c, 404, "not_found", "This draft doesn't exist");
    }
    return c.json(draft, 200);
  } catch (err) {
    logger.error("submission_draft_details_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't save this step right now");
  }
});

/**
 * `POST /submissions/draft/:id/complete` — step 3, the confirm.
 *
 * Everything that decides whether this succeeds lives in
 * `devtunnel.complete_user_submission()` (sql/028), which locks the
 * draft, re-checks every step, derives the slug and inserts — all in one
 * transaction. This handler only maps its outcomes onto status codes.
 *
 * `already_submitted` is a 409 with the code intact rather than a
 * generic failure, because the useful response to "someone already
 * submitted this repository" is to show the contributor the existing
 * entry, not to tell them something broke.
 */
submissions.post("/submissions/draft/:id/complete", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  const withinLimit = await checkRateLimit(c, {
    bucket: "submissions-complete",
    limit: 10,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const result = await completeSubmissionDraft(getSupabase(env), c.req.param("id"), user.id);

    if (result.status === "not_found") {
      return errorResponse(c, 404, "not_found", "This draft doesn't exist");
    }
    if (result.status === "already_submitted") {
      return errorResponse(
        c,
        409,
        "already_submitted",
        "This repository is already on the community list",
      );
    }
    if (result.status === "incomplete") {
      return errorResponse(
        c,
        422,
        "draft_incomplete",
        "This submission isn't ready yet — check the earlier steps",
      );
    }

    return c.json(result.submission, 201);
  } catch (err) {
    logger.error("submission_complete_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't publish this submission right now");
  }
});

/**
 * `PUT /submissions/:slug/upvote` — the signal behind Trending and
 * Popular.
 *
 * A local DevTunnel vote, not a GitHub star: see sql/028 for why this
 * isn't reusing `github_stars`. Idempotent, so the button can't
 * double-count, and the response carries the real count read back after
 * the write rather than an increment the client guessed (rule 38).
 */
submissions.put("/submissions/:slug/upvote", requireAuth, async (c) => {
  return handleUpvote(c, "upvote");
});

/** `DELETE /submissions/:slug/upvote` — the reverse, same handling. */
submissions.delete("/submissions/:slug/upvote", requireAuth, async (c) => {
  return handleUpvote(c, "remove");
});

async function handleUpvote(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  action: "upvote" | "remove",
) {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "submissions-upvote",
    limit: 40,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);
    const submission = await getSubmissionBySlug(supabase, slug);
    if (!submission) {
      return errorResponse(c, 404, "not_found", "This submission isn't on DevTunnel");
    }

    const status =
      action === "upvote"
        ? await upvoteSubmission(supabase, submission.id, user.id)
        : await removeSubmissionUpvote(supabase, submission.id, user.id);

    return c.json(status, 200);
  } catch (err) {
    logger.error("submission_upvote_failed", {
      error: err instanceof Error ? err.message : String(err),
      action,
      slug,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't record your vote right now");
  }
}