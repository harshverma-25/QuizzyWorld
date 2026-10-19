import { Schema, model } from 'mongoose';
import { IUserQuizQuotaDocument } from './quiz.types.js';

const UserQuizQuotaSchema = new Schema<IUserQuizQuotaDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    generationsToday: { type: Number, default: 0, min: 0 },
    lastResetDate: { type: Date, default: Date.now },
    isPro: { type: Boolean, default: false },
    proExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const UserQuizQuotaModel = model<IUserQuizQuotaDocument>('UserQuizQuota', UserQuizQuotaSchema);
export default UserQuizQuotaModel;
