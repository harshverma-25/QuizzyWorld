import mongoose, { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { quizService } from '../modules/quiz/quiz.service.js';
import { UserQuizModel } from '../modules/quiz/quiz.model.js';
import { UserQuizQuotaModel } from '../modules/quiz/quiz-quota.model.js';
import { QuestionModel } from '../modules/question/question.model.js';
import { CategoryModel, SubjectModel } from '../modules/category/category.model.js';
import { questionRepository } from '../modules/question/question.repository.js';
import { validateCategoryAndSubjectReferences } from '../modules/quiz/quiz.validation.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} - ${details || ''}`);
    failed++;
  }
}

async function runVerification() {
  console.log('\n======================================================');
  console.log('🧪 VERIFYING QUIZZY USER QUIZ BACKEND FOUNDATION');
  console.log('======================================================\n');

  await connectDatabase();

  const user1 = {
    _id: new Types.ObjectId(),
    username: 'creator_one',
    displayName: 'Creator One',
    isGuest: false,
  };

  const user2 = {
    _id: new Types.ObjectId(),
    username: 'other_player',
    displayName: 'Other Player',
    isGuest: false,
  };

  const sampleQuestions = Array.from({ length: 20 }, (_, i) => ({
    questionId: `q_foundation_${i + 1}`,
    question: `What is foundation test concept #${i + 1}?`,
    options: ['Alpha', 'Beta', 'Gamma', 'Delta'] as [string, string, string, string],
    correctAnswer: (i % 4) as 0 | 1 | 2 | 3,
    explanation: `Foundation test explanation #${i + 1}`,
    difficulty: 'easy',
  }));

  try {
    // -----------------------------------------------------------------
    // TEST 1: CATEGORY & SUBJECT REFERENCE VALIDATION
    // -----------------------------------------------------------------
    console.log('▶ TEST 1: Category & Subject Reference Validation');

    // 1.1 Non-existent Category ID
    let fakeCategoryRejected = false;
    try {
      await validateCategoryAndSubjectReferences(new Types.ObjectId().toString(), null);
    } catch (e: any) {
      fakeCategoryRejected = e.message.includes('Category with ID') || e.message.includes('does not exist');
    }
    assert(fakeCategoryRejected, 'Non-existent category ID is rejected with 400 error');

    // 1.2 Non-existent Subject ID
    let fakeSubjectRejected = false;
    try {
      await validateCategoryAndSubjectReferences(null, new Types.ObjectId().toString());
    } catch (e: any) {
      fakeSubjectRejected = e.message.includes('Subject with ID') || e.message.includes('does not exist');
    }
    assert(fakeSubjectRejected, 'Non-existent subject ID is rejected with 400 error');

    // 1.3 Valid Category Lookup
    const existingCategory = await CategoryModel.findOne({ isActive: true });
    if (existingCategory) {
      const validRef = await validateCategoryAndSubjectReferences(existingCategory._id.toString(), null);
      assert(validRef.validCategoryId !== null, 'Existing category reference validates successfully');
    } else {
      console.log('  ⚠️ SKIP: No active category in DB to test valid reference');
    }

    // -----------------------------------------------------------------
    // TEST 2: QUIZ CREATION, DEFAULT PRIVACY & MODEL EXTENSIONS
    // -----------------------------------------------------------------
    console.log('\n▶ TEST 2: User Quiz Creation & Default Privacy');

    const createdQuiz = await quizService.saveQuiz(user1, {
      topic: 'Neural Networks & Deep Learning',
      categoryName: 'Technology',
      description: 'A 20-question deep dive into neural architectures',
      questions: sampleQuestions,
    });

    assert(createdQuiz.isPrivate === true, 'Newly created quiz defaults to isPrivate: true');
    assert(createdQuiz.isPublished === false, 'Newly created quiz defaults to isPublished: false');
    assert(createdQuiz.creatorId.toString() === user1._id.toString(), 'creatorId matches authenticated creator');
    assert(createdQuiz.ownerId?.toString() === user1._id.toString(), 'ownerId virtual alias returns creatorId');
    assert(createdQuiz.visibility === 'private', 'visibility virtual returns "private"');
    assert(createdQuiz.shareId.startsWith('qz_'), 'Unique shareId is assigned');

    // Verify questions were synchronized into QuestionModel
    const syncedQuestions = await QuestionModel.find({ subjectId: createdQuiz._id });
    assert(syncedQuestions.length === 20, 'Synchronized 20 questions into QuestionModel');
    assert(syncedQuestions.every((q) => q.isPublished === false), 'Synced questions in QuestionModel are initially unpublished');

    // -----------------------------------------------------------------
    // TEST 3: PRIVACY & PERMISSION ENFORCEMENT ON RETRIEVAL
    // -----------------------------------------------------------------
    console.log('\n▶ TEST 3: Privacy & Visibility Enforcement');

    // 3.1 Owner can access their own private quiz via ID
    const ownerFetch = await quizService.getQuizById(createdQuiz._id.toString(), user1._id);
    assert(ownerFetch._id.toString() === createdQuiz._id.toString(), 'Owner can access their private quiz by ID');

    // 3.2 Owner can access their own private quiz via share link preview
    const ownerShareFetch = await quizService.getQuizByShareId(createdQuiz.shareId, user1._id);
    assert(ownerShareFetch._id.toString() === createdQuiz._id.toString(), 'Owner can preview their private quiz via share link');

    // 3.3 Other user (user2) attempting to access private quiz by ID -> 403 Forbidden
    let otherUserForbidden = false;
    try {
      await quizService.getQuizById(createdQuiz._id.toString(), user2._id);
    } catch (e: any) {
      otherUserForbidden = e.statusCode === 403 || e.message.includes('private');
    }
    assert(otherUserForbidden, 'Other user accessing private quiz by ID is rejected with 403');

    // 3.4 Anonymous / other user accessing private quiz via share link -> 403 Forbidden
    let anonymousShareForbidden = false;
    try {
      await quizService.getQuizByShareId(createdQuiz.shareId, undefined);
    } catch (e: any) {
      anonymousShareForbidden = e.statusCode === 403 || e.message.includes('private');
    }
    assert(anonymousShareForbidden, 'Anonymous user accessing private quiz via share link is rejected with 403');

    // 3.5 Private quiz must NEVER appear in public catalog results
    const publicCatalogBeforePublish = await quizService.getPublicQuizzes(50, 1);
    const leakedInCatalog = publicCatalogBeforePublish.quizzes.some(
      (q) => q._id.toString() === createdQuiz._id.toString()
    );
    assert(!leakedInCatalog, 'Private quiz is NEVER included in public catalog results');

    // -----------------------------------------------------------------
    // TEST 4: OWNERSHIP ENFORCEMENT ON EDIT, PUBLISH, DELETE
    // -----------------------------------------------------------------
    console.log('\n▶ TEST 4: Ownership Enforcement on Modifications');

    // 4.1 Non-owner (user2) attempting to edit quiz -> 403 Forbidden
    let unauthorizedEditBlocked = false;
    try {
      await quizService.updateQuiz(createdQuiz._id.toString(), user2._id, {
        title: 'Hacked Title by Unauthorized User',
      });
    } catch (e: any) {
      unauthorizedEditBlocked = e.statusCode === 403 || e.message.includes('Forbidden') || e.message.includes('permission');
    }
    assert(unauthorizedEditBlocked, 'Unauthorized user editing quiz is rejected with 403');

    // 4.2 Non-owner (user2) attempting to toggle publish status -> 403 Forbidden
    let unauthorizedPublishBlocked = false;
    try {
      await quizService.togglePublish(createdQuiz._id.toString(), user2._id, true);
    } catch (e: any) {
      unauthorizedPublishBlocked = e.statusCode === 403 || e.message.includes('Forbidden') || e.message.includes('permission');
    }
    assert(unauthorizedPublishBlocked, 'Unauthorized user toggling publish status is rejected with 403');

    // 4.3 Non-owner (user2) attempting to delete quiz -> 403 Forbidden
    let unauthorizedDeleteBlocked = false;
    try {
      await quizService.deleteQuiz(createdQuiz._id.toString(), user2._id);
    } catch (e: any) {
      unauthorizedDeleteBlocked = e.statusCode === 403 || e.message.includes('Forbidden') || e.message.includes('permission');
    }
    assert(unauthorizedDeleteBlocked, 'Unauthorized user deleting quiz is rejected with 403');

    // 4.4 Legitimate owner (user1) edits quiz
    const updatedQuiz = await quizService.updateQuiz(createdQuiz._id.toString(), user1._id, {
      title: 'Deep Learning Mastery 2026',
    });
    assert(updatedQuiz.title === 'Deep Learning Mastery 2026', 'Owner successfully updates quiz title');

    // -----------------------------------------------------------------
    // TEST 5: PUBLISHING & PUBLIC DISCOVERY
    // -----------------------------------------------------------------
    console.log('\n▶ TEST 5: Publishing & Public Catalog Discovery');

    const publishedQuiz = await quizService.togglePublish(createdQuiz._id.toString(), user1._id, true);
    assert(publishedQuiz.isPublished === true, 'Quiz is successfully published');
    assert(publishedQuiz.isPrivate === false, 'Published quiz has isPrivate: false');
    assert(publishedQuiz.visibility === 'public', 'Published quiz has visibility: "public"');

    // Verify QuestionModel questions are now isPublished: true
    const publishedQuestionsInModel = await QuestionModel.find({ subjectId: createdQuiz._id });
    assert(
      publishedQuestionsInModel.every((q) => q.isPublished === true),
      'Synced questions in QuestionModel are marked isPublished: true upon quiz publish'
    );

    // Now anyone can retrieve it via ID and shareId
    const otherUserAccess = await quizService.getQuizById(createdQuiz._id.toString(), user2._id);
    assert(otherUserAccess._id.toString() === createdQuiz._id.toString(), 'Other user can now view published quiz by ID');

    const anonymousShareAccess = await quizService.getQuizByShareId(createdQuiz.shareId);
    assert(anonymousShareAccess._id.toString() === createdQuiz._id.toString(), 'Anonymous user can view published quiz via share link');

    // Published quiz now appears in public catalog
    const publicCatalogAfterPublish = await quizService.getPublicQuizzes(50, 1);
    const foundInCatalog = publicCatalogAfterPublish.quizzes.some(
      (q) => q._id.toString() === createdQuiz._id.toString()
    );
    assert(foundInCatalog, 'Published quiz is discoverable in public catalog results');

    // -----------------------------------------------------------------
    // TEST 6: GAMEPLAY & MULTIPLAYER COMPATIBILITY
    // -----------------------------------------------------------------
    console.log('\n▶ TEST 6: Normal & Multiplayer Gameplay Compatibility');

    // Test that questionRepository.sampleRandomPublished can sample the published user quiz
    const sampledForGame = await questionRepository.sampleRandomPublished(
      { subjectId: createdQuiz._id.toString() },
      undefined,
      10
    );
    assert(sampledForGame.length === 10, 'Gameplay engine successfully samples 10 questions from user quiz');
    assert(
      sampledForGame.every((q) => q.subjectId?.toString() === createdQuiz._id.toString()),
      'Sampled gameplay questions match user quiz subjectId'
    );

    // -----------------------------------------------------------------
    // TEST 7: DELETION & CASCADE CLEANUP
    // -----------------------------------------------------------------
    console.log('\n▶ TEST 7: Quiz Deletion & Question Cleanup');

    await quizService.deleteQuiz(createdQuiz._id.toString(), user1._id);

    const deletedCheck = await UserQuizModel.findById(createdQuiz._id);
    assert(deletedCheck === null, 'User quiz document deleted from DB');

    const cleanedQuestions = await QuestionModel.find({ subjectId: createdQuiz._id });
    assert(cleanedQuestions.length === 0, 'Associated QuestionModel questions cleaned up on delete');

    // -----------------------------------------------------------------
    // TEST 8: ATOMIC QUOTA CONCURRENCY ENFORCEMENT
    // -----------------------------------------------------------------
    console.log('\n▶ TEST 8: Atomic Quota Concurrency (Race Condition Prevention)');

    const concurrencyUserId = new Types.ObjectId();
    await UserQuizQuotaModel.deleteMany({ userId: concurrencyUserId });

    // 8.1 Simulate 10 simultaneous concurrent requests for a Free user (limit = 1)
    console.log('  Simulating 10 simultaneous generation requests for Free user (limit 1)...');
    const freeSimultaneousResults = await Promise.all(
      Array.from({ length: 10 }, () => quizService.reserveAtomicGenerationQuota(concurrencyUserId))
    );

    const freeAllowedCount = freeSimultaneousResults.filter((r) => r.allowed).length;
    const freeRejectedCount = freeSimultaneousResults.filter((r) => !r.allowed).length;

    assert(freeAllowedCount === 1, `Exactly 1 concurrent request succeeded (got ${freeAllowedCount})`);
    assert(freeRejectedCount === 9, `Remaining 9 concurrent requests were atomically rejected (got ${freeRejectedCount})`);

    const quotaInDb = await UserQuizQuotaModel.findOne({ userId: concurrencyUserId });
    assert(quotaInDb?.generationsToday === 1, 'Database reflects exactly 1 generation unit consumed');

    // 8.2 Upgrade to Pro (limit = 10) and simulate 15 simultaneous requests
    console.log('  Simulating 15 simultaneous generation requests for Pro user (limit 10)...');
    await UserQuizQuotaModel.updateOne(
      { userId: concurrencyUserId },
      { $set: { isPro: true, proExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } }
    );

    // Total limit is 10, already used 1, so exactly 9 should succeed and 6 should be rejected
    const proSimultaneousResults = await Promise.all(
      Array.from({ length: 15 }, () => quizService.reserveAtomicGenerationQuota(concurrencyUserId))
    );

    const proAllowedCount = proSimultaneousResults.filter((r) => r.allowed).length;
    const proRejectedCount = proSimultaneousResults.filter((r) => !r.allowed).length;

    assert(proAllowedCount === 9, `Exactly 9 remaining slots granted under Pro limit (got ${proAllowedCount})`);
    assert(proRejectedCount === 6, `Excess 6 requests rejected when Pro quota exhausted (got ${proRejectedCount})`);

    const finalQuotaInDb = await UserQuizQuotaModel.findOne({ userId: concurrencyUserId });
    assert(finalQuotaInDb?.generationsToday === 10, 'Database reflects exactly 10 generations (never exceeded)');

    // 8.3 Test atomic rollback reservation
    await quizService.rollbackQuotaReservation(concurrencyUserId);
    const rolledBackDoc = await UserQuizQuotaModel.findOne({ userId: concurrencyUserId });
    assert(rolledBackDoc?.generationsToday === 9, 'Atomic rollback decrements generation count back to 9');

    // Clean up test quota
    await UserQuizQuotaModel.deleteOne({ userId: concurrencyUserId });

    console.log('\n======================================================');
    console.log(`🎉 BACKEND FOUNDATION VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');
  } finally {
    await disconnectDatabase();
  }
}

runVerification().catch((err) => {
  console.error('Fatal error running verification:', err);
  process.exit(1);
});
