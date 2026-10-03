import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { getEnv, type ValidatedEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { verifyHmacSha256Hex } from "../lib/crypto";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import {
  MAX_SPONSOR_AMOUNT_PAISE,
  noteKeyNames,
  readSponsorNotes,
  sponsorTierForPaise,
} from "../lib/sponsorRules";
import { markSponsorshipRefunded, upsertSponsorshipPayment } from "../db/sponsorships";

/**
 * Sponsors — Razorpay webhook receiver.
 *
 *  - `POST /webhooks/razorpay`
 *
 * Server-to-server: no cookies, no session. The only authentication is the
 * HMAC-SHA256 signature Razorpay puts in `X-Razorpay-Signature`, computed over
 * the raw request body with `RAZORPAY_WEBHOOK_SECRET`. CORS and `requireAuth`
 * don't apply (CORS only decorates allow-listed browser origins; `requireAuth`
 * is per-route and never mounted here).
 *
 * Order of checks, cheapest and safest first:
 *  1. Secret not configured          -> 503 (feature off; other routes unaffected)
 *  2. Body too large / bad signature -> 400 / 401, no detail
 *  3. Signature valid                -> from here on the answer is 200, so
 *     Razorpay stops retrying, EXCEPT a database failure (500 on purpose: the
 *     payment is real and Razorpay's retry is how it gets recorded).
 *
 * Events handled (everything else is acknowledged and ignored):
 *  - payment.captured, payment_link.paid, order.paid -> row `captured`
 *    (all three can fire for one payment; they converge on one row)
 *  - payment.failed                                  -> row `failed`
 *  - refund.processed                                -> row `refunded` (full refunds only)
 *
 * The supporter's answers (GitHub username, display name, anonymous, show
 * amount) are read from the payment's `notes`. New rows are `approved = false`;
 * the tier is a generated database column derived from the amount.
 *
 * No KV, at most two Supabase calls per delivery, and neither the secret nor
 * the payload is ever logged.
 */
export const razorpayWebhook = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Razorpay's payloads are a few KB; anything near this is not Razorpay. */
const MAX_BODY_BYTES = 256 * 1024;

const CAPTURED_EVENTS = new Set(["payment.captured", "payment_link.paid", "order.paid"]);
const FAILED_EVENTS = new Set(["payment.failed"]);
const REFUND_EVENTS = new Set(["refund.processed"]);

const paymentEntitySchema = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  amount: z.number().int().positive(),
  currency: z.string().max(8).nullish(),
  status: z.string().max(40).nullish(),
  captured: z.boolean().nullish(),
  created_at: z.number().nullish(),
  refund_status: z.string().max(40).nullish(),
  amount_refunded: z.number().nullish(),
  // Validated and sanitised in readSponsorNotes: Razorpay sends [] / null / {...}.
  notes: z.unknown(),
});

const notesHolderSchema = z.object({ entity: z.object({ notes: z.unknown() }) });

const eventSchema = z.object({
  event: z.string().max(80),
  created_at: z.number().nullish(),
  payload: z
    .object({
      payment: z.object({ entity: paymentEntitySchema }).optional(),
      // Fallback notes and the refund details are only hints: if their shape
      // ever changes they are dropped instead of failing the whole event.
      payment_link: notesHolderSchema.optional().catch(undefined),
      order: notesHolderSchema.optional().catch(undefined),
      refund: z
        .object({
          entity: z.object({
            payment_id: z.string().max(60).nullish(),
            amount: z.number().nullish(),
          }),
        })
        .optional()
        .catch(undefined),
    })
    .optional(),
});

type ParsedEvent = z.infer<typeof eventSchema>;
type PaymentEntity = z.infer<typeof paymentEntitySchema>;

/** `X-Razorpay-Event-Id` is Razorpay's per-delivery id. Kept only if it looks like one. */
function cleanEventId(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 100 && /^[A-Za-z0-9_.:-]+$/.test(trimmed) ? trimmed : null;
}

/** Epoch seconds -> ISO, falling back to "now" for anything missing or implausible. */
function paidAtIso(...candidates: Array<number | null | undefined>): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  for (const seconds of candidates) {
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 1_577_836_800 && seconds <= nowSeconds + 86_400) {
      return new Date(seconds * 1000).toISOString();
    }
  }
  return new Date(nowSeconds * 1000).toISOString();
}

/** Razorpay sends currency "" on some sample payloads; only a non-empty, non-INR code is rejected. */
function isInr(payment: PaymentEntity): boolean {
  const currency = payment.currency?.trim().toUpperCase();
  return !currency || currency === "INR";
}

/** true = full, false = partial, null = the payment entity doesn't say. */
function fullRefundHint(payment: PaymentEntity | undefined): boolean | null {
  if (!payment) return null;
  if (payment.refund_status === "full" || payment.status === "refunded") return true;
  if (payment.amount_refunded != null && payment.amount_refunded >= payment.amount) return true;
  if (payment.refund_status === "partial") return false;
  return null;
}

type Result = "processed" | "duplicate" | "ignored";

