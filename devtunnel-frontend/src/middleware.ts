import { NextResponse, type NextRequest } from "next/server";
import { SESSION_HINT_COOKIE } from "@/lib/constants";

/**
 * Checklist: "Create protected-route handling" (edge layer).
 *
 * Only checks for a non-sensitive presence cookie (e.g. `dt_session_present=1`)
 * that the backend sets alongside its real httpOnly session cookie purely
 * as a routing hint — it carries no auth data itself, so leaking or
 * spoofing it grants no access. Its only job is to avoid shipping a
 * protected page's HTML to a browser that's obviously signed out.
 *
 * The backend must still independently authenticate and authorize every
 * API call the page goes on to make (Frontend_Development_Rules.txt,
 * rule 18: "robots.txt/middleware is not an access-control mechanism").
 */
const PROTECTED_PREFIXES = ["/dashboard"];

export function middleware(request: NextRequest) {  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const hasSessionHint = request.cookies.has(SESSION_HINT_COOKIE);
  if (hasSessionHint) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("returnTo", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // NOTE: Next.js only invokes middleware for paths matching `matcher` —
  // if you add a new prefix to PROTECTED_PREFIXES above, add its route
  // pattern here too, or this file never runs for it.
  matcher: ["/dashboard/:path*"],
};
