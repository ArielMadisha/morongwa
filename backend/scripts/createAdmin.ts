// Script to create admin or superadmin users
// Run with: npx ts-node scripts/createAdmin.ts

import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import readline from "readline";
import User from "../src/data/models/User";
import Wallet from "../src/data/models/Wallet";

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

const createAdmin = async () => {
  try {
    // Connect to database
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/morongwa";
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    console.log("\n🔐 Create Admin/SuperAdmin Account\n");

    // Get user input
    const name = await question("Enter admin name: ");
    const email = await question("Enter admin email: ");
    const password = await question("Enter admin password: ");
    const roleInput = await question("Enter role (admin/superadmin) [default: admin]: ");
    
    const role = roleInput.toLowerCase() === "superadmin" ? "superadmin" : "admin";

    // Validate email
    if (!email.includes("@")) {
      console.error("❌ Invalid email format");
      process.exit(1);
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.error("❌ User with this email already exists");
      process.exit(1);
    }

    // Validate password strength
    if (password.length < 8) {
      console.error("❌ Password must be at least 8 characters long");
      process.exit(1);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      isVerified: true, // Auto-verify admin accounts
      active: true,
    });

    // Create wallet for admin
    await Wallet.create({ user: user._id });

    console.log("\n✅ Admin account created successfully!");
    console.log(`\nDetails:`);
    console.log(`- Name: ${user.name}`);
    console.log(`- Email: ${user.email}`);
    console.log(`- Role: ${user.role}`);
    console.log(`- ID: ${user._id}`);
    console.log(`\nYou can now login with these credentials.`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating admin:", error);
    process.exit(1);
  } finally {
    rl.close();
  }
};

createAdmin();
