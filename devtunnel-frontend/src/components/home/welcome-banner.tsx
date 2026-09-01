"use client";

import { useAuth } from "@/lib/auth/use-auth";

export function WelcomeBanner() {
  const { user, status } = useAuth();

  const displayName =
    status === "loading" ? null : user?.name || user?.username || "there";

  return (
    <p className="text-[15px] font-medium text-text mb-4" aria-live="polite">
      {displayName ? `Welcome back, ${displayName}` : "Welcome back"}
    </p>
  );
}