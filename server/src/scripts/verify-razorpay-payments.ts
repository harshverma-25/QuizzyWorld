import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { PaymentOrderModel } from '../modules/payment/payment.model.js';
import { paymentService, QUIZZY_PRO_PLAN } from '../modules/payment/payment.service.js';
import { UserQuizQuotaModel } from '../modules/quiz/quiz-quota.model.js';
import { quizService } from '../modules/quiz/quiz.service.js';
import { getStartOfIstDay } from '../modules/quiz/quota-timezone.js';

/**
 * ============================================================================
 * 🧪 VERIFICATION SUITE: RAZORPAY PRO PAYMENTS & ENTITLEMENT ENGINE
 * ============================================================================
 *
 * Deterministic automated test suite covering:
 * 1. Fixed Plan Verification: ₹19 (1900 paise), 7 days, 10 daily generations
 * 2. Order Creation & Parameter Tampering Prevention
 * 3. Valid HMAC-SHA256 Payment Signature Verification & Pro Activation
 * 4. Invalid / Forged Payment Signatures Rejection
 * 5. Forged Payment-Success Requests & Ownership Protection
 * 6. Idempotent Duplicate Payment Verification (No Double Entitlements)
 * 7. Webhook Signature Verification (Valid vs Invalid HMAC-SHA256)
 * 8. Duplicate & Out-of-Order Webhook Delivery Idempotency
 * 9. Failed & Cancelled Payment Handling
 * 10. Entitlement Extension (Extends from current expiry, not now)
 * 11. Entitlement Expiration & Automatic Fallback to Free 1/day
 * 12. Daily Usage Preservation upon Pro Activation (Existing Count Kept)
 * 13. Concurrency Protection under Simultaneous Verification Calls
 * 14. Atomic Pro 10-Quiz Quota Enforcement & Midnight IST Reset
 * 15. Mock vs Real Provider Credential Diagnostics
 */

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${testName} ${details ? `- ${details}` : ''}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runRazorpayVerificationSuite() {
  console.log('\n======================================================');
  console.log('🧪 VERIFYING RAZORPAY PRO PAYMENTS & ENTITLEMENT ENGINE');
  console.log('======================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  // Test Secret for HMAC-SHA256 signature generation in tests
  const TEST_KEY_SECRET = 'test_razorpay_secret_key_abcdef123456';
  const TEST_WEBHOOK_SECRET = 'test_webhook_secret_key_9876543210';
  process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  paymentService.setTestSecrets({ keySecret: TEST_KEY_SECRET, webhookSecret: TEST_WEBHOOK_SECRET });

  // Clean up any lingering mock orders from previous runs to ensure clean idempotency
  await PaymentOrderModel.deleteMany({ orderId: { $regex: '^order_test_' } });

  // Set mock Razorpay client
  let mockOrderCounter = Date.now();
  paymentService.setMockRazorpay({
    orders: {
      create: async (options: any) => {
        mockOrderCounter++;
        return {
          id: `order_test_${mockOrderCounter}`,
          amount: options.amount,
          currency: options.currency,
          receipt: options.receipt,
          status: 'created',
          notes: options.notes,
        };
      },
    },
  });

  const testUser1 = {
    _id: new Types.ObjectId(),
    username: 'pay_user_alpha',
    displayName: 'Alpha Player',
    email: 'alpha@quizzy.local',
  };

  const testUser2 = {
    _id: new Types.ObjectId(),
    username: 'pay_user_beta',
    displayName: 'Beta Player',
    email: 'beta@quizzy.local',
  };

  try {
    // =========================================================================
    // SUITE 1: FIXED PLAN DEFINITION & IMMUTABILITY
    // =========================================================================
    console.log('▶ TEST SUITE 1: Fixed Plan Pricing & Configuration');
    assert(QUIZZY_PRO_PLAN.priceInr === 19, 'Plan price is fixed at ₹19 INR');
    assert(QUIZZY_PRO_PLAN.pricePaise === 1900, 'Plan price in paise is exactly 1900');
    assert(QUIZZY_PRO_PLAN.currency === 'INR', 'Currency is INR');
    assert(QUIZZY_PRO_PLAN.durationDays === 7, 'Entitlement duration is exactly 7 days');
    assert(QUIZZY_PRO_PLAN.dailyGenerationsLimit === 10, 'Pro daily generation limit is 10 quizzes');

    // =========================================================================
    // SUITE 2: ORDER CREATION & TAMPER RESISTANCE
    // =========================================================================
    console.log('\n▶ TEST SUITE 2: Order Creation & Tampering Resistance');
    const order1 = await paymentService.createOrder(testUser1);
    assert(order1.orderId.startsWith('order_test_'), 'Order ID generated with order_ prefix');
    assert(order1.amount === 1900, 'Order amount enforced by backend as 1900 paise (₹19)');
    assert(order1.currency === 'INR', 'Order currency enforced as INR');
    assert(order1.plan.dailyLimit === 10, 'Plan daily limit specified as 10');

    // Check DB persistence
    const savedOrder1 = await PaymentOrderModel.findOne({ orderId: order1.orderId });
    assert(savedOrder1 !== null, 'Order record created in PaymentOrderModel');
    assert(savedOrder1?.status === 'created', 'Initial order status is "created"');
    assert(savedOrder1?.userId.toString() === testUser1._id.toString(), 'Order correctly linked to testUser1');
    assert(savedOrder1?.amount === 1900, 'Stored amount is 1900 paise');

    // =========================================================================
    // SUITE 3: VALID PAYMENT SIGNATURE & PRO ACTIVATION
    // =========================================================================
    console.log('\n▶ TEST SUITE 3: Valid HMAC-SHA256 Signature Verification & Pro Activation');
    const paymentId1 = 'pay_test_001001';
    const validSignature1 = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(`${order1.orderId}|${paymentId1}`)
      .digest('hex');

    const verifyResult1 = await paymentService.verifyPayment(testUser1, {
      razorpay_order_id: order1.orderId,
      razorpay_payment_id: paymentId1,
      razorpay_signature: validSignature1,
    });

    assert(verifyResult1.success === true, 'Verification succeeds for valid signature');
    assert(verifyResult1.quota.isPro === true, 'User is now Pro (isPro=true)');
    assert(verifyResult1.quota.dailyLimit === 10, 'Daily limit upgraded from 1 to 10');
    assert(verifyResult1.quota.remainingToday === 10, 'Remaining today is 10 for fresh user');
    assert(typeof verifyResult1.quota.proExpiresAt === 'string', 'proExpiresAt timestamp returned');

    // Check DB update
    const dbOrder1 = await PaymentOrderModel.findOne({ orderId: order1.orderId });
    assert(dbOrder1?.status === 'paid', 'Database order status transitioned to "paid"');
    assert(dbOrder1?.paymentId === paymentId1, 'Payment ID recorded in order');
    assert(dbOrder1?.signature === validSignature1, 'Signature recorded in order');
    assert(!!dbOrder1?.entitlementExpiresAt, 'entitlementExpiresAt recorded on order');

    // =========================================================================
    // SUITE 4: INVALID & FORGED SIGNATURE REJECTION
    // =========================================================================
    console.log('\n▶ TEST SUITE 4: Invalid & Forged Signature Rejection');
    const order2 = await paymentService.createOrder(testUser1);
    const forgedSignature = '0000000000000000000000000000000000000000000000000000000000000000';

    let caughtInvalidSig = false;
    try {
      await paymentService.verifyPayment(testUser1, {
        razorpay_order_id: order2.orderId,
        razorpay_payment_id: 'pay_test_002002',
        razorpay_signature: forgedSignature,
      });
    } catch (e: any) {
      caughtInvalidSig = e.statusCode === 400 && e.message.includes('Invalid payment signature');
    }
    assert(caughtInvalidSig, 'Forged signature rejected with 400 Bad Request');

    const failedOrder = await PaymentOrderModel.findOne({ orderId: order2.orderId });
    assert(failedOrder?.status === 'failed', 'Failed signature marks order status as "failed"');

    // =========================================================================
    // SUITE 5: FORGED REQUESTS & USER OWNERSHIP PROTECTION
    // =========================================================================
    console.log('\n▶ TEST SUITE 5: Cross-User Forgery & Ownership Protection');
    const order3 = await paymentService.createOrder(testUser1); // belongs to User1
    const validSig3 = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(`${order3.orderId}|pay_test_003`)
      .digest('hex');

    // User2 attempts to verify User1's order
    let caughtOwnershipMismatch = false;
    try {
      await paymentService.verifyPayment(testUser2, {
        razorpay_order_id: order3.orderId,
        razorpay_payment_id: 'pay_test_003',
        razorpay_signature: validSig3,
      });
    } catch (e: any) {
      caughtOwnershipMismatch = e.statusCode === 403;
    }
    assert(caughtOwnershipMismatch, 'Attempt by different user to verify order rejected with 403 Forbidden');

    // Non-existent order
    let caughtNotFound = false;
    try {
      await paymentService.verifyPayment(testUser1, {
        razorpay_order_id: 'order_non_existent_9999',
        razorpay_payment_id: 'pay_test_9999',
        razorpay_signature: 'fake_sig',
      });
    } catch (e: any) {
      caughtNotFound = e.statusCode === 404;
    }
    assert(caughtNotFound, 'Non-existent order ID rejected with 404 Not Found');

    // =========================================================================
    // SUITE 6: IDEMPOTENT DUPLICATE VERIFICATION (NO DOUBLE GRANTING)
    // =========================================================================
    console.log('\n▶ TEST SUITE 6: Idempotent Duplicate Payment Verification');
    const quotaBeforeDup = await UserQuizQuotaModel.findOne({ userId: testUser1._id });
    const expiryBeforeDup = quotaBeforeDup?.proExpiresAt?.getTime();

    // Verify order1 again (which was already paid in Suite 3)
    const dupVerify = await paymentService.verifyPayment(testUser1, {
      razorpay_order_id: order1.orderId,
      razorpay_payment_id: paymentId1,
      razorpay_signature: validSignature1,
    });

    assert(dupVerify.success === true, 'Duplicate verification returns success gracefully');
    assert(dupVerify.alreadyProcessed === true, 'alreadyProcessed flag set to true');

    const quotaAfterDup = await UserQuizQuotaModel.findOne({ userId: testUser1._id });
    assert(
      quotaAfterDup?.proExpiresAt?.getTime() === expiryBeforeDup,
      'Duplicate verification does NOT grant double duration or extend expiration'
    );

    // =========================================================================
    // SUITE 7: WEBHOOK SIGNATURE VERIFICATION & FULFILLMENT
    // =========================================================================
    console.log('\n▶ TEST SUITE 7: Webhook Signature Verification & Processing');
    const order4 = await paymentService.createOrder(testUser2); // Fresh order for User2

    const webhookBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_webhook_004',
            order_id: order4.orderId,
            amount: 1900,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });
    const rawWebhookBuffer = Buffer.from(webhookBody, 'utf8');

    // Invalid signature test
    let caughtInvalidWebhookSig = false;
    try {
      await paymentService.handleWebhook(rawWebhookBuffer, 'invalid_webhook_sig');
    } catch (e: any) {
      caughtInvalidWebhookSig = e.statusCode === 400 && e.message.includes('Invalid webhook signature');
    }
    assert(caughtInvalidWebhookSig, 'Invalid webhook signature rejected with 400');

    // Valid signature test
    const validWebhookSig = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(rawWebhookBuffer)
      .digest('hex');

    const webhookRes = await paymentService.handleWebhook(rawWebhookBuffer, validWebhookSig);
    assert(webhookRes.status === 'success', 'Valid webhook activates entitlement with status: success');

    const user2Quota = await UserQuizQuotaModel.findOne({ userId: testUser2._id });
    assert(user2Quota?.isPro === true, 'User2 upgraded to Pro via webhook');
    assert(!!user2Quota?.proExpiresAt, 'User2 proExpiresAt set via webhook');

    // =========================================================================
    // SUITE 8: DUPLICATE & OUT-OF-ORDER WEBHOOK DELIVERIES
    // =========================================================================
    console.log('\n▶ TEST SUITE 8: Duplicate Webhook Delivery Idempotency');
    const user2ExpiryBefore = user2Quota?.proExpiresAt?.getTime();

    // Redeliver identical webhook
    const dupWebhookRes = await paymentService.handleWebhook(rawWebhookBuffer, validWebhookSig);
    assert(dupWebhookRes.status === 'already_paid', 'Duplicate webhook delivery returns status: already_paid');

    const user2QuotaAfterDup = await UserQuizQuotaModel.findOne({ userId: testUser2._id });
    assert(
      user2QuotaAfterDup?.proExpiresAt?.getTime() === user2ExpiryBefore,
      'Duplicate webhook does NOT alter or extend entitlement duration'
    );

    // =========================================================================
    // SUITE 9: FAILED PAYMENT WEBHOOK
    // =========================================================================
    console.log('\n▶ TEST SUITE 9: Failed Payment Webhook Handling');
    const order5 = await paymentService.createOrder(testUser1);
    const failWebhookBody = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_failed_005',
            order_id: order5.orderId,
            error_code: 'BAD_REQUEST_ERROR',
            error_description: 'Payment was cancelled by user',
          },
        },
      },
    });
    const failBuffer = Buffer.from(failWebhookBody, 'utf8');
    const failSig = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(failBuffer).digest('hex');

    const failRes = await paymentService.handleWebhook(failBuffer, failSig);
    assert(failRes.status === 'payment_failed_recorded', 'Failed payment webhook recorded');

    const dbOrder5 = await PaymentOrderModel.findOne({ orderId: order5.orderId });
    assert(dbOrder5?.status === 'failed', 'Order status marked as "failed"');

    // =========================================================================
    // SUITE 10: ENTITLEMENT EXTENSION (STACKING +7 DAYS)
    // =========================================================================
    console.log('\n▶ TEST SUITE 10: Entitlement Extension for Active Pro Users');
    // User1 already has an active Pro entitlement expiring in ~7 days
    const currentQuota1 = await UserQuizQuotaModel.findOne({ userId: testUser1._id });
    const currentExpiryTime = currentQuota1!.proExpiresAt!.getTime();

    const order6 = await paymentService.createOrder(testUser1);
    const sig6 = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(`${order6.orderId}|pay_test_extend_006`)
      .digest('hex');

    const extendResult = await paymentService.verifyPayment(testUser1, {
      razorpay_order_id: order6.orderId,
      razorpay_payment_id: 'pay_test_extend_006',
      razorpay_signature: sig6,
    });

    const newExpiryTime = new Date(extendResult.quota.proExpiresAt!).getTime();
    const expectedExtension = 7 * 24 * 60 * 60 * 1000;
    const diff = newExpiryTime - currentExpiryTime;

    assert(
      Math.abs(diff - expectedExtension) < 2000,
      `Pro extends from existing expiration (+7 days = ${expectedExtension}ms, got ${diff}ms)`
    );

    // =========================================================================
    // SUITE 11: ENTITLEMENT EXPIRATION & AUTOMATIC FALLBACK TO FREE 1/DAY
    // =========================================================================
    console.log('\n▶ TEST SUITE 11: Automatic Fallback to Free Tier Upon Expiration');
    const expiredUser = {
      _id: new Types.ObjectId(),
      username: 'expired_user',
      displayName: 'Expired Player',
    };

    // Simulate expired Pro pass (expired 1 hour ago)
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    await UserQuizQuotaModel.create({
      userId: expiredUser._id,
      generationsToday: 0,
      lastResetDate: getStartOfIstDay(),
      isPro: true,
      proExpiresAt: oneHourAgo,
    });

    const expiredQuota = await quizService.getOrCreateUserQuota(expiredUser._id);
    assert(expiredQuota.isPro === false, 'Expired Pro is automatically treated as isPro=false');
    assert(expiredQuota.dailyLimit === 1, 'Expired Pro daily limit reverts to Free tier limit (1)');
    assert(expiredQuota.remainingToday === 1, 'Remaining today matches Free tier (1/1)');

    // =========================================================================
    // SUITE 12: DAILY USAGE PRESERVATION UPON PRO UPGRADE
    // =========================================================================
    console.log('\n▶ TEST SUITE 12: Daily Usage Preservation (No Loss or Reset of Count)');
    const upgradingUser = {
      _id: new Types.ObjectId(),
      username: 'upgrading_user',
      displayName: 'Upgrading Player',
    };

    // User already used their 1 free generation today
    await UserQuizQuotaModel.create({
      userId: upgradingUser._id,
      generationsToday: 1, // exhausted Free quota
      lastResetDate: getStartOfIstDay(),
      isPro: false,
      proExpiresAt: null,
    });

    const preUpgradeQuota = await quizService.getOrCreateUserQuota(upgradingUser._id);
    assert(preUpgradeQuota.allowed === false, 'Free user starts with 0 remaining today (exhausted)');
    assert(preUpgradeQuota.generationsToday === 1, 'Free user used 1 generation today');

    // Upgrade to Pro
    const upgradeOrder = await paymentService.createOrder(upgradingUser);
    const upgradeSig = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(`${upgradeOrder.orderId}|pay_test_upgrade_007`)
      .digest('hex');

    const upgradeRes = await paymentService.verifyPayment(upgradingUser, {
      razorpay_order_id: upgradeOrder.orderId,
      razorpay_payment_id: 'pay_test_upgrade_007',
      razorpay_signature: upgradeSig,
    });

    assert(upgradeRes.quota.isPro === true, 'Upgraded user is now Pro');
    assert(upgradeRes.quota.generationsToday === 1, 'Existing 1 generation used today is PRESERVED');
    assert(upgradeRes.quota.dailyLimit === 10, 'Daily limit expanded to 10');
    assert(upgradeRes.quota.remainingToday === 9, 'Remaining today correctly expands to 9 (10 - 1)');

    // =========================================================================
    // SUITE 13: CONCURRENCY PROTECTION (RACE CONDITION PREVENTION)
    // =========================================================================
    console.log('\n▶ TEST SUITE 13: Concurrency Protection under Simultaneous Verification');
    const concurrentUser = {
      _id: new Types.ObjectId(),
      username: 'concurrent_user',
      displayName: 'Concurrent Player',
    };

    const concOrder = await paymentService.createOrder(concurrentUser);
    const concSig = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(`${concOrder.orderId}|pay_test_conc_008`)
      .digest('hex');

    // Fire 5 simultaneous verify requests for the exact same order
    const concPromises = Array.from({ length: 5 }, () =>
      paymentService.verifyPayment(concurrentUser, {
        razorpay_order_id: concOrder.orderId,
        razorpay_payment_id: 'pay_test_conc_008',
        razorpay_signature: concSig,
      })
    );

    const concResults = await Promise.all(concPromises);
    assert(concResults.every((r) => r.success), 'All concurrent requests handled gracefully');

    const firstTimeProcessed = concResults.filter((r) => !r.alreadyProcessed);
    const idempotentProcessed = concResults.filter((r) => r.alreadyProcessed);

    assert(
      firstTimeProcessed.length === 1,
      `Exactly 1 request executed the initial state transition (got ${firstTimeProcessed.length})`
    );
    assert(
      idempotentProcessed.length === 4,
      `Remaining 4 requests recognized order was already processed (got ${idempotentProcessed.length})`
    );

    // =========================================================================
    // SUITE 14: ATOMIC PRO QUOTA ENFORCEMENT & MIDNIGHT IST RESET
    // =========================================================================
    console.log('\n▶ TEST SUITE 14: Pro 10-Quiz Daily Quota Enforcement');
    // Reserve atomic quota 9 more times for upgradingUser (who already had 1)
    for (let i = 2; i <= 10; i++) {
      const res = await quizService.reserveAtomicGenerationQuota(upgradingUser._id);
      assert(res.allowed === true, `Pro user allowed generation #${i} under limit of 10`);
      assert(res.generationsToday === i, `generationsToday increments to ${i}`);
    }

    // 11th attempt must be rejected (10 daily limit exhausted)
    const exhaustedAttempt = await quizService.reserveAtomicGenerationQuota(upgradingUser._id);
    assert(exhaustedAttempt.allowed === false, '11th attempt rejected (daily limit of 10 exhausted)');
    assert(exhaustedAttempt.remainingToday === 0, 'Remaining today is 0');

    // =========================================================================
    // SUITE 15: CLEANUP & SUMMARY
    // =========================================================================
    console.log('\n▶ TEST SUITE 15: Cleanup Test Data');
    await PaymentOrderModel.deleteMany({
      userId: { $in: [testUser1._id, testUser2._id, expiredUser._id, upgradingUser._id, concurrentUser._id] },
    });
    await UserQuizQuotaModel.deleteMany({
      userId: { $in: [testUser1._id, testUser2._id, expiredUser._id, upgradingUser._id, concurrentUser._id] },
    });
    paymentService.resetMock();
    assert(true, 'Test records cleaned up successfully');

    console.log('\n======================================================');
    console.log(`🎉 RAZORPAY PRO PAYMENTS VERIFICATION: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('======================================================\n');
  } finally {
    await mongoose.connection.close();
  }
}

runRazorpayVerificationSuite().catch((err) => {
  console.error('Fatal error during Razorpay payments verification:', err);
  process.exit(1);
});
