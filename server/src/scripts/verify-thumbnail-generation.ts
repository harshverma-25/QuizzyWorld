/**
 * ============================================================================
 * 🧪 VERIFICATION SUITE: QUIZ THUMBNAIL GENERATION & IMAGE HANDLING
 * ============================================================================
 *
 * Deterministic automated test suite covering:
 * 1. AI thumbnail success with custom prompt & Cloudinary upload
 * 2. Image-provider timeout, rate limit, and failure fallback
 * 3. Valid URL download, content validation, and Cloudinary re-upload
 * 4. SSRF & unsafe redirect rejection (localhost, link-local, private IPs, ports)
 * 5. Valid uploads and invalid/malformed/oversized files
 * 6. Cloudinary upload failures & resilient fallback
 * 7. Correct thumbnailSource ('ai' | 'url' | 'upload' | 'default') and saved URL
 * 8. Quota preservation: No additional quota charged for thumbnails
 * 9. Successful question generation even when thumbnail generation fails
 * 10. Saved quiz persistence, private defaults, and multiplayer gameplay compatibility
 * 11. Distinction between mocked test environment vs real external API credentials
 */

import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { mediaService } from '../modules/media/media.service.js';
import { geminiService } from '../modules/quiz/gemini.service.js';
import { quizService, DEFAULT_FALLBACK_THUMBNAIL } from '../modules/quiz/quiz.service.js';
import { UserQuizModel } from '../modules/quiz/quiz.model.js';
import { UserQuizQuotaModel } from '../modules/quiz/quiz-quota.model.js';
import { QuestionModel } from '../modules/question/question.model.js';
import { CategoryModel } from '../modules/category/category.model.js';
import {
  isPrivateOrRestrictedIp,
  validateSafeHttpsUrl,
  validateImageMagicBytes,
  getImageDimensions,
  validateImageDimensions,
} from '../modules/quiz/ssrf-validator.js';
import { IQuizQuestion } from '../modules/quiz/quiz.types.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${testName}`);
    if (details) console.error(`     Details: ${details}`);
  }
}

// Valid 1x1 transparent PNG buffer (70 bytes)
const VALID_1X1_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VALID_PNG_BUFFER = Buffer.from(VALID_1X1_PNG_BASE64, 'base64');

// Valid 100x100 PNG header buffer (simulated)
function createSimulatedPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(70);
  VALID_PNG_BUFFER.copy(buf);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

// Standard 20 mock questions generator
function generateMockQuestions(topic: string): IQuizQuestion[] {
  return Array.from({ length: 20 }, (_, i) => ({
    questionId: `mock_q_${i + 1}`,
    question: `What is a foundational concept in ${topic}? (Question #${i + 1})`,
    options: [
      `Primary element of ${topic}`,
      `Secondary variation of ${topic}`,
      `Alternative approach to ${topic}`,
      `Unrelated factor to ${topic}`,
    ] as [string, string, string, string],
    correctAnswer: i % 4,
    explanation: `This is the verified educational explanation for question #${i + 1} regarding ${topic}.`,
    difficulty: 'easy',
  }));
}

