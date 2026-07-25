/** Fetch recent Twilio voice calls for debugging. Run from backend/: node scripts/listTwilioVoiceCalls.mjs */
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function main() {
  const calls = await client.calls.list({ limit: 10 });
  console.log("Recent Twilio calls:");
  for (const c of calls) {
    console.log(
      `${c.dateCreated?.toISOString?.() || c.dateCreated} | ${c.status} | ${c.duration}s | ${c.from} -> ${c.to} | ${c.sid}`
    );
    if (c.status === "failed" || c.status === "no-answer") {
      console.log(`  direction=${c.direction} answeredBy=${c.answeredBy || "-"} price=${c.price}`);
    }
  }
}

main().catch(console.error);
