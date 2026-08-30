"use client";

import { useState } from "react";
import { useAuth } from "@/context/auth-context";

interface LogoutButtonProps {
  className?: string;
}

/** Checklist: "Create logout functionality". */
export function LogoutButton({ className }: LogoutButtonProps) {
  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleClick() {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoggingOut}
      aria-busy={isLoggingOut}
      className={
        className ??
        "rounded-chip border border-border px-3 py-1.5 text-[13px] font-medium text-ink-secondary transition-colors hover:border-ink-disabled hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {isLoggingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
