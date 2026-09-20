import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  AUTH_FLAG_COOKIE,
} from "@/lib/auth/session";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/home",
  "/profile",
  "/settings",
  "/onboarding",
];

const ADMIN_PREFIX = "/admin";
const ADMIN_LOGIN_PATH = "/admin/login";

export function middleware(
  request: NextRequest,
) {
  const { pathname } =
    request.nextUrl;

  const hasAuthFlag =
    request.cookies.has(
      AUTH_FLAG_COOKIE,
    );

  const isProtected =
    PROTECTED_PREFIXES.some(
      (prefix) =>
        pathname === prefix ||
        pathname.startsWith(`${prefix}/`),
    );

  if (
    isProtected &&
    !hasAuthFlag
  ) {
    const loginUrl =
      new URL(
        "/login",
        request.url,
      );

    loginUrl.searchParams.set(
      "next",
      pathname,
    );

    return NextResponse.redirect(
      loginUrl,
    );
  }

  const isAdminRoute =
    (
      pathname === ADMIN_PREFIX ||
      pathname.startsWith(
        `${ADMIN_PREFIX}/`,
      )
    ) &&
    pathname !== ADMIN_LOGIN_PATH;

  if (
    isAdminRoute &&
    !hasAuthFlag
  ) {
    const adminLoginUrl =
      new URL(
        ADMIN_LOGIN_PATH,
        request.url,
      );

    adminLoginUrl.searchParams.set(
      "next",
      pathname,
    );

    return NextResponse.redirect(
      adminLoginUrl,
    );
  }

  const requestHeaders =
    new Headers(
      request.headers,
    );

  requestHeaders.set(
    "x-pathname",
    pathname,
  );

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
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