import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import twilio from "twilio";

async function main() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in environment");
  }

  const templatePath = path.resolve(
    process.cwd(),
    "src",
    "integrations",
    "zweppe-mochina-flow",
    "twilio-flow-v2.template.json"
  );
  const raw = await fs.readFile(templatePath, "utf8");
  const definition = JSON.parse(raw);
  const definitionStr = JSON.stringify(definition);

  const client = twilio(sid, token);
  const existingSid = String(process.env.TWILIO_STUDIO_FLOW_SID || "").trim();

  if (existingSid) {
    await client.studio.v2.flows(existingSid).update({
      status: "draft",
      definition: definitionStr,
    });
    const published = await client.studio.v2.flows(existingSid).update({
      status: "published",
    });
    console.log("Updated existing Twilio Flow (in place):");
    console.log(`SID: ${published.sid}`);
    console.log(`FriendlyName: ${published.friendlyName}`);
    console.log(`Status: ${published.status}`);
    return;
  }

  const friendlyName = `Morongwa WhatsApp Flow v2 ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;

  const flow = await client.studio.v2.flows.create({
    friendlyName,
    status: "draft",
    definition: definitionStr,
  });

  console.log("Created NEW Twilio Flow (not wired to WhatsApp until you attach it):");
  console.log(`SID: ${flow.sid}`);
  console.log(`FriendlyName: ${flow.friendlyName}`);
  console.log(`Status: ${flow.status}`);
  console.log("");
  console.log("To avoid orphan flows next time, set in .env:");
  console.log(`TWILIO_STUDIO_FLOW_SID=${flow.sid}`);
  console.log("Then re-run this script to update the same flow.");
}

main().catch((err) => {
  console.error("Failed to push Twilio Flow:", err?.message || err);
  process.exit(1);
});
