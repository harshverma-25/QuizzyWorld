import { z } from 'zod';

export const createGuestSessionSchema = z.object({
  body: z
    .object({
      displayName: z
        .string()
        .trim()
        .min(2, 'Display name must be at least 2 characters')
        .max(25, 'Display name must not exceed 25 characters')
        .regex(
          /^[a-zA-Z0-9 _-]+$/,
          'Display name can only contain letters, numbers, spaces, underscores, and hyphens'
        )
        .optional(),
    })
    .optional(),
});

export type CreateGuestSessionInput = z.infer<typeof createGuestSessionSchema>;

export const registerSchema = z.object({
  body: z.object({
    email: z.string().trim().email('Invalid email address'),
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must not exceed 30 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    displayName: z.string().trim().min(2, 'Display name must be at least 2 characters').max(50).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    emailOrUsername: z.string().trim().min(1, 'Email or username is required'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().optional(),
  }).optional(),
});

export const googleAuthSchema = z.object({
  body: z
    .object({
      credential: z.string().optional(),
      idToken: z.string().optional(),
      token: z.string().optional(),
      code: z.string().optional(),
      accessToken: z.string().optional(),
    })
    .refine(
      (data) => !!(data.credential || data.idToken || data.token || data.code || data.accessToken),
      {
        message: 'Google authentication requires credential (ID token), code, or accessToken.',
      }
    ),
});

