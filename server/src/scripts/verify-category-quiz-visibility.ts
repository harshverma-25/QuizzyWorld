import mongoose, { Types } from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import assert from 'assert';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { CategoryModel } from '../modules/category/category.model.js';
import { categoryService } from '../modules/category/category.service.js';
import { categoryRepository } from '../modules/category/category.repository.js';
import { quizService } from '../modules/quiz/quiz.service.js';
import { UserQuizModel } from '../modules/quiz/quiz.model.js';
import { questionRepository } from '../modules/question/question.repository.js';
import { cacheService } from '../shared/cache/cache.service.js';

async function runRegressionTests() {
  console.log('--- Starting QUIZZY Category Quiz Visibility Regression Suite ---');

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/codearena';
  await mongoose.connect(uri);

  // Clear existing cache to start fresh
  await cacheService.delByPrefix('categories:');
  await cacheService.delByPrefix('popular:');

  const testUserId = new Types.ObjectId('000000000000000000000001');
  const otherUserId = new Types.ObjectId('000000000000000000000002');

  const sportsCat = await CategoryModel.findOne({ slug: 'sports' });
  assert(sportsCat, 'Sports category must exist in DB');
  console.log(`✓ Sports Category identified: ${sportsCat.name} (${sportsCat._id.toString()})`);

  // Find another category for cross-category isolation testing
  const otherCat = await CategoryModel.findOne({ slug: { $ne: 'sports' }, isActive: true });
  assert(otherCat, 'Another active category must exist');
  console.log(`✓ Second Category for isolation: ${otherCat.name} (${otherCat.slug})`);

  // -------------------------------------------------------------------------
  // TEST 1: Existing seeded/admin Sports quizzes continue to appear
  // -------------------------------------------------------------------------
  console.log('\n[Test 1] Verifying existing seeded/admin Sports quizzes appear...');
  const sportsData = await categoryService.getSubjectsForCategory('sports');
  assert(sportsData.category.slug === 'sports', 'Category slug matches');
  assert(sportsData.subjects.length > 0, 'Sports category has subjects');

  const seededAdminCount = sportsData.subjects.filter((s) => !s.isUserCreated).length;
  console.log(`✓ Seeded/admin Sports subjects count: ${seededAdminCount}`);
  assert(seededAdminCount >= 5, 'Expected at least 5 seeded sports subjects (e.g., IPL Superstars)');

  // -------------------------------------------------------------------------
  // TEST 2: Existing published "Virat Kohli" quiz is visible in Sports category
  // -------------------------------------------------------------------------
  console.log('\n[Test 2] Checking real published Virat Kohli quiz in Sports category...');
  const viratQuiz = await UserQuizModel.findOne({ title: 'Virat Kohli', isPublished: true });
  if (viratQuiz) {
    const foundVirat = sportsData.subjects.find((s) => s._id === viratQuiz._id.toString() || s.name === viratQuiz.title);
    assert(foundVirat, 'Virat Kohli must be present in Sports category subjects');
    console.log(`✓ Virat Kohli found in Sports catalog: questionCount=${foundVirat.questionCount}, playable=${foundVirat.isPlayable}`);
    assert(foundVirat.isUserCreated === true, 'Flagged as user-created');
    assert(foundVirat.questionCount === 20, 'Has 20 questions');

    // Also check GET /api/v1/quizzes/public with sports filter
    const publicSports = await quizService.getPublicQuizzes(20, 1, 'sports');
    const viratInPublic = publicSports.quizzes.find((q) => q._id.toString() === viratQuiz._id.toString());
    assert(viratInPublic, 'Virat Kohli must be present in GET /api/v1/quizzes/public?category=sports');
    console.log('✓ Virat Kohli found in public quizzes filtered by category=sports');
  } else {
    console.log('Note: Virat Kohli quiz not currently in DB, continuing with mock test cases.');
  }

  // -------------------------------------------------------------------------
  // TEST 3: A newly saved private Sports quiz does NOT appear publicly
  // -------------------------------------------------------------------------
  console.log('\n[Test 3] Creating private Sports quiz and verifying isolation...');
  const mockQuestions = Array.from({ length: 20 }, (_, i) => ({
    questionId: `mock_q_${i + 1}`,
    question: `Test Private Sports Question ${i + 1}?`,
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    correctAnswer: 0,
    explanation: 'Explanation',
    difficulty: 'easy',
  }));

  const privateQuiz = await quizService.saveQuiz(
    { _id: testUserId, username: 'testuser' },
    {
      title: 'Private Tennis Master',
      topic: 'Tennis',
      categoryId: sportsCat._id.toString(),
      categoryName: sportsCat.name,
      categorySlug: sportsCat.slug,
      isPrivate: true,
      isPublished: false,
      questions: mockQuestions,
    }
  );

  console.log(`✓ Saved private quiz: ${privateQuiz.title} (ID: ${privateQuiz._id.toString()})`);

  // Verify private quiz is NOT in Sports category subjects
  const sportsDataWithPrivate = await categoryService.getSubjectsForCategory('sports');
  const privateFoundInCat = sportsDataWithPrivate.subjects.find((s) => s._id === privateQuiz._id.toString());
  assert(!privateFoundInCat, 'Private quiz must NOT appear in category subjects');
  console.log('✓ Confirmed: Private Sports quiz does NOT appear in category subjects');

  // Verify private quiz is NOT in public quizzes endpoint
  const publicAll = await quizService.getPublicQuizzes(50, 1);
  const privateFoundInPublicAll = publicAll.quizzes.find((q) => q._id.toString() === privateQuiz._id.toString());
  assert(!privateFoundInPublicAll, 'Private quiz must NOT appear in public catalog');
  console.log('✓ Confirmed: Private Sports quiz does NOT appear in GET /quizzes/public');

  // Verify private quiz is inaccessible to other users
  let blockedAccess = false;
  try {
    await quizService.getQuizById(privateQuiz._id.toString(), otherUserId);
  } catch (err: any) {
    if (err.statusCode === 403) {
      blockedAccess = true;
    }
  }
  assert(blockedAccess, 'Other users must be forbidden from accessing private quiz directly');
  console.log('✓ Confirmed: Other users receive 403 Forbidden for private quiz');

  // -------------------------------------------------------------------------
  // TEST 4: Publishing the quiz makes it appear in Sports category and public catalog
  // -------------------------------------------------------------------------
  console.log('\n[Test 4] Publishing the Sports quiz...');
  await quizService.togglePublish(privateQuiz._id.toString(), testUserId, true);

  // Check Sports category endpoint (cache eviction should happen automatically)
  const sportsDataPublished = await categoryService.getSubjectsForCategory('sports');
  const publishedFoundInCat = sportsDataPublished.subjects.find((s) => s._id === privateQuiz._id.toString());
  assert(publishedFoundInCat, 'Published quiz MUST appear in Sports category subjects');
  assert(publishedFoundInCat.name === 'Private Tennis Master', 'Published quiz title matches');
  assert(publishedFoundInCat.questionCount === 20, 'Published quiz has 20 questions');
  console.log('✓ Confirmed: Published quiz immediately appears in Sports category subjects');

  // Check public endpoint with category filter
  const publicSportsAfter = await quizService.getPublicQuizzes(20, 1, 'sports');
  const publishedFoundInSportsPublic = publicSportsAfter.quizzes.find((q) => q._id.toString() === privateQuiz._id.toString());
  assert(publishedFoundInSportsPublic, 'Published quiz MUST appear in /quizzes/public?category=sports');
  console.log('✓ Confirmed: Published quiz appears in /quizzes/public?category=sports');

  // Check home summary endpoint
  const homeSummary = await categoryService.getHomeSummary();
  const publishedFoundInHome = homeSummary.subjects.find((s) => s._id === privateQuiz._id.toString());
  assert(publishedFoundInHome, 'Published quiz MUST appear in home summary subjects');
  console.log('✓ Confirmed: Published quiz appears in /categories/summary');

  // Check gameplay / room resolution
  const resolvedSubj = await categoryRepository.findSubjectByIdOrSlug(privateQuiz._id.toString());
  assert(resolvedSubj, 'categoryRepository must resolve published user quiz by ID');
  assert(resolvedSubj.categoryId.toString() === sportsCat._id.toString(), 'Category matches');

  const matchingQuestions = await questionRepository.countMatchingQuestions({
    categoryId: 'sports',
    subjectId: privateQuiz._id.toString(),
  });
  assert(matchingQuestions === 20, `Expected 20 matching questions, got ${matchingQuestions}`);
  console.log('✓ Confirmed: Question matchmaking finds 20 questions for published user quiz');

  // -------------------------------------------------------------------------
  // TEST 5: A published quiz from another category does NOT appear in Sports
  // -------------------------------------------------------------------------
  console.log('\n[Test 5] Creating and publishing a quiz in another category...');
  const otherCatQuiz = await quizService.saveQuiz(
    { _id: testUserId, username: 'testuser' },
    {
      title: 'Quantum Physics 101',
      topic: 'Quantum Physics',
      categoryId: otherCat._id.toString(),
      categoryName: otherCat.name,
      categorySlug: otherCat.slug,
      isPrivate: false,
      isPublished: true,
      questions: mockQuestions,
    }
  );

  // Verify otherCatQuiz appears in otherCat
  const otherCatData = await categoryService.getSubjectsForCategory(otherCat.slug);
  const foundInOther = otherCatData.subjects.find((s) => s._id === otherCatQuiz._id.toString());
  assert(foundInOther, 'Quiz must appear in its own category');
  console.log(`✓ Confirmed: Quiz appears in its own category '${otherCat.name}'`);

  // Verify otherCatQuiz does NOT appear in Sports category
  const sportsDataCrossCheck = await categoryService.getSubjectsForCategory('sports');
  const foundCrossInSports = sportsDataCrossCheck.subjects.find((s) => s._id === otherCatQuiz._id.toString());
  assert(!foundCrossInSports, 'Other category quiz must NOT appear in Sports');
  console.log('✓ Confirmed: Other category quiz does NOT appear in Sports category');

  // Verify otherCatQuiz does NOT appear in Sports public query
  const sportsPublicCrossCheck = await quizService.getPublicQuizzes(20, 1, 'sports');
  const foundCrossInSportsPublic = sportsPublicCrossCheck.quizzes.find((q) => q._id.toString() === otherCatQuiz._id.toString());
  assert(!foundCrossInSportsPublic, 'Other category quiz must NOT appear in /quizzes/public?category=sports');
  console.log('✓ Confirmed: Other category quiz does NOT appear in /quizzes/public?category=sports');

  // -------------------------------------------------------------------------
  // TEST 6: Unpublishing removes quiz from public discovery
  // -------------------------------------------------------------------------
  console.log('\n[Test 6] Unpublishing the Sports quiz...');
  await quizService.togglePublish(privateQuiz._id.toString(), testUserId, false);

  const sportsDataAfterUnpublish = await categoryService.getSubjectsForCategory('sports');
  const unpubInSports = sportsDataAfterUnpublish.subjects.find((s) => s._id === privateQuiz._id.toString());
  assert(!unpubInSports, 'Unpublished quiz must NOT appear in Sports category subjects');
  console.log('✓ Confirmed: Unpublished quiz is removed from Sports category subjects');

  const sportsPublicAfterUnpublish = await quizService.getPublicQuizzes(20, 1, 'sports');
  const unpubInSportsPublic = sportsPublicAfterUnpublish.quizzes.find((q) => q._id.toString() === privateQuiz._id.toString());
  assert(!unpubInSportsPublic, 'Unpublished quiz must NOT appear in /quizzes/public?category=sports');
  console.log('✓ Confirmed: Unpublished quiz is removed from /quizzes/public');

  // Cleanup test quizzes
  console.log('\n[Cleanup] Cleaning up test records...');
  await quizService.deleteQuiz(privateQuiz._id.toString(), testUserId);
  await quizService.deleteQuiz(otherCatQuiz._id.toString(), testUserId);
  console.log('✓ Test quizzes removed');

  await mongoose.disconnect();
  console.log('\n🎉 ALL REGRESSION TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runRegressionTests().catch((err) => {
  console.error('\n❌ Regression test failed:', err);
  process.exit(1);
});
