import { Request, Response, NextFunction } from 'express';
import { quizService } from './quiz.service.js';
import { ApiError } from '../../shared/errors/api-error.js';
import {
  GenerateQuizRequestSchema,
  ThumbnailRequestSchema,
  SaveQuizRequestSchema,
  UpdateQuizRequestSchema,
  TogglePublishRequestSchema,
} from './quiz.validation.js';

export class QuizController {
  /**
   * GET /api/v1/quizzes/quota
   * Returns current user's generation quota status.
   */
  async getQuotaStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required');
      }
      const quota = await quizService.getOrCreateUserQuota(req.user._id);
      res.status(200).json({
        success: true,
        data: quota,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/quizzes/generate
   */
  async generateQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required to generate quizzes');
      }

      const parseResult = GenerateQuizRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ApiError(
          400,
          `Invalid generation parameters: ${parseResult.error.errors.map((e) => e.message).join('; ')}`
        );
      }

      const result = await quizService.generateQuiz(req.user, parseResult.data);
      res.status(200).json({
        success: true,
        message: 'Quiz generated successfully with 20 questions.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/quizzes/thumbnail
   * Independent thumbnail generation / validation / upload endpoint.
   * Does not consume quiz question generation quota.
   */
  async processThumbnail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required');
      }

      const parseResult = ThumbnailRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ApiError(
          400,
          `Invalid thumbnail parameters: ${parseResult.error.errors.map((e) => e.message).join('; ')}`
        );
      }

      const result = await quizService.processThumbnail(parseResult.data);
      res.status(200).json({
        success: true,
        message: 'Thumbnail processed successfully.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/quizzes
   * Saves a newly created quiz privately by default.
   */
  async saveQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required to save quizzes');
      }

      const parseResult = SaveQuizRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ApiError(
          400,
          `Invalid quiz payload: ${parseResult.error.errors.map((e) => e.message).join('; ')}`
        );
      }

      const savedQuiz = await quizService.saveQuiz(req.user, parseResult.data as any);
      res.status(201).json({
        success: true,
        message: 'Quiz saved privately to My Quizzes.',
        data: savedQuiz,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/quizzes/my
   * Lists quizzes owned by the authenticated user.
   */
  async getMyQuizzes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required');
      }

      const quizzes = await quizService.getUserQuizzes(req.user._id);
      res.status(200).json({
        success: true,
        data: quizzes,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/quizzes/public
   * Public discovery endpoint for published quizzes.
   */
  async getPublicQuizzes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const category = (req.query.category || req.query.categoryId || req.query.categorySlug) as string | undefined;

      const result = await quizService.getPublicQuizzes(limit, page, category);
      res.status(200).json({
        success: true,
        data: result.quizzes,
        pagination: {
          total: result.total,
          page,
          limit,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/quizzes/share/:shareId
   * Public endpoint to access a quiz by shareable link.
   */
  async getSharedQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shareId = req.params.shareId;
      if (!shareId) {
        throw new ApiError(400, 'Share ID is required');
      }

      const quiz = await quizService.getQuizByShareId(shareId, req.user?._id);
      res.status(200).json({
        success: true,
        data: quiz,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/quizzes/:id
   * Retrieves a single quiz by ID (owner or public if published).
   */
  async getQuizById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const quizId = req.params.id;
      const quiz = await quizService.getQuizById(quizId, req.user?._id);
      res.status(200).json({
        success: true,
        data: quiz,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/quizzes/:id
   * Updates quiz questions, title, or thumbnail (owner only).
   */
  async updateQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required');
      }

      const quizId = req.params.id;
      const parseResult = UpdateQuizRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ApiError(
          400,
          `Invalid update payload: ${parseResult.error.errors.map((e) => e.message).join('; ')}`
        );
      }

      const updated = await quizService.updateQuiz(quizId, req.user._id, parseResult.data as any);
      res.status(200).json({
        success: true,
        message: 'Quiz updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/quizzes/:id/publish
   * Toggles publishing status (owner only).
   */
  async togglePublish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required');
      }

      const quizId = req.params.id;
      const parseResult = TogglePublishRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ApiError(400, 'Invalid publish request format');
      }

      const updated = await quizService.togglePublish(quizId, req.user._id, parseResult.data.publish);
      res.status(200).json({
        success: true,
        message: parseResult.data.publish
          ? 'Quiz is now published to the public catalog.'
          : 'Quiz is now private.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/quizzes/:id
   * Deletes an owned quiz (owner only).
   */
  async deleteQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required');
      }

      const quizId = req.params.id;
      await quizService.deleteQuiz(quizId, req.user._id);
      res.status(200).json({
        success: true,
        message: 'Quiz deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}

export const quizController = new QuizController();
