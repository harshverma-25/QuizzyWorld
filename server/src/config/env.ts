import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z
    .string()
    .min(1, 'PORT environment variable is required')
    .transform((val) => {
      const parsed = parseInt(val, 10);
      if (isNaN(parsed)) {
        throw new Error('PORT must be a valid number');
      }
      return parsed;
    }),
  NODE_ENV: z.enum(['development', 'production', 'test'], {
    errorMap: () => ({ message: 'NODE_ENV must be development, production, or test' }),
  }),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  CORS_ORIGIN: z.string().default('*'),
  REDIS_URI: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  GUEST_JWT_SECRET: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('900'), // 15 mins (in seconds)
  JWT_REFRESH_EXPIRES_IN: z.string().default('604800'), // 7 days (in seconds)
  // Cloudflare Workers AI Config
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_AI_MODEL: z.string().default('@cf/stabilityai/stable-diffusion-xl-base-1.0'),
  // Cloudinary Config
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_URL: z.string().optional(),
  // Google OAuth Config
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
})
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (!data.GUEST_JWT_SECRET || data.GUEST_JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['GUEST_JWT_SECRET'],
          message: 'GUEST_JWT_SECRET is required and must be at least 32 characters in production',
        });
      }
      if (!data.JWT_ACCESS_SECRET || data.JWT_ACCESS_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'JWT_ACCESS_SECRET is required and must be at least 32 characters in production',
        });
      }
      if (!data.JWT_REFRESH_SECRET || data.JWT_REFRESH_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'JWT_REFRESH_SECRET is required and must be at least 32 characters in production',
        });
      }
    }
  })
  .transform((data) => ({
    ...data,
    CORS_ORIGIN:
      !data.CORS_ORIGIN || (data.NODE_ENV === 'production' && data.CORS_ORIGIN === '*')
        ? 'https://quizzyworld.vercel.app'
        : data.CORS_ORIGIN,
    GUEST_JWT_SECRET:
      data.GUEST_JWT_SECRET || 'codearena_dev_guest_jwt_secret_key_32_bytes_min',
    JWT_ACCESS_SECRET:
      data.JWT_ACCESS_SECRET || 'codearena_dev_access_jwt_secret_key_32_bytes_min',
    JWT_REFRESH_SECRET:
      data.JWT_REFRESH_SECRET || 'codearena_dev_refresh_jwt_secret_key_32_bytes_min',
  }));

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment configuration:', JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

export const env = result.data;
export type Env = z.infer<typeof envSchema>;

export const TRUSTED_PRODUCTION_ORIGINS = [
  'https://quizzyworld.vercel.app',
  'https://code-arena-jade.vercel.app',
];

/**
 * Resolves CORS origins from configuration.
 * Automatically normalizes origins (stripping trailing slashes) and guarantees inclusion
 * of the exact trusted production frontend origin (https://quizzyworld.vercel.app).
 * Returns true in development wildcard mode, or an array of allowed origin strings.
 */
export function resolveCorsOrigins(corsOrigin: string): boolean | string[] {
  if (corsOrigin === '*') {
    return true;
  }

  const origins = new Set<string>();

  // Always include trusted production origin(s)
  TRUSTED_PRODUCTION_ORIGINS.forEach((o) => {
    origins.add(o.trim().replace(/\/+$/, ''));
  });

  // Add any explicitly configured origins
  if (corsOrigin) {
    corsOrigin
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean)
      .forEach((o) => origins.add(o));
  }

  // Include localhost during non-production runs
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://localhost:3001');
    origins.add('http://127.0.0.1:3000');
  }

  return Array.from(origins);
}

export default env;

