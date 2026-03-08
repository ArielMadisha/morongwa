/**
 * Seed SuperAdmin account
 * Run: npx ts-node scripts/seedSuperAdmin.ts
 *
 * Credentials:
 *   Email: superadmin@qwertymates.com
 *   Username: superadmin
 *   Password: gtSFKT2F6ndYy9Gpers_yo1wKDk
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/data/models/User";
import Wallet from "../src/data/models/Wallet";

dotenv.config();

const SUPERADMIN_EMAIL = "superadmin@qwertymates.com";
const SUPERADMIN_USERNAME = "superadmin";
const SUPERADMIN_NAME = "SuperAdmin";
const SUPERADMIN_PASSWORD = "gtSFKT2F6ndYy9Gpers_yo1wKDk";

async function seedSuperAdmin() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/morongwa";
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    const existing = await User.findOne({
      $or: [{ email: SUPERADMIN_EMAIL }, { username: SUPERADMIN_USERNAME }],
    });

    if (existing) {
      console.log("\n⚠️ SuperAdmin already exists:");
      console.log(`   Email: ${existing.email}`);
      console.log(`   Role: ${existing.role}`);
      process.exit(0);
      return;
    }

    const passwordHash = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);
    const user = await User.create({
      name: SUPERADMIN_NAME,
      email: SUPERADMIN_EMAIL,
      username: SUPERADMIN_USERNAME,
      passwordHash,
      role: ["superadmin"],
      isVerified: true,
      active: true,
    });

    await Wallet.create({ user: user._id });

    console.log("\n✅ SuperAdmin created successfully!");
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Username: ${(user as any).username}`);
    console.log(`   Role: superadmin`);
    console.log(`   Login with: ${SUPERADMIN_EMAIL} or ${SUPERADMIN_USERNAME}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

seedSuperAdmin();
