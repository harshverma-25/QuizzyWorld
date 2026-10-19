import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { PaymentOrderModel } from './payment.model.js';
import { IProPlanConfig } from './payment.types.js';
import { VerifyPaymentRequest } from './payment.validation.js';
import { UserQuizQuotaModel } from '../quiz/quiz-quota.model.js';
import { quizService } from '../quiz/quiz.service.js';

export const QUIZZY_PRO_PLAN: IProPlanConfig = {
  planId: 'quizzy_pro_7d',
  name: 'Quizzy Pro (7 Days)',
  pricePaise: 1900, // ₹19.00 in paise
  priceInr: 19,
  durationDays: 7,
  dailyGenerationsLimit: 10,
  currency: 'INR',
};

export class PaymentService {
  private razorpayClient: Razorpay | null = null;
  private mockRazorpay: any = null;
  private testKeySecret: string | null = null;
  private testWebhookSecret: string | null = null;
  private testKeyId: string | null = null;

  constructor() {
    this.initRazorpay();
  }

  /**
   * Safe test secret configuration injector for offline automated verification.
   */
  public setTestSecrets(secrets: { keySecret?: string; webhookSecret?: string; keyId?: string } | null): void {
    if (!secrets) {
      this.testKeySecret = null;
      this.testWebhookSecret = null;
      this.testKeyId = null;
    } else {
      if (secrets.keySecret !== undefined) this.testKeySecret = secrets.keySecret;
      if (secrets.webhookSecret !== undefined) this.testWebhookSecret = secrets.webhookSecret;
      if (secrets.keyId !== undefined) this.testKeyId = secrets.keyId;
    }
  }

  public getKeySecret(): string | undefined {
    return this.testKeySecret ?? process.env.RAZORPAY_KEY_SECRET ?? env.RAZORPAY_KEY_SECRET;
  }

  public getWebhookSecret(): string | undefined {
    return this.testWebhookSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET ?? env.RAZORPAY_WEBHOOK_SECRET;
  }

  public getKeyId(): string | undefined {
    return this.testKeyId ?? process.env.RAZORPAY_KEY_ID ?? env.RAZORPAY_KEY_ID;
  }

  private initRazorpay(): void {
    const keyId = this.getKeyId();
    const keySecret = this.getKeySecret();

    if (keyId && keySecret) {
      try {
        this.razorpayClient = new Razorpay({
          key_id: keyId,
          key_secret: keySecret,
        });
        logger.info({ keyId: keyId.substring(0, 8) + '...' }, 'Razorpay client initialized');
      } catch (err) {
        logger.warn({ err }, 'Failed to initialize Razorpay client with configured credentials');
      }
    }
  }

  /**
   * Mock injector for offline testing.
   */
  public setMockRazorpay(mock: any): void {
    this.mockRazorpay = mock;
  }

  public resetMock(): void {
    this.mockRazorpay = null;
    this.testKeySecret = null;
    this.testWebhookSecret = null;
    this.testKeyId = null;
    this.initRazorpay();
  }

  private getRazorpay(): Razorpay {
    if (this.mockRazorpay) {
      return this.mockRazorpay;
    }
    if (!this.razorpayClient) {
      const keyId = this.getKeyId();
      const keySecret = this.getKeySecret();
      if (keyId && keySecret) {
        this.razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
        return this.razorpayClient;
      }
      throw new ApiError(
        500,
        'Razorpay credentials are not configured on the server. Please configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
      );
    }
    return this.razorpayClient;
  }

  /**
   * Helper: Retrieve server's configured public checkout key.
   */
  public getPublicKey(): string {
    return env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder';
  }

