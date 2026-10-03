// devtunnel-frontend/src/lib/admin/sponsors/types.ts
import type { SponsorTierId } from "@/lib/sponsors/api";

/**
 * Wire types for `/admin/sponsors` and `/admin/sponsor-goal`, copied from the
 * backend (devtunnel-backend/src/db/adminSponsors.ts, Part 4). Keep the two
 * in sync. Every body is camelCase JSON in a `{ data: ... }` envelope.
 */

export const ADMIN_SPONSOR_STATUSES = ["pending", "captured", "refunded", "failed"] as const;
export type AdminSponsorStatus = (typeof ADMIN_SPONSOR_STATUSES)[number];

/** Backend max for `?limit=` on `GET /admin/sponsors`. */
export const ADMIN_SPONSORS_PAGE_SIZE = 100;

export interface AdminSponsor {
  id: string;
  /** null for manual rows. */
  razorpayPaymentId: string | null;
  amountPaise: number;
  /** Rupees (amountPaise / 100). */
  amountInr: number;
  currency: string;
  status: AdminSponsorStatus;
  displayName: string | null;
  githubUsername: string | null;
  isAnonymous: boolean;
  showAmount: boolean;
  /** Derived from the amount by the database; read-only. */
  tier: SponsorTierId;
  approved: boolean;
  hidden: boolean;
  source: "razorpay" | "manual";
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSponsorsPage {
  sponsors: AdminSponsor[];
  /** Pass as `before` on the next request. `null` when there are no more rows. */
  nextCursor: string | null;
}

/** `PATCH /admin/sponsors/:id` — only these fields can ever change. `tier` is derived and rejected. */
export interface AdminSponsorPatch {
  displayName?: string | null;
  githubUsername?: string | null;
  showAmount?: boolean;
  isAnonymous?: boolean;
  approved?: boolean;
  hidden?: boolean;
}

/** `POST /admin/sponsors` — a sponsor who paid outside Razorpay. */
export interface AdminManualSponsorPayload {
  amountInr: number;
  displayName?: string | null;
  githubUsername?: string | null;
  isAnonymous?: boolean;
  showAmount?: boolean;
  approved?: boolean;
  /** ISO 8601 with offset (a `Z` timestamp is fine). Defaults to now on the server. */
  paidAt?: string;
}

/** `PUT /admin/sponsor-goal`. `note`: omit to keep the existing note, `null` to clear it. */
export interface AdminSponsorGoalPayload {
  /** "YYYY-MM". Defaults to the current India-time month on the server. */
  month?: string;
  goalInr: number;
  note?: string | null;
}

export interface AdminSponsorGoal {
  /** First day of the month, "YYYY-MM-01". */
  month: string;
  goalPaise: number;
  goalInr: number;
  note: string | null;
}
