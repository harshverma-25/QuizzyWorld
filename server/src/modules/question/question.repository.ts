import { Types } from 'mongoose';
import { QuestionModel } from './question.model.js';
import { IQuestion, IQuestionDocument, QuestionTopic, QuestionDifficulty } from './question.types.js';
import { categoryRepository } from '../category/category.repository.js';

export class QuestionRepository {
  /**
   * Helper to construct MongoDB query matching categoryId, subjectId, isMixedCategory, or legacy topic.
   */
  private async buildQuestionMatchQuery(filter: {
    categoryId?: string;
    subjectId?: string;
    isMixedCategory?: boolean;
    topic?: string;
    difficulty?: string;
  }): Promise<any> {
    const query: any = { isPublished: true };

    if (filter.difficulty && filter.difficulty !== 'all' && filter.difficulty !== 'random') {
      query.difficulty = filter.difficulty.toLowerCase();
    }

    let categoryDoc = filter.categoryId
      ? await categoryRepository.findCategoryByIdOrSlug(filter.categoryId)
      : null;

    let subjectDoc = filter.subjectId && !filter.isMixedCategory
      ? await categoryRepository.findSubjectByIdOrSlug(filter.subjectId)
      : null;

    // Fallback: if categoryId was not passed but topic was passed
    if (!categoryDoc && !subjectDoc && filter.topic && filter.topic !== 'all' && filter.topic !== 'random') {
      subjectDoc = await categoryRepository.findSubjectByIdOrSlug(filter.topic);
      if (subjectDoc) {
        categoryDoc = await categoryRepository.findCategoryByIdOrSlug(subjectDoc.categoryId.toString());
      } else {
        categoryDoc = await categoryRepository.findCategoryByIdOrSlug(filter.topic);
      }
    }

    if (categoryDoc) {
      query.categoryId = categoryDoc._id;
    } else if (subjectDoc && (subjectDoc as any).categoryId) {
      query.categoryId = (subjectDoc as any).categoryId;
    }

    if (subjectDoc && !filter.isMixedCategory) {
      query.subjectId = subjectDoc._id;
    } else if (filter.subjectId && Types.ObjectId.isValid(filter.subjectId) && !filter.isMixedCategory) {
      query.subjectId = new Types.ObjectId(filter.subjectId);
    }

    // If neither categoryId nor subjectId could be resolved, fallback to legacy topic query
    if (!query.categoryId && !query.subjectId && filter.topic && filter.topic !== 'all' && filter.topic !== 'random') {
      query.topic = filter.topic;
    }

    return query;
  }

  /**
   * Find a question by its unique questionId.
   */
  async findByQuestionId(questionId: string): Promise<IQuestionDocument | null> {
    return QuestionModel.findOne({ questionId });
  }

  /**
   * Find multiple questions by an array of questionIds.
   */
  async findByQuestionIds(questionIds: string[]): Promise<IQuestionDocument[]> {
    return QuestionModel.find({ questionId: { $in: questionIds } });
  }

  /**
   * Upsert a question based on its unique questionId to prevent duplicates.
   */
  async upsertQuestion(data: Partial<IQuestion>): Promise<IQuestionDocument> {
    const question = await QuestionModel.findOneAndUpdate(
      { questionId: data.questionId },
      { $set: data },
      { new: true, upsert: true, runValidators: true }
    );
    return question;
  }

