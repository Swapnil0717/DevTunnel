"use client";

import { useState } from "react";
import type { AuthUser } from "@/lib/auth/types";
import { useAuth } from "@/lib/auth/use-auth";
import { updateSkills, SettingsApiError } from "@/lib/settings/api";
import { EditIcon } from "@/components/layout/nav-icons";
import { Spinner } from "@/components/ui/spinner";
import { TagInput } from "@/components/onboarding/tag-input";
import { OptionCard } from "@/components/onboarding/option-card";
import { TechIcon } from "@/components/onboarding/tech-icon";
import { TechPicker } from "@/components/onboarding/tech-picker";
import {
  DEVELOPER_ROLE_DESCRIPTION,
  DEVELOPER_ROLE_LABEL,
  EXPERIENCE_LEVEL_LABEL,
  type DeveloperRole,
  type ExperienceLevel,
} from "@/lib/onboarding/types";

interface SkillsBackgroundCardProps {
  user: AuthUser;
}

const DEVELOPER_ROLES = Object.keys(DEVELOPER_ROLE_LABEL) as DeveloperRole[];
const EXPERIENCE_LEVELS = Object.keys(EXPERIENCE_LEVEL_LABEL) as ExperienceLevel[];

/**
 * "Skills and background" section — the settings-page counterpart to
 * onboarding's `ProfileStep`. Onboarding only ever asks for this once;
 * this card is what lets a contributor keep it current afterward (new
 * skills picked up, a role they no longer do, etc.) without re-running
 * the wizard. Reuses the exact same inputs onboarding uses
 * (`TagInput`/`OptionCard`/`TechPicker`) so the two never drift apart in
 * behavior, just in surrounding chrome (a view/edit toggle here, vs.
 * always-open during onboarding).
 *
 * `bio` isn't here — it's owned by the "Profile" card/`PATCH
 * /settings/profile` — and `intent` isn't here either, since it's a
 * one-time onboarding choice this page doesn't re-ask.
 */
export function SkillsBackgroundCard({ user }: SkillsBackgroundCardProps) {
  const { refreshUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [developerRoles, setDeveloperRoles] = useState<DeveloperRole[]>(user.developerRoles);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(
    user.experienceLevel,
  );
  const [skills, setSkills] = useState<string[]>(user.skills);
  const [technologies, setTechnologies] = useState<string[]>(user.technologies);
  const [interests, setInterests] = useState<string[]>(user.interests);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setError(null);
    setDeveloperRoles(user.developerRoles);
    setExperienceLevel(user.experienceLevel);
    setSkills(user.skills);
    setTechnologies(user.technologies);
    setInterests(user.interests);
    setIsEditing(true);
  }

  function cancelEditing() {
    setError(null);
    setIsEditing(false);
  }

  function toggleDeveloperRole(role: DeveloperRole) {
    setDeveloperRoles((current) =>
      current.includes(role) ? current.filter((value) => value !== role) : [...current, role],
    );
  }

  const canSave = developerRoles.length > 0 && experienceLevel !== null;

  async function handleSave() {
    if (!canSave || isSaving) {
      if (!canSave) {
        setError("Select at least one developer role and an experience level.");
      }
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      await updateSkills({
        skills,
        technologies,
        developerRoles,
        experienceLevel,
        interests,
      });
      await refreshUser();
      setIsEditing(false);
    } catch (err) {
      setError(
        err instanceof SettingsApiError
          ? "Couldn't save your skills and background. Try again."
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-[10px] border border-border bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 mb-1 text-sm font-medium text-text">Skills and background</h2>
          <p className="m-0 text-[11.5px] text-text-faint">
            Set during onboarding — shown to maintainers when you apply to a project.
          </p>
        </div>
        {!isEditing ? (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-text transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <EditIcon className="h-3.5 w-3.5" />
            Edit
          </button>
        ) : null}
      </div>

      {isEditing ? (
        <div className="flex flex-col gap-5">
          <div>
            <p id="settings-developer-role-label" className="mb-2 text-[11.5px] text-text-muted">
              Developer role
            </p>
            <div
              role="group"
              aria-labelledby="settings-developer-role-label"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
            >
              {DEVELOPER_ROLES.map((role) => (
                <OptionCard
                  key={role}
                  multiple
                  label={DEVELOPER_ROLE_LABEL[role]}
                  description={DEVELOPER_ROLE_DESCRIPTION[role]}
                  selected={developerRoles.includes(role)}
                  onSelect={() => toggleDeveloperRole(role)}
                />
              ))}
            </div>
          </div>

          <div>
            <p id="settings-experience-level-label" className="mb-2 text-[11.5px] text-text-muted">
              Experience level
            </p>
            <div
              role="radiogroup"
              aria-labelledby="settings-experience-level-label"
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              {EXPERIENCE_LEVELS.map((level) => (
                <OptionCard
                  key={level}
                  label={EXPERIENCE_LEVEL_LABEL[level]}
                  selected={experienceLevel === level}
                  onSelect={() => setExperienceLevel(level)}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <TagInput
              label="Skills"
              variant="skill"
              values={skills}
              onChange={setSkills}
              placeholder="Add a skill and press Enter"
            />

            <div>
              <TagInput
                label="Technologies"
                variant="tech"
                values={technologies}
                onChange={setTechnologies}
                placeholder="Add a technology and press Enter"
                renderIcon={(value) => <TechIcon name={value} />}
              />
              <TechPicker values={technologies} onChange={setTechnologies} />
            </div>
          </div>

          <TagInput
            label="Interests"
            variant="interest"
            values={interests}
            onChange={setInterests}
            placeholder="Add an interest and press Enter"
          />

          <div className="flex items-center gap-3 border-t border-border-subtle pt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-md bg-text px-3.5 py-2 text-[13px] font-medium text-bg transition-colors hover:bg-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? <Spinner size={13} /> : null}
              {isSaving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              disabled={isSaving}
              className="rounded-md border border-border px-3.5 py-2 text-[13px] font-medium text-text-muted transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            {!isSaving && error ? (
              <p className="m-0 text-[12px] text-status-error-label">{error}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            {user.developerRoles.length > 0 ? (
              user.developerRoles.map((role) => (
                <span
                  key={role}
                  className="rounded-full border border-accent bg-surface-selected px-3 py-1 text-[11px] text-text"
                >
                  {DEVELOPER_ROLE_LABEL[role]}
                </span>
              ))
            ) : (
              <p className="m-0 text-[12px] italic text-text-faint">No developer role set.</p>
            )}
          </div>

          {(["skills", "technologies", "interests"] as const).map((key) => {
            const values = { skills: user.skills, technologies: user.technologies, interests: user.interests }[key];
            const variantClasses = {
              skills: "bg-tag-skill-bg border-tag-skill-border text-tag-skill-text",
              technologies: "bg-tag-tech-bg border-tag-tech-border text-tag-tech-text",
              interests: "bg-tag-interest-bg border-tag-interest-border text-tag-interest-text",
            }[key];
            const label = { skills: "Skills", technologies: "Technologies", interests: "Interests" }[key];

            if (values.length === 0) return null;

            return (
              <div key={key}>
                <p className="m-0 mb-1.5 text-[11px] text-text-faint">{label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {values.map((value) => (
                    <span
                      key={value}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] ${variantClasses}`}
                    >
                      {key === "technologies" ? <TechIcon name={value} /> : null}
                      {value}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}