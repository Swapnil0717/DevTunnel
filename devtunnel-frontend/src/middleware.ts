import { NextResponse, type NextRequest } from "next/server";
import { AUTH_FLAG_COOKIE } from "@/lib/auth/session";

/**
 * Routes that require a signed-in user. Anything under these paths bounces
 * to /login (with a `next` param) when the `dt_auth` flag cookie is absent.
 *
 * `/home` is the real contributor landing page in the sign-in → onboarding
 * → home flow (devtunnel_workflow.txt, Module C1); `/dashboard` stays
 * listed too since (protected)/dashboard/page.tsx still redirects old
 * bookmarked links there. `/settings` was added alongside the new
 * AppSidebar "Settings" link — it lives under (protected) like /profile,
 * so it needs the same fast edge-level bounce.
 *
 * `/admin` is the Admin Portal (devtunnel_workflow.txt, Module A1). It
 * gets the same fast flag-cookie bounce as the contributor routes, but is
 * handled separately below: `/admin/login` itself must stay reachable
 * (that's where a signed-out — or non-admin — visitor is sent), and the
 * bounce target is `/admin/login`, not `/login`. The *real* admin check
 * (is this session actually `role: "ADMIN"`, not just signed in) can't
 * happen at the edge — it needs `GET /auth/me` — so that's enforced in
 * `admin/(protected)/layout.tsx`, same division of labor as the
 * contributor flow's flag-cookie-vs-`getServerUser()` split.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/home",
  "/profile",
  "/settings",
  "/onboarding",
];

const ADMIN_PREFIX = "/admin";
const ADMIN_LOGIN_PATH = "/admin/login";

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

  const isAdminRoute =
    (pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`)) &&
    pathname !== ADMIN_LOGIN_PATH;

  if (isAdminRoute && !hasAuthFlag) {
    const adminLoginUrl = new URL(ADMIN_LOGIN_PATH, request.url);
    adminLoginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(adminLoginUrl);
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
    "/settings/:path*",
    "/onboarding/:path*",
    "/admin/:path*",
  ],
};