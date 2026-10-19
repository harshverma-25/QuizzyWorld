import { z } from 'zod';
import { Types } from 'mongoose';
import { ApiError } from '../../shared/errors/api-error.js';
import { CategoryModel, SubjectModel } from '../category/category.model.js';

export const QuizQuestionItemSchema = z.object({
  questionId: z.string().min(1, 'Question ID is required'),
  question: z.string().trim().min(5, 'Question text must be at least 5 characters').max(500),
  options: z
    .array(z.string().trim().min(1, 'Option text cannot be empty').max(200))
    .length(4, 'Question must have exactly 4 options'),
  correctAnswer: z
    .number()
    .int('Correct answer must be an integer index')
    .min(0, 'Correct answer index must be between 0 and 3')
    .max(3, 'Correct answer index must be between 0 and 3'),
  explanation: z.string().trim().min(3, 'Explanation must be at least 3 characters').max(1000),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('easy'),
});

export const GenerateQuizRequestSchema = z.object({
  categoryId: z.string().trim().optional(),
  categorySlug: z.string().trim().optional(),
  categoryName: z.string().trim().min(1, 'Category name is required').max(50).optional(),
  topic: z
    .string({ required_error: 'Topic is required' })
    .trim()
    .min(2, 'Topic must be at least 2 characters')
    .max(100, 'Topic cannot exceed 100 characters'),
  thumbnailMode: z.enum(['ai', 'url', 'upload']).optional(),
  thumbnailUrl: z.string().trim().optional(),
  thumbnailUploadData: z.any().optional(),
});

export const ThumbnailRequestSchema = z.object({
  mode: z.enum(['ai', 'url', 'upload']),
  topic: z
    .string({ required_error: 'Topic is required' })
    .trim()
    .min(2, 'Topic must be at least 2 characters')
    .max(100, 'Topic cannot exceed 100 characters'),
  categoryName: z.string().trim().optional(),
  categorySlug: z.string().trim().optional(),
  url: z.string().trim().optional(),
  upload: z
    .object({
      base64: z.string().min(1, 'Base64 image data is required'),
      mimeType: z.string().optional(),
      fileName: z.string().optional(),
    })
    .optional(),
});

export const SaveQuizRequestSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(100).optional(),
  topic: z.string().trim().min(2, 'Topic must be at least 2 characters').max(100),
  categoryName: z.string().trim().min(1, 'Category name is required').max(50),
  categoryId: z.string().trim().optional(),
  categorySlug: z.string().trim().optional(),
  subjectId: z.string().trim().optional(),
  subjectSlug: z.string().trim().optional(),
  description: z.string().trim().max(500).optional(),
  thumbnailUrl: z.string().trim().optional(),
  thumbnailSource: z.enum(['ai', 'url', 'upload', 'default']).default('default'),
  storageMetadata: z.record(z.any()).optional(),
  questions: z
    .array(QuizQuestionItemSchema)
    .min(10, 'Quiz must have at least 10 questions')
    .max(50, 'Quiz cannot exceed 50 questions'),
  isPrivate: z.boolean().default(true),
  isPublished: z.boolean().default(false),
});

export const UpdateQuizRequestSchema = z.object({
  title: z.string().trim().min(2).max(100).optional(),
  topic: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  thumbnailUrl: z.string().trim().optional(),
  thumbnailSource: z.enum(['ai', 'url', 'upload', 'default']).optional(),
  storageMetadata: z.record(z.any()).optional(),
  questions: z.array(QuizQuestionItemSchema).min(10).max(50).optional(),
});

export const TogglePublishRequestSchema = z.object({
  publish: z.boolean({ required_error: 'Publish status is required' }),
});

/**
 * Validates that categoryId and subjectId exist in the database and are mutually consistent.
 */
export async function validateCategoryAndSubjectReferences(
  categoryId?: string | null,
  subjectId?: string | null
): Promise<{
  validCategoryId: Types.ObjectId | null;
  validSubjectId: Types.ObjectId | null;
  categoryDoc: any | null;
  subjectDoc: any | null;
}> {
  let categoryDoc: any = null;
  let subjectDoc: any = null;
  let validCategoryId: Types.ObjectId | null = null;
  let validSubjectId: Types.ObjectId | null = null;

  if (categoryId) {
    if (!Types.ObjectId.isValid(categoryId)) {
      throw new ApiError(400, `Invalid category ID format: '${categoryId}'`);
    }
    categoryDoc = await CategoryModel.findById(categoryId);
    if (!categoryDoc) {
      throw new ApiError(400, `Category with ID '${categoryId}' does not exist.`);
    }
    validCategoryId = categoryDoc._id;
  }

  if (subjectId) {
    if (!Types.ObjectId.isValid(subjectId)) {
      throw new ApiError(400, `Invalid subject ID format: '${subjectId}'`);
    }
    subjectDoc = await SubjectModel.findById(subjectId);
    if (!subjectDoc) {
      throw new ApiError(400, `Subject with ID '${subjectId}' does not exist.`);
    }
    validSubjectId = subjectDoc._id;

    // Verify consistency: subject must belong to the specified category if categoryId was provided
    if (categoryDoc && subjectDoc.categoryId.toString() !== categoryDoc._id.toString()) {
      throw new ApiError(
        400,
        `Subject '${subjectDoc.name}' does not belong to category '${categoryDoc.name}'.`
      );
    }

    // If categoryId was omitted but subjectId was passed, infer category from subject
    if (!categoryDoc) {
      categoryDoc = await CategoryModel.findById(subjectDoc.categoryId);
      if (categoryDoc) {
        validCategoryId = categoryDoc._id;
      }
    }
  }

  return { validCategoryId, validSubjectId, categoryDoc, subjectDoc };
}
