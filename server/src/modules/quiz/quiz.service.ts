import crypto from 'crypto';
import { Types } from 'mongoose';
import { ApiError } from '../../shared/errors/api-error.js';
import { logger } from '../../config/logger.js';
import { cacheService } from '../../shared/cache/cache.service.js';
import { UserQuizModel } from './quiz.model.js';
import { UserQuizQuotaModel } from './quiz-quota.model.js';
import { QuestionModel } from '../question/question.model.js';
import { CategoryModel } from '../category/category.model.js';
import { validateCategoryAndSubjectReferences } from './quiz.validation.js';
import { geminiService } from './gemini.service.js';
import { getStartOfIstDay, getNextMidnightIst } from './quota-timezone.js';
import { mediaService } from '../media/media.service.js';
import {
  downloadAndUploadUrlImage,
  processAndUploadImageFile,
  validateSafeHttpsUrl,
  validateImageMagicBytes,
} from './ssrf-validator.js';
import {
  IQuizQuestion,
  IUserQuizDocument,
  QuotaStatusResponse,
  SaveQuizInput,
  ThumbnailSource,
  UpdateQuizInput,
} from './quiz.types.js';

// Default fallback thumbnail if cover image generation is not specified or fails
export const DEFAULT_FALLBACK_THUMBNAIL =
  'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=600&auto=format&fit=crop&q=80';

export class QuizService {
  /**
   * Retrieve or initialize persistent daily quota information for a user.
   * Quota resets strictly at midnight IST (00:00:00.000 IST).
   */
  async getOrCreateUserQuota(userId: Types.ObjectId): Promise<QuotaStatusResponse> {
    const startOfTodayIst = getStartOfIstDay();
    const nextMidnightIst = getNextMidnightIst();
    const now = new Date();

    // 1. Ensure the user quota document exists
    try {
      await UserQuizQuotaModel.updateOne(
        { userId },
        {
          $setOnInsert: {
            userId,
            generationsToday: 0,
            lastResetDate: startOfTodayIst,
            isPro: false,
            proExpiresAt: null,
          },
        },
        { upsert: true }
      );
    } catch (err: any) {
      if (err.code !== 11000) throw err;
    }

    // 2. Atomically reset count if lastResetDate < startOfTodayIst
    await UserQuizQuotaModel.updateOne(
      {
        userId,
        lastResetDate: { $lt: startOfTodayIst },
      },
      {
        $set: {
          generationsToday: 0,
          lastResetDate: startOfTodayIst,
        },
      }
    );

    const quotaDoc = await UserQuizQuotaModel.findOne({ userId });
    const isProActive = Boolean(
      quotaDoc?.isPro && (!quotaDoc.proExpiresAt || new Date(quotaDoc.proExpiresAt) > now)
    );

    const dailyLimit = isProActive ? 10 : 1;
    const generationsToday = quotaDoc?.generationsToday || 0;
    const remainingToday = Math.max(0, dailyLimit - generationsToday);
    const allowed = remainingToday > 0;

    return {
      allowed,
      generationsToday,
      dailyLimit,
      remainingToday,
      isPro: isProActive,
      proExpiresAt: quotaDoc?.proExpiresAt ? quotaDoc.proExpiresAt.toISOString() : null,
      resetsAt: nextMidnightIst.toISOString(),
    };
  }

