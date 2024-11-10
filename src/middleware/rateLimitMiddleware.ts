import { Context, Next } from 'hono';

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

class RateLimitStore {
  private store: Map<string, RateLimitInfo>;
  private maxEntries: number;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(maxEntries = 10000) {
    this.store = new Map();
    this.maxEntries = maxEntries;

    // Cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
  }

  private cleanup() {
    const now = Date.now();
    let deleted = 0;

    // Only check up to 1000 entries per cleanup cycle
    for (const [key, value] of this.store.entries()) {
      if (value.resetTime < now) {
        this.store.delete(key);
        deleted++;
      }
      if (deleted >= 1000) break;
    }
  }

  get(key: string): RateLimitInfo | undefined {
    const info = this.store.get(key);

    // Clean expired entry if found
    if (info && info.resetTime < Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    return info;
  }

  set(key: string, value: RateLimitInfo): void {
    // If store is full, remove oldest entries
    if (this.store.size >= this.maxEntries) {
      const entriesToRemove = Math.ceil(this.maxEntries * 0.1); // Remove 10% of entries
      const entries = Array.from(this.store.entries());
      entries
        .sort((a, b) => a[1].resetTime - b[1].resetTime)
        .slice(0, entriesToRemove)
        .forEach(([key]) => this.store.delete(key));
    }

    this.store.set(key, value);
  }
}

// Create a single store instance
const rateLimitStore = new RateLimitStore();

export const rateLimitMiddleware = (
  requests: number = 100,
  windowMs: number = 60000,
  message: string = 'Too many requests, please try again later.'
) => {
  return async (c: Context, next: Next) => {
    // Get client identifier (IP + optional user agent)
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0] ||
      c.req.header('x-real-ip') ||
      'unknown';
    const identifier = `${ip}-${c.req.header('user-agent') || ''}`;

    const now = Date.now();

    // Get or create rate limit info
    let rateLimit = rateLimitStore.get(identifier) || {
      count: 0,
      resetTime: now + windowMs,
    };

    // Reset if window expired
    if (rateLimit.resetTime < now) {
      rateLimit = {
        count: 0,
        resetTime: now + windowMs,
      };
    }

    // Increment request count
    rateLimit.count++;
    rateLimitStore.set(identifier, rateLimit);

    // Set headers
    c.header('X-RateLimit-Limit', requests.toString());
    c.header(
      'X-RateLimit-Remaining',
      Math.max(0, requests - rateLimit.count).toString()
    );
    c.header('X-RateLimit-Reset', rateLimit.resetTime.toString());

    // Check if rate limit exceeded
    if (rateLimit.count > requests) {
      return c.json(
        {
          status: 'error',
          error: message,
        },
        429
      );
    }

    await next();
  };
};
