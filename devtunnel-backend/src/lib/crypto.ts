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

async function importAesKey(base64Key: string): Promise<CryptoKey> {
  const raw = fromBase64Url(base64Key.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  // GITHUB_TOKEN_ENCRYPTION_KEY is validated to decode to 32 bytes in
  // src/config/env.ts — this is a defensive re-check, not the primary
  // validation.
  if (raw.length !== 32) {
    throw new Error("Encryption key must decode to exactly 32 bytes");
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/**
 * Encrypts a secret (e.g. a GitHub user access/refresh token) for storage
 * at rest using AES-256-GCM. Returns a single opaque, URL-safe string
 * (random 96-bit IV + ciphertext, concatenated) — nothing about the
 * plaintext is recoverable without `GITHUB_TOKEN_ENCRYPTION_KEY`
 * (Backend_Development_Rules.txt rule 6/8: secrets are never stored in
 * plaintext, even server-side).
 */
export async function encryptSecret(plaintext: string, base64Key: string): Promise<string> {
  const key = await importAesKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return toBase64Url(combined.buffer);
}

/** Reverses `encryptSecret`. Throws if the key is wrong or the value was tampered with. */
export async function decryptSecret(encoded: string, base64Key: string): Promise<string> {
  const key = await importAesKey(base64Key);
  const combined = fromBase64Url(encoded);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintextBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintextBuf);
}