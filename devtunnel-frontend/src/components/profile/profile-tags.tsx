import type { AuthUser } from "@/lib/auth/types";
import {
  DEVELOPER_ROLE_LABEL,
  EXPERIENCE_LEVEL_LABEL,
} from "@/lib/onboarding/types";
import { getTechTagClasses } from "@/lib/home/tag-style";

const ROLE_LABEL: Record<AuthUser["role"], string> = {
  CONTRIBUTOR: "Contributor",
  MAINTAINER: "Maintainer",
  ADMIN: "Admin",
};

/**
 * Badge row under the profile header. Every badge here reads from a real
 * `AuthUser` field:
 * - Account role always renders — it's on every session (`user.role`).
 * - Developer role / experience / skills / technologies only render when
 *   present, since `GET /auth/me` may not send them yet (see the comment
 *   on `AuthUser` in lib/auth/types.ts). Nothing here is a guess or a
 *   sample value — an empty onboarding field just means one fewer badge,
 *   never a placeholder badge (Frontend_Development_Rules.txt rule 58).
 */
export function ProfileTags({ user }: { user: AuthUser }) {
  const tech = [...(user.skills ?? []), ...(user.technologies ?? [])];
  const hasIdentityTags = Boolean(user.developerRole || user.experienceLevel);

  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      <span className="rounded-md border border-accent bg-surface-selected px-2.5 py-1 text-[11px] text-status-success-label">
        {ROLE_LABEL[user.role]}
      </span>

      {user.developerRole ? (
        <span className="rounded-md border border-accent bg-surface-selected px-2.5 py-1 text-[11px] text-status-success-label">
          {DEVELOPER_ROLE_LABEL[user.developerRole]}
        </span>
      ) : null}

      {user.experienceLevel ? (
        <span className="rounded-md border border-border bg-surface-raised px-2.5 py-1 text-[11px] text-text-muted">
          {EXPERIENCE_LEVEL_LABEL[user.experienceLevel]}
        </span>
      ) : null}

      {hasIdentityTags && tech.length > 0 ? (
        <span aria-hidden="true" className="mx-1 h-3.5 w-px bg-border" />
      ) : null}

      {tech.map((name) => (
        <span
          key={name}
          className={`rounded-md border px-2.5 py-1 text-[11px] ${getTechTagClasses(name)}`}
        >
          {name}
        </span>
      ))}
    </div>
  );
}