"use client";

import { GA_MEASUREMENT_ID } from "@/lib/config";
import { openCookieSettings } from "@/lib/consent";

/**
 * "Cookie settings" — reopens the consent banner so a visitor can change
 * their analytics choice at any time. Renders nothing while analytics isn't
 * configured, because then there is no choice to change.
 */
export function CookieSettingsLink({ className = "" }: { className?: string }) {
  if (!GA_MEASUREMENT_ID) return null;
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      Cookie settings
    </button>
  );
}
