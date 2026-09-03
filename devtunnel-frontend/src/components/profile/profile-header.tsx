import Link from "next/link";
import type { AuthUser } from "@/lib/auth/types";
import { EditIcon } from "@/components/layout/nav-icons";
import { ProfileAvatar } from "./profile-avatar";

export function ProfileHeader({ user }: { user: AuthUser }) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3.5">
        <ProfileAvatar avatarUrl={user.avatarUrl} />

        <div className="min-w-0">
          <p className="m-0 mb-0.5 truncate text-base font-medium text-text">
            {user.name ?? user.username}
          </p>

          <p className="m-0 mb-2 break-words font-mono text-xs text-text-dim">
            @{user.username}

            {user.githubUsername ? (
              <>
                {" · "}

                {user.githubProfileUrl ? (
                  <a
                    href={user.githubProfileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-dim underline-offset-2 hover:text-accent hover:underline"
                  >
                    GitHub
                  </a>
                ) : (
                  "GitHub"
                )}
              </>
            ) : null}
          </p>

          {user.bio ? (
            <p className="m-0 max-w-full text-[12.5px] leading-relaxed text-text-muted sm:max-w-[380px]">
              {user.bio}
            </p>
          ) : null}
        </div>
      </div>

      {/* 
        No dedicated profile-edit flow exists yet.
        /settings is currently the available account-management page.
      */}
      <Link
        href="/settings"
        className="flex shrink-0 items-center justify-center gap-1.5 self-start rounded-md border border-border px-3.5 py-[7px] text-xs text-text-secondary transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:self-auto"
      >
        <EditIcon className="h-[13px] w-[13px]" />
        Edit profile
      </Link>
    </div>
  );
}