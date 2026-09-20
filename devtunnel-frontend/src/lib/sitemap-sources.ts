import { API_BASE_URL } from "@/lib/config";

/**
 * Data behind `app/sitemap.ts` — the public DevTunnel catalog, read the way
 * a crawler would read it: **anonymously**, with no cookies forwarded.
 *
 * That is the point. A sitemap may only list URLs a visitor can actually
 * open and that contain real content (Frontend_Development_Rules.txt rules
 * 23, 29). So each list is fetched without credentials, and a section whose
 * endpoint answers with anything other than `200` (a `401` while the backend
 * still requires a session, a `5xx` outage, a network error) simply
 * contributes nothing — never a guessed or stale URL. The moment the backend
 * serves those lists to anonymous requests, the corresponding pages appear
 * in the sitemap with no further frontend change.
 *
 * Not a Server-Component-only file in the "reads cookies" sense (it never
 * touches `next/headers`), but it is server-only: it's called from
 * `sitemap.ts` and uses the un-prefixed API base for a server-to-server call.
 */

/** Sitemap responses are cached for an hour — a new project is discoverable within that. */
const REVALIDATE_SECONDS = 3600;

/** Hard stop for cursor-paginated walks so a misbehaving API can't loop forever. */
const MAX_PAGES = 20;

const PAGE_LIMIT = 100;

interface SlugRecord {
  slug: string;
}

interface TaskRecord {
  id: string;
  project: { slug: string };
}

async function fetchAnonymous(path: string) {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });

    return res.ok ? res : null;
  } catch {
    return null;
  }
}

async function fetchJsonArray<T>(path: string): Promise<T[] | null> {
  const res = await fetchAnonymous(path);
  if (!res) return null;

  try {
    const body: unknown = await res.json();
    return Array.isArray(body) ? (body as T[]) : null;
  } catch {
    return null;
  }
}

/** Walks a keyset-paginated list (`limit`/`before` + `X-Next-Cursor`), like `fetchAllAdminPages`. */
async function fetchAllPagesAnonymous<T>(path: string): Promise<T[] | null> {
  const items: T[] = [];
  let before: string | undefined;
  let pages = 0;

  do {
    const query = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (before) query.set("before", before);

    const res = await fetchAnonymous(`${path}?${query.toString()}`);
    if (!res) return items.length > 0 ? items : null;

    try {
      const body: unknown = await res.json();
      if (!Array.isArray(body)) return items.length > 0 ? items : null;
      items.push(...(body as T[]));
    } catch {
      return items.length > 0 ? items : null;
    }

    before = res.headers.get("X-Next-Cursor") ?? undefined;
    pages += 1;
  } while (before && pages < MAX_PAGES);

  return items;
}

export interface PublicCatalogUrls {
  /** `null` = the list isn't publicly readable right now, so its index page stays out of the sitemap. */
  projects: string[] | null;
  tools: string[] | null;
  tasks: string[] | null;
}

/** Site-relative paths for every anonymously-readable DevTunnel project, tool and task. */
export async function getPublicCatalogUrls(): Promise<PublicCatalogUrls> {
  const [projects, tools, tasks] = await Promise.all([
    fetchJsonArray<SlugRecord>("/projects/available"),
    fetchJsonArray<SlugRecord>("/opensource-tools/available"),
    fetchAllPagesAnonymous<TaskRecord>("/tasks"),
  ]);

  return {
    projects: projects
      ? projects.filter((p) => p?.slug).map((p) => `/projects/${encodeURIComponent(p.slug)}`)
      : null,
    tools: tools
      ? tools.filter((t) => t?.slug).map((t) => `/opensource-tools/${encodeURIComponent(t.slug)}`)
      : null,
    tasks: tasks
      ? tasks
          .filter((t) => t?.id && t.project?.slug)
          .map(
            (t) =>
              `/projects/${encodeURIComponent(t.project.slug)}/tasks/${encodeURIComponent(t.id)}`,
          )
      : null,
  };
}
