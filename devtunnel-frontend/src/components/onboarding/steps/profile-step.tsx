import Image from "next/image";
import type { AuthUser } from "@/lib/auth/types";
import { TagInput } from "../tag-input";
import { OptionCard } from "../option-card";
import { TechIcon } from "../tech-icon";
import { TechPicker } from "../tech-picker";
import {
  DEVELOPER_ROLE_DESCRIPTION,
  DEVELOPER_ROLE_LABEL,
  EXPERIENCE_LEVEL_LABEL,
  type DeveloperRole,
  type ExperienceLevel,
  type OnboardingData,
} from "@/lib/onboarding/types";

interface ProfileStepProps {
  user: AuthUser;
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const DEVELOPER_ROLES = Object.keys(DEVELOPER_ROLE_LABEL) as DeveloperRole[];
const EXPERIENCE_LEVELS = Object.keys(EXPERIENCE_LEVEL_LABEL) as ExperienceLevel[];

/**
 * Onboarding step 2 of 4: bio, skills, technologies, developer role,
 * experience level, and interests (originally scoped from
 * 3_devtunnel_onboarding.html). Reworked into a single responsive column —
 * a fixed-width side profile card doesn't have anywhere sensible to go on
 * a narrow viewport, so identity is a compact top strip instead, and every
 * option group below reflows by breakpoint rather than by a hardcoded
 * pixel width (Frontend_Development_Rules.txt rule 33: mobile-first
 * responsive design).
 */
export function ProfileStep({ user, data, onChange }: ProfileStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        {user.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 flex-shrink-0 rounded-full border border-border"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[13px] font-medium text-text">
            {user.name ?? user.username}
          </p>
          <p className="m-0 truncate font-mono text-[11.5px] text-text-dim">@{user.username}</p>
        </div>
        {user.githubUsername ? (
          <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border border-border-subtle bg-surface-raised px-2.5 py-1 text-[11px] text-text-faint">
            Imported from GitHub
          </span>
        ) : null}
      </div>

      <div>
        <h1 className="m-0 mb-1 text-[16px] font-medium text-text sm:text-[15px]">
          Tell us about your bio and skills
        </h1>
        <p className="m-0 text-[12.5px] text-text-muted">
          This helps us match you with the right projects and tasks.
        </p>
      </div>

      <div>
        <label htmlFor="onboarding-bio" className="mb-1.5 block text-[11.5px] text-text-muted">
          Bio
        </label>
        <textarea
          id="onboarding-bio"
          name="bio"
          rows={3}
          value={data.bio}
          onChange={(event) => onChange({ bio: event.target.value })}
          placeholder="Frontend engineer who likes clean APIs and DX tooling."
          className="w-full resize-none rounded-md border border-border bg-surface p-2.5 text-[12.5px] leading-[1.5] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TagInput
          label="Skills"
          variant="skill"
          values={data.skills}
          onChange={(skills) => onChange({ skills })}
          placeholder="Add a skill and press Enter"
        />

        <div>
          <TagInput
            label="Technologies"
            variant="tech"
            values={data.technologies}
            onChange={(technologies) => onChange({ technologies })}
            placeholder="Add a technology and press Enter"
            renderIcon={(value) => <TechIcon name={value} />}
          />
          <TechPicker
            values={data.technologies}
            onChange={(technologies) => onChange({ technologies })}
          />
        </div>
      </div>

      <div>
        <p id="developer-role-label" className="mb-2 text-[11.5px] text-text-muted">
          Developer role
        </p>
        <div
          role="radiogroup"
          aria-labelledby="developer-role-label"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {DEVELOPER_ROLES.map((role) => (
            <OptionCard
              key={role}
              label={DEVELOPER_ROLE_LABEL[role]}
              description={DEVELOPER_ROLE_DESCRIPTION[role]}
              selected={data.developerRole === role}
              onSelect={() => onChange({ developerRole: role })}
            />
          ))}
        </div>
      </div>

      <div>
        <p id="experience-level-label" className="mb-2 text-[11.5px] text-text-muted">
          Experience level
        </p>
        <div
          role="radiogroup"
          aria-labelledby="experience-level-label"
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        >
          {EXPERIENCE_LEVELS.map((level) => (
            <OptionCard
              key={level}
              label={EXPERIENCE_LEVEL_LABEL[level]}
              selected={data.experienceLevel === level}
              onSelect={() => onChange({ experienceLevel: level })}
            />
          ))}
        </div>
      </div>

      <TagInput
        label="Interests"
        variant="interest"
        values={data.interests}
        onChange={(interests) => onChange({ interests })}
        placeholder="Add an interest and press Enter"
      />
    </div>
  );
}