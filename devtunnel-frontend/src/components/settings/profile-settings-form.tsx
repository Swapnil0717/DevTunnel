"use client";

import { useState, type FormEvent } from "react";
import type { AuthUser } from "@/lib/auth/types";
import { useAuth } from "@/lib/auth/use-auth";
import { updateProfile, SettingsApiError } from "@/lib/settings/api";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Spinner } from "@/components/ui/spinner";

interface ProfileSettingsFormProps {
  user: AuthUser;
}

const BIO_MAX_LENGTH = 500;
const NAME_MAX_LENGTH = 80;

/**
 * "Profile" section — display name + bio. Everything else about identity
 * (email, username, avatar, GitHub handle) is sourced from GitHub at
 * sign-in (db/users.ts `upsertUserFromGitHub`) and shown read-only here,
 * same posture as the existing "Account" section in this page before this
 * change — this form only ever PATCHes the two fields it renders as
 * inputs (devtunnel-backend/src/routes/settings.ts `profileUpdateSchema`
 * doesn't accept anything else regardless of what's sent).
 */
export function ProfileSettingsForm({ user }: ProfileSettingsFormProps) {
  const { refreshUser } = useAuth();
  const [name, setName] = useState(user.name ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const isDirty = name !== (user.name ?? "") || bio !== (user.bio ?? "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDirty || isSaving) return;

    setError(null);
    setIsSaving(true);

    try {
      await updateProfile({
        name: name.trim().length > 0 ? name.trim() : null,
        bio: bio.trim().length > 0 ? bio.trim() : null,
      });
      await refreshUser();
      setSavedAt(Date.now());
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
      <h2 className="m-0 mb-4 text-sm font-medium text-text">Profile</h2>

      <div className="mb-5 flex items-center gap-3">
        <ProfileAvatar avatarUrl={user.avatarUrl} />
        <div className="min-w-0">
          <p className="m-0 truncate text-[13px] text-text">{user.email}</p>
          <p className="m-0 truncate font-mono text-[11.5px] text-text-dim">@{user.username}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            disabled={!isDirty || isSaving}
            className="inline-flex items-center gap-1.5 rounded-md bg-text px-3.5 py-2 text-[13px] font-medium text-bg transition-colors hover:bg-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <Spinner size={13} /> : null}
            {isSaving ? "Saving…" : "Save changes"}
          </button>
          {!isSaving && error ? (
            <p className="m-0 text-[12px] text-status-error-label">{error}</p>
          ) : null}
          {!isSaving && !error && savedAt && !isDirty ? (
            <p className="m-0 text-[12px] text-text-muted">Saved</p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
