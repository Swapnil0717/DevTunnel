import { NextResponse, type NextRequest } from "next/server";
import { AUTH_FLAG_COOKIE } from "@/lib/auth/session";

/**
 * Routes that require a signed-in user. Anything under these paths bounces
 * to /login (with a `next` param) when the `dt_auth` flag cookie is absent.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/profile"];

/**
 * Routes that only make sense for a signed-out visitor. An already-signed-in
 * user hitting /login is sent straight to their dashboard instead of seeing
 * the sign-in screen again.
 */
const SIGNED_OUT_ONLY_ROUTES = ["/login"];

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

  if (SIGNED_OUT_ONLY_ROUTES.includes(pathname) && hasAuthFlag) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/profile/:path*", "/login"],
};
