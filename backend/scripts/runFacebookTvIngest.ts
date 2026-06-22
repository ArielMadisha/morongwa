/**
 * Manual Facebook Page → QwertyTV ingest (one slot or all).
 *
 *   npm run facebook-tv:ingest -- --page=DumaFM
 *   npm run facebook-tv:ingest -- --all
 */

import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { FACEBOOK_TV_INGEST_SLOTS } from "../src/config/facebookTvIngest";
import { runFacebookTvIngestForSlot } from "../src/services/facebookTvIngestService";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const ALL = args.includes("--all");

function argValue(prefix: string): string | undefined {
  const hit = args.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  return hit.slice(prefix.length).trim() || undefined;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  const page = argValue("--page=");
  const BOT_ID = argValue("--bot=")?.toLowerCase();
  let slots = ALL ? [...FACEBOOK_TV_INGEST_SLOTS] : [];
  if (page) {
    slots = FACEBOOK_TV_INGEST_SLOTS.filter((s) => s.pageSlug.toLowerCase() === page.toLowerCase());
  }
  if (BOT_ID) {
    slots = slots.filter((s) => s.botId === BOT_ID);
    if (!slots.length && !page && !ALL) {
      slots = FACEBOOK_TV_INGEST_SLOTS.filter((s) => s.botId === BOT_ID);
    }
  }

  if (!slots.length) {
    console.error("Usage: --page=PageSlug | --all | --bot=sports|education|business");
    process.exit(1);
  }

  for (const slot of slots) {
    console.log(`\n==> ${slot.pageLabel} (${slot.pageSlug})`);
    const result = await runFacebookTvIngestForSlot(slot);
    console.log(JSON.stringify(result, null, 2));
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
