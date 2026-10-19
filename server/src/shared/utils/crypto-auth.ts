import crypto from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(crypto.pbkdf2);

export const PBKDF2_ITERATIONS = 100000;
export const PBKDF2_KEYLEN = 64;
export const PBKDF2_DIGEST = 'sha512';

/**
 * Hash a plain text password asynchronously using Node.js pbkdf2 (libuv thread pool).
 * Returns salt:hash format. Does not block the main event loop.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a plain text password against a stored salt:hash string using timing-safe comparison asynchronously.
 * Safely handles malformed hashes, incorrect formats, and prevents event-loop starvation.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash || typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [salt, originalHash] = parts;
  if (!salt || !originalHash || salt.length !== 32 || originalHash.length !== 128) {
    // 16 bytes = 32 hex chars salt, 64 bytes = 128 hex chars sha512 hash
    return false;
  }

  try {
    const derivedKey = await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
    const hashToTest = derivedKey.toString('hex');

    const bufA = Buffer.from(hashToTest, 'hex');
    const bufB = Buffer.from(originalHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Synchronous hash fallback provided strictly for offline seeding and legacy synchronous utilities.
 * @deprecated Prefer asynchronous hashPassword() in server request pipelines.
 */
export function hashPasswordSync(password: string): string {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Synchronous verify fallback provided strictly for offline seeding and legacy synchronous utilities.
 * @deprecated Prefer asynchronous verifyPassword() in server request pipelines.
 */
export function verifyPasswordSync(password: string, storedHash: string): boolean {
  if (!password || !storedHash || typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  if (!salt || !originalHash || salt.length !== 32 || originalHash.length !== 128) return false;

  try {
    const hashToTest = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
    const bufA = Buffer.from(hashToTest, 'hex');
    const bufB = Buffer.from(originalHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Hash a refresh token for safe storage in DB.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
