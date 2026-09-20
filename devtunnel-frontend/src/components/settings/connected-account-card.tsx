import type { AuthUser } from "@/lib/auth/types";

/**
 * "Connected account" section — every DevTunnel account is created via
 * GitHub sign-in (db/users.ts `upsertUserFromGitHub`), so there is no
 * "connect GitHub" action to offer here; this is a read-only status card
 * confirming which GitHub identity this account is linked to, with a
 * link out to the real profile. `githubUsername`/`githubProfileUrl` are
 * already on `AuthUser` — no extra fetch needed.
 */
export function ConnectedAccountCard({ user }: { user: AuthUser }) {
  return (
    <section className="rounded-[10px] border border-border bg-surface p-5">
      <h2 className="m-0 mb-3 text-sm font-medium text-text">Connected account</h2>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="m-0 text-[13px] text-text">GitHub</p>
          <p className="m-0 truncate text-[11.5px] text-text-muted">
            {user.githubUsername ? `Connected as @${user.githubUsername}` : "Not connected"}
          </p>
        </div>

        {user.githubUsername ? (
          <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border border-status-success-border bg-status-success-bg px-2.5 py-1 text-[11px] font-medium text-status-success-label">
            Connected
          </span>
        ) : (
          <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border border-border-subtle bg-surface-raised px-2.5 py-1 text-[11px] text-text-faint">
            Not connected
          </span>
        )}
      </div>

      {user.githubProfileUrl ? (
        <a
          href={user.githubProfileUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-[12px] text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          View GitHub profile
        </a>
      ) : null}
    </section>
  );
}
