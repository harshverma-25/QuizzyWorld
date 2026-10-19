import { Request, Response, NextFunction } from 'express';
import { paymentService } from './payment.service.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { VerifyPaymentRequestSchema } from './payment.validation.js';
import { quizService } from '../quiz/quiz.service.js';

export class PaymentController {
  /**
   * POST /api/v1/payments/create-order
   * Authenticated endpoint to initialize a Razorpay order for the ₹19 Quizzy Pro plan.
   */
  async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required to create a payment order');
      }

      const orderData = await paymentService.createOrder(req.user);
      res.status(201).json({
        success: true,
        message: 'Razorpay order created successfully.',
        data: orderData,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/payments/verify
   * Authenticated endpoint to verify payment signature and activate Pro entitlement.
   */
  async verifyPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required to verify payment');
      }

      const parseResult = VerifyPaymentRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ApiError(
          400,
          `Invalid payment verification data: ${parseResult.error.errors.map((e) => e.message).join('; ')}`
        );
      }

      const result = await paymentService.verifyPayment(req.user, parseResult.data);
      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/payments/webhook
   * Public webhook endpoint called directly by Razorpay servers.
   * Verifies x-razorpay-signature on the raw body buffer.
   */
  async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
      const signatureHeader = req.headers['x-razorpay-signature'] as string | undefined;

      const result = await paymentService.handleWebhook(rawBody, signatureHeader);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/payments/status
   * Returns authenticated user's current Pro plan entitlement status and expiry.
   */
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required');
      }

      const quota = await quizService.getOrCreateUserQuota(req.user._id);
      res.status(200).json({
        success: true,
        data: {
          isPro: quota.isPro,
          proExpiresAt: quota.proExpiresAt || null,
          dailyLimit: quota.dailyLimit,
          remainingToday: quota.remainingToday,
          generationsToday: quota.generationsToday,
          resetsAt: quota.resetsAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const paymentController = new PaymentController();
export default paymentController;
