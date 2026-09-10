// devtunnel-backend/src/lib/toolSource.ts

import { logger } from "./logger";
import {
  GitHubRepoError,
  parseGithubRepoUrl,
  fetchRepositoryMetadata,
  fetchRepositoryReadme,
} from "./githubRepo";

/**
 * URL resolver for Admin **Open Source Tool Onboarding**, Step 1 ("Tool
 * URL" — devtunnel-frontend/src/lib/admin/opensource-tool-onboarding/
 * types.ts `OnboardingToolSource`). There's no Admin Portal Master
 * Coding Specification module for this flow (frontend's own types.ts
 * comment says as much), so this mirrors the already-implemented GitHub
 * path project onboarding uses (src/lib/githubRepo.ts) and adds a
 * second, best-effort path for any non-GitHub URL — the frontend only
 * promises "GitHub repo metadata when the URL is a GitHub repository, or
 * a best-effort name/description otherwise", never a guess invented by
 * this backend (rule 73: never fabricate a field the source didn't
 * actually provide).
 *
 * Every field on `ResolvedToolSource` maps 1:1 onto `OnboardingToolSource`
 * (url/name/fetchedDescription/readme/primaryLanguage) — nothing here is
 * DevTunnel-specific; that layer is Step 2 ("Description"), a separate,
 * explicitly Admin-authored field this module never touches.
 */

const USER_AGENT = "devtunnel-backend";
// Same reasoning as githubRepo.ts's REQUEST_TIMEOUT_MS: an arbitrary
// third-party site can be far slower than GitHub's API, but this must
// never hang indefinitely (rule 53).
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 1;
// A hand-authored setup guide (Step 4) already covers "how do I use
// this", so an arbitrary site's raw HTML is only ever mined for a
// name/description here — bound the amount of markup we're willing to
// buffer in memory before giving up on it (rule 67).
const MAX_HTML_BYTES = 2_000_000;

export class ToolSourceError extends Error {
  /** Safe-to-show-the-admin reason code (never a raw HTTP/network detail). */
  reason: "invalid_url" | "not_found" | "unreachable" | "unsupported_content";
  constructor(reason: ToolSourceError["reason"], message: string) {
    super(message);
    this.name = "ToolSourceError";
    this.reason = reason;
  }
}

export interface ResolvedToolSource {
  url: string;
  name: string;
  fetchedDescription: string | null;
  readme: string | null;
  primaryLanguage: string | null;
}

/**
 * Normalizes whatever an Admin pastes into an absolute `https?://` URL.
 * Rejects anything that isn't a syntactically valid URL before it ever
 * reaches the network (rule 14: validate every input at the boundary).
 */
function parseToolUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  attempt = 0,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      return fetchWithTimeout(url, init, attempt + 1);
    }
    throw new ToolSourceError(
      "unreachable",
      `Couldn't reach that URL: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Decodes a handful of common numeric/named HTML entities in scraped
 * `<title>`/meta-description text. Deliberately not a full HTML-entity
 * table — this is display text for an Admin preview, not content that
 * gets rendered as HTML anywhere (rule 20: never `dangerouslySetInnerHTML`
 * downstream, so this only needs to be readable, not exhaustive).
 */
function decodeBasicEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best-effort `<title>` / meta-description scrape for a non-GitHub URL.
 * Returns `null` for a field it can't find rather than fabricating one —
 * the frontend explicitly types both `name` fallback and
 * `fetchedDescription` as allowed to be absent (`fetchedDescription:
 * string | null`).
 */
function scrapeMetadata(html: string): { title: string | null; description: string | null } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1] ? decodeBasicEntities(titleMatch[1]) : null;

  // Prefer Open Graph's description (usually hand-curated, higher
  // signal), fall back to the standard meta description tag.
  const ogMatch = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i,
  );
  const metaMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i,
  );
  const rawDescription = ogMatch?.[1] ?? metaMatch?.[1] ?? null;
  const description = rawDescription ? decodeBasicEntities(rawDescription) : null;

  return { title, description: description && description.length > 0 ? description : null };
}

/**
 * Fetches a non-GitHub page's HTML and extracts a best-effort
 * name/description. Never throws for "page loaded but has no useful
 * metadata" — only for genuine network/HTTP failure — since a missing
 * `<title>` is a legitimate, common state (same convention as
 * `fetchRepositoryReadme` treating a missing README as `null`, not an
 * error).
 */
async function resolveGenericSite(url: URL): Promise<ResolvedToolSource> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (err) {
    if (err instanceof ToolSourceError) throw err;
    throw new ToolSourceError("unreachable", "Couldn't reach that URL");
  }

  if (res.status === 404) {
    throw new ToolSourceError("not_found", "Nothing was found at that URL");
  }
  if (!res.ok) {
    logger.warn("tool_source_fetch_non_ok", { url: url.toString(), status: res.status });
    throw new ToolSourceError("unreachable", `That URL returned an error (${res.status})`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
    throw new ToolSourceError(
      "unsupported_content",
      "That URL doesn't appear to be a webpage DevTunnel can read metadata from",
    );
  }

  // Bound how much of the body we buffer — a misbehaving server
  // shouldn't be able to stream unbounded data into this Worker
  // (rule 67).
  const reader = res.body?.getReader();
  let html = "";
  if (reader) {
    let received = 0;
    const decoder = new TextDecoder();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (received >= MAX_HTML_BYTES) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  } else {
    html = (await res.text()).slice(0, MAX_HTML_BYTES);
  }

  const { title, description } = scrapeMetadata(html);
  const fallbackName = url.hostname.replace(/^www\./i, "");

  return {
    url: url.toString(),
    name: title ?? fallbackName,
    fetchedDescription: description,
    readme: null,
    primaryLanguage: null,
  };
}

/**
 * Resolves an Admin-supplied tool URL to `OnboardingToolSource` shape.
 * GitHub repository URLs go through the same authoritative REST calls
 * project onboarding already uses (metadata + README); anything else
 * falls back to a best-effort HTML scrape. `accessToken` is optional and
 * unauthenticated by default — unlike project onboarding, the tool being
 * onboarded here isn't necessarily one the admin's own GitHub account has
 * any relationship to, so there's no per-admin stored token to look up
 * for it; passing `null` simply means public-repository rate limits
 * apply (same graceful-degradation path `fetchRepositoryMetadata`
 * already supports for unauthenticated callers).
 */
export async function resolveToolSource(rawUrl: string): Promise<ResolvedToolSource> {
  const url = parseToolUrl(rawUrl);
  if (!url) {
    throw new ToolSourceError(
      "invalid_url",
      "Enter a valid URL (e.g. https://github.com/owner/repository or https://example.com)",
    );
  }

  const parsedRepo = parseGithubRepoUrl(url.toString());
  if (parsedRepo) {
    try {
      const metadata = await fetchRepositoryMetadata(null, parsedRepo.owner, parsedRepo.repo);
      const readme = await fetchRepositoryReadme(null, parsedRepo.owner, parsedRepo.repo);
      return {
        url: metadata.htmlUrl,
        name: metadata.name,
        fetchedDescription: metadata.description,
        readme,
        primaryLanguage: metadata.primaryLanguage,
      };
    } catch (err) {
      if (err instanceof GitHubRepoError) {
        const reason: ToolSourceError["reason"] =
          err.reason === "not_found"
            ? "not_found"
            : err.reason === "invalid_url"
              ? "invalid_url"
              : "unreachable";
        throw new ToolSourceError(reason, err.message);
      }
      throw err;
    }
  }

  return resolveGenericSite(url);
}