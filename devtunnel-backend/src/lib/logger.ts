/**
 * Minimal structured logger. Cloudflare Workers `console.log` output is
 * captured by `wrangler tail` and Workers Logs, so plain JSON lines are
 * enough — no external log shipping dependency to justify (rule 103).
 *
 * Never pass raw cookies, tokens, access tokens, or the service role key
 * into `meta` — see rule 59. `redact()` is a best-effort safety net, not a
 * substitute for not logging secrets in the first place.
 */

const SECRET_KEY_PATTERN = /(token|secret|password|authorization|cookie|key)/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? "[redacted]" : redact(v);
    }
    return out;
  }
  return value;
}

type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const line = {
    level,
    message,
    time: new Date().toISOString(),
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const serialized = JSON.stringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
};
