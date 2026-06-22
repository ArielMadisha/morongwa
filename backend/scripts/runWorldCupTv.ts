/**
 * Manual World Cup TV post run (@worldnews by default).
 *
 *   npm run world-cup:post
 *   npm run world-cup:post -- --dry-run
 *   npm run world-cup:post -- --live
 */

import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { publishWorldCupTvUpdates } from "../src/services/worldCupTvService";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIVE = args.includes("--live");

async function main() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();
  if (!mongoUri) throw new Error("MONGO_URI missing");
  await mongoose.connect(mongoUri);
  try {
    const result = await publishWorldCupTvUpdates({
      mode: LIVE ? "live" : "daily",
      dryRun: DRY_RUN,
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
