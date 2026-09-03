import type { AuthUser } from "@/lib/auth/types";
import {
  CONTRIBUTOR_INTENT_LABEL,
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
 * Badge row + onboarding-details block under the profile header. Every
 * badge/line here reads from a real `AuthUser` field — `GET /auth/me`
 * now returns every field the onboarding wizard asks for (devtunnel-backend
 * src/db/users.ts `toAuthUser`), so this renders all of it, not just a
 * subset:
 * - Account role always renders — it's on every session (`user.role`).
 * - "Maintainer" also renders as its own badge whenever
 *   `user.isMaintainer` is true (devtunnel.project_maintainers —
 *   devtunnel-backend src/db/devtunnelStats.ts `getIsMaintainer`), even
 *   for a `CONTRIBUTOR`-role account — maintaining a specific project and
 *   an account-wide role are two separate, both-real facts, so a
 *   contributor who also maintains a project shows both badges rather
 *   than only one. (Skipped only when `role` is already `MAINTAINER` or
 *   `ADMIN`, so the word "Maintainer" never renders twice.)
 * - Developer role / experience level / skills / technologies / interests
 *   / intent only render when present — an empty onboarding field just
 *   means one fewer badge/line, never a placeholder
 *   (Frontend_Development_Rules.txt rule 58).
 */
export function ProfileTags({ user }: { user: AuthUser }) {
  const tech = [...(user.skills ?? []), ...(user.technologies ?? [])];
  const interests = user.interests ?? [];
  const hasIdentityTags = Boolean(user.developerRole || user.experienceLevel);
  const showMaintainerBadge = user.isMaintainer && user.role !== "MAINTAINER" && user.role !== "ADMIN";

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md border border-accent bg-surface-selected px-2.5 py-1 text-[11px] text-status-success-label">
          {ROLE_LABEL[user.role]}
        </span>

        {showMaintainerBadge ? (
          <span className="rounded-md border border-accent bg-surface-selected px-2.5 py-1 text-[11px] text-status-success-label">
            Maintainer
          </span>
        ) : null}

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

      {interests.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-text-dim">Interested in</span>
          {interests.map((name) => (
            <span
              key={name}
              className="rounded-md border border-border bg-surface-raised px-2.5 py-1 text-[11px] text-text-muted"
            >
              {name}
            </span>
          ))}
        </div>
      ) : null}

      {user.intent ? (
        <p className="m-0 mt-2 text-[11px] text-text-dim">
          {CONTRIBUTOR_INTENT_LABEL[user.intent]}
        </p>
      ) : null}
    </div>
  );
}