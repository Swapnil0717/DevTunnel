"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";

/**
 * Checklist: "Create protected-route handling".
 *
 * `src/middleware.ts` already redirects unauthenticated requests before a
 * protected page's HTML is ever sent, using a non-sensitive cookie hint.
 * This component is the second, authoritative layer: it waits for
 * GET /auth/me to resolve and redirects client-side if the real session
 * turns out to be missing or expired. Route groups under `app/dashboard`
 * render inside this so no protected screen can flash real content before
 * the check completes.
 *
 * This is UX, not the security boundary — every protected API request must
 * still be independently authorized by the backend regardless of what this
 * component decides (Frontend_Development_Rules.txt, rule 18).
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      const returnTo = encodeURIComponent(pathname);
      router.replace(`/login?returnTo=${returnTo}`);
    }
  }, [status, pathname, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status">
        <p className="text-sm text-ink-muted">Checking your session…</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return <>{children}</>;
}
