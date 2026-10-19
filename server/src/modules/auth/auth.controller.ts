import { Request, Response, CookieOptions } from 'express';
import { authService } from './auth.service.js';
import { ApiResponse } from '../../shared/utils/api-response.js';
import { ApiError } from '../../shared/errors/api-error.js';

const isProd = process.env.NODE_ENV === 'production';

export const getRefreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/v1/auth',
});

export const getClearRefreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/api/v1/auth',
});

export class AuthController {
  /**
   * POST /api/v1/auth/register
   * Registers a new native user account.
   */
  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(req.body);

    // Set HttpOnly refresh token cookie (SameSite=None in production for cross-site Vercel <-> Render)
    res.cookie('refreshToken', result.refreshToken, getRefreshCookieOptions());

    // Strip refreshToken from JSON body — it is delivered only via the HttpOnly cookie
    const { refreshToken: _rt, ...safeResult } = result;

    res.status(201).json(
      new ApiResponse(201, safeResult, 'User registered successfully.')
    );
  }

  /**
   * POST /api/v1/auth/login
   * Authenticates a native user with email/username and password.
   */
  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login(req.body);

    // Set HttpOnly refresh token cookie (SameSite=None in production for cross-site Vercel <-> Render)
    res.cookie('refreshToken', result.refreshToken, getRefreshCookieOptions());

    // Strip refreshToken from JSON body — it is delivered only via the HttpOnly cookie
    const { refreshToken: _rt, ...safeResult } = result;

    res.status(200).json(
      new ApiResponse(200, safeResult, 'Logged in successfully.')
    );
  }

  /**
   * POST /api/v1/auth/google
   * Authenticates a user with Google ID token, OAuth code, or access token.
   */
  async googleLogin(req: Request, res: Response): Promise<void> {
    const result = await authService.googleLogin(req.body);

    // Set HttpOnly refresh token cookie (SameSite=None in production for cross-site Vercel <-> Render)
    res.cookie('refreshToken', result.refreshToken, getRefreshCookieOptions());

    // Strip refreshToken from JSON body — it is delivered only via the HttpOnly cookie
    const { refreshToken: _rt, ...safeResult } = result;

    res.status(200).json(
      new ApiResponse(200, safeResult, 'Logged in with Google successfully.')
    );
  }

  /**
   * POST /api/v1/auth/refresh
   * Obtains a new access token using a refresh token.
   */
  async refresh(req: Request, res: Response): Promise<void> {
    const token =
      req.cookies?.refreshToken ||
      (process.env.NODE_ENV !== 'production' ? req.body?.refreshToken : undefined);
    if (!token) {
      throw new ApiError(
        401,
        process.env.NODE_ENV === 'production'
          ? 'Refresh token cookie is required'
          : 'Refresh token is required'
      );
    }

    const result = await authService.refresh(token);

    // Set updated HttpOnly refresh token cookie
    res.cookie('refreshToken', result.refreshToken, getRefreshCookieOptions());

    // Strip refreshToken from JSON body — it is delivered only via the HttpOnly cookie
    const { refreshToken: _rt, ...safeResult } = result;

    res.status(200).json(
      new ApiResponse(200, safeResult, 'Token refreshed successfully.')
    );
  }

  /**
   * POST /api/v1/auth/logout
   * Invalidates refresh session and clears cookie.
   */
  async logout(req: Request, res: Response): Promise<void> {
    const userId = req.user?._id?.toString() || req.user?.id?.toString();
    const token =
      req.cookies?.refreshToken ||
      (process.env.NODE_ENV !== 'production' ? req.body?.refreshToken : undefined);
    if (userId) {
      await authService.logout(userId, token);
    }

    res.clearCookie('refreshToken', getClearRefreshCookieOptions());

    res.status(200).json(
      new ApiResponse(200, null, 'Logged out successfully.')
    );
  }

  /**
   * GET /api/v1/auth/me
   * Returns current authenticated user or guest profile.
   */
  async getMe(req: Request, res: Response): Promise<void> {
    const user = req.user;
    if (!user) {
      throw new ApiError(401, 'Unauthorized');
    }

    const responseData = user.isGuest
      ? {
          id: user._id.toString(),
          _id: user._id.toString(),
          displayName: user.displayName,
          username: user.username,
          avatar: user.avatar,
          type: 'guest',
          isGuest: true,
          role: 'guest',
        }
      : {
          id: user._id.toString(),
          _id: user._id.toString(),
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          avatar: user.avatar,
          type: 'user',
          isGuest: false,
          role: user.role || 'user',
        };

    res.status(200).json(
      new ApiResponse(200, responseData, 'Current user retrieved successfully.')
    );
  }

  /**
   * POST /api/v1/auth/guest
   * Creates an ephemeral guest account and returns a signed guest JWT.
   */
  async createGuest(req: Request, res: Response): Promise<void> {
    const displayName = req.body?.displayName;
    const session = await authService.createGuestSession(displayName);

    res.status(201).json(
      new ApiResponse(201, session, 'Guest session created successfully.')
    );
  }
}

export const authController = new AuthController();
export default authController;

