/**
 * Smoke: phone E.164 normalization + optional live OTP health.
 * Run: node scripts/smokePhoneOtp.mjs
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/src/utils/phoneE164.js");

const { canonicalPhoneDigits, formatPhoneE164 } = require(dist);

const cases = [
  ["+27 82 123 4567", "27821234567"],
  ["082 123 4567", "27821234567"],
  ["+267 71 234 567", "26771234567"],
  ["71234567", "26771234567"],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = canonicalPhoneDigits(input);
  const e164 = formatPhoneE164(input);
  const ok = got === expected;
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${JSON.stringify(input)} => ${got} (expected ${expected}) e164=${e164}`);
  } else {
    console.log(`OK   ${JSON.stringify(input)} => +${got}`);
  }
}

const base = process.env.PROBE_API_BASE || "https://api.qwertymates.com/api";
const health = await fetch(`${base}/auth/otp-health`).then((r) => r.json());
console.log("otp-health:", JSON.stringify(health.data || health, null, 2));

if (failed > 0) {
  console.error(`${failed} normalization case(s) failed`);
  process.exit(1);
}
console.log("smokePhoneOtp passed");
