import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sponsors — admin read/write side of `devtunnel.sponsorships` and
 * `devtunnel.sponsor_goals` (sql/048). Backs `/admin/sponsors` and
 * `/admin/sponsor-goal` (src/routes/admin/sponsors.ts).
 *
 * What an admin can see: every row (unapproved, hidden, failed, refunded),
 * including `razorpay_payment_id` and the amount. What the table holds, and
 * so what can ever be returned: no email, phone, card or UPI data, and no
 * raw Razorpay payload (see the "WHAT IS (AND IS NOT) STORED" note in sql/048).
 *
 * What an admin can change: only the moderation fields below. `tier` and
 * `tier_rank` are GENERATED columns derived from `amount_paise`, so they are
 * never written here. There is no hard delete anywhere in this module; the
 * "remove from the wall" action is `hidden = true`.
 *
 * Supabase calls per function: exactly one each.
 */

const TABLE = "sponsorships";
const GOALS_TABLE = "sponsor_goals";

/** Never includes `razorpay_event_id` (an internal delivery id the admin has no use for). */
const ADMIN_COLUMNS =
  "id, razorpay_payment_id, amount_paise, currency, status, display_name, github_username, " +
  "is_anonymous, show_amount, tier, approved, hidden, source, paid_at, created_at, updated_at";

export type AdminSponsorStatus = "pending" | "captured" | "refunded" | "failed";
export const ADMIN_SPONSOR_STATUSES = ["pending", "captured", "refunded", "failed"] as const;

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
  tier: "supporter" | "backer" | "champion";
  approved: boolean;
  hidden: boolean;
  source: "razorpay" | "manual";
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SponsorRow {
  id: string;
  razorpay_payment_id: string | null;
  amount_paise: number;
  currency: string;
  status: AdminSponsorStatus;
  display_name: string | null;
  github_username: string | null;
  is_anonymous: boolean;
  show_amount: boolean;
  tier: "supporter" | "backer" | "champion";
  approved: boolean;
  hidden: boolean;
  source: "razorpay" | "manual";
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

function toAdminSponsor(row: SponsorRow): AdminSponsor {
  return {
    id: row.id,
    razorpayPaymentId: row.razorpay_payment_id,
    amountPaise: row.amount_paise,
    amountInr: row.amount_paise / 100,
    currency: row.currency,
    status: row.status,
    displayName: row.display_name,
    githubUsername: row.github_username,
    isAnonymous: row.is_anonymous,
    showAmount: row.show_amount,
    tier: row.tier,
    approved: row.approved,
    hidden: row.hidden,
    source: row.source,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ---------------------------------------------------------------------------
 * List
 * ------------------------------------------------------------------------- */

export interface ListAdminSponsorsOptions {
  /** Already validated by the route's Zod schema. */
  limit: number;
  /** Keyset cursor: return rows strictly older than this `created_at`. */
  before: string | null;
  status: AdminSponsorStatus | null;
  approved: boolean | null;
}

export interface AdminSponsorsPage {
  sponsors: AdminSponsor[];
  /** Pass as `before` on the next request. `null` when there are no more rows. */
  nextCursor: string | null;
}

/**
 * Newest first by `created_at` (every row has one, unlike `paid_at`, which is
 * null on failed/pending rows). Keyset pagination, same approach as
 * `listAdminAuditLog` (src/db/adminAudit.ts): one extra row is fetched to
 * learn whether another page exists, with no separate COUNT query.
 */
export async function listAdminSponsors(
  supabase: SupabaseClient,
  options: ListAdminSponsorsOptions,
): Promise<AdminSponsorsPage> {
  let query = supabase
    .from(TABLE)
    .select(ADMIN_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(options.limit + 1);

  if (options.status) query = query.eq("status", options.status);
  if (options.approved !== null) query = query.eq("approved", options.approved);
  if (options.before) query = query.lt("created_at", options.before);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list ${TABLE}: ${error.message}`);

  const rows = (data ?? []) as unknown as SponsorRow[];
  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;

  return {
    sponsors: page.map(toAdminSponsor),
    nextCursor: hasMore ? (page[page.length - 1] as SponsorRow).created_at : null,
  };
}

/* ---------------------------------------------------------------------------
 * Update (moderation edits)
 * ------------------------------------------------------------------------- */

/** The ONLY columns an admin edit may touch. `tier` is generated and is deliberately absent. */
export interface AdminSponsorPatch {
  display_name?: string | null;
  github_username?: string | null;
  is_anonymous?: boolean;
  show_amount?: boolean;
  approved?: boolean;
  hidden?: boolean;
}

/** Returns the updated row, or `null` when no sponsorship has that id. */
export async function updateAdminSponsor(
  supabase: SupabaseClient,
  id: string,
  patch: AdminSponsorPatch,
): Promise<AdminSponsor | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select(ADMIN_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to update ${TABLE}: ${error.message}`);
  return data ? toAdminSponsor(data as unknown as SponsorRow) : null;
}

/** Soft hide: `hidden = true`. Idempotent. Returns the row, or `null` when the id doesn't exist. */
export async function hideAdminSponsor(supabase: SupabaseClient, id: string): Promise<AdminSponsor | null> {
  return updateAdminSponsor(supabase, id, { hidden: true });
}

/* ---------------------------------------------------------------------------
 * Manual sponsor (paid outside Razorpay, e.g. a direct UPI transfer)
 * ------------------------------------------------------------------------- */

export interface ManualSponsorInput {
  amountPaise: number;
  displayName: string | null;
  githubUsername: string | null;
  isAnonymous: boolean;
  showAmount: boolean;
  approved: boolean;
  /** ISO timestamp. */
  paidAt: string;
}

/**
 * Inserts a `source = 'manual'`, `status = 'captured'` row. It has no
 * `razorpay_payment_id` (the table allows that for manual rows), so it counts
 * toward the month total as soon as it exists and joins the wall as soon as
 * it is `approved`. `tier` is generated from the amount by the database.
 */
export async function createManualSponsor(
  supabase: SupabaseClient,
  input: ManualSponsorInput,
): Promise<AdminSponsor> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      amount_paise: input.amountPaise,
      currency: "INR",
      status: "captured",
      display_name: input.displayName,
      github_username: input.githubUsername,
      is_anonymous: input.isAnonymous,
      show_amount: input.showAmount,
      approved: input.approved,
      hidden: false,
      source: "manual",
      paid_at: input.paidAt,
    })
    .select(ADMIN_COLUMNS)
    .single();
  if (error) throw new Error(`Failed to insert ${TABLE}: ${error.message}`);
  return toAdminSponsor(data as unknown as SponsorRow);
}