  /**
   * ATOMIC QUOTA ENFORCEMENT:
   * Uses MongoDB conditional findOneAndUpdate to atomically test & reserve 1 generation unit.
   * Completely immune to simultaneous request race conditions.
   * Resets at midnight IST.
   */
  async reserveAtomicGenerationQuota(userId: Types.ObjectId): Promise<{
    allowed: boolean;
    generationsToday: number;
    dailyLimit: number;
    remainingToday: number;
    isPro: boolean;
  }> {
    const startOfTodayIst = getStartOfIstDay();
    const now = new Date();

    // 1. Ensure the user quota document exists (handle duplicate key safely if concurrent)
    try {
      await UserQuizQuotaModel.updateOne(
        { userId },
        {
          $setOnInsert: {
            userId,
            generationsToday: 0,
            lastResetDate: startOfTodayIst,
            isPro: false,
            proExpiresAt: null,
          },
        },
        { upsert: true }
      );
    } catch (err: any) {
      if (err.code !== 11000) throw err;
    }

    // 2. Atomically reset count if a new IST day has started
    await UserQuizQuotaModel.updateOne(
      {
        userId,
        lastResetDate: { $lt: startOfTodayIst },
      },
      {
        $set: {
          generationsToday: 0,
          lastResetDate: startOfTodayIst,
        },
      }
    );

    // 3. Fetch record to check Pro status
    const existing = await UserQuizQuotaModel.findOne({ userId });
    const isProActive = Boolean(
      existing?.isPro && (!existing.proExpiresAt || new Date(existing.proExpiresAt) > now)
    );
    const dailyLimit = isProActive ? 10 : 1;

    // 4. Atomic reservation: increment generationsToday ONLY IF generationsToday < dailyLimit
    const updated = await UserQuizQuotaModel.findOneAndUpdate(
      {
        userId,
        generationsToday: { $lt: dailyLimit },
      },
      {
        $inc: { generationsToday: 1 },
      },
      {
        new: true,
      }
    );

    if (!updated) {
      return {
        allowed: false,
        generationsToday: existing?.generationsToday || dailyLimit,
        dailyLimit,
        remainingToday: 0,
        isPro: isProActive,
      };
    }

    const remainingToday = Math.max(0, dailyLimit - updated.generationsToday);
    return {
      allowed: true,
      generationsToday: updated.generationsToday,
      dailyLimit,
      remainingToday,
      isPro: isProActive,
    };
  }

  /**
   * Release reserved quota unit in case the generation pipeline subsequently fails.
   */
  async rollbackQuotaReservation(userId: Types.ObjectId): Promise<void> {
    await UserQuizQuotaModel.updateOne(
      { userId, generationsToday: { $gt: 0 } },
      { $inc: { generationsToday: -1 } }
    );
  }

  /**
   * Helper: Synchronize user quiz questions into QuestionModel for gameplay compatibility.
   */
  private async syncQuestionsToCatalog(quiz: IUserQuizDocument): Promise<void> {
    const docs = quiz.questions.map((q, index) => ({
      questionId: `${quiz.shareId}_q${index + 1}`,
      categoryId: quiz.categoryId || undefined,
      subjectId: quiz._id,
      topic: quiz.topic,
      difficulty: q.difficulty || 'easy',
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      isPublished: quiz.isPublished,
    }));

    // Delete existing synced questions and bulk write
    await QuestionModel.deleteMany({ subjectId: quiz._id });
    if (docs.length > 0) {
      await QuestionModel.insertMany(docs, { ordered: false });
    }
  }

