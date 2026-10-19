import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { IQuizQuestion } from './quiz.types.js';

// Strict question schema validating each generated item
const QuestionItemSchema = z.object({
  question: z.string().trim().min(5, 'Question text too short').max(500),
  options: z
    .array(z.string().trim().min(1, 'Option cannot be empty').max(200))
    .length(4, 'Question must have exactly 4 options')
    .refine(
      (opts) => new Set(opts.map((o) => o.toLowerCase())).size === 4,
      'All 4 answer options must be distinct and non-duplicate'
    ),
  correctAnswer: z
    .number()
    .int('Correct answer index must be an integer')
    .min(0, 'Correct answer index must be between 0 and 3')
    .max(3, 'Correct answer index must be between 0 and 3'),
  explanation: z.string().trim().min(5, 'Explanation too short').max(1000),
  difficulty: z.string().default('easy'),
});

// Full quiz schema ensuring exactly 20 questions
const GeminiQuizOutputSchema = z.object({
  topic: z.string().optional(),
  questions: z
    .array(QuestionItemSchema)
    .length(20, 'Quiz must have exactly 20 questions'),
});

export class GeminiService {
  private mockGenerator: ((topic: string, categoryName: string) => Promise<IQuizQuestion[]>) | null = null;

  /**
   * Allows test runners to inject deterministic mock responses without making real API calls.
   */
  public setMockGenerator(
    mockFn: ((topic: string, categoryName: string) => Promise<IQuizQuestion[]>) | null
  ): void {
    this.mockGenerator = mockFn;
  }

  /**
   * Generates 20 beginner-friendly questions using Google Gemini with structured JSON output
   * and bounded retry handling.
   */
  async generateQuestions(
    topic: string,
    categoryName: string
  ): Promise<IQuizQuestion[]> {
    // If mock generator is set (e.g. in test suite), use it directly
    if (this.mockGenerator) {
      return this.mockGenerator(topic, categoryName);
    }

    const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.error('GEMINI_API_KEY missing in environment');
      throw new ApiError(
        503,
        'AI Quiz Generator service is currently unavailable: GEMINI_API_KEY is not configured on the server.'
      );
    }

    const model = env.GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an expert trivia quiz author for QUIZZY, an interactive trivia battle platform.
Generate a 20-question multiple-choice trivia quiz.
- Category: ${categoryName}
- Topic: ${topic}
- Target Audience & Difficulty: Beginner-friendly and accessible for casual players. Standard beginner difficulty ('easy'). Avoid obscure or hyper-specialized minutiae.

Strict Generation Rules:
1. Generate EXACTLY 20 unique multiple-choice questions. No fewer, no more.
2. Each question MUST have EXACTLY 4 plausible, distinct, mutually exclusive options.
3. "correctAnswer" MUST be an integer (0, 1, 2, or 3) representing the index of the single correct answer in the "options" array.
4. "explanation" MUST be an educational, accurate 1-2 sentence explanation of why the correct answer is factually right.
5. "difficulty" MUST be 'easy'.
6. Do not fabricate facts or include ambiguous questions.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING },
        questions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              correctAnswer: { type: Type.INTEGER },
              explanation: { type: Type.STRING },
              difficulty: { type: Type.STRING },
            },
            required: ['question', 'options', 'correctAnswer', 'explanation'],
          },
        },
      },
      required: ['questions'],
    };

    const maxAttempts = 2; // Bounded retry strategy: 1 initial attempt + 1 retry
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info(
          { attempt, maxAttempts, model, topic, categoryName },
          'Calling Gemini API to generate 20 structured questions...'
        );

        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema,
            temperature: 0.7,
          },
        });

        const rawText = response.text;
        if (!rawText) {
          throw new Error('Gemini returned an empty response text.');
        }

        let parsed: any;
        try {
          parsed = JSON.parse(rawText.trim());
        } catch (jsonErr: any) {
          throw new Error(`Failed to parse Gemini output as JSON: ${jsonErr.message}`);
        }

        const validationResult = GeminiQuizOutputSchema.safeParse(parsed);
        if (!validationResult.success) {
          const details = validationResult.error.errors.map((e) => e.message).join('; ');
          throw new Error(`Gemini output failed schema validation: ${details}`);
        }

        const questions: IQuizQuestion[] = validationResult.data.questions.map((q, index) => ({
          questionId: `q_${Date.now()}_${index + 1}`,
          question: q.question.trim(),
          options: [
            q.options[0].trim(),
            q.options[1].trim(),
            q.options[2].trim(),
            q.options[3].trim(),
          ],
          correctAnswer: q.correctAnswer,
          explanation: q.explanation.trim(),
          difficulty: 'easy',
        }));

        logger.info(
          { count: questions.length, topic },
          'Successfully generated and validated 20 questions from Gemini'
        );
        return questions;
      } catch (err: any) {
        lastError = err;
        logger.warn(
          { attempt, error: err.message },
          'Gemini generation attempt failed, checking retry eligibility...'
        );

        if (attempt < maxAttempts) {
          // Bounded backoff: wait 1500ms before retrying
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }

    // All attempts failed
    logger.error({ err: lastError }, 'All Gemini generation attempts exhausted.');
    if (lastError?.status === 429 || lastError?.message?.includes('429')) {
      throw new ApiError(429, 'Gemini AI rate limit reached. Please wait a few moments and try again.');
    }
    throw new ApiError(
      502,
      'Failed to generate quiz questions from AI provider. Please try again with a slightly different topic.'
    );
  }
}

export const geminiService = new GeminiService();
