/**
 * Probe registration OTP send (no real SMS unless PROBE_PHONE is set).
 * Usage: node scripts/probeSendOtp.mjs
 *   PROBE_PHONE=+27821234567 PROBE_CHANNEL=sms node scripts/probeSendOtp.mjs
 */
const base = process.env.PROBE_API_BASE || "https://api.qwertymates.com/api";

async function main() {
  const health = await fetch(`${base}/auth/otp-health`).then((r) => r.json());
  console.log("otp-health:", JSON.stringify(health, null, 2));

  const phone = process.env.PROBE_PHONE;
  if (!phone) {
    console.log("Set PROBE_PHONE to test a live send.");
    return;
  }
  const channel = process.env.PROBE_CHANNEL || "sms";
  const res = await fetch(`${base}/auth/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, channel }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`send-otp ${res.status}:`, JSON.stringify(body, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
