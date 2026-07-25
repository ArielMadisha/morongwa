/**
 * One-shot Twilio voice pricing sync (same job as the API scheduler).
 * Run from backend/: npm run voice:sync-pricing
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const DESTINATIONS = {
  ZA: { name: "South Africa", mobile: "+27821234567", landline: "+27111234567" },
  BW: { name: "Botswana", mobile: "+26771234567", landline: "+2673912345" },
  LS: { name: "Lesotho", mobile: "+26650123456", landline: "+26622312345" },
  NA: { name: "Namibia", mobile: "+264811234567", landline: "+26461234567" },
  SZ: { name: "Eswatini", mobile: "+26876123456", landline: "+26824041234" },
  ZW: { name: "Zimbabwe", mobile: "+263771234567", landline: "+263242123456" },
  ZM: { name: "Zambia", mobile: "+260971234567", landline: "+260211234567" },
  MZ: { name: "Mozambique", mobile: "+258841234567", landline: "+258211234567" },
};

const sid = process.env.TWILIO_ACCOUNT_SID;
const tok = process.env.TWILIO_AUTH_TOKEN;
const from = String(process.env.TWILIO_VOICE_FROM || process.env.TWILIO_SMS_FROM || "").trim();
if (!sid || !tok) {
  console.error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN required");
  process.exit(1);
}
const auth = Buffer.from(`${sid}:${tok}`).toString("base64");

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) return null;
  return res.json();
}

function perMin(json) {
  const prices = json?.outbound_call_prices || [];
  const mins = prices.map((p) => Number(p.current_price ?? p.base_price)).filter((n) => n > 0);
  if (!mins.length) return null;
  return { min: Math.min(...mins), max: Math.max(...mins), currency: json?.price_unit || "USD" };
}

async function priceNumber(dest) {
  const q = from ? `?OriginationNumber=${encodeURIComponent(from)}` : "";
  return fetchJson(`https://pricing.twilio.com/v2/Voice/Numbers/${encodeURIComponent(dest)}${q}`);
}

const samples = [];
for (const [iso, info] of Object.entries(DESTINATIONS)) {
  const mob = await priceNumber(info.mobile);
  const land = await priceNumber(info.landline);
  samples.push({ iso, country: info.name, twilioMobile: perMin(mob), twilioLandline: perMin(land) });
}

const countries = [];
let uri = "https://pricing.twilio.com/v2/Voice/Countries?PageSize=100";
while (uri) {
  const data = await fetchJson(uri);
  if (!data) break;
  for (const c of data.countries || []) {
    const detail = await fetchJson(`https://pricing.twilio.com/v2/Voice/Countries/${c.iso_country}`);
    if (!detail) continue;
    const prefixes = detail.outbound_prefix_prices || [];
    const prices = prefixes.map((p) => Number(p.current_price ?? p.base_price)).filter((n) => n > 0);
    countries.push({
      iso: detail.iso_country,
      country: detail.country,
      currency: detail.price_unit || "USD",
      minPerMin: prices.length ? Math.min(...prices) : null,
      maxPerMin: prices.length ? Math.max(...prices) : null,
    });
  }
  uri = data.meta?.next_page_url || null;
}
countries.sort((a, b) => String(a.country).localeCompare(String(b.country)));

const payload = {
  generatedAt: new Date().toISOString(),
  twilioOriginationNumber: from || null,
  twilioPriceUnit: "USD",
  twilioPricingSource: "Twilio Pricing API v2 (account-specific, auto-sync)",
  geoEnabledIso: ["ZA", "BW", "LS", "NA", "SZ", "ZW", "ZM", "MZ"],
  morongwaUserCharges: {
    currency: "ZAR",
    connectFeeZar: Number(process.env.VOICE_CONNECT_FEE_ZAR ?? 0.35),
    minWalletBalanceZar: Number(process.env.VOICE_MIN_WALLET_BALANCE_ZAR ?? 5),
    ratesPerMinuteZar: {
      ZA: { mobile: 0.89, landline: 0.69 },
      BW: { mobile: 1.15, landline: 1.15 },
      LS: { mobile: 1.25, landline: 1.25 },
      NA: { mobile: 1.25, landline: 1.25 },
      SZ: { mobile: 1.2, landline: 1.25 },
      ZW: { mobile: 1.35, landline: 1.35 },
      ZM: { mobile: 1.35, landline: 1.35 },
      MZ: { mobile: 1.45, landline: 1.45 },
      INT: { mobile: 2.95, landline: 2.95 },
    },
  },
  twilioSampleMobileLandlinePerMinuteUsd: samples,
  twilioAllCountriesPrefixRangeUsd: countries,
};

const exportsDir = path.join(__dirname, "..", "exports");
fs.mkdirSync(exportsDir, { recursive: true });
const latest = path.join(exportsDir, "twilio-voice-pricing-latest.json");
const charges = path.join(exportsDir, "morongwa-twilio-voice-charges.json");
fs.writeFileSync(latest, JSON.stringify(payload, null, 2));
fs.writeFileSync(charges, JSON.stringify(payload, null, 2));
console.log(`OK: wrote ${latest} (${countries.length} countries)`);
