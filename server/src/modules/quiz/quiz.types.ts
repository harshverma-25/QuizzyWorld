import { Types, Document } from 'mongoose';

export type ThumbnailSource = 'ai' | 'url' | 'upload' | 'default';
export type QuizVisibility = 'private' | 'public';

export interface IQuizQuestion {
  questionId: string;
  question: string;
  options: [string, string, string, string];
  correctAnswer: number; // 0..3 index
  explanation: string;
  difficulty?: string;
}

export interface IUserQuiz {
  creatorId: Types.ObjectId;
  ownerId?: Types.ObjectId;
  creatorName: string;
  title: string;
  categoryName: string;
  categoryId?: Types.ObjectId | null;
  categorySlug?: string;
  subjectId?: Types.ObjectId | null;
  subjectSlug?: string;
  topic: string;
  description?: string;
  thumbnailUrl: string;
  thumbnailSource: ThumbnailSource;
  storageMetadata?: Record<string, any>;
  isPrivate: boolean;
  isPublished: boolean;
  visibility?: QuizVisibility;
  shareId: string;
  playedCount: number;
  questions: IQuizQuestion[];
  createdAt: Date;
  updatedAt: Date;
}

export type IUserQuizDocument = IUserQuiz & Document;

export interface IUserQuizQuota {
  userId: Types.ObjectId;
  generationsToday: number;
  lastResetDate: Date;
  isPro: boolean;
  proExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IUserQuizQuotaDocument = IUserQuizQuota & Document;

export interface QuotaStatusResponse {
  allowed: boolean;
  generationsToday: number;
  dailyLimit: number;
  remainingToday: number;
  isPro: boolean;
  proExpiresAt?: string | null;
  resetsAt: string;
}

export interface SaveQuizInput {
  title?: string;
  topic: string;
  categoryName: string;
  categoryId?: string;
  categorySlug?: string;
  subjectId?: string;
  subjectSlug?: string;
  description?: string;
  thumbnailUrl?: string;
  thumbnailSource?: ThumbnailSource;
  storageMetadata?: Record<string, any>;
  questions: IQuizQuestion[];
  isPrivate?: boolean;
  isPublished?: boolean;
}

export interface UpdateQuizInput {
  title?: string;
  topic?: string;
  description?: string;
  thumbnailUrl?: string;
  thumbnailSource?: ThumbnailSource;
  storageMetadata?: Record<string, any>;
  questions?: IQuizQuestion[];
}
