// Database connection configuration
import mongoose from "mongoose";
import dns from "node:dns";

const DEFAULT_MONGO_DNS_SERVERS = ["8.8.8.8", "1.1.1.1"];

function configureSrvDnsIfNeeded(mongoUri: string) {
  if (!mongoUri.startsWith("mongodb+srv://")) return;

  const configuredFromEnv = (process.env.MONGO_DNS_SERVERS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const servers = configuredFromEnv.length ? configuredFromEnv : DEFAULT_MONGO_DNS_SERVERS;

  try {
    dns.setServers(servers);
    console.log(`Using DNS servers for MongoDB SRV lookup: ${servers.join(", ")}`);
  } catch (err) {
    console.warn("Failed to configure custom DNS servers for MongoDB SRV lookup.", err);
  }
}

export const connectDB = async (): Promise<void> => {
  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/morongwa";
  configureSrvDnsIfNeeded(mongoUri);
  await mongoose.connect(mongoUri, {
    autoIndex: true,
    maxPoolSize: 10,
  });
  console.log("✅ MongoDB connected successfully");
};

/** 1 = connected. Use to gate API when DB is down. */
export const isDbConnected = (): boolean => mongoose.connection.readyState === 1;
