import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import { connectDatabase } from '../config/database.js';
import { authService } from '../modules/auth/auth.service.js';
import { UserModel } from '../modules/user/user.model.js';
import { hashPassword } from '../shared/utils/crypto-auth.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function runPhase3Verification() {
  console.log('====================================================');
  console.log('🧪 QUIZZY Phase 3 Verification: HD-006 & HD-010');
  console.log('====================================================\n');

  await connectDatabase();

  try {
    // -------------------------------------------------------------------------
    // 1. HD-006: Verify Guest Login API Client & Static Code Inspection
    // -------------------------------------------------------------------------
    console.log('▶️ [HD-006] Inspecting PlayAsGuestModal for Centralized API Client...');
    const modalPath = path.resolve(process.cwd(), '../client/features/auth/components/PlayAsGuestModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf8');

    // Check no localhost:5000 or process.env.NEXT_PUBLIC_API_URL remains in modal
    if (modalContent.includes('http://localhost:5000') || modalContent.includes('NEXT_PUBLIC_API_URL')) {
      throw new Error('PlayAsGuestModal still contains hardcoded API URL or direct process.env access!');
    }
    if (!modalContent.includes('useApiClient')) {
      throw new Error('PlayAsGuestModal does not import or use useApiClient!');
    }
    if (modalContent.includes('fetch(')) {
      throw new Error('PlayAsGuestModal still invokes raw fetch instead of centralized api.post!');
    }
    console.log('  PlayAsGuestModal strictly uses useApiClient.post without hardcoded URLs ✅');

    // Verify backend guest login contract
    console.log('▶️ [HD-006] Testing Guest Session Creation & Payload Contract...');
    const guestSession = await authService.createGuestSession('Phase3Tester');
    if (!guestSession.token || !guestSession.user) {
      throw new Error('createGuestSession failed to return token and user');
    }
    if (guestSession.user.displayName !== 'Phase3Tester') {
      throw new Error(`Expected displayName 'Phase3Tester', got '${guestSession.user.displayName}'`);
    }
    if (guestSession.user.isGuest !== true || guestSession.user.role !== 'guest') {
      throw new Error(`Expected guest role, got '${guestSession.user.role}'`);
    }
    console.log(`  Guest session verified: User ${guestSession.user.username} (${guestSession.user.displayName}) ✅`);

    // Verify guest token verification
    const verifiedGuest = authService.verifyGuestToken(guestSession.token);
    if (!verifiedGuest || verifiedGuest.role !== 'guest') {
      throw new Error('Guest token verification failed');
    }
    console.log('  Guest token cryptographically verified with unexpired TTL ✅\n');

    // -------------------------------------------------------------------------
    // 2. HD-010: Edge Proxy Protection Verification (/admin and nested routes)
    // -------------------------------------------------------------------------
    console.log('▶️ [HD-010] Inspecting client/proxy.ts for /admin in PROTECTED_PREFIXES...');
    const proxyPath = path.resolve(process.cwd(), '../client/proxy.ts');
    const proxyContent = fs.readFileSync(proxyPath, 'utf8');

    if (!proxyContent.includes('"/admin"') && !proxyContent.includes("'/admin'")) {
      throw new Error('client/proxy.ts does not include "/admin" in PROTECTED_PREFIXES!');
    }
    console.log('  client/proxy.ts verified: "/admin" is explicitly included in PROTECTED_PREFIXES ✅');

    // -------------------------------------------------------------------------
    // 3. HD-010: Backend Authoritative Security Boundary (/api/v1/admin/*)
    // -------------------------------------------------------------------------
    console.log('▶️ [HD-010] Testing Backend Authoritative Security Boundary on Admin API Endpoints...');

    // Setup Test Admin and Normal User in database
    const adminEmail = 'phase3_admin@quizzy.com';
    let adminUser = await UserModel.findOne({ email: adminEmail });
    if (!adminUser) {
      adminUser = await UserModel.create({
        email: adminEmail,
        username: 'phase3_admin',
        displayName: 'Phase 3 Admin',
        passwordHash: await hashPassword('admin123456'),
        role: 'admin',
        isGuest: false,
      });
    } else {
      adminUser.role = 'admin';
      await adminUser.save();
    }

    const normalEmail = 'phase3_normal@quizzy.com';
    let normalUser = await UserModel.findOne({ email: normalEmail });
    if (!normalUser) {
      normalUser = await UserModel.create({
        email: normalEmail,
        username: 'phase3_normal',
        displayName: 'Phase 3 Normal User',
        passwordHash: await hashPassword('user123456'),
        role: 'user',
        isGuest: false,
      });
    }

    const adminLogin = await authService.login({ emailOrUsername: adminEmail, password: 'admin123456' });
    const normalLogin = await authService.login({ emailOrUsername: normalEmail, password: 'user123456' });

    const adminToken = adminLogin.accessToken;
    const normalToken = normalLogin.accessToken;
    const guestToken = guestSession.token;

    // 3a. Unauthenticated API request -> 401 Unauthorized
    const resApiNoAuth = await fetch('http://localhost:5000/api/v1/admin/overview');
    if (resApiNoAuth.status !== 401) {
      throw new Error(`Expected 401 Unauthorized for unauthenticated API access, got ${resApiNoAuth.status}`);
    }
    console.log('  Unauthenticated API request to /api/v1/admin/overview rejected with 401 Unauthorized ✅');

    // 3b. Guest user API request -> 403 Forbidden (Admin clearance required)
    const resApiGuest = await fetch('http://localhost:5000/api/v1/admin/overview', {
      headers: { Authorization: `Bearer ${guestToken}` },
    });
    if (resApiGuest.status !== 403) {
      throw new Error(`Expected 403 Forbidden for guest user on admin API, got ${resApiGuest.status}`);
    }
    console.log('  Guest user API request to /api/v1/admin/overview rejected with 403 Forbidden ✅');

    // 3c. Regular user API request -> 403 Forbidden
    const resApiNormal = await fetch('http://localhost:5000/api/v1/admin/overview', {
      headers: { Authorization: `Bearer ${normalToken}` },
    });
    if (resApiNormal.status !== 403) {
      throw new Error(`Expected 403 Forbidden for normal user on admin API, got ${resApiNormal.status}`);
    }
    console.log('  Regular registered user API request to /api/v1/admin/overview rejected with 403 Forbidden ✅');

    // 3d. Admin user API request -> 200 OK
    const resApiAdmin = await fetch('http://localhost:5000/api/v1/admin/overview', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (resApiAdmin.status !== 200) {
      throw new Error(`Expected 200 OK for authorized admin on /api/v1/admin/overview, got ${resApiAdmin.status}`);
    }
    const overviewJson = (await resApiAdmin.json()) as any;
    if (!overviewJson.success || !overviewJson.data?.metrics) {
      throw new Error(`Admin overview response missing metrics: ${JSON.stringify(overviewJson)}`);
    }
    console.log(`  Authorized admin successfully retrieved overview metrics (${overviewJson.data.metrics.totalCategories} categories, ${overviewJson.data.metrics.totalQuestions} questions) ✅`);

    // 3e. Nested admin endpoint (/api/v1/admin/categories)
    const resTreeAdmin = await fetch('http://localhost:5000/api/v1/admin/categories', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (resTreeAdmin.status !== 200) {
      throw new Error(`Expected 200 OK on /api/v1/admin/categories for admin, got ${resTreeAdmin.status}`);
    }
    console.log('  Nested admin endpoint /api/v1/admin/categories accessible to admin ✅');

    // Clean up test guest user in DB
    await UserModel.deleteOne({ username: guestSession.user.username });

    console.log('\n====================================================');
    console.log('🎉 ALL PHASE 3 AUDIT VERIFICATIONS PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
  } finally {
    await mongoose.connection.close();
  }
}

runPhase3Verification().catch((err) => {
  console.error('❌ Phase 3 verification failed:', err);
  process.exit(1);
});
