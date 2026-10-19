import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { CategoryModel } from '../modules/category/category.model.js';
import { UserQuizModel } from '../modules/quiz/quiz.model.js';
import { UserQuizQuotaModel } from '../modules/quiz/quiz-quota.model.js';
import { quizService } from '../modules/quiz/quiz.service.js';
import { geminiService } from '../modules/quiz/gemini.service.js';
import { mediaService } from '../modules/media/media.service.js';
import { IQuizQuestion } from '../modules/quiz/quiz.types.js';

/**
 * End-to-End Creator Frontend Integration Verification
 * Validates the full API lifecycle that the QuizCreatorClient interacts with:
 * 1. GET /api/v1/categories
 * 2. GET /api/v1/quizzes/quota
 * 3. POST /api/v1/quizzes/generate
 * 4. POST /api/v1/quizzes/thumbnail (change cover in editor)
 * 5. POST /api/v1/quizzes (save edited draft)
 * 6. GET /api/v1/quizzes/my (dashboard summary & filters)
 * 7. PATCH /api/v1/quizzes/:id/publish (publish / unpublish toggle)
 * 8. DELETE /api/v1/quizzes/:id (delete confirmation)
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// Valid 1x1 transparent PNG buffer
const VALID_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function run() {
  console.log('\n======================================================');
  console.log('🧪 VERIFYING AI QUIZ CREATOR FRONTEND E2E API FLOW');
  console.log('======================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  const userId = new Types.ObjectId().toString();
  const testUser = {
    _id: userId,
    username: 'test_frontend_user',
    displayName: 'Test Frontend User',
    isGuest: false,
    isPro: false,
  };

  try {
    // -------------------------------------------------------------------------
    // 1. Category Catalog & Quota Check (GET /categories & GET /quizzes/quota)
    // -------------------------------------------------------------------------
    console.log('▶ STEP 1: Categories Catalog & Quota Flow');
    const categories = await CategoryModel.find({ isActive: true }).lean();
    assert(categories.length > 0, 'Categories endpoint returns active categories');
    const targetCategory = categories[0];
    assert(!!targetCategory._id, `Selected category: ${targetCategory.name} (${targetCategory._id})`);

    const initialQuota = await quizService.getOrCreateUserQuota(userId);
    assert(initialQuota.allowed === true, 'Quota allowed for fresh user');
    assert(initialQuota.remainingToday === 1, 'Free tier has exactly 1 generation remaining today');
    assert(initialQuota.dailyLimit === 1, 'Free tier daily limit is 1');
    assert(initialQuota.isPro === false, 'isPro correctly reported as false');
    assert(typeof initialQuota.resetsAt === 'string', 'resetsAt ISO timestamp provided');

    // -------------------------------------------------------------------------
    // 2. Draft Generation Workflow (POST /quizzes/generate)
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 2: Generation Workflow (POST /api/v1/quizzes/generate)');

    // Mock Gemini generator for fast deterministic test
    geminiService.setMockGenerator(async (topic) => {
      return Array.from({ length: 20 }, (_, i) => ({
        questionId: `mock_q_${i + 1}`,
        question: `Question ${i + 1} about ${topic}?`,
        options: [`Option A${i + 1}`, `Option B${i + 1}`, `Option C${i + 1}`, `Option D${i + 1}`] as [string, string, string, string],
        correctAnswer: (i % 4) as 0 | 1 | 2 | 3,
        explanation: `Explanation for question ${i + 1}`,
        difficulty: 'easy' as const,
      }));
    });

    // Mock MediaService for fast deterministic thumbnail
    mediaService.setMockAiGenerator(async () => VALID_1X1_PNG);
    mediaService.setMockUploader(async (_input, options) => ({
      url: `https://res.cloudinary.com/quizzy/image/upload/v1234/${options?.publicId || 'sample'}.webp`,
      publicId: options?.publicId || 'thumb_pub_001',
      format: 'webp',
      bytes: 70,
      width: 1,
      height: 1,
    }));

    const generatedDraft = await quizService.generateQuiz(testUser, {
      categoryId: targetCategory._id.toString(),
      categoryName: targetCategory.name,
      categorySlug: targetCategory.slug,
      topic: 'Quantum Computing',
      thumbnailMode: 'ai',
    });

    assert(generatedDraft.topic === 'Quantum Computing', 'Topic preserved in draft');
    assert(generatedDraft.questions.length === 20, 'Exactly 20 questions returned in draft');
    assert(generatedDraft.quota.remainingToday === 0, 'Quota decremented to 0 after generation');
    assert(generatedDraft.thumbnailSource === 'ai', 'AI thumbnail mode honored');

    // Verify subsequent quota check reports exhaustion
    const postGenQuota = await quizService.getOrCreateUserQuota(userId);
    assert(postGenQuota.remainingToday === 0, 'Daily generation quota is now 0');
    assert(postGenQuota.allowed === false, 'Subsequent generation blocked after quota exhaustion');

    // -------------------------------------------------------------------------
    // 3. Question Preview & Editing Workflow
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 3: Question Preview & Editing');
    // Simulate user editing title and question 1 in preview
    const editedQuestions: IQuizQuestion[] = generatedDraft.questions.map((q, idx) => {
      if (idx === 0) {
        return {
          questionId: `q_${idx}`,
          question: 'Edited: What is quantum superposition?',
          options: ['State A', 'Superposed State', 'State C', 'State D'] as [string, string, string, string],
          correctAnswer: 1 as const,
          explanation: 'Superposition allows states to exist simultaneously.',
          difficulty: 'easy' as const,
        };
      }
      return {
        questionId: `q_${idx}`,
        question: q.question,
        options: q.options as [string, string, string, string],
        correctAnswer: q.correctAnswer as 0 | 1 | 2 | 3,
        explanation: q.explanation,
        difficulty: 'easy' as const,
      };
    });

    // User tests Changing Cover via POST /api/v1/quizzes/thumbnail
    const updatedThumbnail = await quizService.processThumbnail({
      mode: 'url',
      url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop',
      topic: 'Quantum Computing',
      categoryName: targetCategory.name,
    });
    assert(updatedThumbnail.source === 'url', 'Thumbnail mode switched to URL');
    assert(!!updatedThumbnail.url, 'Updated thumbnail URL provided');

    // -------------------------------------------------------------------------
    // 4. Save Workflow (POST /api/v1/quizzes)
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 4: Save Workflow');
    const savedQuiz = await quizService.saveQuiz(testUser, {
      title: 'Mastering Quantum Computing',
      topic: 'Quantum Computing',
      categoryName: targetCategory.name,
      categoryId: targetCategory._id.toString(),
      categorySlug: targetCategory.slug,
      thumbnailUrl: updatedThumbnail.url,
      thumbnailSource: updatedThumbnail.source,
      questions: editedQuestions,
      isPrivate: true,
      isPublished: false,
    });

    assert(!!savedQuiz._id, 'Quiz saved to database with unique ID');
    assert(savedQuiz.title === 'Mastering Quantum Computing', 'Custom edited title saved');
    assert(savedQuiz.isPrivate === true, 'Quiz is private by default');
    assert(savedQuiz.isPublished === false, 'Quiz is unpublished by default');
    assert(savedQuiz.questions[0].question === 'Edited: What is quantum superposition?', 'Edited question preserved');
    assert(savedQuiz.questions[0].correctAnswer === 1, 'Edited correct answer index preserved');
    assert(savedQuiz.thumbnailSource === 'url', 'Edited thumbnail source preserved');

    // -------------------------------------------------------------------------
    // 5. My Quizzes Dashboard Workflow (GET /api/v1/quizzes/my)
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 5: My Quizzes Dashboard (GET /api/v1/quizzes/my)');
    const myQuizzes = await quizService.getUserQuizzes(userId);
    assert(Array.isArray(myQuizzes), 'My Quizzes returns array');
    assert(myQuizzes.length === 1, 'My Quizzes lists 1 owned quiz');
    assert(myQuizzes[0]._id.toString() === savedQuiz._id.toString(), 'Returned quiz matches saved ID');
    assert(myQuizzes[0].title === 'Mastering Quantum Computing', 'Title matches in dashboard');
    assert(myQuizzes[0].isPrivate === true, 'Status is private');
    assert(myQuizzes[0].isPublished === false, 'Status is unpublished');

    // -------------------------------------------------------------------------
    // 6. Publication Status Toggle (PATCH /api/v1/quizzes/:id/publish)
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 6: Toggle Publish / Unpublish');
    const publishedQuiz = await quizService.togglePublish(
      savedQuiz._id.toString(),
      userId,
      true
    );
    assert(publishedQuiz.isPublished === true, 'Server confirms quiz is now published');
    assert(publishedQuiz.isPrivate === false, 'Publishing marks isPrivate as false');

    const unpublishedQuiz = await quizService.togglePublish(
      savedQuiz._id.toString(),
      userId,
      false
    );
    assert(unpublishedQuiz.isPublished === false, 'Server confirms quiz is now unpublished');
    assert(unpublishedQuiz.isPrivate === true, 'Unpublishing restores isPrivate to true');

    // -------------------------------------------------------------------------
    // 7. Delete Workflow (DELETE /api/v1/quizzes/:id)
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 7: Delete Quiz');
    await quizService.deleteQuiz(savedQuiz._id.toString(), userId);
    const postDeleteList = await quizService.getUserQuizzes(userId);
    assert(postDeleteList.length === 0, 'Quiz removed from user dashboard');

    // Clean up test data
    await UserQuizQuotaModel.deleteMany({ userId });
    await UserQuizModel.deleteMany({ userId });

    // Reset mocks
    geminiService.setMockGenerator(null);
    mediaService.setMockAiGenerator(null);
    mediaService.setMockUploader(null);

    console.log('\n======================================================');
    console.log(`🎉 FRONTEND CREATOR E2E API VERIFICATION: ${passed} PASSED, ${failed} FAILED!`);
    console.log('======================================================\n');
  } finally {
    await mongoose.connection.close();
  }
}

run().catch((err) => {
  console.error('Fatal error during E2E verification:', err);
  process.exit(1);
});
