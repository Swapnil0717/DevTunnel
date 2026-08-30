/**
 * Central, single-source-of-truth config for the frontend.
 *
 * Keeping these in one file means every page/component derives the same
 * name, URL and API base instead of re-typing (and risking inconsistent)
 * literals — see Frontend_Development_Rules.txt rule 44 (consistent entity
 * names) and rule 51 (centralize cross-cutting concerns).
 */

/** Base URL of the DevTunnel backend API. Never hardcode this elsewhere. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

/** Canonical public URL of this frontend deployment. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://devtunnel.dev";

export const SITE_NAME = "DevTunnel";

export const SITE_DESCRIPTION =
  "DevTunnel connects contributors with open source projects to build, and helps maintainers organize tasks, roles, and pull requests.";
