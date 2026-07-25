/**
 * Enable Twilio Voice geo permissions for Morongwa PSTN destinations.
 * Run from backend/: npm run voice:enable-geo
 */
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const ISO_CODES = ["ZA", "BW", "LS", "NA", "SZ", "ZW", "ZM", "MZ"];

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function main() {
  const updates = ISO_CODES.map((iso_code) => ({
    iso_code,
    low_risk_numbers_enabled: true,
    high_risk_special_numbers_enabled: false,
    high_risk_tollfraud_numbers_enabled: false,
  }));

  console.log("Enabling low-risk voice dialing for:", ISO_CODES.join(", "));
  const result = await client.voice.v1.dialingPermissions.bulkCountryUpdates.create({
    updateRequest: JSON.stringify(updates),
  });
  console.log("Bulk update count:", result.updateCount);

  for (const iso of ISO_CODES) {
    const c = await client.voice.v1.dialingPermissions.countries(iso).fetch();
    console.log(`${iso}: lowRisk=${c.lowRiskNumbersEnabled}`);
  }
  console.log("Done. PSTN calls to Southern Africa should now connect.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
