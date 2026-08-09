/**
 * Token-bucket rate limiter.
 *
 * Both providers publish hard limits (MangaDex ~5 req/s per IP with a 403 IP-ban
 * for persistent abuse; AniList 30 req/min). Relying on call sites to be
 * well-behaved is not a strategy, so every provider request funnels through a
 * bucket and *waits* rather than firing and getting a 429.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private queue: Array<() => void> = [];
  private draining = false;

  constructor(
    /** Bucket size, the most requests allowed in a burst. */
    private readonly capacity: number,
    /** Tokens replenished per second. */
    private readonly refillPerSecond: number
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    if (elapsedSeconds <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefill = now;
  }

  /** Resolves once a token is available. Callers await this before requesting. */
  acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    try {
      while (this.queue.length > 0) {
        this.refill();

        if (this.tokens >= 1) {
          this.tokens -= 1;
          // Non-null: guarded by queue.length above.
          const next = this.queue.shift()!;
          next();
          continue;
        }

        // Wait exactly long enough for one token, plus a small margin so we
        // never round down into the limit.
        const waitMs = ((1 - this.tokens) / this.refillPerSecond) * 1000 + 15;
        await sleep(waitMs);
      }
    } finally {
      this.draining = false;
    }
  }

  /**
   * Empty the bucket for `ms`. Called when a host returns 429 with Retry-After,
   * so the backoff applies to every in-flight caller and not just the unlucky one.
   */
  penalize(ms: number): void {
    this.tokens = 0;
    this.lastRefill = Date.now() + ms;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
