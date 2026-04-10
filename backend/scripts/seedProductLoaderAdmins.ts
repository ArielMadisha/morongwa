/**
 * Create six admin (non-superadmin) accounts for regional product loading.
 * Run from backend: npx ts-node scripts/seedProductLoaderAdmins.ts
 *
 * Credentials are printed once; store them securely. Re-run updates passwords if env vars set.
 *
 * Suffixes: cn×2 (China dropship), za (South Africa), zm (Zambia), bw (Botswana), sdc (SADC).
 */
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/data/models/User";
import Wallet from "../src/data/models/Wallet";

type LoaderDef = { username: string; name: string; email: string; region: string };

const LOADERS: LoaderDef[] = [
  { username: "loadchina1cn", name: "Product Loader China 1", email: "loader.china1@qwertymates.internal", region: "China dropshipping (all)" },
  { username: "loadchina2cn", name: "Product Loader China 2", email: "loader.china2@qwertymates.internal", region: "China dropshipping (all)" },
  { username: "loadsa1za", name: "Product Loader South Africa", email: "loader.za@qwertymates.internal", region: "South Africa" },
  { username: "loadzm1zm", name: "Product Loader Zambia", email: "loader.zm@qwertymates.internal", region: "Zambia" },
  { username: "loadbw1bw", name: "Product Loader Botswana", email: "loader.bw@qwertymates.internal", region: "Botswana" },
  { username: "loadsadc1sdc", name: "Product Loader SADC", email: "loader.sadc@qwertymates.internal", region: "SADC countries" },
];

function randomPassword(): string {
  return crypto.randomBytes(18).toString("base64url");
}

async function seed() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("❌ MONGO_URI (or MONGODB_URI) not set in .env");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("✅ Connected to MongoDB\n");

  const printed: Array<{ username: string; email: string; password: string; region: string }> = [];

  for (const def of LOADERS) {
    const password =
      process.env[`LOADER_PW_${def.username.toUpperCase()}`] ?? randomPassword();
    const passwordHash = await bcrypt.hash(password, 10);

    let user = await User.findOne({ $or: [{ email: def.email.toLowerCase() }, { username: def.username }] });

    if (user) {
      user.name = def.name;
      user.username = def.username;
      user.email = def.email.toLowerCase();
      user.passwordHash = passwordHash;
      if (!(user.role as string[]).includes("admin")) {
        (user.role as string[]) = [...new Set([...(user.role as string[]), "admin"])];
      }
      user.isVerified = true;
      user.active = true;
      user.suspended = false;
      await user.save();
      console.log("✅ Updated:", def.username);
    } else {
      user = await User.create({
        name: def.name,
        username: def.username,
        email: def.email.toLowerCase(),
        passwordHash,
        role: ["admin"],
        isVerified: true,
        active: true,
      });
      await Wallet.create({ user: user._id }).catch(() => {});
      console.log("✅ Created:", def.username);
    }

    printed.push({
      username: def.username,
      email: def.email.toLowerCase(),
      password,
      region: def.region,
    });
  }

  console.log("\n--- Loader accounts (role: admin, below superadmin) ---\n");
  for (const row of printed) {
    console.log(`${row.region}`);
    console.log(`  Username: ${row.username}`);
    console.log(`  Email:    ${row.email}`);
    console.log(`  Password: ${row.password}`);
    console.log("");
  }
  console.log("Set per-loader passwords via env LOADER_PW_LOADCHINA1CN, etc. (optional).\n");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
