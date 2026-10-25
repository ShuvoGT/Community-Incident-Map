// Lightweight in-memory IP rate limiter (sliding window). Single-process only;
// a production multi-instance deployment should back this with Redis. Shared
// networks must not block legitimate residents, so limits are generous and
// per-minute, and device/IP signals are hints, not proof of abuse.

type Hits = number[];
const buckets = new Map<string, Hits>();

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Returns true if the request is allowed. Prunes timestamps outside the window.
export function ipRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
