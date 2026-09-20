"use client";

import { useState } from "react";
import {
  updateNotificationPreferences,
  SettingsApiError,
} from "@/lib/settings/api";
import type { NotificationPreferences } from "@/lib/settings/types";
import { Toggle } from "@/components/ui/toggle";
import { Spinner } from "@/components/ui/spinner";

interface NotificationPreferencesFormProps {
  initialPreferences: NotificationPreferences;
}

const ROWS: Array<{
  key: keyof NotificationPreferences;
  title: string;
  description: string;
}> = [
  {
    key: "issueAssigned",
    title: "New issue assigned to me",
    description: "Get notified when a maintainer assigns you a task.",
  },
  {
    key: "reviewRequested",
    title: "PR review requested",
    description: "Someone asks you to review their contribution.",
  },
  {
    key: "weeklyDigest",
    title: "Weekly digest",
    description: "A summary of new projects and open tasks.",
  },
];

/**
 * "Notifications" section — one save covers all three toggles (matches
 * the mockup's single "Save changes" button rather than per-toggle
 * autosave), backed by `PATCH /settings/notifications`
 * (devtunnel-backend/src/routes/settings.ts).
 */
export function NotificationPreferencesForm({
  initialPreferences,
}: NotificationPreferencesFormProps) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const isDirty = ROWS.some((row) => preferences[row.key] !== initialPreferences[row.key]);

  function toggle(key: keyof NotificationPreferences, value: boolean) {
    setSavedAt(null);
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (isSaving) return;
    setError(null);
    setIsSaving(true);

    try {
      const saved = await updateNotificationPreferences(preferences);
      setPreferences(saved);
      setSavedAt(Date.now());
    } catch (err) {
      setError(
        err instanceof SettingsApiError
          ? "Couldn't save your notification preferences. Try again."
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-[10px] border border-border bg-surface p-5">
      <h2 className="m-0 mb-3 text-sm font-medium text-text">Notifications</h2>

      <div className="flex flex-col">
        {ROWS.map((row, index) => (
          <div
            key={row.key}
            className={`flex items-center justify-between gap-4 py-3 ${
              index < ROWS.length - 1 ? "border-b border-border-subtle" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="m-0 text-[13px] text-text">{row.title}</p>
              <p className="m-0 text-[11.5px] text-text-muted">{row.description}</p>
            </div>
            <Toggle
              label={row.title}
              checked={preferences[row.key]}
              onChange={(checked) => toggle(row.key, checked)}
              disabled={isSaving}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="inline-flex items-center gap-1.5 rounded-md bg-text px-3.5 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
    </section>
  );
}