  /**
   * Find published questions filtered by categoryId, subjectId, topic & difficulty with pagination.
   */
  async findPublished(
    filter: { categoryId?: string; subjectId?: string; isMixedCategory?: boolean; topic?: string; difficulty?: string } = {},
    options: { page?: number; limit?: number } = {}
  ): Promise<{ questions: IQuestionDocument[]; total: number }> {
    const query = await this.buildQuestionMatchQuery(filter);

    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 10));
    const skip = (page - 1) * limit;

    const [questions, total] = await Promise.all([
      QuestionModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      QuestionModel.countDocuments(query),
    ]);

    return { questions, total };
  }

  /**
   * Count published questions matching category, subject, topic & difficulty criteria.
   */
  async countMatchingQuestions(filter: {
    categoryId?: string;
    subjectId?: string;
    isMixedCategory?: boolean;
    topic?: string;
    difficulty?: string;
  } = {}): Promise<number> {
    const query = await this.buildQuestionMatchQuery(filter);
    return QuestionModel.countDocuments(query);
  }

  /**
   * Randomly sample published questions matching category, subject & difficulty criteria.
   * Supports mixed category mode (querying categoryId without filtering by subjectId).
   */
  async sampleRandomPublished(
    filterOrTopic?: string | { categoryId?: string; subjectId?: string; isMixedCategory?: boolean; topic?: string; difficulty?: string },
    difficultyParam?: string | number,
    countParam: number = 5,
    excludeQuestionIds: string[] = []
  ): Promise<IQuestionDocument[]> {
    let filterObj: { categoryId?: string; subjectId?: string; isMixedCategory?: boolean; topic?: string; difficulty?: string } = {};
    let count = countParam;

    if (typeof filterOrTopic === 'object' && filterOrTopic !== null) {
      filterObj = filterOrTopic;
      if (typeof difficultyParam === 'number') {
        count = difficultyParam;
      }
    } else {
      filterObj = {
        topic: filterOrTopic,
        difficulty: typeof difficultyParam === 'string' ? difficultyParam : undefined,
      };
    }

    const matchStage = await this.buildQuestionMatchQuery(filterObj);

    if (excludeQuestionIds.length > 0) {
      matchStage.questionId = { $nin: excludeQuestionIds };
    }

    // Over-sample with a safety multiplier (Math.max(count * 2, count + 10))
    // and deduplicate by questionId within the aggregation pipeline to guarantee
    // that MongoDB's pseudo-random $sample draws never return duplicate questions.
    const sampleSize = Math.max(count * 2, count + 10);

    return QuestionModel.aggregate([
      { $match: matchStage },
      { $sample: { size: sampleSize } },
      {
        $group: {
          _id: '$questionId',
          doc: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$doc' } },
      { $limit: count },
    ]);
  }

  /**
   * Retrieve list of unique published topics available in DB.
   */
  async getAvailablePublishedTopics(): Promise<string[]> {
    return QuestionModel.distinct('topic', { isPublished: true });
  }

  /**
   * Count published questions matching category/subject/topic & difficulty.
   */
  async countMatching(
    filter: { categoryId?: string; subjectId?: string; isMixedCategory?: boolean; topic?: string; difficulty?: string } | string,
    difficulty?: string
  ): Promise<number> {
    const filterObj = typeof filter === 'string' ? { topic: filter, difficulty } : filter;
    const query = await this.buildQuestionMatchQuery(filterObj);
    return QuestionModel.countDocuments(query);
  }

  /**
   * Check if any published questions match the given category/subject/topic & difficulty.
   */
  async hasMatchingQuestion(
    filter: { categoryId?: string; subjectId?: string; isMixedCategory?: boolean; topic?: string; difficulty?: string }
  ): Promise<boolean> {
    const count = await this.countMatching(filter);
    return count > 0;
  }

  /**
   * Batch count published questions grouped by categoryId in a single index-covered aggregation.
   * Completely avoids N+1 queries across category listings.
   */
  async countPublishedGroupedByCategory(): Promise<Map<string, number>> {
    const results = await QuestionModel.aggregate([
      { $match: { isPublished: true, categoryId: { $ne: null } } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ]);
    const map = new Map<string, number>();
    for (const r of results) {
      if (r._id) {
        map.set(r._id.toString(), r.count);
      }
    }
    return map;
  }

  /**
   * Batch count published questions for a specific category grouped by subjectId in a single aggregation.
   * Fully covered by compound index { categoryId: 1, subjectId: 1, isPublished: 1 }.
   */
  async countPublishedGroupedBySubject(categoryId: any): Promise<{ subjectCounts: Map<string, number>; totalCategoryCount: number }> {
    const catObjectId = typeof categoryId === 'string' && Types.ObjectId.isValid(categoryId)
      ? new Types.ObjectId(categoryId)
      : categoryId;

    const results = await QuestionModel.aggregate([
      { $match: { categoryId: catObjectId, isPublished: true } },
      { $group: { _id: '$subjectId', count: { $sum: 1 } } },
    ]);

    const subjectCounts = new Map<string, number>();
    let totalCategoryCount = 0;

    for (const r of results) {
      totalCategoryCount += r.count;
      if (r._id) {
        subjectCounts.set(r._id.toString(), r.count);
      }
    }

    return { subjectCounts, totalCategoryCount };
  }

  /**
   * Batch count published questions across all active subjects in a single aggregation.
   * Completely avoids per-subject or per-category N+1 queries for homepage catalog aggregation.
   */
  async countPublishedGroupedByAllSubjects(): Promise<Map<string, number>> {
    const results = await QuestionModel.aggregate([
      { $match: { isPublished: true, subjectId: { $ne: null } } },
      { $group: { _id: '$subjectId', count: { $sum: 1 } } },
    ]);

    const subjectCounts = new Map<string, number>();
    for (const r of results) {
      if (r._id) {
        subjectCounts.set(r._id.toString(), r.count);
      }
    }

    return subjectCounts;
  }
}

export const questionRepository = new QuestionRepository();
export default questionRepository;