/* ---------------------------------------------------------------------------
 * Monthly goal
 * ------------------------------------------------------------------------- */

export interface AdminSponsorGoal {
  /** First day of the month, "YYYY-MM-01". */
  month: string;
  goalPaise: number;
  goalInr: number;
  note: string | null;
}

/**
 * Sets (creates or replaces) the goal for one month. `note` is only written
 * when provided: omitting it leaves an existing note untouched, passing
 * `null` clears it.
 */
export async function upsertSponsorGoal(
  supabase: SupabaseClient,
  input: { month: string; goalPaise: number; note?: string | null },
): Promise<AdminSponsorGoal> {
  const row: { month: string; goal_paise: number; note?: string | null } = {
    month: input.month,
    goal_paise: input.goalPaise,
  };
  if (input.note !== undefined) row.note = input.note;

  const { data, error } = await supabase
    .from(GOALS_TABLE)
    .upsert(row, { onConflict: "month" })
    .select("month, goal_paise, note")
    .single();
  if (error) throw new Error(`Failed to write ${GOALS_TABLE}: ${error.message}`);

  const saved = data as { month: string; goal_paise: number; note: string | null };
  return {
    month: saved.month,
    goalPaise: saved.goal_paise,
    goalInr: saved.goal_paise / 100,
    note: saved.note,
  };
}
