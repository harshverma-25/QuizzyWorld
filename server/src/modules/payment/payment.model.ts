import { Schema, model } from 'mongoose';
import { IPaymentOrderDocument } from './payment.types.js';

const PaymentOrderSchema = new Schema<IPaymentOrderDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    paymentId: {
      type: String,
      sparse: true,
      index: true,
      trim: true,
    },
    signature: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: 'INR',
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['created', 'attempted', 'paid', 'failed', 'refunded'],
      default: 'created',
      index: true,
    },
    planId: {
      type: String,
      required: true,
      default: 'quizzy_pro_7d',
    },
    planDurationDays: {
      type: Number,
      required: true,
      default: 7,
    },
    planDailyGenerations: {
      type: Number,
      required: true,
      default: 10,
    },
    entitlementStartsAt: {
      type: Date,
      default: null,
    },
    entitlementExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    receipt: {
      type: String,
      required: true,
    },
    notes: {
      type: Schema.Types.Mixed,
      default: {},
    },
    rawWebhookData: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for user payment history and lookup
PaymentOrderSchema.index({ userId: 1, createdAt: -1 });
PaymentOrderSchema.index({ userId: 1, status: 1 });

export const PaymentOrderModel = model<IPaymentOrderDocument>('PaymentOrder', PaymentOrderSchema);
export default PaymentOrderModel;
