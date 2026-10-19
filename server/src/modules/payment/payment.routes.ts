import { Router } from 'express';
import { paymentController } from './payment.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { paymentRateLimiter } from '../../middleware/rate-limiter.middleware.js';

const router = Router();

// Public webhook route (called by Razorpay servers with x-razorpay-signature header)
router.post('/webhook', paymentController.handleWebhook);

// Protected routes (require user login)
router.post('/create-order', authenticate, paymentRateLimiter, paymentController.createOrder);
router.post('/verify', authenticate, paymentRateLimiter, paymentController.verifyPayment);
router.get('/status', authenticate, paymentController.getStatus);

export const paymentRoutes = router;
export default paymentRoutes;
