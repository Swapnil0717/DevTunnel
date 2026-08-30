import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import { parseAuthMeResponse } from "./api";
import type { AuthUser } from "./types";

/**
 * Server-side `GET /auth/me`, forwarding the incoming request's cookies.
 *
 * This is the one place server components call to find out who's signed
 * in before rendering — `(protected)/layout.tsx`, `profile/page.tsx`, and
 * `onboarding/page.tsx` all used to each define their own copy of this
 * function; centralizing it means the response-parsing fix in
 * `lib/auth/api.ts` (`parseAuthMeResponse`) only has to exist once.
 *
 * Only import this from a server component/layout — it reads
 * `next/headers`, which throws if called from client code.
 */
export async function getServerUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { cookie: cookies().toString() },
      cache: "no-store",
    });

    if (!res.ok) return null;

    return parseAuthMeResponse(await res.json());
  } catch {
    return null;
  }
}
