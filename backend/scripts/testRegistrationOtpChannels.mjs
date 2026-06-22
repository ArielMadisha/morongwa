/**
 * Test registration OTP for both SMS and WhatsApp channels.
 * Usage:
 *   node scripts/testRegistrationOtpChannels.mjs
 *   PROBE_PHONE=0815826899 node scripts/testRegistrationOtpChannels.mjs
 *   PROBE_PHONE=+27820425737 PROBE_CHANNELS=sms,whatsapp node scripts/testRegistrationOtpChannels.mjs
 */
const base = process.env.PROBE_API_BASE || "https://api.qwertymates.com/api";

async function sendOtp(phone, channel) {
  const res = await fetch(`${base}/auth/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, channel }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const health = await fetch(`${base}/auth/otp-health`).then((r) => r.json());
  console.log("=== OTP health ===");
  console.log(JSON.stringify(health, null, 2));

  const phone = process.env.PROBE_PHONE;
  if (!phone) {
    console.log("\nSet PROBE_PHONE to run live send tests (e.g. PROBE_PHONE=0712345678).");
    return;
  }

  const channels = (process.env.PROBE_CHANNELS || "sms,whatsapp")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  console.log(`\n=== Live send tests for ${phone} ===`);
  for (const channel of channels) {
    console.log(`\n--- channel: ${channel} ---`);
    const result = await sendOtp(phone, channel);
    console.log(`HTTP ${result.status}:`, JSON.stringify(result.body, null, 2));
    if (channels.length > 1 && channel !== channels[channels.length - 1]) {
      const waitMs = Number(process.env.PROBE_WAIT_MS || 3000);
      console.log(`(waiting ${waitMs}ms before next channel…)`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
