/** Inspect a Twilio call SID for: node scripts/inspectTwilioCall.mjs CAxxxx */
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const sid = process.argv[2] || "CAb3a3b56daa4f2e73383442751c48be8c";
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function main() {
  const c = await client.calls(sid).fetch();
  console.log(JSON.stringify(c, null, 2));

  const events = await client.calls(sid).events.list({ limit: 20 });
  console.log("\nEvents:");
  for (const e of events) {
    console.log(`  ${e.request?.dateCreated || ""} ${e.name || ""} ${JSON.stringify(e.response || {})}`);
  }

  // Geo permissions
  const perms = await client.voice.v1.dialingPermissions.countries("ZA").fetch();
  console.log("\nZA dialing permission:", JSON.stringify(perms, null, 2));
}

main().catch(console.error);
