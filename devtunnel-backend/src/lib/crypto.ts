/**
 * All primitives here use the Workers-native Web Crypto API — no Node
 * `crypto` module, so this is safe under the Cloudflare Workers runtime
 * (Backend_Development_Rules.txt rule 69).
 */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64Url(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Cryptographically random opaque token, hex-encoded. */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

/** SHA-256 hash of a string, hex-encoded. Used to store session tokens at rest. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Signs `{ state, next }` into a single opaque, tamper-proof cookie value
 * for the OAuth `state` round trip (Backend_Development_Rules.txt rule 50).
 * `next` is bundled here rather than in a second cookie so there is exactly
 * one signature to verify and one cookie to manage.
 */
export async function signOAuthState(
  payload: { state: string; next: string },
  secret: string,
): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${toBase64Url(signature)}`;
}

/**
 * Verifies and decodes a cookie produced by `signOAuthState`. Returns
 * `null` on any tampering, expiry-independent malformation, or signature
 * mismatch — callers must treat `null` as "reject the callback".
 */
export async function verifyOAuthState(
  cookieValue: string,
  secret: string,
): Promise<{ state: string; next: string } | null> {
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts as [string, string];

  const key = await hmacKey(secret);
  const isValid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signature),
    new TextEncoder().encode(body),
  );
  if (!isValid) return null;

  try {
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (typeof decoded?.state !== "string" || typeof decoded?.next !== "string") return null;
    return decoded;
  } catch {
    return null;
  }
}
