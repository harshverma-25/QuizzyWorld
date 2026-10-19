import { Redis } from '@upstash/redis';
import { env } from './env.js';
import { logger } from './logger.js';

let redisInstance: Redis | null = null;
let customRedisClient: any = null;
let isConfigured = false;

/**
 * Injects a custom or mock Redis client (useful for unit testing multi-instance scenarios).
 */
export function setCustomRedisClient(client: any): void {
  customRedisClient = client;
}

/**
 * Initializes and returns the singleton Upstash Redis client.
 * Safe against missing credentials or initialization failures — will never crash the server.
 */
export function getRedisClient(): Redis | null {
  if (customRedisClient !== null) {
    return customRedisClient;
  }

  if (redisInstance !== null) {
    return redisInstance;
  }

  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();

  // If credentials are omitted, return null gracefully (fallback to in-memory/MongoDB)
  if (!url || !token) {
    return null;
  }

  // Basic format sanity check without exposing credentials
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    logger.warn('⚠️ UPSTASH_REDIS_REST_URL must start with https://. Upstash Redis disabled.');
    return null;
  }

  try {
    redisInstance = new Redis({
      url,
      token,
    });
    isConfigured = true;

    // Log safe, non-sensitive confirmation
    const maskedHost = new URL(url).host;
    logger.info({ host: maskedHost }, '🚀 Upstash Redis REST client initialized successfully');
  } catch (error: any) {
    logger.warn(
      { error: error?.message || 'Unknown initialization error' },
      '⚠️ Failed to initialize Upstash Redis REST client. Operating in fallback mode.'
    );
    redisInstance = null;
    isConfigured = false;
  }

  return redisInstance;
}

/**
 * Check if Upstash Redis has valid configuration credentials.
 */
export function isUpstashConfigured(): boolean {
  return isConfigured || Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * Test connectivity to Upstash Redis safely with a timeout.
 * Returns true if ping succeeds, false otherwise without throwing.
 */
export async function checkRedisHealth(timeoutMs = 2000): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    const pingPromise = client.ping();
    const timeoutPromise = new Promise<'timeout'>((_, reject) =>
      setTimeout(() => reject(new Error('Redis ping timeout')), timeoutMs)
    );
    const res = await Promise.race([pingPromise, timeoutPromise]);
    return res === 'PONG' || Boolean(res);
  } catch {
    return false;
  }
}