  /**
   * STEP 1: CREATE PAYMENT ORDER
   * Server strictly enforces fixed ₹19 price and 7-day plan.
   * Client-supplied prices, durations, or statuses are never accepted.
   */
  async createOrder(user: { _id: string | Types.ObjectId; displayName?: string; email?: string }): Promise<{
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
    plan: {
      id: string;
      name: string;
      price: number;
      durationDays: number;
      dailyLimit: number;
    };
  }> {
    const userId = new Types.ObjectId(user._id.toString());
    const rzp = this.getRazorpay();
    const receipt = `rcpt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const orderOptions = {
      amount: QUIZZY_PRO_PLAN.pricePaise, // 1900 paise = ₹19
      currency: QUIZZY_PRO_PLAN.currency, // 'INR'
      receipt,
      notes: {
        userId: userId.toString(),
        planId: QUIZZY_PRO_PLAN.planId,
        durationDays: String(QUIZZY_PRO_PLAN.durationDays),
        dailyGenerationsLimit: String(QUIZZY_PRO_PLAN.dailyGenerationsLimit),
      },
    };

    let rzpOrder: any;
    try {
      rzpOrder = await rzp.orders.create(orderOptions);
    } catch (err: any) {
      logger.error({ err, userId: userId.toString() }, 'Failed to create Razorpay order');
      throw new ApiError(502, `Failed to initialize Razorpay checkout order: ${err?.message || 'Provider error'}`);
    }

    if (!rzpOrder || !rzpOrder.id) {
      throw new ApiError(502, 'Razorpay provider returned an invalid order payload');
    }

    // Persist order record in database with 'created' status
    await PaymentOrderModel.create({
      userId,
      orderId: rzpOrder.id,
      amount: QUIZZY_PRO_PLAN.pricePaise,
      currency: QUIZZY_PRO_PLAN.currency,
      status: 'created',
      planId: QUIZZY_PRO_PLAN.planId,
      planDurationDays: QUIZZY_PRO_PLAN.durationDays,
      planDailyGenerations: QUIZZY_PRO_PLAN.dailyGenerationsLimit,
      receipt,
      notes: orderOptions.notes,
    });

    logger.info(
      { orderId: rzpOrder.id, userId: userId.toString(), amount: QUIZZY_PRO_PLAN.pricePaise },
      'Razorpay order created successfully'
    );

    return {
      orderId: rzpOrder.id,
      amount: QUIZZY_PRO_PLAN.pricePaise,
      currency: QUIZZY_PRO_PLAN.currency,
      keyId: this.getPublicKey(),
      plan: {
        id: QUIZZY_PRO_PLAN.planId,
        name: QUIZZY_PRO_PLAN.name,
        price: QUIZZY_PRO_PLAN.priceInr,
        durationDays: QUIZZY_PRO_PLAN.durationDays,
        dailyLimit: QUIZZY_PRO_PLAN.dailyGenerationsLimit,
      },
    };
  }

  /**
   * STEP 2: VERIFY PAYMENT SIGNATURE & ACTIVATE PRO ENTITLEMENT
   * Uses official Razorpay HMAC-SHA256 signature verification procedure.
   * Completely idempotent and protected against concurrency races and duplicate callbacks.
   */
  async verifyPayment(
    user: { _id: string | Types.ObjectId },
    dto: VerifyPaymentRequest
  ): Promise<{
    success: boolean;
    message: string;
    alreadyProcessed?: boolean;
    quota: {
      isPro: boolean;
      proExpiresAt: string | null;
      dailyLimit: number;
      remainingToday: number;
      generationsToday: number;
    };
  }> {
    const userId = new Types.ObjectId(user._id.toString());
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = dto;

    // 1. Fetch order from DB
    const order = await PaymentOrderModel.findOne({ orderId: razorpay_order_id });
    if (!order) {
      throw new ApiError(404, 'Payment order not found in records.');
    }

    // 2. Strict ownership check: Must belong to the authenticated user
    if (order.userId.toString() !== userId.toString()) {
      logger.warn(
        { orderId: razorpay_order_id, orderUserId: order.userId.toString(), callerUserId: userId.toString() },
        'Payment order ownership mismatch detected'
      );
      throw new ApiError(403, 'Unauthorized access to payment order.');
    }

    // 3. IDEMPOTENCY CHECK: If order is already paid, return fulfilled quota without double granting!
    if (order.status === 'paid') {
      logger.info({ orderId: razorpay_order_id }, 'Payment already verified previously; returning idempotent status');
      const currentQuota = await quizService.getOrCreateUserQuota(userId);
      return {
        success: true,
        message: 'Payment was previously verified and Pro remains active.',
        alreadyProcessed: true,
        quota: {
          isPro: currentQuota.isPro,
          proExpiresAt: currentQuota.proExpiresAt || null,
          dailyLimit: currentQuota.dailyLimit,
          remainingToday: currentQuota.remainingToday,
          generationsToday: currentQuota.generationsToday,
        },
      };
    }

    // 4. Verify HMAC-SHA256 Signature
    const keySecret = this.getKeySecret();
    if (!keySecret) {
      throw new ApiError(500, 'Server payment secret key is not configured.');
    }

    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto.createHmac('sha256', keySecret).update(payload).digest('hex');

    const signatureValid = this.timingSafeEqual(razorpay_signature, expectedSignature);
    if (!signatureValid) {
      logger.warn({ orderId: razorpay_order_id, paymentId: razorpay_payment_id }, 'Invalid Razorpay payment signature');
      await PaymentOrderModel.updateOne({ orderId: razorpay_order_id }, { $set: { status: 'failed' } });
      throw new ApiError(400, 'Invalid payment signature. Payment verification failed.');
    }

    // 5. ATOMIC STATUS LOCK: Prevent race condition between concurrent verify callbacks or webhook
    const updatedOrder = await PaymentOrderModel.findOneAndUpdate(
      {
        orderId: razorpay_order_id,
        status: { $ne: 'paid' },
      },
      {
        $set: {
          status: 'paid',
          paymentId: razorpay_payment_id,
          signature: razorpay_signature,
        },
      },
      { new: true }
    );

    if (!updatedOrder) {
      // Another concurrent worker transitioned the status to 'paid' first
      const currentQuota = await quizService.getOrCreateUserQuota(userId);
      return {
        success: true,
        message: 'Payment confirmed and Pro is active.',
        alreadyProcessed: true,
        quota: {
          isPro: currentQuota.isPro,
          proExpiresAt: currentQuota.proExpiresAt || null,
          dailyLimit: currentQuota.dailyLimit,
          remainingToday: currentQuota.remainingToday,
          generationsToday: currentQuota.generationsToday,
        },
      };
    }

    // 6. ACTIVATE OR EXTEND PRO ENTITLEMENT
    const entitlement = await this.activateOrExtendPro(userId, QUIZZY_PRO_PLAN.durationDays);

    // Save final entitlement bounds to order
    await PaymentOrderModel.updateOne(
      { orderId: razorpay_order_id },
      {
        $set: {
          entitlementStartsAt: entitlement.startsAt,
          entitlementExpiresAt: entitlement.expiresAt,
        },
      }
    );

    logger.info(
      {
        userId: userId.toString(),
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        expiresAt: entitlement.expiresAt.toISOString(),
      },
      'Pro entitlement successfully activated'
    );

    const updatedQuota = await quizService.getOrCreateUserQuota(userId);
    return {
      success: true,
      message: 'Payment verified successfully! Quizzy Pro activated for 7 days.',
      quota: {
        isPro: true,
        proExpiresAt: entitlement.expiresAt.toISOString(),
        dailyLimit: updatedQuota.dailyLimit,
        remainingToday: updatedQuota.remainingToday,
        generationsToday: updatedQuota.generationsToday,
      },
    };
  }

  /**
   * STEP 3: WEBHOOK PROCESSING
   * Verifies x-razorpay-signature on the raw body buffer and idempotently fulfills payments.
   */
  async handleWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined
  ): Promise<{ status: string; processedEvent?: string }> {
    const webhookSecret = this.getWebhookSecret();

    if (!webhookSecret) {
      logger.warn('RAZORPAY_WEBHOOK_SECRET is not configured on server; rejecting webhook');
      throw new ApiError(500, 'Webhook secret is not configured on the server.');
    }

    if (!signatureHeader) {
      throw new ApiError(400, 'Missing x-razorpay-signature header');
    }

    // Verify HMAC-SHA256 over exact raw body buffer
    const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    if (!this.timingSafeEqual(signatureHeader, expectedSignature)) {
      logger.warn('Invalid webhook signature received');
      throw new ApiError(400, 'Invalid webhook signature');
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new ApiError(400, 'Invalid JSON webhook payload');
    }

    const event = payload.event;
    logger.info({ event }, 'Processing Razorpay webhook event');

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id || payload.payload?.order?.entity?.id;
      const paymentId = paymentEntity?.id;

      if (!orderId) {
        logger.warn('Webhook event missing order_id');
        return { status: 'ignored_missing_order_id' };
      }

      // Check order
      const order = await PaymentOrderModel.findOne({ orderId });
      if (!order) {
        logger.warn({ orderId }, 'Webhook received for unknown order');
        return { status: 'ignored_unknown_order' };
      }

      if (order.status === 'paid') {
        logger.info({ orderId }, 'Order already marked as paid; webhook acknowledges idempotently');
        return { status: 'already_paid', processedEvent: event };
      }

      // Atomically update order to paid
      const updated = await PaymentOrderModel.findOneAndUpdate(
        { orderId, status: { $ne: 'paid' } },
        {
          $set: {
            status: 'paid',
            paymentId: paymentId || order.paymentId,
            rawWebhookData: payload,
          },
        },
        { new: true }
      );

      if (updated) {
        // Activate or extend Pro entitlement
        const entitlement = await this.activateOrExtendPro(order.userId, QUIZZY_PRO_PLAN.durationDays);
        await PaymentOrderModel.updateOne(
          { orderId },
          {
            $set: {
              entitlementStartsAt: entitlement.startsAt,
              entitlementExpiresAt: entitlement.expiresAt,
            },
          }
        );
        logger.info({ orderId, userId: order.userId.toString() }, 'Pro entitlement activated via webhook');
      }

      return { status: 'success', processedEvent: event };
    }

    if (event === 'payment.failed') {
      const orderId = payload.payload?.payment?.entity?.order_id;
      if (orderId) {
        await PaymentOrderModel.updateOne(
          { orderId, status: { $ne: 'paid' } },
          { $set: { status: 'failed', rawWebhookData: payload } }
        );
        logger.info({ orderId }, 'Order marked as failed via webhook');
      }
      return { status: 'payment_failed_recorded', processedEvent: event };
    }

    return { status: 'ignored_unhandled_event', processedEvent: event };
  }

  /**
   * Entitlement Policy:
   * - If user currently has active Pro access, extend by `days` from the current expiry date.
   * - If expired or first-time buyer, set expiry to `now + days`.
   * - Does NOT reset existing `generationsToday`.
   */
  async activateOrExtendPro(
    userId: Types.ObjectId,
    days = 7
  ): Promise<{ startsAt: Date; expiresAt: Date; wasExtended: boolean }> {
    const now = new Date();
    const existing = await UserQuizQuotaModel.findOne({ userId });

    let baseDate = now;
    let wasExtended = false;

    if (existing?.isPro && existing.proExpiresAt && new Date(existing.proExpiresAt) > now) {
      baseDate = new Date(existing.proExpiresAt);
      wasExtended = true;
    }

    const newExpiresAt = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

    await UserQuizQuotaModel.updateOne(
      { userId },
      {
        $set: {
          isPro: true,
          proExpiresAt: newExpiresAt,
        },
        $setOnInsert: {
          generationsToday: 0,
          lastResetDate: now,
        },
      },
      { upsert: true }
    );

    return {
      startsAt: now,
      expiresAt: newExpiresAt,
      wasExtended,
    };
  }

  /**
   * Constant-time string comparison preventing timing attack vulnerabilities.
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    } catch {
      return false;
    }
  }
}

export const paymentService = new PaymentService();
export default paymentService;
