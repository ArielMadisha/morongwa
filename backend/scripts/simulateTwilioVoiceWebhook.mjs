/**
 * POST to production voice TwiML with a valid Twilio signature (local .env auth token).
 * Run: node scripts/simulateTwilioVoiceWebhook.mjs [callId]
 */
import dotenv from "dotenv";
import twilio from "twilio";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const apiBase = String(process.env.BACKEND_URL || "").replace(/\/$/, "");
const auth = process.env.TWILIO_AUTH_TOKEN || "";
const mongo = process.env.MONGO_URI || "";

async function main() {
  if (!apiBase || !auth) {
    console.error("Need BACKEND_URL and TWILIO_AUTH_TOKEN in .env");
    process.exit(1);
  }

  await mongoose.connect(mongo);
  await import("../dist/src/data/models/VoiceCall.js");
  const VoiceCall = mongoose.models.VoiceCall;
  const callIdArg = process.argv[2];
  const call = callIdArg
    ? await VoiceCall.findById(callIdArg).lean()
    : await VoiceCall.findOne({ mode: "client" }).sort({ createdAt: -1 }).lean();

  if (!call) {
    console.error("No voice call found");
    process.exit(1);
  }

  const userId = String(call.user);
  const url = `${apiBase}/api/voice/twiml/client-outbound`;
  const params = {
    CallSid: `CA_sim_${Date.now()}`,
    From: `client:user-${userId}`,
    To: `+${call.destinationPhone}`,
    CallId: String(call._id),
  };
  const signature = twilio.getExpectedTwilioSignature(auth, url, params);
  const body = new URLSearchParams(params).toString();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": signature,
    },
    body,
  });
  const text = await res.text();
  console.log("URL:", url);
  console.log("Status:", res.status);
  console.log("Body:", text.slice(0, 500));
  const ok = res.status === 200 && text.includes("<Dial") && !text.includes("<Hangup");
  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
