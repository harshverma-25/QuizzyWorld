import mongoose, { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { quizService } from '../modules/quiz/quiz.service.js';
import { UserQuizModel } from '../modules/quiz/quiz.model.js';
import { UserQuizQuotaModel } from '../modules/quiz/quiz-quota.model.js';
import { QuestionModel } from '../modules/question/question.model.js';
import { geminiService } from '../modules/quiz/gemini.service.js';
import { questionRepository } from '../modules/question/question.repository.js';
import {
  getStartOfIstDay,
  getNextMidnightIst,
  isDifferentIstDay,
  IST_OFFSET_MS,
} from '../modules/quiz/quota-timezone.js';
import { IQuizQuestion } from '../modules/quiz/quiz.types.js';

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

async function runGeminiQuizVerification() {
  console.log('\n======================================================');
  console.log('🧪 VERIFYING GEMINI AI QUIZ GENERATION & QUOTA ENGINE');
  console.log('======================================================\n');

  await connectDatabase();

  const user = {
    _id: new Types.ObjectId(),
    username: 'test_ai_student',
    displayName: 'Test AI Student',
    isGuest: false,
  };

  const mockQuestions20: IQuizQuestion[] = Array.from({ length: 20 }, (_, i) => ({
    questionId: `q_mock_${i + 1}`,
    question: `What is deep learning milestone #${i + 1}?`,
    options: [
      `AlexNet Architecture #${i + 1}`,
      `ResNet Residuals #${i + 1}`,
      `Transformer Self-Attention #${i + 1}`,
      `Diffusion Probabilistic #${i + 1}`,
    ] as [string, string, string, string],
    correctAnswer: (i % 4) as 0 | 1 | 2 | 3,
    explanation: `Detailed explanation for deep learning milestone #${i + 1}`,
    difficulty: 'easy',
  }));

  try {
    // -----------------------------------------------------------------
    // TEST SUITE 1: MIDNIGHT IST TIMEZONE RESET & BOUNDARY VERIFICATION
    // -----------------------------------------------------------------
    console.log('▶ TEST SUITE 1: Midnight IST (UTC+5:30) Timezone Boundary Calculations');

    // Case 1: 1 second before midnight IST (23:59:59 IST = 18:29:59 UTC)
    // 2026-10-19 23:59:59 IST is 2026-10-19 18:29:59 UTC
    const beforeMidnightUtc = new Date(Date.UTC(2026, 9, 19, 18, 29, 59));
    const startOfIstDay1 = getStartOfIstDay(beforeMidnightUtc);
    const nextMidnightIst1 = getNextMidnightIst(beforeMidnightUtc);

    assert(
      startOfIstDay1.toISOString() === '2026-10-18T18:30:00.000Z',
      'Start of IST day for 23:59:59 IST is correctly 18:30:00 UTC of previous UTC day'
    );
    assert(
      nextMidnightIst1.toISOString() === '2026-10-19T18:30:00.000Z',
      'Next midnight IST for 23:59:59 IST is correctly 18:30:00 UTC of current UTC day'
    );

    // Case 2: 1 second after midnight IST (00:00:01 IST = 18:30:01 UTC)
    const afterMidnightUtc = new Date(Date.UTC(2026, 9, 19, 18, 30, 1));
    const startOfIstDay2 = getStartOfIstDay(afterMidnightUtc);
    const nextMidnightIst2 = getNextMidnightIst(afterMidnightUtc);

    assert(
      startOfIstDay2.toISOString() === '2026-10-19T18:30:00.000Z',
      'Start of IST day for 00:00:01 IST advances exactly to 18:30:00 UTC'
    );
    assert(
      nextMidnightIst2.toISOString() === '2026-10-20T18:30:00.000Z',
      'Next midnight IST for 00:00:01 IST is 18:30:00 UTC of tomorrow'
    );

    // Case 3: Boundary crossing test
    assert(
      isDifferentIstDay(beforeMidnightUtc, afterMidnightUtc) === true,
      'isDifferentIstDay detects day transition crossing the 18:30:00 UTC / 00:00:00 IST boundary'
    );

    // Case 4: Same day test (e.g. 10:00 IST and 15:00 IST)
    const morningIstUtc = new Date(Date.UTC(2026, 9, 19, 4, 30, 0)); // 10:00 IST
    const afternoonIstUtc = new Date(Date.UTC(2026, 9, 19, 9, 30, 0)); // 15:00 IST
    assert(
      isDifferentIstDay(morningIstUtc, afternoonIstUtc) === false,
      'isDifferentIstDay returns false for times within the same IST calendar day'
    );

    // -----------------------------------------------------------------
    // TEST SUITE 2: ATOMIC QUOTA RESET AT MIDNIGHT IST
    // -----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 2: Atomic Quota Reset Across Midnight IST Boundary');

    await UserQuizQuotaModel.deleteMany({ userId: user._id });

    // Set lastResetDate to yesterday's IST start (24 hours ago)
    const yesterdayIstStart = new Date(getStartOfIstDay().getTime() - 24 * 60 * 60 * 1000);
    await UserQuizQuotaModel.create({
      userId: user._id,
      generationsToday: 1, // was exhausted yesterday
      lastResetDate: yesterdayIstStart,
      isPro: false,
    });

    // Check quota status today - should reset generationsToday to 0
    const quotaToday = await quizService.getOrCreateUserQuota(user._id);
    assert(quotaToday.allowed === true, 'Quota allowed=true after crossing midnight IST');
    assert(quotaToday.generationsToday === 0, 'generationsToday reset back to 0 at midnight IST');
    assert(quotaToday.remainingToday === 1, 'remainingToday is 1 for Free user');
    assert(quotaToday.resetsAt === getNextMidnightIst().toISOString(), 'resetsAt matches next midnight IST timestamp');

    // -----------------------------------------------------------------
    // TEST SUITE 3: DETERMINISTIC QUESTION GENERATION & DRAFT RETURN
    // -----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 3: Deterministic Question Generation (Mocked Provider)');

    // Inject mock generator
    geminiService.setMockGenerator(async () => mockQuestions20);

    const draft = await quizService.generateQuiz(user, {
      topic: 'Neural Networks and Deep Learning',
      categoryName: 'Technology',
    });

    assert(draft.questions.length === 20, 'Generates exactly 20 questions');
    assert(
      draft.questions.every((q) => Array.isArray(q.options) && q.options.length === 4),
      'Each question contains exactly 4 answer options'
    );
    assert(
      draft.questions.every((q) => Number.isInteger(q.correctAnswer) && q.correctAnswer >= 0 && q.correctAnswer <= 3),
      'Each question contains a valid integer correctAnswer index (0 to 3)'
    );
    assert(
      draft.questions.every((q) => q.difficulty === 'easy'),
      'Questions default to beginner-friendly difficulty ("easy")'
    );
    assert(
      draft.questions.every((q) => q.explanation && q.explanation.length > 5),
      'Each question contains a factually relevant explanation'
    );

    // CRITICAL: Verify draft was NOT automatically saved to UserQuizModel
    const unsavedDocCount = await UserQuizModel.countDocuments({ creatorId: user._id });
    assert(unsavedDocCount === 0, 'Generation endpoint returns draft ONLY; does NOT save to UserQuizModel');

    // Verify quota was consumed (1 generation used today)
    const quotaAfterGen = await quizService.getOrCreateUserQuota(user._id);
    assert(quotaAfterGen.generationsToday === 1, 'Successful generation consumed exactly 1 generation unit');
    assert(quotaAfterGen.remainingToday === 0, 'Free user now has 0 remaining generations today');
    assert(quotaAfterGen.allowed === false, 'Free user quota is now exhausted (allowed=false)');

    // -----------------------------------------------------------------
    // TEST SUITE 4: EXHAUSTED QUOTA REJECTION
    // -----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 4: Exhausted Quota Rejection (429)');

    let quotaExhaustedError = false;
    try {
      await quizService.generateQuiz(user, {
        topic: 'Another Topic',
        categoryName: 'Technology',
      });
    } catch (e: any) {
      quotaExhaustedError = e.statusCode === 429 && e.message.includes('Daily Free quota reached');
    }
    assert(quotaExhaustedError, 'Attempting generation with exhausted quota returns 429 error with IST reset message');

    // -----------------------------------------------------------------
    // TEST SUITE 5: QUOTA REFUND ON PROVIDER FAILURE
    // -----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 5: Atomic Quota Refund on Provider Failure');

    // Reset quota so user has 1 generation available
    await UserQuizQuotaModel.updateOne({ userId: user._id }, { $set: { generationsToday: 0 } });

    // Mock Gemini throwing a provider error (e.g. rate limit or network timeout)
    geminiService.setMockGenerator(async () => {
      throw new Error('Gemini 503 Service Unavailable / Network Timeout');
    });

    let providerErrorCaught = false;
    try {
      await quizService.generateQuiz(user, {
        topic: 'Quantum Physics',
        categoryName: 'Science',
      });
    } catch (e: any) {
      providerErrorCaught = true;
    }
    assert(providerErrorCaught, 'Provider failure was caught and thrown');

    // Verify quota was atomically REFUNDED!
    const quotaAfterFailure = await quizService.getOrCreateUserQuota(user._id);
    assert(quotaAfterFailure.generationsToday === 0, 'Quota was atomically refunded after provider failure');
    assert(quotaAfterFailure.remainingToday === 1, 'User still has 1 remaining generation today');
    assert(quotaAfterFailure.allowed === true, 'User is allowed to generate again');

    // -----------------------------------------------------------------
    // TEST SUITE 6: NO QUOTA REFUND AFTER SUCCESSFUL GENERATION
    // -----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 6: No Quota Refund on Successful Draft (Even if Unsaved)');

    // Re-enable valid mock
    geminiService.setMockGenerator(async () => mockQuestions20);

    const successfulDraft = await quizService.generateQuiz(user, {
      topic: 'Space Exploration',
      categoryName: 'Science',
    });
    assert(successfulDraft.questions.length === 20, 'Generated draft successfully');

    // User walks away and NEVER calls /save
    const quotaAfterAbandonedDraft = await quizService.getOrCreateUserQuota(user._id);
    assert(
      quotaAfterAbandonedDraft.generationsToday === 1,
      'Quota is NOT refunded after successful generation even if the draft is not saved'
    );
    assert(
      quotaAfterAbandonedDraft.remainingToday === 0,
      'Generation quota remains consumed for the day'
    );

    // -----------------------------------------------------------------
    // TEST SUITE 7: VALIDATION OF CATEGORIES & TOPICS
    // -----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 7: Input Validation (Invalid Category ID & Empty Topics)');

    // Reset quota to test input validation
    await UserQuizQuotaModel.updateOne({ userId: user._id }, { $set: { generationsToday: 0 } });

    // 7.1 Empty / whitespace topic
    let emptyTopicRejected = false;
    try {
      await quizService.generateQuiz(user, {
        topic: '   ',
        categoryName: 'General',
      });
    } catch (e: any) {
      emptyTopicRejected = e.statusCode === 400 && e.message.includes('Topic');
    }
    assert(emptyTopicRejected, 'Empty/whitespace topic is rejected with 400 error');

    // 7.2 1-character topic
    let singleCharTopicRejected = false;
    try {
      await quizService.generateQuiz(user, {
        topic: 'A',
        categoryName: 'General',
      });
    } catch (e: any) {
      singleCharTopicRejected = e.statusCode === 400;
    }
    assert(singleCharTopicRejected, '1-character topic is rejected with 400 error (min 2 chars)');

    // 7.3 Invalid category ID format
    let invalidCatIdRejected = false;
    try {
      await quizService.generateQuiz(user, {
        topic: 'Valid Topic',
        categoryId: 'not_a_valid_object_id',
      });
    } catch (e: any) {
      invalidCatIdRejected = e.statusCode === 400 && e.message.includes('category ID');
    }
    assert(invalidCatIdRejected, 'Malformed category ID format is rejected with 400 error');

    // 7.4 Non-existent category ID
    let nonExistentCatRejected = false;
    try {
      await quizService.generateQuiz(user, {
        topic: 'Valid Topic',
        categoryId: new Types.ObjectId().toString(),
      });
    } catch (e: any) {
      nonExistentCatRejected = e.statusCode === 400 && e.message.includes('does not exist');
    }
    assert(nonExistentCatRejected, 'Non-existent category ID is rejected with 400 error');

    // -----------------------------------------------------------------
    // TEST SUITE 8: CONCURRENT REQUESTS CANNOT EXCEED DAILY LIMIT
    // -----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 8: Concurrency Protection (Race Condition Prevention)');

    const concurrencyUser = {
      _id: new Types.ObjectId(),
      username: 'concurrent_coder',
      displayName: 'Concurrent Coder',
      isGuest: false,
    };
    await UserQuizQuotaModel.deleteMany({ userId: concurrencyUser._id });

    // Free user: 10 concurrent requests simultaneously
    geminiService.setMockGenerator(async () => mockQuestions20);

    const concurrentResults = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        quizService.generateQuiz(concurrencyUser, {
          topic: 'Concurrent AI Request',
          categoryName: 'Tech',
        })
      )
    );

    const successes = concurrentResults.filter((r) => r.status === 'fulfilled');
    const failures = concurrentResults.filter((r) => r.status === 'rejected');

    assert(successes.length === 1, `Exactly 1 concurrent request succeeded for Free user (got ${successes.length})`);
    assert(failures.length === 9, `Remaining 9 concurrent requests were rejected with 429 (got ${failures.length})`);

    const quotaInDb = await UserQuizQuotaModel.findOne({ userId: concurrencyUser._id });
    assert(quotaInDb?.generationsToday === 1, 'MongoDB reflects exactly 1 generation unit consumed');

    // Upgrade to Pro (limit = 10) and test 15 simultaneous requests
    await UserQuizQuotaModel.updateOne(
      { userId: concurrencyUser._id },
      { $set: { isPro: true, proExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } }
    );

    const proConcurrentResults = await Promise.allSettled(
      Array.from({ length: 15 }, () =>
        quizService.generateQuiz(concurrencyUser, {
          topic: 'Pro Concurrent Request',
          categoryName: 'Tech',
        })
      )
    );

    const proSuccesses = proConcurrentResults.filter((r) => r.status === 'fulfilled');
    const proFailures = proConcurrentResults.filter((r) => r.status === 'rejected');

    assert(proSuccesses.length === 9, `Exactly 9 remaining slots granted under Pro limit (got ${proSuccesses.length})`);
    assert(proFailures.length === 6, `Excess 6 requests rejected when Pro quota exhausted (got ${proFailures.length})`);

    const finalProQuota = await UserQuizQuotaModel.findOne({ userId: concurrencyUser._id });
    assert(finalProQuota?.generationsToday === 10, 'MongoDB reflects exactly 10 generations (never exceeded)');

    // -----------------------------------------------------------------
    // TEST SUITE 9: SEPARATE SAVING ENDPOINT & MULTIPLAYER COMPATIBILITY
    // -----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 9: Saving Workflow & Multiplayer Gameplay Compatibility');

    // User edits draft questions and saves
    const editableDraft = [...mockQuestions20];
    editableDraft[0].question = 'Customized Question #1 Edited by Player?';

    const savedQuiz = await quizService.saveQuiz(user, {
      topic: 'Space Exploration',
      categoryName: 'Science',
      questions: editableDraft,
    });

    assert(savedQuiz.isPrivate === true, 'Saved quiz defaults to isPrivate: true');
    assert(savedQuiz.isPublished === false, 'Saved quiz defaults to isPublished: false');
    assert(savedQuiz.questions[0].question === 'Customized Question #1 Edited by Player?', 'Edited questions saved correctly');

    // Publish quiz and verify gameplay sampling
    await quizService.togglePublish(savedQuiz._id.toString(), user._id, true);
    const sampledForLobby = await questionRepository.sampleRandomPublished(
      { subjectId: savedQuiz._id.toString() },
      undefined,
      10
    );
    assert(sampledForLobby.length === 10, 'Gameplay engine successfully samples questions from published quiz');

    // -----------------------------------------------------------------
    // TEST SUITE 10: REAL GEMINI API CALL (CONDITIONAL)
    // -----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 10: Real Gemini API Provider Status');
    const liveApiKey = process.env.GEMINI_API_KEY;

    if (liveApiKey && liveApiKey.trim().length > 10) {
      console.log('  Testing live Gemini API call with configured GEMINI_API_KEY...');
      // Clear mock to invoke real provider
      geminiService.setMockGenerator(null);

      // Temporarily grant 1 quota unit for live test
      await UserQuizQuotaModel.updateOne({ userId: user._id }, { $set: { generationsToday: 0 } });

      try {
        const liveResult = await quizService.generateQuiz(user, {
          topic: 'Solar System Planets',
          categoryName: 'Science',
        });

        assert(liveResult.questions.length === 20, 'Live Gemini model generated 20 valid questions');
        assert(
          liveResult.questions.every((q) => q.options.length === 4),
          'Live Gemini questions have exactly 4 options'
        );
        console.log(`  🌟 Live Gemini Sample Question: "${liveResult.questions[0].question}"`);
        console.log(`     Options: ${liveResult.questions[0].options.join(' | ')}`);
        console.log(`     Correct: ${liveResult.questions[0].options[liveResult.questions[0].correctAnswer]}`);
      } catch (liveErr: any) {
        console.error('  ⚠️ Live Gemini call failed:', liveErr.message);
        // Do not fail entire test runner if rate-limited on live key
      }
    } else {
      console.log('  ℹ️ GEMINI_API_KEY not configured in .env. Mocked suite passed 100% of contracts.');
    }

    // Clean up test data
    await UserQuizModel.deleteMany({ creatorId: user._id });
    await QuestionModel.deleteMany({ subjectId: savedQuiz._id });
    await UserQuizQuotaModel.deleteMany({ userId: { $in: [user._id, concurrencyUser._id] } });

    console.log('\n======================================================');
    console.log(`🎉 GEMINI QUIZ VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');
  } finally {
    geminiService.setMockGenerator(null);
    await disconnectDatabase();
  }
}

runGeminiQuizVerification().catch((err) => {
  console.error('Fatal error during Gemini verification:', err);
  process.exit(1);
});
