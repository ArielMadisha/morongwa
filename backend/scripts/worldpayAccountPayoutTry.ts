/**
 * Run a single Account Payout against Worldpay Try (or Live if WORLDPAY_ACCESS_MODE=live).
 *
 * Setup:
 *   1. Copy backend/scripts/worldpay-payout-payload.example.json → worldpay-payout-payload.json
 *   2. Fill .env (see backend/.env.production.example Worldpay section)
 *   3. From backend/: npx ts-node scripts/worldpayAccountPayoutTry.ts [path-to-json]
 *
 * Do not commit worldpay-payout-payload.json or real credentials.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  getWorldpayAccountPayoutConfig,
  isWorldpayAccountPayoutReady,
  postSingleAccountPayout,
  WORLDPAY_PHASE1_COUNTRIES,
} from "../src/services/worldpayAccountPayoutService";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const jsonPath =
    process.argv[2] || path.join(__dirname, "worldpay-payout-payload.json");
  if (!fs.existsSync(jsonPath)) {
    console.error("Missing payload file:", jsonPath);
    console.error("Copy scripts/worldpay-payout-payload.example.json and edit, or pass a path.");
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, "utf8");
  const body = JSON.parse(raw) as Record<string, unknown>;
  delete body._comment;

  const cfg = getWorldpayAccountPayoutConfig();
  console.log("Mode:", cfg.mode, "Base:", cfg.baseUrl, "WP-Api-Version:", cfg.wpApiVersion);
  if (!isWorldpayAccountPayoutReady()) {
    console.error("Worldpay Account Payouts not ready. Check WORLDPAY_* env vars.");
    process.exit(1);
  }

  const cc = String(body.countryCode || "").toUpperCase();
  if (cc && !WORLDPAY_PHASE1_COUNTRIES.includes(cc as (typeof WORLDPAY_PHASE1_COUNTRIES)[number])) {
    console.warn("Note: countryCode", cc, "is outside phase-1 list", [...WORLDPAY_PHASE1_COUNTRIES].join(", "));
  }

  const result = await postSingleAccountPayout(body);
  console.log("HTTP", result.status);
  console.log(JSON.stringify(result.data, null, 2));
  if (result.status >= 400) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
