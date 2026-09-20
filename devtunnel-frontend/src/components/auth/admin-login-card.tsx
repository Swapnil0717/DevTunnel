import { GithubLoginButton } from "./github-login-button";

interface AdminLoginCardProps {
  next?: string;
  signedInAsNonAdmin?: string;
}

export function AdminLoginCard({
  next,
  signedInAsNonAdmin,
}: AdminLoginCardProps) {
  return (
    <div className="w-full max-w-[340px] rounded-[10px] border border-border bg-surface px-[26px] py-7">
      <p className="m-0 mb-1 text-center text-[15px] font-medium text-text">
        DevTunnel Admin
      </p>

      <p className="m-0 mb-[22px] text-center text-[13px] leading-[1.5] text-text-muted">
        Sign in with the GitHub account authorized to curate
        DevTunnel projects.
      </p>

      {signedInAsNonAdmin ? (
        <p className="m-0 mb-[14px] rounded-md border border-status-error-border bg-status-error-bg px-3 py-2 text-center text-xs leading-[1.5] text-status-error-text">
          Signed in to DevTunnel as{" "}
          <strong>{signedInAsNonAdmin}</strong>, but this account
          doesn&apos;t have admin access. Continuing will re-check
          that GitHub account.
        </p>
      ) : null}

      <GithubLoginButton next={next} />

      <div className="my-[18px] flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />

        <span className="font-mono text-[11px] text-text-faint">
          secured via oauth
        </span>

        <div className="h-px flex-1 bg-border" />
      </div>

      <p className="m-0 text-center text-[11.5px] leading-[1.6] text-text-faint">
        This portal is restricted to authorized DevTunnel staff.
        <br />
        Contributor sign-in lives at{" "}
        <span className="text-text-muted">
          devtunnel.tech/login
        </span>
      </p>
    </div>
  );
}