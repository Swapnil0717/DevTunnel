import { NextResponse, type NextRequest } from "next/server";
import { AUTH_FLAG_COOKIE } from "@/lib/auth/session";

/**
 * Routes that require a signed-in user. Anything under these paths bounces
 * to /login (with a `next` param) when the `dt_auth` flag cookie is absent.
 *
 * `/home` is the real contributor landing page in the sign-in → onboarding
 * → home flow (devtunnel_workflow.txt, Module C1); `/dashboard` stays
 * listed too since (protected)/dashboard/page.tsx still redirects old
 * bookmarked links there.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/home", "/profile", "/onboarding"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasAuthFlag = request.cookies.has(AUTH_FLAG_COOKIE);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !hasAuthFlag) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Forwarded so (protected)/layout.tsx — a server component with no
  // direct access to the current path — can tell whether the request is
  // already headed to /onboarding and skip its own onboarding redirect
  // there (avoids a redirect loop). Non-sensitive: just the path already
  // visible in the URL.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/home/:path*",
    "/profile/:path*",
    "/onboarding/:path*",
  ],
};