// Database connection configuration
import mongoose from "mongoose";

export const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/morongwa";

    await mongoose.connect(mongoUri, {
      autoIndex: true,
      maxPoolSize: 10,
    });

    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
};
