/**
 * Naive in-memory sliding-window rate limiter — one per deployed val instance.
 * 10 req/min per client IP, matching the Val Town free-OpenAI budget.
 * Pure: the clock is injected (`now` in ms), so tests are deterministic.
 * Not distributed and not durable — acceptable for a demo val; the worst
 * case of a cold restart is a fresh budget, never a wrong refusal.
 */

export interface RateLimiterOptions {
  /** sliding window length in ms */
  windowMs: number;
  /** max allowed hits per key inside the window */
  max: number;
}

export interface RateLimiter {
  /** Record a hit for `key`; true when allowed, false when over budget. */
  allow(key: string, now: number): boolean;
  /** Drop keys whose every hit is older than the window; return count dropped. */
  prune(now: number): number;
  /** Number of tracked keys (memory bound check). */
  size(): number;
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { windowMs, max } = opts;
  if (!Number.isFinite(windowMs) || windowMs <= 0 || !Number.isFinite(max) || max < 1) {
    throw new Error("createRateLimiter: windowMs and max must be positive numbers");
  }
  const hits = new Map<string, number[]>();

  const fresh = (key: string, now: number): number[] => {
    const kept = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (kept.length) hits.set(key, kept);
    else hits.delete(key);
    return kept;
  };

  return {
    allow(key: string, now: number): boolean {
      const kept = fresh(key, now);
      if (kept.length >= max) {
        hits.set(key, kept); // keep history even on refusal
        return false;
      }
      kept.push(now);
      hits.set(key, kept);
      return true;
    },
    prune(now: number): number {
      let dropped = 0;
      for (const key of [...hits.keys()]) {
        if (fresh(key, now).length === 0) dropped++;
      }
      return dropped;
    },
    size(): number {
      return hits.size;
    },
  };
}
