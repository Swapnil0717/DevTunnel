import { API_BASE_URL } from "@/lib/config";
import type { OnboardingData } from "./types";

export class OnboardingApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OnboardingApiError";
    this.status = status;
  }
}

/**
 * Submits the completed onboarding form.
 *
 * Assumption (documented since the backend isn't part of this deliverable
 * — same convention as `githubLoginActionUrl`/`fetchCurrentUser` in
 * lib/auth/api.ts): posts to `PATCH /auth/onboarding`, a natural extension
 * of the existing Module C1 auth routes (`POST /auth/github`,
 * `GET /auth/callback`, `GET /auth/me`, `POST /auth/logout`). The backend
 * owns validating and persisting these fields once the corresponding
 * columns exist (see devtunnel-backend/sql/001_create_schema.sql, which
 * currently only defines the auth columns). This frontend never assumes
 * the data was actually saved beyond what a 2xx response confirms.
 */
export async function submitOnboarding(data: OnboardingData): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/onboarding`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new OnboardingApiError(
      `Failed to save onboarding details (${res.status})`,
      res.status,
    );
  }
}
