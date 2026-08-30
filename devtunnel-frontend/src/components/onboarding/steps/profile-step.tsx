import Image from "next/image";
import type { AuthUser } from "@/lib/auth/types";
import { TagInput } from "../tag-input";
import { OptionCard } from "../option-card";
import {
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
 * experience level, and interests (3_devtunnel_onboarding.html).
 */
export function ProfileStep({ user, data, onChange }: ProfileStepProps) {
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="w-full flex-shrink-0 rounded-[10px] border border-border bg-surface p-[18px] md:w-[200px]">
        {user.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt=""
            width={48}
            height={48}
            className="mb-3 rounded-full border border-border"
          />
        ) : null}
        <p className="m-0 mb-0.5 text-[13px] font-medium text-text">
          {user.name ?? user.username}
        </p>
        <p className="m-0 mb-3 font-mono text-[12px] text-text-dim">@{user.username}</p>
        {user.githubUsername ? (
          <div className="flex items-center gap-1.5 border-t border-border-subtle pt-2.5 text-[11px] text-text-faint">
            Imported from GitHub
          </div>
        ) : null}
      </aside>

      <div className="flex-1">
        <h1 className="m-0 mb-1 text-[15px] font-medium text-text">
          Tell us about your bio and skills
        </h1>
        <p className="m-0 mb-[18px] text-[12.5px] text-text-muted">
          This helps us match you with the right projects and tasks.
        </p>

        <div className="mb-[18px]">
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

        <div className="mb-[18px]">
          <TagInput
            label="Skills"
            variant="skill"
            values={data.skills}
            onChange={(skills) => onChange({ skills })}
            placeholder="Add a skill and press Enter"
          />
        </div>

        <div className="mb-[18px]">
          <TagInput
            label="Technologies"
            variant="tech"
            values={data.technologies}
            onChange={(technologies) => onChange({ technologies })}
            placeholder="Add a technology and press Enter"
          />
        </div>

        <div className="mb-[18px] flex flex-col gap-6 sm:flex-row">
          <div className="flex-1">
            <p id="developer-role-label" className="mb-2 text-[11.5px] text-text-muted">
              Developer role
            </p>
            <div
              role="radiogroup"
              aria-labelledby="developer-role-label"
              className="flex flex-col gap-1.5"
            >
              {DEVELOPER_ROLES.map((role) => (
                <OptionCard
                  key={role}
                  label={DEVELOPER_ROLE_LABEL[role]}
                  selected={data.developerRole === role}
                  onSelect={() => onChange({ developerRole: role })}
                />
              ))}
            </div>
          </div>

          <div className="flex-1">
            <p id="experience-level-label" className="mb-2 text-[11.5px] text-text-muted">
              Experience level
            </p>
            <div
              role="radiogroup"
              aria-labelledby="experience-level-label"
              className="flex flex-col gap-1.5"
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
        </div>

        <TagInput
          label="Interests"
          variant="interest"
          values={data.interests}
          onChange={(interests) => onChange({ interests })}
          placeholder="Add an interest and press Enter"
        />
      </div>
    </div>
  );
}
