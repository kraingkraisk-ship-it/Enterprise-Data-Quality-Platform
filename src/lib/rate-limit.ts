// In-memory sliding-window rate limiter (per IP+route). Replace with Redis in
// production deployments — contract kept identical.
interface Bucket { timestamps: number[] }
const buckets = new Map<string, Bucket>()

export function rateLimit(key: string, limitPerMinute = 120): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now()
  const windowMs = 60_000
  const b = buckets.get(key) ?? { timestamps: [] }
  b.timestamps = b.timestamps.filter((t) => now - t < windowMs)
  if (b.timestamps.length >= limitPerMinute) {
    const oldest = b.timestamps[0]
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((windowMs - (now - oldest)) / 1000) }
  }
  b.timestamps.push(now)
  buckets.set(key, b)
  if (buckets.size > 10_000) {
    // simple eviction to bound memory
    const first = buckets.keys().next().value
    if (first) buckets.delete(first)
  }
  return { allowed: true, remaining: limitPerMinute - b.timestamps.length, retryAfterSec: 0 }
}
