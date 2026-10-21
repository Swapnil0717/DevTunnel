"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setClientViewMode, type ViewMode } from "@/lib/auth/view-mode";

/** Admin "Continue as Admin / User" choice, in the landing page's panel style. */
export function AuthPortalChoice({
  name,
  userDestination = "/home",
}: {
  name: string;
  userDestination?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<ViewMode | null>(null);

  function choose(mode: ViewMode) {
    setPending(mode);
    setClientViewMode(mode);
    router.replace(mode === "admin" ? "/admin" : userDestination);
  }

  return (
    <div className="au-card">
      <p className="au-title">Welcome back, {name}</p>
      <p className="au-text">
        This account has admin access. How do you want to sign in?
      </p>

      <div className="au-stack">
        <button
          type="button"
          onClick={() => choose("admin")}
          disabled={pending !== null}
          className="h-cta au-btn"
        >
          {pending === "admin" ? "Opening admin portal…" : "Continue as Admin"}
        </button>

        <button
          type="button"
          onClick={() => choose("user")}
          disabled={pending !== null}
          className="h-ghost au-btn"
        >
          {pending === "user" ? "Opening DevTunnel…" : "Continue as User"}
        </button>
      </div>

      <p className="au-legal au-gap">
        You can switch back to the admin portal any time from your account menu.
      </p>
    </div>
  );
}
