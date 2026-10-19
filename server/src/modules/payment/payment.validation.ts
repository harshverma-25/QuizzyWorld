import { z } from 'zod';

export const VerifyPaymentRequestSchema = z.object({
  razorpay_order_id: z
    .string({ required_error: 'razorpay_order_id is required' })
    .min(1, 'Order ID cannot be empty'),
  razorpay_payment_id: z
    .string({ required_error: 'razorpay_payment_id is required' })
    .min(1, 'Payment ID cannot be empty'),
  razorpay_signature: z
    .string({ required_error: 'razorpay_signature is required' })
    .min(1, 'Signature cannot be empty'),
});

export type VerifyPaymentRequest = z.infer<typeof VerifyPaymentRequestSchema>;
