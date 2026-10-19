import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../shared/errors/api-error.js';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../config/logger.js';

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  prefix?: string;
  keyGenerator?: (req: Request) => string;
}

const LUA_ATOMIC_RATE_LIMIT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

/**
 * Extracts the real client IP respecting trusted proxy hops (Render / reverse proxies)
 * and hardened proxy-addr@2.0.8 subnet checks.
 */
export function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Production-safe hybrid rate limiter factory.
 * Primary: Distributed Redis store with atomic Lua evaluation across multiple instances.
 * Secondary / Fallback: In-memory sliding window store with automatic eviction.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const store = new Map<string, { count: number; resetTime: number }>();
  const { windowMs, maxRequests, message, prefix = 'rl' } = options;

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, Math.min(windowMs, 5 * 60 * 1000));

  if (cleanup.unref) {
    cleanup.unref();
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = getClientIp(req);
    const identifier = options.keyGenerator ? options.keyGenerator(req) : ip;
    const redisKey = `ratelimit:${prefix}:${identifier}`;
    const now = Date.now();

    // 1. Attempt distributed rate-limiting via Redis if configured
    const redis = getRedisClient();
    if (redis) {
      try {
        let current = 0;
        let ttlMs = windowMs;

        if (typeof (redis as any).eval === 'function') {
          const evalResult = await Promise.race([
            (redis as any).eval(LUA_ATOMIC_RATE_LIMIT, [redisKey], [windowMs]),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Redis rate limit timeout')), 800)
            ),
          ]);

          if (Array.isArray(evalResult)) {
            current = Number(evalResult[0]) || 0;
            ttlMs = Number(evalResult[1]) || windowMs;
          }
        } else {
          // Direct command fallback
          current = await redis.incr(redisKey);
          if (current === 1) {
            await redis.pexpire(redisKey, windowMs);
          }
        }

        if (current > maxRequests) {
          const retryAfterSeconds = Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000));
          res.setHeader('Retry-After', retryAfterSeconds);
          return next(
            new ApiError(
              429,
              message || `Too many requests. Please try again after ${Math.ceil(windowMs / 60000)} minutes.`
            )
          );
        }

        return next();
      } catch (err: any) {
        if (err instanceof ApiError) {
          return next(err);
        }
        logger.warn(
          { error: err?.message || 'Unknown Redis error' },
          '⚠️ Distributed rate limiter encountered Redis error; falling back safely to local memory store.'
        );
        // Continue to local memory store below
      }
    }

    // 2. Safe local memory store fallback
    const record = store.get(identifier);

    if (!record) {
      store.set(identifier, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);
      return next(
        new ApiError(
          429,
          message || `Too many requests. Please try again after ${Math.ceil(windowMs / 60000)} minutes.`
        )
      );
    }

    next();
  };
}

// Global baseline rate limiter (500 requests per 15 minutes per IP)
const globalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 500,
  prefix: 'global',
  message: 'Too many requests, please try again after 15 minutes.',
});

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const normalizedPath = req.path.replace(/\/+$/, '') || '/';

  // Bypass rate limiting for documentation and automated orchestrator health probes
  if (
    normalizedPath === '/health' ||
    normalizedPath === '/api/v1/health' ||
    normalizedPath.startsWith('/api/docs') ||
    normalizedPath.startsWith('/api/swagger.json')
  ) {
    return next();
  }

  return globalLimiter(req, res, next);
}

// Dedicated stricter rate limiter for credential-sensitive endpoints (15 req / 15 min per IP)
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 15,
  prefix: 'auth',
  message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
});

// Dedicated stricter rate limiter for expensive AI media generation (10 req / 10 min)
export const mediaGenerationRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
  prefix: 'media',
  message: 'Too many media generation requests. Please wait a few minutes before trying again.',
});

// Dedicated stricter rate limiter for AI quiz question generation (10 req / 10 min)
export const quizGenerationRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
  prefix: 'quiz-gen',
  message: 'Too many quiz generation requests. Please wait a few minutes before trying again.',
});

// Dedicated stricter rate limiter for Razorpay payment initiation (10 req / 10 min)
export const paymentRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
  prefix: 'payment',
  message: 'Too many payment requests. Please wait a few minutes before trying again.',
});
