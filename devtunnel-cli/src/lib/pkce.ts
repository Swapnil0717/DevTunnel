import { randomBytes, createHash } from "node:crypto";

export interface PkcePair {
  /** Sent to the backend only at the very end, in POST /auth/cli/token. */
  verifier: string;
  /** Sent up front, in GET /auth/cli/start — sha256(verifier), hex-encoded. */
  challenge: string;
}

/**
 * Generates a fresh verifier/challenge pair for one `dev login` attempt.
 * This is what stops a one-time login code intercepted in the loopback
 * redirect (`GET /auth/cli/callback` -> `http://127.0.0.1:<port>/callback`)
 * from being redeemable by anything other than this exact `dev login`
 * process — see devtunnel-backend/src/routes/authCli.ts's module doc
 * comment for the full flow.
 *
 * `verifier` is a random 32-byte value, base64url-encoded (43 chars, well
 * within RFC 7636's 43–128 char bounds). `challenge` is its SHA-256 hash,
 * hex-encoded — the backend validates it against `^[0-9a-f]{64}$`.
 */
export function generatePkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("hex");
  return { verifier, challenge };
}