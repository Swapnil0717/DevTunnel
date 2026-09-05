import { GithubLoginButton } from "./github-login-button";

interface AdminLoginCardProps {
  next?: string;
  /**
   * Set when a signed-in DevTunnel account (visible to the server via
   * `getServerUser()` in admin/login/page.tsx) was checked and does not
   * have admin access. Shown as an honest, accurate notice rather than
   * silently forwarding that person into the contributor app or hiding
   * why the button is still here (Frontend_Development_Rules.txt rule 43
   * — keep important facts explicit; rule 58/59 — never fabricate,
   * never hide real state).
   */
  signedInAsNonAdmin?: string;
}

/**
 * `/admin/login` (devtunnel_workflow.txt, Module A1 — Admin Authentication).
 *
 * There is deliberately no separate admin credential form here. DevTunnel
 * has exactly one identity provider — GitHub — for both portals
 * (devtunnel-backend/src/routes/auth.ts exposes a single `/auth/github`).
 * What makes this the *admin* sign-in is the destination: the button below
 * posts to the same backend endpoint as the main site's login card, just
 * with `next` pointed at the admin portal, and the RBAC check in
 * `oauth-callback-view.tsx` + `admin/(protected)/layout.tsx` is what
 * actually gates entry (Module A1: "Role-based access control (RBAC)").
 */
export function AdminLoginCard({ next, signedInAsNonAdmin }: AdminLoginCardProps) {
  return (
    <div className="w-full max-w-[340px] rounded-[10px] border border-border bg-surface px-[26px] py-7">
      <p className="m-0 mb-1 text-center text-[15px] font-medium text-text">
        DevTunnel Admin
      </p>
      <p className="m-0 mb-[22px] text-center text-[13px] leading-[1.5] text-text-muted">
        Sign in with the GitHub account authorized to curate DevTunnel
        projects.
      </p>

      {signedInAsNonAdmin ? (
        <p className="m-0 mb-[14px] rounded-md border border-status-error-border bg-status-error-bg px-3 py-2 text-center text-xs leading-[1.5] text-status-error-text">
          Signed in to DevTunnel as <strong>{signedInAsNonAdmin}</strong>, but
          this account doesn&apos;t have admin access. Continuing will
          re-check that GitHub account.
        </p>
      ) : null}

      <GithubLoginButton next={next} />

      <div className="my-[18px] flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="font-mono text-[11px] text-text-faint">secured via oauth</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <p className="m-0 text-center text-[11.5px] leading-[1.6] text-text-faint">
        This portal is restricted to authorized DevTunnel staff.
        <br />
        Contributor sign-in lives at{" "}
        <span className="text-text-muted">devtunnel.tech/login</span>
      </p>
    </div>
  );
}