/**
 * Ensures Twilio TwiML Application points at Morongwa Voice SDK outbound URL.
 * Run from backend/: node scripts/provisionTwilioVoiceApp.mjs
 *
 * Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, BACKEND_URL
 * Optional: TWILIO_VOICE_APPLICATION_SID (updates existing) — else creates new app and prints SID to add to .env
 */
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
const apiBase = String(process.env.BACKEND_URL || process.env.API_PUBLIC_URL || "").replace(/\/$/, "");
const existingSid = String(process.env.TWILIO_VOICE_APPLICATION_SID || "").trim();

if (!accountSid || !authToken) {
  console.error("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN");
  process.exit(1);
}
if (!apiBase) {
  console.error("Missing BACKEND_URL (e.g. https://api.qwertymates.com)");
  process.exit(1);
}

const voiceUrl = `${apiBase}/api/voice/twiml/client-outbound`;
const statusUrl = `${apiBase}/api/voice/webhook/status`;

const client = twilio(accountSid, authToken);

async function main() {
  if (existingSid) {
    const app = await client.applications(existingSid).update({
      friendlyName: "Qwertymates Morongwa Voice SDK",
      voiceUrl,
      voiceMethod: "POST",
      statusCallback: statusUrl,
      statusCallbackMethod: "POST",
    });
    console.log("Updated TwiML Application:", app.sid);
    console.log("voiceUrl:", app.voiceUrl);
    return;
  }

  const app = await client.applications.create({
    friendlyName: "Qwertymates Morongwa Voice SDK",
    voiceUrl,
    voiceMethod: "POST",
    statusCallback: statusUrl,
    statusCallbackMethod: "POST",
  });
  console.log("Created TwiML Application:", app.sid);
  console.log("Add to production .env:");
  console.log(`TWILIO_VOICE_APPLICATION_SID=${app.sid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
