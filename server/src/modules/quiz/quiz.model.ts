import { Schema, model } from 'mongoose';
import { IUserQuizDocument } from './quiz.types.js';

const QuizQuestionSchema = new Schema(
  {
    questionId: { type: String, required: true },
    question: { type: String, required: true },
    options: {
      type: [String],
      required: true,
      validate: [
        (val: string[]) => Array.isArray(val) && val.length === 4,
        'Quiz question must have exactly 4 options',
      ],
    },
    correctAnswer: {
      type: Number,
      required: true,
      min: 0,
      max: 3,
    },
    explanation: { type: String, required: true },
    difficulty: { type: String, default: 'easy' },
  },
  { _id: false }
);

const UserQuizSchema = new Schema<IUserQuizDocument>(
  {
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    creatorName: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    categoryName: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', index: true, default: null },
    categorySlug: { type: String, trim: true, default: '' },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', index: true, default: null },
    subjectSlug: { type: String, trim: true, default: '' },
    topic: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    thumbnailSource: {
      type: String,
      enum: ['ai', 'url', 'upload', 'default'],
      default: 'default',
    },
    storageMetadata: { type: Schema.Types.Mixed, default: {} },
    isPrivate: { type: Boolean, default: true, index: true },
    isPublished: { type: Boolean, default: false, index: true },
    shareId: { type: String, required: true, unique: true, index: true },
    playedCount: { type: Number, default: 0, min: 0 },
    questions: {
      type: [QuizQuestionSchema],
      required: true,
      validate: [
        (val: any[]) => Array.isArray(val) && val.length > 0,
        'User quiz must contain questions',
      ],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for ownerId (alias for creatorId)
UserQuizSchema.virtual('ownerId').get(function (this: IUserQuizDocument) {
  return this.creatorId;
});

// Virtual for visibility ('private' | 'public')
UserQuizSchema.virtual('visibility').get(function (this: IUserQuizDocument) {
  return this.isPrivate ? 'private' : 'public';
});

// Compound indexes strictly tailored to actual query patterns
UserQuizSchema.index({ creatorId: 1, createdAt: -1 });
UserQuizSchema.index({ isPublished: 1, isPrivate: 1, createdAt: -1 });
UserQuizSchema.index({ categoryId: 1, isPublished: 1 });

export const UserQuizModel = model<IUserQuizDocument>('UserQuiz', UserQuizSchema);
export default UserQuizModel;
