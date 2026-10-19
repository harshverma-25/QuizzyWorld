import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { requestLogger } from './middleware/request-logger.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { notFoundHandler } from './middleware/not-found.middleware.js';
import { noCache } from './middleware/cache.middleware.js';
import { userRoutes } from './modules/user/user.routes.js';
import { questionRoutes } from './modules/question/question.routes.js';
import { roomRoutes } from './modules/room/room.routes.js';
import { battleRoutes } from './modules/battle/battle.routes.js';
import { historyRoutes } from './modules/history/history.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { categoryRoutes } from './modules/category/category.routes.js';
import { leaderboardRoutes } from './modules/leaderboard/leaderboard.routes.js';
import { docsRoutes } from './modules/docs/docs.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { quizRoutes } from './modules/quiz/quiz.routes.js';
import { paymentRoutes } from './modules/payment/payment.routes.js';

import mongoose from 'mongoose';
import { rateLimiter } from './middleware/rate-limiter.middleware.js';
import { env, resolveCorsOrigins } from './config/env.js';
import { logger } from './config/logger.js';
import { isUpstashConfigured } from './config/redis.js';

const app = express();

// Trust proxy for production environments (behind Nginx/Load Balancers)
app.set('trust proxy', 1);

// Custom Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Apply rate limiting to all requests
app.use(rateLimiter);

// Enable Cross-Origin Resource Sharing with normalization and safe diagnostics
const allowedOrigins = resolveCorsOrigins(env.CORS_ORIGIN);

app.use(cors({
  origin: (requestOrigin, callback) => {
    // Allow non-browser requests (e.g. mobile apps, curl, server-to-server health checks) where origin is omitted
    if (!requestOrigin) {
      return callback(null, true);
    }

    if (allowedOrigins === true) {
      return callback(null, true);
    }

    const normalized = requestOrigin.trim().replace(/\/+$/, '');
    if (Array.isArray(allowedOrigins) && allowedOrigins.includes(normalized)) {
      return callback(null, true);
    }

    logger.warn({ origin: requestOrigin }, '⚠️ Blocked CORS request from unauthorized origin');
    return callback(null, false);
  },
  credentials: true,
}));

// Parse Cookie headers for HttpOnly auth tokens
app.use(cookieParser());

// Parse incoming JSON payloads with safe bounded limits (10MB for base64 thumbnail uploads)
// Capture rawBody buffer for Razorpay webhook signature verification
app.use(
  express.json({
    limit: '10mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Parse URL-encoded payloads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use(requestLogger);

// Enable HTTP response compression for compressible payloads exceeding 1KB
app.use(
  compression({
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

// Health check endpoint
const getHealthStatus = () => {
  const readyState = mongoose.connection.readyState;
  let database = 'disconnected';
  if (readyState === 1) database = 'connected';
  else if (readyState === 2) database = 'connecting';
  else if (readyState === 3) database = 'disconnecting';

  return {
    status: readyState === 1 ? 'OK' : 'DEGRADED',
    database,
    cache: isUpstashConfigured() ? 'upstash_redis' : 'in_memory_fallback',
    uptime: Math.floor(process.uptime()), // in seconds
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
  };
};

app.get('/health', noCache, (req, res) => {
  const health = getHealthStatus();
  res.status(health.status === 'OK' ? 200 : 503).json({
    success: true,
    message: 'Health status retrieved successfully.',
    data: health,
  });
});

app.get('/api/v1/health', noCache, (req, res) => {
  const health = getHealthStatus();
  res.status(health.status === 'OK' ? 200 : 503).json({
    success: true,
    message: 'Health status retrieved successfully.',
    data: health,
  });
});

// Register API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/leaderboard', leaderboardRoutes);
app.use('/api/v1/questions', questionRoutes);
app.use('/api/v1/rooms', roomRoutes);
app.use('/api/v1/battles', battleRoutes);
app.use('/api/v1/matches', battleRoutes);
app.use('/api/v1/history', historyRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/quizzes', quizRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api', docsRoutes);

// Unmatched route handler (404)
app.use(notFoundHandler);

// Centralized error handling middleware
app.use(errorHandler);

export { app };
export default app;
