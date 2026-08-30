import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import { AppHeader } from "@/components/layout/app-header";
import { API_BASE_URL } from "@/lib/config";
import { buildMetadata } from "@/lib/seo";
import type { AuthUser } from "@/lib/auth/types";

export const metadata: Metadata = buildMetadata({
  title: "Your profile",
  description: "Your DevTunnel contributor profile.",
  path: "/profile",
  noIndex: true,
});

// The (protected) layout already guarantees a valid session by the time
// this page renders, so it's safe to fetch the user again here (server
// side, same as the layout) purely to render profile fields — no client
// loading flash, and no private fields beyond what AuthUser exposes.
async function getUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { cookie: cookies().toString() },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: AuthUser } | AuthUser;
    return "user" in data ? (data.user ?? null) : data;
  } catch {
    return null;
  }
}

const ROLE_LABEL: Record<AuthUser["role"], string> = {
  CONTRIBUTOR: "Contributor",
  MAINTAINER: "Maintainer",
  ADMIN: "Admin",
};

export default async function ProfilePage() {
  const user = await getUser();

  return (
    <>
      <AppHeader />
      <main className="px-6 py-12">
        <h1 className="m-0 mb-6 text-xl font-medium text-text">Your profile</h1>

        {user ? (
          <div className="flex max-w-[480px] items-start gap-4 rounded-[10px] border border-border bg-surface p-6">
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt=""
                width={56}
                height={56}
                className="rounded-full border border-border"
              />
            ) : null}
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-text-muted">Name</dt>
              <dd className="m-0 text-text">{user.name ?? user.username}</dd>

              <dt className="text-text-muted">Username</dt>
              <dd className="m-0 text-text">{user.username}</dd>

              <dt className="text-text-muted">Role</dt>
              <dd className="m-0 text-text">{ROLE_LABEL[user.role]}</dd>

              {user.githubUsername ? (
                <>
                  <dt className="text-text-muted">GitHub</dt>
                  <dd className="m-0 text-text">
                    {user.githubProfileUrl ? (
                      <a
                        href={user.githubProfileUrl}
                        className="text-accent underline-offset-2 hover:underline"
                      >
                        @{user.githubUsername}
                      </a>
                    ) : (
                      `@${user.githubUsername}`
                    )}
                  </dd>
                </>
              ) : null}

              {user.bio ? (
                <>
                  <dt className="text-text-muted">Bio</dt>
                  <dd className="m-0 text-text">{user.bio}</dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : (
          <p className="text-[14px] text-text-muted">
            We couldn&apos;t load your profile right now. Try refreshing the page.
          </p>
        )}
      </main>
    </>
  );
}
