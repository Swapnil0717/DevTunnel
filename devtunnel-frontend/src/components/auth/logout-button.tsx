"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";

interface LogoutButtonProps {
  className?: string;
  /**
   * Where to send the person after signing out. Defaults to the
   * contributor `/login`; the Admin Portal shell passes `/admin/login` so
   * signing out of admin doesn't land on the contributor sign-in screen
   * (devtunnel_workflow.txt, Module A1 — Admin Authentication).
   */
  redirectTo?: string;
}

/**
 * Calls `POST /auth/logout` (via `useAuth().logout`) and returns the user
 * to the sign-in screen. Devtunnel_workflow.txt task: "Create logout
 * functionality".
 */
export function LogoutButton({ className = "", redirectTo = "/login" }: LogoutButtonProps) {
  const { logout } = useAuth();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      router.push(redirectTo);
    } catch {
      // If the request fails, let the person try again rather than
      // stranding them on a broken button.
      setIsLoggingOut(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      className={`rounded-md border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {isLoggingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}