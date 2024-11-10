import { Context, Next } from 'hono';

// Memory store for rate limiting
const store = new Map<string, { count: number; resetTime: number }>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (value.resetTime < now) {
      store.delete(key);
    }
  }
}, 60000); // Clean up every minute

export const rateLimitMiddleware = (
  requests: number = 100, // Number of requests allowed
  windowMs: number = 60000, // Time window in milliseconds (default: 1 minute)
  message: string = 'Too many requests, please try again later.'
) => {
  return async (c: Context, next: Next) => {
    const ip =
      c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create rate limit info for this IP
    let rateLimit = store.get(ip);

    // Reset if the window has expired
    if (!rateLimit || rateLimit.resetTime < now) {
      rateLimit = {
        count: 0,
        resetTime: now + windowMs,
      };
    }

    // Increment request count
    rateLimit.count++;
    store.set(ip, rateLimit);

    // Set rate limit headers
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
