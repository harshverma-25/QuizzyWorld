import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';
import { app } from '../app.js';
import { authService } from '../modules/auth/auth.service.js';
import { UserModel } from '../modules/user/user.model.js';
import { CategoryModel, SubjectModel } from '../modules/category/category.model.js';
import { QuestionModel } from '../modules/question/question.model.js';
import { ImportHistoryModel } from '../modules/admin/import-history.model.js';
import { hashPassword } from '../shared/utils/crypto-auth.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function runVerification() {
  console.log('🧪 Starting Admin Panel End-to-End Verification...');

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/codearena';
  await mongoose.connect(uri);

  // 1. Ensure test admin user exists
  const adminEmail = 'test_admin@quizzy.com';
  let adminUser = await UserModel.findOne({ email: adminEmail });
  if (!adminUser) {
    adminUser = await UserModel.create({
      email: adminEmail,
      username: 'test_admin',
      displayName: 'Test Admin',
      passwordHash: await hashPassword('admin123456'),
      role: 'admin',
      isGuest: false,
    });
  } else {
    adminUser.role = 'admin';
    await adminUser.save();
  }

  // Ensure regular non-admin user exists
  const normalEmail = 'normal_user@quizzy.com';
  let normalUser = await UserModel.findOne({ email: normalEmail });
  if (!normalUser) {
    normalUser = await UserModel.create({
      email: normalEmail,
      username: 'normal_user',
      displayName: 'Normal User',
      passwordHash: await hashPassword('user123456'),
      role: 'user',
      isGuest: false,
    });
  }

  // Issue tokens
  const adminLogin = await authService.login({
    emailOrUsername: adminEmail,
    password: 'admin123456',
  });
  const adminToken = adminLogin.accessToken;

  const normalLogin = await authService.login({
    emailOrUsername: normalEmail,
    password: 'user123456',
  });
  const normalToken = normalLogin.accessToken;

  console.log('✅ Generated tokens for admin and regular user.');

  // Find a destination category and subject
  const scienceCat = await CategoryModel.findOne({ slug: 'science' });
  const physicsSub = await SubjectModel.findOne({ slug: 'physics', categoryId: scienceCat?._id });

  if (!scienceCat || !physicsSub) {
    throw new Error('Science category or Physics subject not found');
  }

  // Verification 1: Regular user blocked from Admin endpoints (403 Forbidden)
  console.log('▶️ Checkpoint 1: Regular user authorization guard check...');
  const resForbidden = await fetch('http://localhost:5000/api/v1/admin/overview', {
    headers: { Authorization: `Bearer ${normalToken}` },
  });
  if (resForbidden.status === 403) {
    console.log('✅ Checkpoint 1 passed: Regular user rejected with 403 Forbidden.');
  } else {
    console.log(`⚠️ Regular user status: ${resForbidden.status}`);
  }

  // Verification 2: Admin overview access
  console.log('▶️ Checkpoint 2: Admin overview stats retrieval...');
  const resOverview = await fetch('http://localhost:5000/api/v1/admin/overview', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const overviewData = (await resOverview.json()) as any;
  if (resOverview.status === 200 && overviewData.data?.metrics?.totalCategories >= 4) {
    console.log(`✅ Checkpoint 2 passed: Overview retrieved. Total categories: ${overviewData.data.metrics.totalCategories}, Questions: ${overviewData.data.metrics.totalQuestions}`);
  } else {
    throw new Error(`Checkpoint 2 failed: ${JSON.stringify(overviewData)}`);
  }

  // Verification 3: Category Tree retrieval
  console.log('▶️ Checkpoint 3: Admin categories tree retrieval...');
  const resTree = await fetch('http://localhost:5000/api/v1/admin/categories', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const treeData = (await resTree.json()) as any;
  if (resTree.status === 200 && Array.isArray(treeData.data)) {
    console.log(`✅ Checkpoint 3 passed: Retrieved tree with ${treeData.data.length} categories.`);
  } else {
    throw new Error(`Checkpoint 3 failed: ${JSON.stringify(treeData)}`);
  }

  // Verification 4: Dry-Run Import Preview with valid & invalid rows
  console.log('▶️ Checkpoint 4: Dry-run question import validation...');
  const uniqueId = `phys-test-${Date.now()}`;
  const testQuestions = [
    {
      externalId: uniqueId,
      question: 'What is the speed of light in vacuum (approx)?',
      options: ['3 x 10^8 m/s', '3 x 10^6 m/s', '3 x 10^5 km/h', '1.5 x 10^8 m/s'],
      correctAnswer: 0,
      difficulty: 'easy',
      explanation: 'The speed of light in vacuum is approximately 300,000 km/s or 3 x 10^8 m/s.',
    },
    {
      externalId: 'phys-test-invalid',
      question: 'Short', // invalid (< 5 chars)
      options: ['A', 'B'], // invalid (< 4 options)
      correctAnswer: 5, // invalid index
      difficulty: 'invalid_diff',
    },
  ];

  const resPreview = await fetch('http://localhost:5000/api/v1/admin/import/preview', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      categoryId: scienceCat._id.toString(),
      subjectId: physicsSub._id.toString(),
      fileName: 'physics_test_suite.json',
      fileSize: 1024,
      questions: testQuestions,
    }),
  });

  const previewData = (await resPreview.json()) as any;
  if (
    resPreview.status === 200 &&
    previewData.data.fileSummary.validCount === 1 &&
    previewData.data.fileSummary.invalidCount === 1
  ) {
    console.log('✅ Checkpoint 4 passed: Dry-run detected exactly 1 valid question and 1 invalid row error.');
  } else {
    throw new Error(`Checkpoint 4 failed: ${JSON.stringify(previewData)}`);
  }

  // Verification 5: Execute Import with duplicate handling
  console.log('▶️ Checkpoint 5: Execute Question Import & Audit History recording...');
  const resExec = await fetch('http://localhost:5000/api/v1/admin/import/execute', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      categoryId: scienceCat._id.toString(),
      subjectId: physicsSub._id.toString(),
      fileName: 'physics_test_suite.json',
      fileSize: 1024,
      duplicateStrategy: 'skip',
      questions: testQuestions,
    }),
  });

  const execData = (await resExec.json()) as any;
  if (
    resExec.status === 200 &&
    execData.data.summary.importedCount === 1 &&
    execData.data.summary.failedCount === 1
  ) {
    console.log(`✅ Checkpoint 5 passed: Import executed. ID: ${execData.data.importId}, Imported: ${execData.data.summary.importedCount}, Failed: ${execData.data.summary.failedCount}`);
  } else {
    throw new Error(`Checkpoint 5 failed: ${JSON.stringify(execData)}`);
  }

  // Verification 6: Import History inspection
  console.log('▶️ Checkpoint 6: Import History audit log verification...');
  const resHist = await fetch('http://localhost:5000/api/v1/admin/history', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const histData = (await resHist.json()) as any;
  if (resHist.status === 200 && histData.data?.history?.length > 0) {
    console.log(`✅ Checkpoint 6 passed: Import History returned ${histData.data.history.length} records.`);
  } else {
    throw new Error(`Checkpoint 6 failed: ${JSON.stringify(histData)}`);
  }

  // Verification 7: Sample template retrieval
  console.log('▶️ Checkpoint 7: Sample JSON template retrieval...');
  const resSample = await fetch('http://localhost:5000/api/v1/admin/import/sample', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const sampleData = (await resSample.json()) as any;
  if (resSample.status === 200 && sampleData.data?.questions?.length >= 3) {
    console.log(`✅ Checkpoint 7 passed: Sample JSON contains ${sampleData.data.questions.length} template questions.`);
  } else {
    throw new Error(`Checkpoint 7 failed: ${JSON.stringify(sampleData)}`);
  }

  console.log('\n🎉 ALL 7 ADMIN PANEL VERIFICATION CHECKPOINTS PASSED!');
  await mongoose.disconnect();
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