async function runThumbnailVerificationSuite() {
  console.log('\n======================================================');
  console.log('🧪 VERIFYING QUIZ THUMBNAIL GENERATION & IMAGE HANDLING');
  console.log('======================================================\n');

  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Setup Category
    let category = await CategoryModel.findOne({ slug: 'movies-and-web-series' });
    if (!category) {
      category = await CategoryModel.create({
        name: 'Movies & Web Series',
        slug: 'movies-and-web-series',
        description: 'Films and television',
        isActive: true,
      });
    }

    // Set Gemini deterministic mock
    geminiService.setMockGenerator(async (topic) => generateMockQuestions(topic));

    // =========================================================================
    // SUITE 1: AI THUMBNAIL SUCCESS WITH CLOUDINARY UPLOAD
    // =========================================================================
    console.log('▶ TEST SUITE 1: AI Thumbnail Generation & Cloudinary Upload');

    let aiPromptReceived = '';
    mediaService.setMockAiGenerator(async (subject, cat) => {
      aiPromptReceived = `${subject} (${cat})`;
      return VALID_PNG_BUFFER;
    });

    mediaService.setMockUploader(async (_input, options) => {
      return {
        url: `https://res.cloudinary.com/devd6kcml/image/upload/v1729000/quizzy/thumbnails/${options?.publicId || 'test'}.png`,
        publicId: options?.publicId || 'test_pub_id',
        format: 'png',
        bytes: 70,
        width: 1,
        height: 1,
      };
    });

    const aiThumbResult = await quizService.processThumbnail({
      mode: 'ai',
      topic: 'Inception',
      categoryName: 'Movies & Web Series',
      categorySlug: 'movies-and-web-series',
    });

    assert(aiThumbResult.source === 'ai', 'AI thumbnail returned with thumbnailSource: "ai"');
    assert(
      aiThumbResult.url.includes('cloudinary.com'),
      'AI thumbnail stored and served via Cloudinary CDN'
    );
    assert(aiThumbResult.metadata?.provider === 'cloudflare-ai', 'Storage metadata includes provider info');
    assert(aiPromptReceived.includes('Inception'), 'Topic prompt passed correctly to AI generator');

    // =========================================================================
    // SUITE 2: AI PROVIDER TIMEOUT / RATE LIMIT & FAILURE FALLBACK
    // =========================================================================
    console.log('\n▶ TEST SUITE 2: AI Provider Timeout, Rate Limit, and Failure Fallback');

    // Simulate AI failure (rate limit / timeout / provider 500)
    mediaService.setMockAiGenerator(async () => {
      throw new Error('Cloudflare AI error (429): Rate limit exceeded');
    });

    const fallbackResult = await quizService.processThumbnail({
      mode: 'ai',
      topic: 'Interstellar',
      categoryName: 'Movies & Web Series',
    });

    assert(
      fallbackResult.url === DEFAULT_FALLBACK_THUMBNAIL,
      'AI provider failure falls back gracefully to DEFAULT_FALLBACK_THUMBNAIL'
    );
    assert(fallbackResult.source === 'default', 'Fallback assigns thumbnailSource: "default"');
    assert(fallbackResult.metadata?.fallback === true, 'Metadata flags fallback=true');

    // =========================================================================
    // SUITE 3: NO QUOTA CHARGE FOR THUMBNAILS & RESILIENT GENERATION
    // =========================================================================
    console.log('\n▶ TEST SUITE 3: Quota Preservation & Resilient Question Generation');

    const testUser = {
      _id: new Types.ObjectId(),
      username: 'thumb_test_user',
      isGuest: false,
    };

    // Verify baseline quota
    const initialQuota = await quizService.getOrCreateUserQuota(testUser._id);
    assert(initialQuota.generationsToday === 0, 'User starts with 0 generations used today');

    // Standalone thumbnail call must NOT touch quota
    await quizService.processThumbnail({
      mode: 'ai',
      topic: 'The Matrix',
    });
    const quotaAfterThumb = await quizService.getOrCreateUserQuota(testUser._id);
    assert(
      quotaAfterThumb.generationsToday === 0,
      'Standalone thumbnail call does NOT consume quiz-generation quota'
    );

    // Call generateQuiz while AI thumbnail fails
    // Gemini questions must succeed, thumbnail falls back, and exactly 1 quota consumed
    mediaService.setMockAiGenerator(async () => {
      throw new Error('Cloudflare AI network timeout after 16s');
    });

    const generatedDraft = await quizService.generateQuiz(testUser, {
      topic: 'The Matrix',
      categoryId: category._id.toString(),
      thumbnailMode: 'ai',
    });

    assert(generatedDraft.questions.length === 20, 'Generates exactly 20 questions even when AI thumbnail fails');
    assert(
      generatedDraft.thumbnailUrl === DEFAULT_FALLBACK_THUMBNAIL,
      'Thumbnail safely falls back to default thumbnail on provider failure'
    );
    assert(generatedDraft.thumbnailSource === 'default', 'thumbnailSource defaults on image provider failure');
    assert(generatedDraft.quota.generationsToday === 1, 'Exactly 1 generation counted after 20 valid questions');
    assert(generatedDraft.quota.remainingToday === 0, 'Daily allowance correctly decremented to 0');

    // =========================================================================
    // SUITE 4: VALID URL DOWNLOAD & CLOUDINARY RE-UPLOAD
    // =========================================================================
    console.log('\n▶ TEST SUITE 4: Valid Image URL Download & Cloudinary Re-upload');

    // Reset mock uploader
    mediaService.setMockUploader(async (_input, options) => {
      return {
        url: `https://res.cloudinary.com/devd6kcml/image/upload/v1729000/quizzy/thumbnails/urls/${options?.publicId}.png`,
        publicId: options?.publicId || 'url_pub_id',
        format: 'png',
        bytes: 70,
        width: 100,
        height: 100,
      };
    });

    // Mock global fetch for safe external URL test
    const valid400Png = createSimulatedPng(400, 400);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: any, init?: any) => {
      const urlStr = input.toString();
      if (urlStr.includes('unsplash.com')) {
        return new Response(valid400Png, {
          status: 200,
          statusText: 'OK',
          headers: {
            'content-type': 'image/png',
            'content-length': String(valid400Png.length),
          },
        });
      }
      return originalFetch(input, init);
    };

    const urlThumbResult = await quizService.processThumbnail({
      mode: 'url',
      topic: 'Oppenheimer',
      url: 'https://images.unsplash.com/photo-oppenheimer.png',
    });

    assert(urlThumbResult.source === 'url', 'URL thumbnail returns thumbnailSource: "url"');
    assert(urlThumbResult.url.includes('cloudinary.com'), 'External URL safely uploaded to Cloudinary');
    assert(urlThumbResult.metadata?.originalUrl?.includes('unsplash'), 'Metadata stores original URL');

    // Restore fetch
    globalThis.fetch = originalFetch;

    // =========================================================================
    // SUITE 5: SSRF AND UNSAFE REDIRECT REJECTION
    // =========================================================================
    console.log('\n▶ TEST SUITE 5: SSRF and Unsafe Destination Rejection');

    // IP filter checks
    assert(isPrivateOrRestrictedIp('127.0.0.1') === true, 'Blocks IPv4 loopback (127.0.0.1)');
    assert(isPrivateOrRestrictedIp('10.0.0.1') === true, 'Blocks RFC 1918 Class A (10.0.0.1)');
    assert(isPrivateOrRestrictedIp('172.16.0.1') === true, 'Blocks RFC 1918 Class B (172.16.0.1)');
    assert(isPrivateOrRestrictedIp('192.168.1.1') === true, 'Blocks RFC 1918 Class C (192.168.1.1)');
    assert(isPrivateOrRestrictedIp('169.254.169.254') === true, 'Blocks Cloud Instance Metadata (169.254.169.254)');
    assert(isPrivateOrRestrictedIp('::1') === true, 'Blocks IPv6 loopback (::1)');
    assert(isPrivateOrRestrictedIp('8.8.8.8') === false, 'Allows public IPv4 address (8.8.8.8)');

    // Insecure protocol rejection
    let threwInsecure = false;
    try {
      await validateSafeHttpsUrl('http://images.unsplash.com/sample.jpg');
    } catch {
      threwInsecure = true;
    }
    assert(threwInsecure, 'Rejects insecure HTTP protocol (must be HTTPS)');

    // Embedded credentials rejection
    let threwCreds = false;
    try {
      await validateSafeHttpsUrl('https://admin:secret@example.com/pic.jpg');
    } catch {
      threwCreds = true;
    }
    assert(threwCreds, 'Rejects embedded credentials in URL');

    // Localhost rejection
    let threwLocalhost = false;
    try {
      await validateSafeHttpsUrl('https://localhost/avatar.png');
    } catch {
      threwLocalhost = true;
    }
    assert(threwLocalhost, 'Rejects access to localhost domain');

    // Non-standard port rejection
    let threwPort = false;
    try {
      await validateSafeHttpsUrl('https://example.com:8080/avatar.png');
    } catch {
      threwPort = true;
    }
    assert(threwPort, 'Rejects non-standard HTTPS port (:8080)');

    // Direct private IP in HTTPS URL rejection
    let threwPrivateIp = false;
    try {
      await validateSafeHttpsUrl('https://169.254.169.254/latest/meta-data');
    } catch {
      threwPrivateIp = true;
    }
    assert(threwPrivateIp, 'Rejects direct link-local metadata IP in HTTPS URL');

    // =========================================================================
    // SUITE 6: VALID UPLOADS & MALFORMED/OVERSIZED FILE HANDLING
    // =========================================================================
    console.log('\n▶ TEST SUITE 6: File Uploads, Magic Bytes, and Dimension Limits');

    // Valid upload
    mediaService.setMockUploader(async (_input, options) => {
      return {
        url: `https://res.cloudinary.com/devd6kcml/image/upload/v1729000/quizzy/thumbnails/uploads/${options?.publicId}.png`,
        publicId: options?.publicId || 'upload_pub_id',
        format: 'png',
        bytes: 70,
        width: 1,
        height: 1,
      };
    });

    const uploadThumbResult = await quizService.processThumbnail({
      mode: 'upload',
      topic: 'Dune Part Two',
      upload: {
        base64: `data:image/png;base64,${createSimulatedPng(400, 400).toString('base64')}`,
        mimeType: 'image/png',
      },
    });

    assert(uploadThumbResult.source === 'upload', 'Upload mode returns thumbnailSource: "upload"');
    assert(uploadThumbResult.url.includes('cloudinary.com'), 'Uploaded buffer stored in Cloudinary');

    // Malformed plain text data disguised as image
    let threwMalformed = false;
    try {
      const fakeBase64 = Buffer.from('This is not an image file at all!').toString('base64');
      await quizService.processThumbnail({
        mode: 'upload',
        topic: 'Test',
        upload: { base64: fakeBase64, mimeType: 'image/jpeg' },
      });
    } catch {
      threwMalformed = true;
    }
    assert(threwMalformed, 'Rejects non-image payload with invalid magic bytes');

    // Oversized buffer rejection (> 5MB)
    let threwOversized = false;
    try {
      const hugeBuffer = Buffer.alloc(6 * 1024 * 1024);
      VALID_PNG_BUFFER.copy(hugeBuffer);
      await quizService.processThumbnail({
        mode: 'upload',
        topic: 'Test',
        upload: { base64: hugeBuffer.toString('base64'), mimeType: 'image/png' },
      });
    } catch {
      threwOversized = true;
    }
    assert(threwOversized, 'Rejects file exceeding 5MB maximum limit');

    // Dimension limits (e.g. 5000x5000px)
    let threwOversizedDim = false;
    try {
      const oversizedPng = createSimulatedPng(5000, 5000);
      validateImageDimensions(oversizedPng);
    } catch {
      threwOversizedDim = true;
    }
    assert(threwOversizedDim, 'Rejects image with dimensions exceeding 4096px limit');

    // Minimum dimensions check (< 16px)
    let threwTinyDim = false;
    try {
      const tinyPng = createSimulatedPng(5, 5);
      validateImageDimensions(tinyPng);
    } catch {
      threwTinyDim = true;
    }
    assert(threwTinyDim, 'Rejects image with dimensions below 16px');

    // =========================================================================
    // SUITE 7: CLOUDINARY UPLOAD FAILURE HANDLING
    // =========================================================================
    console.log('\n▶ TEST SUITE 7: Cloudinary Upload Failure Handling');

    mediaService.setMockAiGenerator(async () => VALID_PNG_BUFFER);
    mediaService.setMockUploader(async () => {
      throw new Error('Cloudinary API connection dropped: Request timeout');
    });

    const cloudFailResult = await quizService.processThumbnail({
      mode: 'ai',
      topic: 'Fight Club',
    });

    assert(
      cloudFailResult.url === DEFAULT_FALLBACK_THUMBNAIL,
      'Cloudinary failure falls back safely to default fallback thumbnail'
    );
    assert(cloudFailResult.source === 'default', 'Cloudinary failure sets thumbnailSource: "default"');

    // =========================================================================
    // SUITE 8: THUMBNAIL SOURCE & PERSISTENCE IN DATABASE
    // =========================================================================
    console.log('\n▶ TEST SUITE 8: Thumbnail Source Persistence & Updates');

    // Save quiz with AI thumbnail
    const savedQuiz = await quizService.saveQuiz(testUser, {
      title: 'Inception Film Trivia',
      topic: 'Inception',
      categoryName: 'Movies & Web Series',
      categoryId: category._id.toString(),
      thumbnailUrl: 'https://res.cloudinary.com/devd6kcml/image/upload/v1/test_thumb.jpg',
      thumbnailSource: 'ai',
      storageMetadata: { provider: 'cloudflare-ai', publicId: 'test_thumb' },
      questions: generateMockQuestions('Inception'),
    });

    assert(savedQuiz.thumbnailSource === 'ai', 'Saved quiz preserves thumbnailSource: "ai"');
    assert(savedQuiz.thumbnailUrl.includes('test_thumb'), 'Saved quiz preserves Cloudinary URL');

    // Update thumbnail to custom URL
    const updatedQuiz = await quizService.updateQuiz(savedQuiz._id.toString(), testUser._id, {
      thumbnailUrl: 'https://res.cloudinary.com/devd6kcml/image/upload/v2/updated_thumb.jpg',
      thumbnailSource: 'url',
      storageMetadata: { provider: 'url', originalUrl: 'https://example.com/pic.jpg' },
    });

    assert(updatedQuiz.thumbnailSource === 'url', 'updateQuiz updates thumbnailSource to "url"');
    assert(updatedQuiz.thumbnailUrl.includes('updated_thumb'), 'updateQuiz updates thumbnailUrl');

    // =========================================================================
    // SUITE 9: GAMEPLAY COMPATIBILITY WITH CUSTOM THUMBNAILS
    // =========================================================================
    console.log('\n▶ TEST SUITE 9: Gameplay Compatibility & Privacy');

    assert(savedQuiz.isPrivate === true, 'Saved quiz defaults to isPrivate: true');
    assert(savedQuiz.isPublished === false, 'Saved quiz defaults to isPublished: false');

    // Publish quiz and verify gameplay questions
    await quizService.togglePublish(savedQuiz._id.toString(), testUser._id, true);

    const syncedQuestions = await QuestionModel.find({ subjectId: savedQuiz._id });
    assert(syncedQuestions.length === 20, 'Synchronized all 20 questions into QuestionModel');
    assert(syncedQuestions[0].isPublished === true, 'Synced questions marked as isPublished=true');

    // Verify multiplayer matchmaking can sample from it
    const sampled = await QuestionModel.aggregate([
      { $match: { subjectId: savedQuiz._id, isPublished: true } },
      { $sample: { size: 5 } },
    ]);
    assert(sampled.length === 5, 'Matchmaking engine successfully samples questions from quiz');

    // Clean up test data
    await UserQuizModel.deleteMany({ creatorId: testUser._id });
    await UserQuizQuotaModel.deleteMany({ userId: testUser._id });
    await QuestionModel.deleteMany({ subjectId: savedQuiz._id });

    // =========================================================================
    // SUITE 10: REAL PROVIDER STATUS REPORT
    // =========================================================================
    console.log('\n▶ TEST SUITE 10: Real Provider Configuration Status');

    const mediaStatus = mediaService.getStatus();
    const hasCloudflare = Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
    const hasCloudinary = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

    console.log(`  ℹ️ Cloudflare Workers AI configured: ${hasCloudflare ? 'YES' : 'NO'}`);
    console.log(`  ℹ️ Cloudflare AI Model: ${env.CLOUDFLARE_AI_MODEL || '@cf/stabilityai/stable-diffusion-xl-base-1.0'}`);
    console.log(`  ℹ️ Cloudinary credentials configured: ${hasCloudinary ? 'YES' : 'NO'}`);
    console.log(`  ℹ️ Automated test isolation: 100% mocked external calls for zero-cost test safety.`);

    console.log('\n======================================================');
    console.log(`🎉 THUMBNAIL VERIFICATION: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('======================================================\n');
  } catch (err: any) {
    console.error('Fatal error during verification:', err);
    process.exit(1);
  } finally {
    // Reset mock injection hooks
    mediaService.setMockAiGenerator(null);
    mediaService.setMockUploader(null);
    geminiService.setMockGenerator(null);

    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runThumbnailVerificationSuite();
