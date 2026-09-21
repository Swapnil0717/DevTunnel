"use client";

import { useAuth } from "@/lib/auth/use-auth";

/**
 * The page's one `<h1>`: "Welcome back, {name}". It used to be a small
 * paragraph under a visually hidden "Contributor home" heading; the redesign
 * makes the greeting itself the page title, so it carries the heading
 * semantics (rule 5) and the hidden one is gone.
 *
 * Reads the signed-in person from `AuthProvider`, which `(protected)/layout.tsx`
 * seeds from the server-side `/auth/me` check — so the name is already in the
 * server-rendered HTML rather than popping in after a client fetch.
 */
export function WelcomeBanner() {
  const { user, status } = useAuth();

  const displayName =
    status === "loading" ? null : user?.name || user?.username || "there";

  return (
    <h1 className="m-0 mb-5 break-words text-[26px] font-medium leading-normal tracking-[-0.02em] text-text">
      {displayName ? `Welcome back, ${displayName}` : "Welcome back"}
    </h1>
  );
}
