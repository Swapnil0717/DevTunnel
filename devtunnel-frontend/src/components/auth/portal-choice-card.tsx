"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setClientViewMode, type ViewMode } from "@/lib/auth/view-mode";

interface PortalChoiceCardProps {
  name: string;
  /** Where "Continue as user" should land once picked. Defaults to /home. */
  userDestination?: string;
}

export function PortalChoiceCard({
  name,
  userDestination = "/home",
}: PortalChoiceCardProps) {
  const router = useRouter();
  const [pending, setPending] = useState<ViewMode | null>(null);

  function choose(mode: ViewMode) {
    setPending(mode);
    setClientViewMode(mode);

    router.replace(mode === "admin" ? "/admin" : userDestination);
  }

  return (
    <div className="w-full max-w-[340px] rounded-[10px] border border-border bg-surface px-[26px] py-7">
      <p className="m-0 mb-1 text-center text-[15px] font-medium text-text">
        Welcome back, {name}
      </p>

      <p className="m-0 mb-[22px] text-center text-[13px] leading-[1.5] text-text-muted">
        This account has admin access. How do you want to sign in?
      </p>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => choose("admin")}
          disabled={pending !== null}
          className="flex h-[38px] w-full items-center justify-center gap-2 rounded-md bg-text text-[13px] font-medium text-bg transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending === "admin"
            ? "Opening admin portal…"
            : "Continue as Admin"}
        </button>

        <button
          type="button"
          onClick={() => choose("user")}
          disabled={pending !== null}
          className="flex h-[38px] w-full items-center justify-center gap-2 rounded-md border border-border bg-surface text-[13px] font-medium text-text transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending === "user"
            ? "Opening DevTunnel…"
            : "Continue as User"}
        </button>
      </div>

      <p className="m-0 mt-[18px] text-center text-[11.5px] leading-[1.6] text-text-faint">
        You can switch back to the admin portal any time from your account
        menu.
      </p>
    </div>
  );
}