  /**
   * AI Quiz Question Generation Endpoint:
   * 1. Authenticate user (reject guests).
   * 2. Atomically reserve generation quota (1/day for Free, 10/day for Pro, resetting at midnight IST).
   * 3. Validate category ID from catalog if provided (or custom topic).
   * 4. Call Gemini to generate 20 beginner-friendly questions.
   * 5. Return validated draft with remaining allowance (DO NOT permanently save to DB in this step).
  /**
   * Process and persist a quiz thumbnail according to the chosen mode.
   * Can be called independently without consuming question generation quota.
   */
  async processThumbnail(input: {
    mode: 'ai' | 'url' | 'upload';
    topic: string;
    categoryName?: string;
    categorySlug?: string;
    url?: string;
    upload?: { base64: string; mimeType?: string; fileName?: string };
  }): Promise<{
    url: string;
    source: ThumbnailSource;
    metadata: Record<string, any>;
  }> {
    const topic = input.topic.trim();

    if (input.mode === 'url') {
      if (!input.url) {
        throw new ApiError(400, 'Image URL is required when using URL thumbnail mode.');
      }
      return downloadAndUploadUrlImage(input.url, topic);
    }

    if (input.mode === 'upload') {
      if (!input.upload || !input.upload.base64) {
        throw new ApiError(400, 'Image file data is required when using upload thumbnail mode.');
      }
      return processAndUploadImageFile(
        input.upload.base64,
        input.upload.mimeType || 'image/jpeg',
        topic
      );
    }

    // Default: 'ai' mode
    try {
      const aiResult = await mediaService.generateAndUploadSubjectThumbnailWithMetadata(
        topic,
        input.categoryName,
        { categorySlug: input.categorySlug }
      );
      return {
        url: aiResult.url,
        source: 'ai',
        metadata: aiResult.metadata,
      };
    } catch (err: any) {
      logger.warn(
        { err: err.message, topic },
        'AI thumbnail generation failed, falling back to default thumbnail'
      );
      return {
        url: DEFAULT_FALLBACK_THUMBNAIL,
        source: 'default',
        metadata: {
          fallback: true,
          error: err.message || 'AI thumbnail generation unavailable',
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * AI Quiz Question Generation Endpoint:
   * 1. Authenticate user (reject guests).
   * 2. Pre-validate inputs (topic, category, thumbnail url/upload safety).
   * 3. Atomically reserve generation quota (1/day Free, 10/day Pro, midnight IST reset).
   * 4. Call Gemini to generate 20 beginner-friendly questions.
   * 5. Process thumbnail according to mode ('ai', 'url', 'upload') with safe fallback.
   * 6. Return validated draft with remaining allowance (DO NOT permanently save to DB).
   * 7. Atomically refund reservation on any question generation failure.
   */
  async generateQuiz(
    user: { _id: Types.ObjectId; isGuest?: boolean; username?: string; displayName?: string },
    input: {
      topic: string;
      categoryName?: string;
      categoryId?: string;
      categorySlug?: string;
      thumbnailMode?: 'ai' | 'url' | 'upload';
      thumbnailUrl?: string;
      thumbnailUploadData?: { base64: string; mimeType: string; fileName?: string };
    }
  ): Promise<{
    topic: string;
    categoryName: string;
    categoryId?: string;
    categorySlug?: string;
    thumbnailUrl: string;
    thumbnailSource: ThumbnailSource;
    storageMetadata?: Record<string, any>;
    questions: IQuizQuestion[];
    quota: QuotaStatusResponse;
  }> {
    if (user.isGuest) {
      throw new ApiError(
        403,
        'A registered account is required to generate AI quizzes. Guest accounts are restricted.'
      );
    }

    if (!input.topic || input.topic.trim().length < 2) {
      throw new ApiError(400, 'Topic is required and must be at least 2 characters long.');
    }
    if (input.topic.trim().length > 100) {
      throw new ApiError(400, 'Topic must not exceed 100 characters.');
    }

    // Pre-validate custom thumbnail inputs early so invalid URLs / files fail before quota
    if (input.thumbnailMode === 'url' && input.thumbnailUrl) {
      await validateSafeHttpsUrl(input.thumbnailUrl);
    } else if (input.thumbnailMode === 'upload' && input.thumbnailUploadData?.base64) {
      const cleanBase64 = input.thumbnailUploadData.base64.replace(
        /^data:image\/[a-zA-Z]+;base64,/,
        ''
      );
      const buf = Buffer.from(cleanBase64, 'base64');
      validateImageMagicBytes(buf);
    }

    // Resolve category against database catalog
    let resolvedCategoryName = input.categoryName?.trim() || 'General';
    let resolvedCategoryId: Types.ObjectId | null = null;
    let resolvedCategorySlug = input.categorySlug?.trim() || '';

    if (input.categoryId && input.categoryId !== 'other') {
      if (!Types.ObjectId.isValid(input.categoryId)) {
        throw new ApiError(400, `Invalid category ID format: '${input.categoryId}'`);
      }
      const cat = await CategoryModel.findById(input.categoryId);
      if (!cat) {
        throw new ApiError(400, `Category with ID '${input.categoryId}' does not exist.`);
      }
      resolvedCategoryId = cat._id;
      resolvedCategoryName = cat.name;
      resolvedCategorySlug = cat.slug;
    }

    // 1. Atomic Quota Reservation
    const quotaReservation = await this.reserveAtomicGenerationQuota(user._id);
    if (!quotaReservation.allowed) {
      throw new ApiError(
        429,
        quotaReservation.isPro
          ? 'Daily Pro quota reached (10/10 quizzes generated today). Quota resets at midnight IST.'
          : 'Daily Free quota reached (1/1 quiz generated today). Upgrade to Quizzy Pro (₹19/7 days) for 10 quizzes per day.'
      );
    }

    try {
      // 2. Call Gemini text model to generate 20 beginner-friendly questions
      const questions = await geminiService.generateQuestions(
        input.topic.trim(),
        resolvedCategoryName
      );

      // 3. Process thumbnail safely (failure must NOT fail or invalidate successful question generation)
      let thumbnailResult: {
        url: string;
        source: ThumbnailSource;
        metadata: Record<string, any>;
      };

      try {
        thumbnailResult = await this.processThumbnail({
          mode: input.thumbnailMode || 'ai',
          topic: input.topic.trim(),
          categoryName: resolvedCategoryName,
          categorySlug: resolvedCategorySlug,
          url: input.thumbnailUrl,
          upload: input.thumbnailUploadData,
        });
      } catch (thumbErr: any) {
        logger.warn(
          { err: thumbErr.message },
          'Thumbnail processing failed after questions generated, falling back to default thumbnail'
        );
        thumbnailResult = {
          url: DEFAULT_FALLBACK_THUMBNAIL,
          source: 'default',
          metadata: {
            fallback: true,
            error: thumbErr.message,
            timestamp: new Date().toISOString(),
          },
        };
      }

      // 4. Return updated quota info
      const updatedQuota = await this.getOrCreateUserQuota(user._id);

      return {
        topic: input.topic.trim(),
        categoryName: resolvedCategoryName,
        categoryId: resolvedCategoryId ? resolvedCategoryId.toString() : undefined,
        categorySlug: resolvedCategorySlug,
        thumbnailUrl: thumbnailResult.url,
        thumbnailSource: thumbnailResult.source,
        storageMetadata: thumbnailResult.metadata,
        questions,
        quota: updatedQuota,
      };
    } catch (err: any) {
      // 5. Atomically rollback the quota reservation on question generation failure!
      await this.rollbackQuotaReservation(user._id);
      throw err;
    }
  }

  /**
   * Save a newly created user quiz.
   * Defaults to private (isPrivate: true, isPublished: false).
   */
  async saveQuiz(
    user: { _id: Types.ObjectId; username?: string; displayName?: string; isGuest?: boolean },
    payload: SaveQuizInput
  ): Promise<IUserQuizDocument> {
    if (user.isGuest) {
      throw new ApiError(403, 'A registered account is required to save quizzes.');
    }

    // 1. Validate Category and Subject database references
    const { validCategoryId, validSubjectId, categoryDoc, subjectDoc } =
      await validateCategoryAndSubjectReferences(payload.categoryId, payload.subjectId);

    const categoryName = categoryDoc?.name || payload.categoryName || 'General';
    const categorySlug = categoryDoc?.slug || payload.categorySlug || '';
    const subjectSlug = subjectDoc?.slug || payload.subjectSlug || '';
    const topic = payload.topic?.trim() || subjectDoc?.name || 'General Topic';
    const title = payload.title?.trim() || topic;

    // 2. Generate unique share ID
    const shareId = `qz_${crypto.randomBytes(6).toString('hex')}`;
    const creatorName = user.displayName || user.username || 'Quizzy Author';

    // 3. Create Quiz document (Private by default)
    const newQuiz = await UserQuizModel.create({
      creatorId: user._id,
      creatorName,
      title,
      topic,
      categoryName,
      categoryId: validCategoryId,
      categorySlug,
      subjectId: validSubjectId,
      subjectSlug,
      description: payload.description || `20-question quiz on ${topic}`,
      thumbnailUrl: payload.thumbnailUrl || DEFAULT_FALLBACK_THUMBNAIL,
      thumbnailSource: payload.thumbnailSource || 'default',
      storageMetadata: payload.storageMetadata || {},
      isPrivate: payload.isPrivate !== undefined ? payload.isPrivate : true,
      isPublished: payload.isPublished !== undefined ? payload.isPublished : false,
      shareId,
      playedCount: 0,
      questions: payload.questions,
    });

    // 4. Synchronize into QuestionModel for seamless battle & multiplayer gameplay
    await this.syncQuestionsToCatalog(newQuiz);

    if (newQuiz.isPublished && !newQuiz.isPrivate) {
      await Promise.all([
        cacheService.delByPrefix('categories:'),
        cacheService.delByPrefix('popular:'),
      ]).catch(() => {});
    }

    logger.info({ quizId: newQuiz._id, shareId, userId: user._id }, 'User quiz saved successfully');
    return newQuiz;
  }

  /**
   * Retrieve all quizzes created by the authenticated owner.
   */
  async getUserQuizzes(userId: Types.ObjectId): Promise<IUserQuizDocument[]> {
    return UserQuizModel.find({ creatorId: userId }).sort({ createdAt: -1 });
  }

  /**
   * Retrieve a single quiz by database ID with strict ownership and privacy enforcement.
   */
  async getQuizById(quizId: string, userId?: Types.ObjectId): Promise<IUserQuizDocument> {
    if (!Types.ObjectId.isValid(quizId)) {
      throw new ApiError(400, 'Invalid quiz ID format.');
    }

    const quiz = await UserQuizModel.findById(quizId);
    if (!quiz) {
      throw new ApiError(404, 'Quiz not found.');
    }

    // Permission enforcement: if private, ONLY the owner can access it
    if (quiz.isPrivate || !quiz.isPublished) {
      if (!userId || quiz.creatorId.toString() !== userId.toString()) {
        throw new ApiError(403, 'Forbidden: This quiz is private to its creator.');
      }
    }

    return quiz;
  }

  /**
   * Retrieve a quiz by its shareId for shareable direct links.
   */
  async getQuizByShareId(shareId: string, userId?: Types.ObjectId): Promise<IUserQuizDocument> {
    const quiz = await UserQuizModel.findOne({ shareId });
    if (!quiz) {
      throw new ApiError(404, 'Quiz not found or direct link is invalid.');
    }

    // If private or unpublished, only the creator may preview it
    if (quiz.isPrivate || !quiz.isPublished) {
      if (!userId || quiz.creatorId.toString() !== userId.toString()) {
        throw new ApiError(403, 'This quiz is currently private and has not been published yet.');
      }
    }

    return quiz;
  }

  /**
   * Update quiz questions, title, or thumbnail (strictly creator/owner only).
   */
  async updateQuiz(
    quizId: string,
    userId: Types.ObjectId,
    updates: UpdateQuizInput
  ): Promise<IUserQuizDocument> {
    const quiz = await this.getQuizById(quizId, userId);

    // Ownership enforcement
    if (quiz.creatorId.toString() !== userId.toString()) {
      throw new ApiError(403, 'Forbidden: You do not have permission to edit this quiz.');
    }

    if (updates.questions) {
      quiz.questions = updates.questions;
    }
    if (updates.title) quiz.title = updates.title.trim();
    if (updates.topic) quiz.topic = updates.topic.trim();
    if (updates.description !== undefined) quiz.description = updates.description.trim();
    if (updates.thumbnailUrl) quiz.thumbnailUrl = updates.thumbnailUrl;
    if (updates.thumbnailSource) quiz.thumbnailSource = updates.thumbnailSource;
    if (updates.storageMetadata) quiz.storageMetadata = updates.storageMetadata;

    await quiz.save();

    // Re-sync updated questions to QuestionModel
    await this.syncQuestionsToCatalog(quiz);

    await Promise.all([
      cacheService.delByPrefix('categories:'),
      cacheService.delByPrefix('popular:'),
    ]).catch(() => {});

    return quiz;
  }

  /**
   * Toggle publish / unpublish status for owned quiz (strictly owner only).
   */
  async togglePublish(
    quizId: string,
    userId: Types.ObjectId,
    publish: boolean
  ): Promise<IUserQuizDocument> {
    const quiz = await this.getQuizById(quizId, userId);

    // Ownership enforcement
    if (quiz.creatorId.toString() !== userId.toString()) {
      throw new ApiError(403, 'Forbidden: You do not have permission to modify this quiz.');
    }

    quiz.isPublished = publish;
    quiz.isPrivate = !publish;
    await quiz.save();

    // Synchronize publication status to QuestionModel so match matchmaking respects it
    await QuestionModel.updateMany({ subjectId: quiz._id }, { $set: { isPublished: publish } });

    // Evict cached categories and popular quizzes immediately
    await Promise.all([
      cacheService.delByPrefix('categories:'),
      cacheService.delByPrefix('popular:'),
    ]).catch(() => {});

    logger.info({ quizId, publish, userId }, 'Quiz publication status toggled');
    return quiz;
  }

  /**
   * Delete an owned quiz (strictly owner only).
   */
  async deleteQuiz(quizId: string, userId: Types.ObjectId): Promise<void> {
    const quiz = await this.getQuizById(quizId, userId);

    // Ownership enforcement
    if (quiz.creatorId.toString() !== userId.toString()) {
      throw new ApiError(403, 'Forbidden: You do not have permission to delete this quiz.');
    }

    await UserQuizModel.deleteOne({ _id: quiz._id });
    await QuestionModel.deleteMany({ subjectId: quiz._id });

    // Evict cached categories and popular quizzes immediately
    await Promise.all([
      cacheService.delByPrefix('categories:'),
      cacheService.delByPrefix('popular:'),
    ]).catch(() => {});

    logger.info({ quizId, userId }, 'User quiz and associated questions deleted successfully');
  }

  /**
   * Browse published quizzes for public catalog discovery.
   * Guarantees private quizzes are never returned.
   * Supports optional category filtering by category slug or ObjectId.
   */
  async getPublicQuizzes(
    limit = 20,
    page = 1,
    categoryIdentifier?: string
  ): Promise<{ quizzes: IUserQuizDocument[]; total: number }> {
    const query: any = { isPublished: true, isPrivate: false };
    const skip = (page - 1) * limit;

    if (categoryIdentifier) {
      const cleanCat = categoryIdentifier.trim();
      const isObjectId = Types.ObjectId.isValid(cleanCat);
      const orClauses: any[] = [
        { categorySlug: cleanCat.toLowerCase() },
      ];
      if (isObjectId) {
        orClauses.push({ categoryId: new Types.ObjectId(cleanCat) });
      }
      query.$or = orClauses;
    }

    const [quizzes, total] = await Promise.all([
      UserQuizModel.find(query).sort({ playedCount: -1, createdAt: -1 }).skip(skip).limit(limit),
      UserQuizModel.countDocuments(query),
    ]);

    return { quizzes, total };
  }
}

export const quizService = new QuizService();
