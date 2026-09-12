"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import { Spinner } from "@/components/ui/spinner";

interface LogoutButtonProps {
  className?: string;
  redirectTo?: string;
}

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
      setIsLoggingOut(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {isLoggingOut ? <Spinner size={13} /> : null}
      {isLoggingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}