import Link from "next/link";
import { AuthGithubButton } from "./auth-github-button";

/** Sign-in / sign-up card in the landing page's panel style. */
export function AuthCard({ next }: { next?: string }) {
  return (
    <div className="au-card">
      <p className="au-title">Sign in to DevTunnel</p>
      <p className="au-text">
        Connect your GitHub account to get matched with open source tasks.
      </p>

      <AuthGithubButton next={next} />

      <div className="au-or">
        <i />
        <span>secured via oauth</span>
        <i />
      </div>

      <p className="au-legal">
        By continuing you agree to the
        <br />
        <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>
      </p>
    </div>
  );
}
