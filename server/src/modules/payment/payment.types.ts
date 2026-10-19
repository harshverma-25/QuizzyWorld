import { Document, Types } from 'mongoose';

export type PaymentOrderStatus = 'created' | 'attempted' | 'paid' | 'failed' | 'refunded';

export interface IPaymentOrder {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  orderId: string; // Razorpay order_...
  paymentId?: string; // Razorpay pay_...
  signature?: string;
  amount: number; // in paise: 1900
  currency: string; // 'INR'
  status: PaymentOrderStatus;
  planId: string; // 'quizzy_pro_7d'
  planDurationDays: number; // 7
  planDailyGenerations: number; // 10
  entitlementStartsAt?: Date;
  entitlementExpiresAt?: Date;
  receipt: string;
  notes?: Record<string, any>;
  rawWebhookData?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type IPaymentOrderDocument = IPaymentOrder & Document;

export interface IProPlanConfig {
  planId: string;
  name: string;
  pricePaise: number;
  priceInr: number;
  durationDays: number;
  dailyGenerationsLimit: number;
  currency: string;
}
