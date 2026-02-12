// Database connection configuration
import mongoose from "mongoose";

export const connectDB = async (): Promise<void> => {
  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/morongwa";
  await mongoose.connect(mongoUri, {
    autoIndex: true,
    maxPoolSize: 10,
  });
  console.log("✅ MongoDB connected successfully");
};

/** 1 = connected. Use to gate API when DB is down. */
export const isDbConnected = (): boolean => mongoose.connection.readyState === 1;
