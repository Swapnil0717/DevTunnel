import { z } from "zod";
import type { ContributionCalendar } from "../types";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const REQUEST_TIMEOUT_MS = 8000;
const USER_AGENT = "devtunnel-backend";

export class GitHubGraphQLError extends Error {
  /** Safe-to-map-to-an-HTTP-response reason code. */
  reason: "user_not_found" | "invalid_token" | "github_unavailable";
  constructor(reason: "user_not_found" | "invalid_token" | "github_unavailable", message: string) {
    super(message);
    this.name = "GitHubGraphQLError";
    this.reason = reason;
  }
}

/** rule 53: never let an external request hang indefinitely. */
async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const contributionCalendarSchema = z.object({
  totalContributions: z.number(),
  weeks: z.array(
    z.object({
      contributionDays: z.array(
        z.object({
          date: z.string(),
          contributionCount: z.number(),
        }),
      ),
    }),
  ),
});

const graphqlResponseSchema = z.object({
  data: z
    .object({
      user: z
        .object({
          contributionsCollection: z.object({
            contributionCalendar: contributionCalendarSchema,
          }),
        })
        .nullable(),
    })
    .nullable()
    .optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

const CONTRIBUTIONS_QUERY = `
  query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

/**
 * rule 51–52: external APIs are untrusted — validate the shape before
 * using it, and translate every failure mode into a typed error instead
 * of leaking one to a route handler to guess about.
 *
 * `accessToken` is a specific *user's* GitHub user-to-server token
 * (src/db/githubTokens.ts) — this backend queries each user's own
 * contribution calendar with their own authorization, never a shared
 * server-wide credential, so a 401/403 here means *that user's* token is
 * invalid/revoked (`invalid_token`), not an operator misconfiguration.
 *
 * `from`/`to` must be ISO 8601 and no more than one year apart (a GitHub
 * GraphQL API constraint) — callers here always pass either a single
 * calendar month or a rolling 365-day window, both well within that.
 */
async function runContributionsQuery(
  accessToken: string,
  login: string,
  from: string,
  to: string,
): Promise<ContributionCalendar> {
  let res: Response;
  try {
    res = await fetchWithTimeout(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        query: CONTRIBUTIONS_QUERY,
        variables: { login, from, to },
      }),
    });
  } catch (err) {
    throw new GitHubGraphQLError(
      "github_unavailable",
      `GitHub GraphQL request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new GitHubGraphQLError("invalid_token", `GitHub GraphQL rejected the user's token (${res.status})`);
  }
  if (res.status === 429) {
    throw new GitHubGraphQLError("github_unavailable", "GitHub GraphQL rate limit exceeded");
  }
  if (!res.ok) {
    throw new GitHubGraphQLError("github_unavailable", `GitHub GraphQL returned ${res.status}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new GitHubGraphQLError("github_unavailable", "GitHub GraphQL response was not valid JSON");
  }

  const parsed = graphqlResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new GitHubGraphQLError("github_unavailable", "Unexpected GitHub GraphQL response shape");
  }

  const user = parsed.data.data?.user;
  if (!user) {
    throw new GitHubGraphQLError("user_not_found", `GitHub user not found: ${login}`);
  }

  const calendar = user.contributionsCollection.contributionCalendar;
  return {
    totalContributions: calendar.totalContributions,
    weeks: calendar.weeks.map((week) => ({
      days: week.contributionDays.map((day) => ({
        date: day.date,
        count: day.contributionCount,
      })),
    })),
  };
}

/** Contribution calendar for an explicit `[fromISO, toISO]` window (max 1 year). */
export async function fetchContributionCalendar(
  accessToken: string,
  login: string,
  fromISO: string,
  toISO: string,
): Promise<ContributionCalendar> {
  return runContributionsQuery(accessToken, login, fromISO, toISO);
}

/** Rolling 365-day total, used for the profile page's "Contributions" stat. */
export async function fetchContributionSummary(
  accessToken: string,
  login: string,
): Promise<{ totalContributions: number; fromISO: string; toISO: string }> {
  const to = new Date();
  const from = new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000);
  const fromISO = from.toISOString();
  const toISO = to.toISOString();
  const calendar = await runContributionsQuery(accessToken, login, fromISO, toISO);
  return { totalContributions: calendar.totalContributions, fromISO, toISO };
}