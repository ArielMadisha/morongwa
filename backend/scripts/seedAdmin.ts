// Seed the default admin account
// Run from backend: npx ts-node scripts/seedAdmin.ts
// Or: node --loader ts-node/esm scripts/seedAdmin.ts

import dotenv from "dotenv";
import path from "path";

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/data/models/User";
import Wallet from "../src/data/models/Wallet";

// Prefer env so secrets are never committed. Local fallback for dev only.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@morongwa.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "081276@Am";
const ADMIN_NAME = process.env.ADMIN_NAME ?? "Admin";
const ADMIN_EMAIL = "admin@morongwa.com";
const ADMIN_PASSWORD = "";
const ADMIN_NAME = "Admin";

async function seedAdmin() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error("❌ MONGO_URI not set in .env");
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    const email = ADMIN_EMAIL.toLowerCase();
    let user = await User.findOne({ email });

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    if (user) {
      user.passwordHash = passwordHash;
      if (!(user.role as string[]).includes("admin")) {
        (user.role as string[]) = [...(user.role as string[]), "admin"];
      }
      user.isVerified = true;
      user.active = true;
      user.suspended = false;
      await user.save();
      console.log("✅ Admin account updated:", user.email);
    } else {
      user = await User.create({
        name: ADMIN_NAME,
        email,
        passwordHash,
        role: ["admin"],
        isVerified: true,
        active: true,
      });
      const existingWallet = await Wallet.findOne({ user: user._id });
      if (!existingWallet) {
        await Wallet.create({ user: user._id });
      }
      console.log("✅ Admin account created:", user.email);
    }

    console.log("\nAdmin login:");
    console.log("  Email:", ADMIN_EMAIL);
    console.log("  Password: (from ADMIN_PASSWORD in .env or default local)");
    console.log("\nSign in at: http://localhost:3001/admin");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

seedAdmin();
