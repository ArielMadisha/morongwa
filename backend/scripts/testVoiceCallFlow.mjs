/**
 * Voice call flow smoke test — run from backend/: node scripts/testVoiceCallFlow.mjs
 * Checks env, token, TwiML generation, and recent call records.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import twilio from "twilio";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const {
  voiceClientConfigured,
  voiceEnabled,
  quoteVoiceMinuteRateZar,
} = await import("../dist/src/config/voiceRates.js");
const {
  clientIdentityForUser,
  createClientAccessToken,
  twimlForClientOutbound,
  userIdFromClientIdentity,
} = await import("../dist/src/services/twilioVoiceService.js");

function ok(label, pass, detail = "") {
  const mark = pass ? "PASS" : "FAIL";
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

async function main() {
  let allPass = true;
  const fail = (label, detail) => {
    allPass = ok(label, false, detail) && allPass;
  };
  const pass = (label, detail) => {
    ok(label, true, detail);
  };

  pass("voiceEnabled", String(voiceEnabled()));
  pass("voiceClientConfigured", String(voiceClientConfigured()));

  const from = String(process.env.TWILIO_VOICE_FROM || process.env.TWILIO_SMS_FROM || "").trim();
  if (!from) fail("TWILIO_VOICE_FROM", "missing — PSTN dial will fail");
  else pass("TWILIO_VOICE_FROM", from.replace(/\d(?=\d{4})/g, "*"));

  const apiBase = String(process.env.BACKEND_URL || "").replace(/\/$/, "");
  if (!apiBase) fail("BACKEND_URL", "missing");
  else pass("BACKEND_URL", apiBase);

  const appSid = String(process.env.TWILIO_VOICE_APPLICATION_SID || "");
  if (!appSid) fail("TWILIO_VOICE_APPLICATION_SID", "missing");
  else pass("TWILIO_VOICE_APPLICATION_SID", appSid);

  const mongo = String(process.env.MONGO_URI || "");
  if (!mongo) {
    fail("MONGO_URI", "missing — skip DB tests");
  } else {
    await mongoose.connect(mongo);
    pass("MongoDB", "connected");

    await import("../dist/src/data/models/VoiceCall.js");
    const VoiceCall = mongoose.models.VoiceCall;
    if (!VoiceCall?.find) {
      fail("VoiceCall model", "not registered");
    } else {
      const recent = await VoiceCall.find({ mode: "client" })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean();
      console.log("\nRecent client voice calls:");
      for (const c of recent) {
        console.log(
          `  ${c._id} | ${c.status} | +${c.destinationPhone} | ${c.durationSec}s | billed R${c.billedAmountZar ?? 0} | ${c.errorMessage || "-"}`
        );
      }

      const sample = recent.find((c) => c.status !== "completed" || c.durationSec === 0) || recent[0];
      if (sample) {
        const userId = String(sample.user);
        const identity = clientIdentityForUser(userId);
        const token = createClientAccessToken(userId);
        pass("Access token", token ? "generated" : "null");

        const twimlParams = {
          CallId: String(sample._id),
          To: `+${sample.destinationPhone}`,
          From: `client:${identity}`,
          CallSid: "CA_test_smoke_" + Date.now(),
        };
        const xml = await twimlForClientOutbound(twimlParams);
        const hasDial = xml.includes("<Dial") && xml.includes(`+${sample.destinationPhone}`);
        const hasHangup = xml.includes("<Hangup");
        const hasSay = xml.includes("<Say");
        if (hasDial && !hasHangup) pass("TwiML dial XML", "contains Dial to destination");
        else fail("TwiML dial XML", hasSay ? "returned Say+Hangup (auth/validation error)" : xml.slice(0, 200));

        const uid = userIdFromClientIdentity(identity);
        pass("Identity parse", uid === userId ? "ok" : `expected ${userId} got ${uid}`);
      }
    }

    await mongoose.disconnect();
  }

  // Twilio signature URL must match BACKEND_URL + path (proxy-safe)
  const testUrl = `${apiBase}/api/voice/twiml/client-outbound`;
  const auth = process.env.TWILIO_AUTH_TOKEN || "";
  if (auth && apiBase) {
    const params = { CallSid: "CA_sig_test", From: "client:user-test", To: "+27820000000", CallId: "test" };
    const sig = twilio.getExpectedTwilioSignature(auth, testUrl, params);
    const valid = twilio.validateRequest(auth, sig, testUrl, params);
    pass("Signature round-trip (BACKEND_URL)", String(valid));
  }

  console.log(allPass ? "\nAll checks passed." : "\nSome checks FAILED — fix before live calls.");
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
