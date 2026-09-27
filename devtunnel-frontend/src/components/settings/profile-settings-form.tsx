"use client";

import { useState, type FormEvent } from "react";
import type { AuthUser } from "@/lib/auth/types";
import { useAuth } from "@/lib/auth/use-auth";
import { updateProfile, SettingsApiError } from "@/lib/settings/api";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { EditIcon } from "@/components/layout/nav-icons";
import { Spinner } from "@/components/ui/spinner";
import { EXPERIENCE_LEVEL_LABEL } from "@/lib/onboarding/types";

interface ProfileSettingsFormProps {
  user: AuthUser;
}

const BIO_MAX_LENGTH = 500;
const NAME_MAX_LENGTH = 80;

/**
 * "Profile" section — hero-style card (avatar, name, handle, experience
 * badge, bio) with an explicit view/edit toggle instead of a
 * permanently-open form, matching the redesigned settings page's
 * profile-first layout. Editable fields are still only name + bio;
 * `experienceLevel` is shown read-only here as a badge (it's owned by
 * the "Skills and background" card — see SkillsBackgroundCard — so it
 * isn't edited from two places). Everything else about identity (email,
 * username, avatar, GitHub handle) is sourced from GitHub at sign-in
 * (db/users.ts `upsertUserFromGitHub`) and stays read-only, same posture
 * as before this redesign — this form only ever PATCHes the two fields
 * it renders as inputs (devtunnel-backend/src/routes/settings.ts
 * `profileUpdateSchema` doesn't accept anything else regardless of what's
 * sent).
 */
export function ProfileSettingsForm({ user }: ProfileSettingsFormProps) {
  const { refreshUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user.name ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setError(null);
    setName(user.name ?? "");
    setBio(user.bio ?? "");
    setIsEditing(true);
  }

  function cancelEditing() {
    setError(null);
    setIsEditing(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    setError(null);
    setIsSaving(true);

    try {
      await updateProfile({
        name: name.trim().length > 0 ? name.trim() : null,
        bio: bio.trim().length > 0 ? bio.trim() : null,
      });
      await refreshUser();
      setIsEditing(false);
    } catch (err) {
      setError(
        err instanceof SettingsApiError
          ? "Couldn't save your profile. Try again."
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-[10px] border border-border bg-surface p-5">
      {isEditing ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <ProfileAvatar avatarUrl={user.avatarUrl} />
            <div className="min-w-0">
              <p className="m-0 truncate text-[13px] text-text">{user.email}</p>
              <p className="m-0 truncate font-mono text-[11.5px] text-text-dim">@{user.username}</p>
            </div>
          </div>

          <div>
            <label htmlFor="settings-name" className="mb-1.5 block text-[11.5px] text-text-muted">
              Display name
            </label>
            <input
              id="settings-name"
              name="name"
              type="text"
              value={name}
              maxLength={NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
              placeholder={user.username}
              className="w-full rounded-md border border-border bg-surface-raised p-2.5 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </div>

          <div>
            <label htmlFor="settings-bio" className="mb-1.5 block text-[11.5px] text-text-muted">
              Bio
            </label>
            <textarea
              id="settings-bio"
              name="bio"
              rows={3}
              value={bio}
              maxLength={BIO_MAX_LENGTH}
              onChange={(event) => setBio(event.target.value)}
              placeholder="Contributing to open source, one PR at a time."
              className="w-full resize-none rounded-md border border-border bg-surface-raised p-2.5 text-[12.5px] leading-[1.5] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
            <p className="m-0 mt-1 text-right text-[10.5px] text-text-faint">
              {bio.length}/{BIO_MAX_LENGTH}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
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
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <ProfileAvatar avatarUrl={user.avatarUrl} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="m-0 truncate text-[16px] font-medium text-text">
                {user.name ?? user.username}
              </p>
              {user.experienceLevel ? (
                <span className="inline-flex flex-shrink-0 items-center rounded-md border border-status-success-border bg-status-success-bg px-2 py-0.5 text-[10.5px] text-status-success-label">
                  {EXPERIENCE_LEVEL_LABEL[user.experienceLevel]}
                </span>
              ) : null}
            </div>
            <p className="m-0 mt-0.5 truncate font-mono text-[11px] text-text-dim">
              @{user.username} · {user.email}
            </p>
            {user.bio ? (
              <p className="m-0 mt-1.5 text-[12px] leading-[1.5] text-text-muted">{user.bio}</p>
            ) : (
              <p className="m-0 mt-1.5 text-[12px] italic text-text-faint">No bio yet.</p>
            )}
          </div>

          <button
            type="button"
            onClick={startEditing}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[12px] font-medium text-text transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <EditIcon className="h-3.5 w-3.5" />
            Edit profile
          </button>
        </div>
      )}
    </section>
  );
}