import { GithubLoginButton } from "./github-login-button";

interface LoginCardProps {
  next?: string;
}

export function LoginCard({ next }: LoginCardProps) {
  return (
    <div className="w-full max-w-[340px] rounded-[24px] border border-white/10 bg-black/70 px-[26px] py-7 backdrop-blur-md">
      <p className="m-0 mb-1 text-center text-[15px] font-medium text-text">
        Sign in to DevTunnel
      </p>

      <p className="m-0 mb-[22px] text-center font-sub text-[13px] leading-[1.5] text-text-muted">
        Connect your GitHub account to create and manage tunnels.
      </p>

      <GithubLoginButton next={next} />

      <div className="my-[18px] flex items-center gap-2">
        <div className="h-px flex-1 bg-white/10" />

        <span className="font-mono text-[11px] text-text-faint">
          secured via oauth
        </span>

        <div className="h-px flex-1 bg-white/10" />
      </div>

      <p className="m-0 text-center font-sub text-[11.5px] leading-[1.6] text-text-faint">
        By continuing you agree to the
        <br />
        <span className="text-text-muted">
          Terms of Service
        </span>{" "}
        and{" "}
        <span className="text-text-muted">
          Privacy Policy
        </span>
      </p>
    </div>
  );
}