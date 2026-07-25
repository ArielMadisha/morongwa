/**
 * Place a short test PSTN call to verify geo permissions (hangs up after ~3s).
 * Run: node scripts/testVoicePstnDial.mjs +27821234567
 */
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const to = process.argv[2] || "+27815826899";
const from = String(process.env.TWILIO_VOICE_FROM || "").trim();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!from) {
    console.error("TWILIO_VOICE_FROM missing");
    process.exit(1);
  }
  console.log(`Test dial ${from} -> ${to} (auto hangup in 3s)`);
  const call = await client.calls.create({
    twiml: `<Response><Pause length="1"/><Say voice="alice">Morongwa voice test. Hanging up now.</Say><Hangup/></Response>`,
    to,
    from,
    timeout: 15,
  });
  console.log("Created:", call.sid, "status:", call.status);
  await sleep(4000);
  const updated = await client.calls(call.sid).fetch();
  console.log("After 4s:", updated.status, "duration:", updated.duration);
  if (updated.status === "failed") {
    console.error("FAIL — PSTN leg still failing. Check Twilio console.");
    process.exit(1);
  }
  console.log("PASS — call reached Twilio (status:", updated.status + ")");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
