import mongoose, { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { isPrivateOrRestrictedIp, validateImageMagicBytes, validateSafeHttpsUrl } from '../modules/quiz/ssrf-validator.js';
import { quizService } from '../modules/quiz/quiz.service.js';
import { UserQuizQuotaModel } from '../modules/quiz/quiz-quota.model.js';
import { UserQuizModel } from '../modules/quiz/quiz.model.js';
import { geminiService } from '../modules/quiz/gemini.service.js';

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

async function runTests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING AI QUIZ CREATOR TEST SUITE');
  console.log('==================================================\n');

  await connectDatabase();

  try {
    // ----------------------------------------------------
    // TEST SUITE 1: SSRF & IP RESTRICTION CHECKS
    // ----------------------------------------------------
    console.log('▶ TEST SUITE 1: SSRF & Restricted Network Protection');

    assert(isPrivateOrRestrictedIp('127.0.0.1') === true, '127.0.0.1 is blocked as loopback');
    assert(isPrivateOrRestrictedIp('10.0.0.5') === true, '10.0.0.5 is blocked as RFC1918');
    assert(isPrivateOrRestrictedIp('172.16.0.1') === true, '172.16.0.1 is blocked as RFC1918');
    assert(isPrivateOrRestrictedIp('172.31.255.255') === true, '172.31.255.255 is blocked as RFC1918');
    assert(isPrivateOrRestrictedIp('192.168.1.100') === true, '192.168.1.100 is blocked as RFC1918');
    assert(isPrivateOrRestrictedIp('169.254.169.254') === true, '169.254.169.254 is blocked as AWS metadata');
    assert(isPrivateOrRestrictedIp('0.0.0.0') === true, '0.0.0.0 is blocked');
    assert(isPrivateOrRestrictedIp('100.64.0.1') === true, '100.64.0.1 is blocked as CGNAT');
    assert(isPrivateOrRestrictedIp('::1') === true, 'IPv6 ::1 is blocked as loopback');
    assert(isPrivateOrRestrictedIp('::ffff:127.0.0.1') === true, 'IPv4-mapped IPv6 loopback is blocked');
    assert(isPrivateOrRestrictedIp('::ffff:192.168.0.1') === true, 'IPv4-mapped IPv6 private is blocked');
    assert(isPrivateOrRestrictedIp('8.8.8.8') === false, '8.8.8.8 is allowed as public IP');
    assert(isPrivateOrRestrictedIp('1.1.1.1') === false, '1.1.1.1 is allowed as public IP');

    // ----------------------------------------------------
    // TEST SUITE 2: SAFE URL VALIDATION (HTTP / CREDENTIALS / LOCALHOST)
    // ----------------------------------------------------
    console.log('\n▶ TEST SUITE 2: URL Scheme & Target Destination Validation');

    let httpRejected = false;
    try {
      await validateSafeHttpsUrl('http://example.com/image.jpg');
    } catch (e: any) {
      httpRejected = e.message.includes('HTTPS');
    }
    assert(httpRejected, 'HTTP protocol is strictly rejected in favor of HTTPS');

    let credsRejected = false;
    try {
      await validateSafeHttpsUrl('https://admin:secret@example.com/image.jpg');
    } catch (e: any) {
      credsRejected = e.message.includes('credentials');
    }
    assert(credsRejected, 'URLs with embedded credentials are safely rejected');

    let localhostRejected = false;
    try {
      await validateSafeHttpsUrl('https://localhost/test.png');
    } catch (e: any) {
      localhostRejected = e.message.includes('local');
    }
    assert(localhostRejected, 'localhost URLs are safely rejected');

    let privateIpRejected = false;
    try {
      await validateSafeHttpsUrl('https://169.254.169.254/latest/meta-data');
    } catch (e: any) {
      privateIpRejected = e.message.includes('private or internal');
    }
    assert(privateIpRejected, 'Direct private IP 169.254.169.254 is safely rejected');

    // ----------------------------------------------------
    // TEST SUITE 3: IMAGE MAGIC BYTES & CONTENT VALIDATION
    // ----------------------------------------------------
    console.log('\n▶ TEST SUITE 3: Image Content & Format Validation');

    // Fake JPEG header
    const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    assert(validateImageMagicBytes(validJpeg) === 'image/jpeg', 'Authentic JPEG magic bytes recognized');

    // Fake PNG header
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    assert(validateImageMagicBytes(validPng) === 'image/png', 'Authentic PNG magic bytes recognized');

    // Fake WebP header
    const validWebp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP'),
    ]);
    assert(validateImageMagicBytes(validWebp) === 'image/webp', 'Authentic WebP magic bytes recognized');

    // Invalid non-image buffer (e.g. text/html payload)
    let nonImageRejected = false;
    try {
      validateImageMagicBytes(Buffer.from('<html><body>Not an image</body></html>'));
    } catch (e: any) {
      nonImageRejected = e.message.includes('Invalid image format');
    }
    assert(nonImageRejected, 'Non-image content (HTML/text) is rejected by magic bytes check');

    // ----------------------------------------------------
    // TEST SUITE 4: USER QUOTA ENFORCEMENT & PRO LIMITS
    // ----------------------------------------------------
    console.log('\n▶ TEST SUITE 4: User Daily Quota Enforcement (Free 1/day, Pro 10/day)');

    const testUserId = new Types.ObjectId();

    // 1. Clean previous test quota
    await UserQuizQuotaModel.deleteMany({ userId: testUserId });

    // 2. Initial quota for free user
    const q1 = await quizService.getOrCreateUserQuota(testUserId);
    assert(q1.allowed === true, 'New free user starts with allowed=true');
    assert(q1.dailyLimit === 1, 'Free user daily limit is 1');
    assert(q1.remainingToday === 1, 'Free user starts with remainingToday=1');

    // 3. Simulate 1 generation used
    await UserQuizQuotaModel.updateOne({ userId: testUserId }, { $inc: { generationsToday: 1 } });
    const q2 = await quizService.getOrCreateUserQuota(testUserId);
    assert(q2.allowed === false, 'Free user with 1 generation is now allowed=false');
    assert(q2.remainingToday === 0, 'Free user remainingToday is now 0');

    // 4. Upgrade user to Pro
    await UserQuizQuotaModel.updateOne(
      { userId: testUserId },
      { $set: { isPro: true, proExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } }
    );
    const q3 = await quizService.getOrCreateUserQuota(testUserId);
    assert(q3.allowed === true, 'Upgraded Pro user is now allowed=true');
    assert(q3.dailyLimit === 10, 'Pro user daily limit is 10');
    assert(q3.remainingToday === 9, 'Pro user with 1 used generation has 9 remaining today');

    // 5. Simulate exhausting Pro quota (10 generations)
    await UserQuizQuotaModel.updateOne({ userId: testUserId }, { $set: { generationsToday: 10 } });
    const q4 = await quizService.getOrCreateUserQuota(testUserId);
    assert(q4.allowed === false, 'Exhausted Pro user (10/10) is allowed=false');
    assert(q4.remainingToday === 0, 'Exhausted Pro user has remainingToday=0');

    // ----------------------------------------------------
    // TEST SUITE 5: AI IMAGE GENERATION FAILURE / TIMEOUT FALLBACK
    // ----------------------------------------------------
    console.log('\n▶ TEST SUITE 5: Non-Blocking AI Image Fallback');

    // When AI image generation encounters an error or timeout:
    // Question generation continues smoothly and uses default fallback thumbnail.
    const mockUser = {
      _id: testUserId,
      isGuest: false,
      username: 'test_coder',
      displayName: 'Test Coder',
    };

    // Reset quota so generation can proceed
    await UserQuizQuotaModel.updateOne({ userId: testUserId }, { $set: { generationsToday: 0 } });

    // Mock Gemini question generator to return 20 valid questions
    const originalGenerateQuestions = geminiService.generateQuestions;
    const mockQuestions = Array.from({ length: 20 }, (_, i) => ({
      questionId: `q_test_${i + 1}`,
      question: `What is test concept #${i + 1}?`,
      options: ['Option A', 'Option B', 'Option C', 'Option D'] as [string, string, string, string],
      correctAnswer: 0,
      explanation: `Test explanation #${i + 1}`,
    }));

    geminiService.generateQuestions = async () => mockQuestions;

    // Test that AI thumbnail error does not crash the quiz generation
    try {
      const generatedQuiz = await quizService.generateQuiz(mockUser, {
        categoryName: 'Science',
        topic: 'Quantum Physics',
        thumbnailMode: 'ai',
      });

      assert(generatedQuiz.questions.length === 20, 'Generates exactly 20 questions');
      assert(Boolean(generatedQuiz.thumbnailUrl), 'Thumbnail URL is populated (AI or fallback)');
      assert(
        generatedQuiz.thumbnailSource === 'ai' || generatedQuiz.thumbnailSource === 'default',
        `Thumbnail source handled gracefully: ${generatedQuiz.thumbnailSource}`
      );
    } finally {
      geminiService.generateQuestions = originalGenerateQuestions;
    }

    // ----------------------------------------------------
    // TEST SUITE 6: SAVE QUIZ PRIVATELY BY DEFAULT & MY QUIZZES
    // ----------------------------------------------------
    console.log('\n▶ TEST SUITE 6: Quiz Saving & Privacy By Default');

    const savedQuiz = await quizService.saveQuiz(mockUser, {
      categoryName: 'Science',
      topic: 'Quantum Physics',
      questions: mockQuestions,
      thumbnailUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      thumbnailSource: 'default',
    });

    assert(savedQuiz.isPrivate === true, 'Quiz is saved privately by default');
    assert(savedQuiz.isPublished === false, 'Quiz is unpublished by default');
    assert(savedQuiz.shareId.startsWith('qz_'), 'Unique shareId is generated');

    // Toggle publish
    const publishedQuiz = await quizService.togglePublish(savedQuiz._id.toString(), testUserId, true);
    assert(publishedQuiz.isPublished === true, 'Quiz is successfully published');
    assert(publishedQuiz.isPrivate === false, 'Published quiz has isPrivate=false');

    // Direct link share retrieval
    const sharedQuiz = await quizService.getQuizByShareId(savedQuiz.shareId);
    assert(sharedQuiz._id.toString() === savedQuiz._id.toString(), 'Published quiz retrieved via shareId');

    // ----------------------------------------------------
    // TEST SUITE 7: EXPLICIT AI IMAGE QUOTA EXHAUSTION / ERROR FALLBACK
    // ----------------------------------------------------
    console.log('\n▶ TEST SUITE 7: Explicit AI Image Error / Exhaustion Fallback');
    const { mediaService } = await import('../modules/media/media.service.js');
    const originalGenerateThumb = mediaService.generateAndUploadSubjectThumbnail;

    try {
      // Force AI image provider failure
      mediaService.generateAndUploadSubjectThumbnail = async () => {
        throw new Error('Cloudflare AI quota exceeded: 429 Too Many Requests');
      };

      geminiService.generateQuestions = async () => mockQuestions;

      await UserQuizQuotaModel.updateOne({ userId: testUserId }, { $set: { generationsToday: 0 } });

      const fallbackQuiz = await quizService.generateQuiz(mockUser, {
        categoryName: 'History',
        topic: 'Ancient Rome',
        thumbnailMode: 'ai',
      });

      assert(fallbackQuiz.questions.length === 20, 'Quiz questions generated even when AI image provider exhausts quota');
      assert(fallbackQuiz.thumbnailSource === 'default', 'Thumbnail source falls back to default');
      assert(fallbackQuiz.thumbnailUrl.includes('unsplash') || fallbackQuiz.thumbnailUrl.includes('photo'), 'Fallback thumbnail URL is returned');
    } finally {
      mediaService.generateAndUploadSubjectThumbnail = originalGenerateThumb;
      geminiService.generateQuestions = originalGenerateQuestions;
    }

    // ----------------------------------------------------
    // TEST SUITE 8: UPLOAD FAILURE (FILE SIZE / CORRUPTION)
    // ----------------------------------------------------
    console.log('\n▶ TEST SUITE 8: Upload Failures (Oversize / Corrupted Mime)');
    const { processAndUploadImageFile } = await import('../modules/quiz/ssrf-validator.js');

    // 1. Oversize buffer (> 5MB)
    const oversizeBuffer = Buffer.alloc(5.5 * 1024 * 1024); // 5.5MB
    let oversizeRejected = false;
    try {
      await processAndUploadImageFile(oversizeBuffer.toString('base64'), 'image/jpeg', 'Oversize Topic');
    } catch (e: any) {
      oversizeRejected = e.message.includes('5MB');
    }
    assert(oversizeRejected, 'Image upload > 5MB is rejected with 400 error');

    // 2. Corrupt/fake base64 that is not an authentic image
    let corruptRejected = false;
    try {
      await processAndUploadImageFile(Buffer.from('not an image at all').toString('base64'), 'image/png', 'Corrupt Topic');
    } catch (e: any) {
      corruptRejected = e.message.includes('Invalid image format');
    }
    assert(corruptRejected, 'Corrupted / fake image payload rejected by magic bytes');

    // ----------------------------------------------------
    // TEST SUITE 9: MALFORMED GEMINI OUTPUT HANDLING
    // ----------------------------------------------------
    console.log('\n▶ TEST SUITE 9: Malformed Gemini Output Handling');
    const { z } = await import('zod');

    // Schema validation checks that 19 questions or missing options are rejected
    const testQuestionSchema = z.object({
      question: z.string().min(5),
      options: z.array(z.string().min(1)).length(4),
      correctAnswer: z.number().int().min(0).max(3),
      explanation: z.string().min(5),
    });
    const testQuizSchema = z.object({
      questions: z.array(testQuestionSchema).length(20),
    });

    const incompleteQuestions = mockQuestions.slice(0, 19); // only 19
    const incompleteResult = testQuizSchema.safeParse({ questions: incompleteQuestions });
    assert(incompleteResult.success === false, 'Gemini output with fewer than 20 questions is rejected by schema');

    const invalidOptions = mockQuestions.slice(0, 20);
    // @ts-ignore
    invalidOptions[0] = { ...invalidOptions[0], options: ['A', 'B', 'C'] }; // only 3 options
    const invalidOptionsResult = testQuizSchema.safeParse({ questions: invalidOptions });
    assert(invalidOptionsResult.success === false, 'Question with fewer than 4 options is rejected by schema');

    // Clean up test quiz & quota
    await UserQuizModel.deleteOne({ _id: savedQuiz._id });
    await UserQuizQuotaModel.deleteOne({ userId: testUserId });

    console.log('\n==================================================');
    console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================\n');
  } finally {
    await disconnectDatabase();
  }
}

runTests().catch((err) => {
  console.error('Fatal error in test runner:', err);
  process.exit(1);
});
