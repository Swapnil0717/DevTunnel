"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth/use-auth";
import { isAdmin } from "@/lib/auth/is-admin";
import { setClientViewMode } from "@/lib/auth/view-mode";

interface PortalSwitchLinkProps {
  from: "admin" | "user";
  className?: string;
}

export function PortalSwitchLink({
  from,
  className = "",
}: PortalSwitchLinkProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (!isAdmin(user)) return null;

  const target = from === "admin" ? "user" : "admin";
  const label =
    from === "admin" ? "Switch to User view" : "Switch to Admin";
  const destination = from === "admin" ? "/home" : "/admin";

  function handleClick() {
    setPending(true);
    setClientViewMode(target);
    router.push(destination);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-text-dim transition-colors hover:bg-surface hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending ? "Switching…" : label}
    </button>
  );
}