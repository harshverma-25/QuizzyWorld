import { Schema, model } from 'mongoose';
import { IUserDocument } from './user.types.js';

const UserSchema = new Schema<IUserDocument>(
  {
    email: { type: String, unique: true, sparse: true, index: true, lowercase: true, trim: true },
    googleId: { type: String, unique: true, sparse: true, index: true },
    passwordHash: { type: String, select: false },
    refreshTokenHash: { type: String, select: false },
    refreshTokenFamilies: {
      type: [
        {
          familyId: { type: String, required: true },
          tokenHash: { type: String, required: true },
          usedHashes: { type: [String], default: [] },
          expiresAt: { type: Date, required: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      select: false,
      default: [],
    },
    username: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    avatar: { type: String, default: '' },
    matchesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    totalCorrect: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0, min: 0, max: 100 },
    currentStreak: { type: Number, default: 0 },
    highestWinStreak: { type: Number, default: 0 },
    isGuest: { type: Boolean, default: false, index: true },
    role: { type: String, enum: ['user', 'guest', 'admin'], default: 'user' },
  },
  {
    timestamps: true,
  }
);

// Compound index for optimized global leaderboard sorting & rank calculation
UserSchema.index({ isGuest: 1, wins: -1, accuracy: -1, matchesPlayed: -1, username: 1 });

// TTL index to automatically purge guest users after 7 days (604800s)
UserSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 7 * 24 * 60 * 60,
    partialFilterExpression: { isGuest: true },
  }
);

export const UserModel = model<IUserDocument>('User', UserSchema);
export default UserModel;