razorpayWebhook.post("/webhooks/razorpay", async (c) => {
  const env = getEnv(c.env);
  const requestId = c.get("requestId") as string | undefined;

  // 1. Feature switch. Empty or unset secret = disabled, never a crash.
  const secret = env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    logger.warn("razorpay_webhook_disabled", { requestId });
    return errorResponse(c, 503, "webhook_disabled", "This endpoint is not available.");
  }

  // 2. Raw bytes + signature. Verified over the exact bytes received (a
  // re-serialised JSON body would never match).
  const declaredLength = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return errorResponse(c, 400, "bad_request", "Invalid request.");
  }
  const rawBody = new Uint8Array(await c.req.arrayBuffer());
  if (rawBody.byteLength > MAX_BODY_BYTES) {
    return errorResponse(c, 400, "bad_request", "Invalid request.");
  }

  const signature = c.req.header("x-razorpay-signature");
  const signatureOk = signature ? await verifyHmacSha256Hex(secret, rawBody, signature) : false;
  if (!signatureOk) {
    // Reason is logged, never returned.
    logger.warn("razorpay_webhook_signature_rejected", { requestId, hadSignature: Boolean(signature) });
    return errorResponse(c, 401, "unauthorized", "Invalid request.");
  }

  // 3. Signature valid: from here every non-database outcome is a 200.
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    logger.warn("razorpay_webhook_body_not_json", { requestId });
    return c.json({ ok: true, result: "ignored" satisfies Result });
  }

  const eventName =
    typeof json === "object" && json !== null && typeof (json as { event?: unknown }).event === "string"
      ? ((json as { event: string }).event as string).slice(0, 80)
      : null;

  const handled =
    eventName !== null &&
    (CAPTURED_EVENTS.has(eventName) || FAILED_EVENTS.has(eventName) || REFUND_EVENTS.has(eventName));
  if (!handled) {
    logger.info("razorpay_webhook_ignored", { requestId, event: eventName, reason: "unhandled_event" });
    return c.json({ ok: true, result: "ignored" satisfies Result });
  }

  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) {
    // Paths only: the issue messages could echo payload values.
    logger.warn("razorpay_webhook_payload_invalid", {
      requestId,
      event: eventName,
      fields: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".")),
    });
    return c.json({ ok: true, result: "ignored" satisfies Result });
  }

  const eventId = cleanEventId(c.req.header("x-razorpay-event-id"));

  try {
    const result = await processEvent(env, parsed.data, eventId, requestId);
    return c.json({ ok: true, result });
  } catch (err) {
    // The payment is real; a 500 makes Razorpay retry, which is how it
    // eventually gets recorded. Idempotency makes the retry safe.
    logger.error("razorpay_webhook_db_failed", {
      requestId,
      event: eventName,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse(c, 500, "internal_error", "Something went wrong. Please try again.");
  }
});

async function processEvent(
  env: ValidatedEnv,
  event: ParsedEvent,
  eventId: string | null,
  requestId: string | undefined,
): Promise<Result> {
  const name = event.event;
  const payment = event.payload?.payment?.entity;

  /* ---- refund.processed ------------------------------------------------ */
  if (REFUND_EVENTS.has(name)) {
    const refund = event.payload?.refund?.entity;
    const paymentId = refund?.payment_id ?? payment?.id;
    if (!paymentId || !/^pay_[A-Za-z0-9]{6,40}$/.test(paymentId)) {
      logger.warn("razorpay_webhook_ignored", { requestId, event: name, reason: "no_payment_id" });
      return "ignored";
    }
    const outcome = await markSponsorshipRefunded(
      getSupabase(env),
      paymentId,
      eventId,
      refund?.amount ?? null,
      fullRefundHint(payment),
    );
    logger.info("razorpay_webhook_handled", { requestId, event: name, paymentId, outcome });
    return outcome === "refunded" ? "processed" : outcome === "unchanged" ? "duplicate" : "ignored";
  }

  /* ---- captured / failed ---------------------------------------------- */
  if (!payment) {
    logger.warn("razorpay_webhook_ignored", { requestId, event: name, reason: "no_payment_entity" });
    return "ignored";
  }
  if (!isInr(payment) || payment.amount > MAX_SPONSOR_AMOUNT_PAISE) {
    // Totals are summed in paise as INR; a foreign-currency amount would corrupt them.
    logger.warn("razorpay_webhook_ignored", { requestId, event: name, paymentId: payment.id, reason: "currency_or_amount" });
    return "ignored";
  }

  const isCapture = CAPTURED_EVENTS.has(name);
  if (isCapture && !(payment.status === "captured" || payment.captured === true)) {
    // e.g. authorized but not yet captured: wait for the captured event.
    logger.info("razorpay_webhook_ignored", { requestId, event: name, paymentId: payment.id, reason: "not_captured" });
    return "ignored";
  }

  const notes = readSponsorNotes(
    payment.notes,
    event.payload?.payment_link?.entity.notes,
    event.payload?.order?.entity.notes,
  );
  if (isCapture && !notes.displayName && !notes.githubUsername) {
    // Help diagnose a Razorpay form whose field labels we didn't recognise: key NAMES only.
    logger.info("razorpay_webhook_no_supporter_fields", {
      requestId,
      paymentId: payment.id,
      noteFields: noteKeyNames(payment.notes),
    });
  }

  const outcome = await upsertSponsorshipPayment(getSupabase(env), {
    razorpayPaymentId: payment.id,
    razorpayEventId: eventId,
    amountPaise: payment.amount,
    currency: "INR",
    status: isCapture ? "captured" : "failed",
    displayName: notes.displayName,
    githubUsername: notes.githubUsername,
    isAnonymous: notes.isAnonymous,
    showAmount: notes.showAmount,
    paidAt: isCapture ? paidAtIso(payment.created_at, event.created_at) : null,
  });

  // No names, usernames or notes in the log line.
  logger.info("razorpay_webhook_handled", {
    requestId,
    event: name,
    paymentId: payment.id,
    outcome,
    tier: sponsorTierForPaise(payment.amount),
    anonymous: notes.isAnonymous,
  });
  return outcome === "unchanged" ? "duplicate" : "processed";
}
