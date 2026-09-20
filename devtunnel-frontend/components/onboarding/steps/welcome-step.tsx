import Image from "next/image";
import type { AuthUser } from "@/lib/auth/types";

interface WelcomeStepProps {
  user: AuthUser;
}

/**
 * Onboarding step 1 of 4: confirms what GitHub already gave us before
 * asking the person for anything new. Only renders fields that actually
 * came back on `AuthUser` — never fabricated placeholder profile data
 * (Frontend_Development_Rules.txt rule 49).
 */
export function WelcomeStep({ user }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center gap-5 py-6 text-center">
      {user.avatarUrl ? (
        <Image
          src={user.avatarUrl}
          alt=""
          width={64}
          height={64}
          className="rounded-full border border-border"
        />
      ) : null}

      <div>
        <h1 className="m-0 mb-1.5 text-[16px] font-medium text-text">
          Welcome, {user.name ?? user.username}
        </h1>
        <p className="m-0 max-w-[360px] text-[13px] leading-[1.5] text-text-muted">
          We imported your profile from GitHub. Next, let&apos;s set up your
          skills and interests so we can match you with the right projects.
        </p>
      </div>

      {user.githubUsername ? (
        <div className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface px-3 py-1.5 font-mono text-[11px] text-text-faint">
          Imported from GitHub · @{user.githubUsername}
        </div>
      ) : null}
    </div>
  );
}
