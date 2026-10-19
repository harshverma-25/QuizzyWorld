import { Router, Request, Response, NextFunction } from 'express';
import { authController } from './auth.controller.js';
import { validateRequest } from '../../middleware/validate.middleware.js';
import {
  createGuestSessionSchema,
  registerSchema,
  loginSchema,
  refreshSchema,
  googleAuthSchema,
} from './auth.validator.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware.js';
import { noCache } from '../../middleware/cache.middleware.js';
import { authRateLimiter } from '../../middleware/rate-limiter.middleware.js';

const router = Router();
router.use(noCache);

const guestCreationCounts = new Map<string, { count: number; resetTime: number }>();
const GUEST_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_GUEST_CREATIONS = 20; // 20 guest registrations per 15 min per IP

// Periodically purge expired IP records to prevent memory leak
const GUEST_SWEEPER_INTERVAL_MS = 5 * 60 * 1000;
const guestSweeper = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of guestCreationCounts.entries()) {
    if (now > record.resetTime) {
      guestCreationCounts.delete(ip);
    }
  }
}, GUEST_SWEEPER_INTERVAL_MS);

if (guestSweeper.unref) {
  guestSweeper.unref();
}

function guestRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const record = guestCreationCounts.get(ip);
  if (!record || now > record.resetTime) {
    guestCreationCounts.set(ip, { count: 1, resetTime: now + GUEST_WINDOW_MS });
    return next();
  }

  record.count++;
  if (record.count > MAX_GUEST_CREATIONS) {
    throw new ApiError(429, 'Too many guest sessions created from this IP. Please try again later.');
  }

  next();
}

// POST /api/v1/auth/register
router.post(
  '/register',
  authRateLimiter,
  validateRequest(registerSchema),
  asyncHandler((req: Request, res: Response) => authController.register(req, res))
);

// POST /api/v1/auth/login
router.post(
  '/login',
  authRateLimiter,
  validateRequest(loginSchema),
  asyncHandler((req: Request, res: Response) => authController.login(req, res))
);

// POST /api/v1/auth/google
router.post(
  '/google',
  authRateLimiter,
  validateRequest(googleAuthSchema),
  asyncHandler((req: Request, res: Response) => authController.googleLogin(req, res))
);

// GET /api/v1/auth/google/callback (for direct OAuth redirect code callback)
router.get(
  '/google/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const error = req.query.error as string;
    const clientRedirect = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/login';

    if (error) {
      return res.redirect(`${clientRedirect}?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return res.redirect(`${clientRedirect}?error=missing_code`);
    }

    try {
      req.body = { code };
      await authController.googleLogin(req, res);
    } catch (err: any) {
      return res.redirect(`${clientRedirect}?error=${encodeURIComponent(err?.message || 'google_auth_failed')}`);
    }
  })
);

// POST /api/v1/auth/refresh
router.post(
  '/refresh',
  validateRequest(refreshSchema),
  asyncHandler((req: Request, res: Response) => authController.refresh(req, res))
);

// POST /api/v1/auth/logout
router.post(
  '/logout',
  optionalAuthenticate,
  asyncHandler((req: Request, res: Response) => authController.logout(req, res))
);

// GET /api/v1/auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler((req: Request, res: Response) => authController.getMe(req, res))
);

// POST /api/v1/auth/guest
router.post(
  '/guest',
  guestRateLimiter,
  validateRequest(createGuestSessionSchema),
  asyncHandler((req: Request, res: Response) => authController.createGuest(req, res))
);

export const authRoutes = router;
export default authRoutes;

