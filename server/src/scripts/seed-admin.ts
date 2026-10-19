import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';
import { UserModel } from '../modules/user/user.model.js';
import { hashPassword } from '../shared/utils/crypto-auth.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export async function seedAdminUser() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/codearena';
  await mongoose.connect(uri);

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@quizzy.com').trim().toLowerCase();
  const adminUsername = (process.env.ADMIN_USERNAME || 'quizzy_admin').trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';

  let user = await UserModel.findOne({
    $or: [{ email: adminEmail }, { username: adminUsername }],
  });

  if (user) {
    user.role = 'admin';
    user.displayName = user.displayName || 'QUIZZY Admin';
    user.passwordHash = await hashPassword(adminPassword);
    await user.save();
    console.log(`✅ Existing user updated to ADMIN: ${user.email} (${user.username})`);
  } else {
    user = await UserModel.create({
      email: adminEmail,
      username: adminUsername,
      displayName: 'QUIZZY Admin',
      passwordHash: await hashPassword(adminPassword),
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=quizzy_admin`,
      isGuest: false,
      role: 'admin',
    });
    console.log(`✅ Created new ADMIN user: ${adminEmail} (${adminUsername}) / password: ${adminPassword}`);
  }

  await mongoose.disconnect();
}

if (process.argv[1] && process.argv[1].endsWith('seed-admin.ts')) {
  seedAdminUser().catch((err) => {
    console.error('❌ Failed to seed admin:', err);
    process.exit(1);
  });
}
