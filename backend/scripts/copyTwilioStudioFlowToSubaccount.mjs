#!/usr/bin/env node
/**
 * Copy a Twilio Studio **v2** flow *definition* from the parent account to the WhatsApp subaccount.
 *
 * Why: SA (+27) may stay on the parent Twilio account while BW (+267) uses the subaccount. Each account
 * has its own Studio flows, but both can call the **same** HTTPS endpoints (your API / web app).
 * This script keeps the subaccount flow identical to the parent flow (e.g. after you edit the parent in Console).
 *
 * Env (backend/.env):
 *   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN     — source (parent)
 *   TWILIO_SUBACCOUNT_SID / TWILIO_SUBACCOUNT_AUTH_TOKEN — destination
 *   TWILIO_STUDIO_FLOW_COPY_FROM — source Flow SID on parent (e.g. FW… used by +27)
 *   TWILIO_STUDIO_FLOW_COPY_TO   — destination Flow SID on subaccount (e.g. FW… for +267)
 *
 * Optional:
 *   --save-template  Also write definition to src/integrations/zweppe-mochina-flow/twilio-flow-v2.template.json
 *
 * Usage:
 *   node scripts/copyTwilioStudioFlowToSubaccount.mjs
 *   node scripts/copyTwilioStudioFlowToSubaccount.mjs FW_source_parent FW_dest_subaccount
 */
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import twilio from "twilio";

const saveTemplate = process.argv.includes("--save-template");

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const argvFrom = args[0];
  const argvTo = args[1];
  const srcSid = String(
    argvFrom ||
      process.env.TWILIO_STUDIO_FLOW_COPY_FROM ||
      process.env.TWILIO_STUDIO_FLOW_SID ||
      ""
  ).trim();
  const dstSid = String(
    argvTo ||
      process.env.TWILIO_STUDIO_FLOW_COPY_TO ||
      process.env.TWILIO_STUDIO_FLOW_SID_BW ||
      ""
  ).trim();
  if (!srcSid || !dstSid) {
    throw new Error(
      "Set TWILIO_STUDIO_FLOW_COPY_FROM + TWILIO_STUDIO_FLOW_COPY_TO, or TWILIO_STUDIO_FLOW_SID (parent SA) + TWILIO_STUDIO_FLOW_SID_BW (Botswana subaccount)"
    );
  }

  const parentSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const parentTok = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const subSid = String(process.env.TWILIO_SUBACCOUNT_SID || "").trim();
  const subTok = String(process.env.TWILIO_SUBACCOUNT_AUTH_TOKEN || "").trim();
  if (!parentSid || !parentTok) throw new Error("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN");
  if (!subSid || !subTok) throw new Error("Missing TWILIO_SUBACCOUNT_SID / TWILIO_SUBACCOUNT_AUTH_TOKEN");

  const parentClient = twilio(parentSid, parentTok);
  const subClient = twilio(subSid, subTok);

  console.log(`Fetching definition from parent flow ${srcSid}…`);
  const sourceFlow = await parentClient.studio.v2.flows(srcSid).fetch();
  const definition = sourceFlow.definition;
  if (definition == null || (typeof definition === "object" && Object.keys(definition).length === 0)) {
    throw new Error("Source flow has no definition in API response; check Flow SID and Studio v2.");
  }

  if (saveTemplate) {
    const templatePath = path.resolve(
      process.cwd(),
      "src",
      "integrations",
      "zweppe-mochina-flow",
      "twilio-flow-v2.template.json"
    );
    const pretty = JSON.stringify(definition, null, 2);
    await fs.writeFile(templatePath, pretty, "utf8");
    console.log(`Wrote template: ${templatePath}`);
  }

  const definitionStr = typeof definition === "string" ? definition : JSON.stringify(definition);

  console.log(`Publishing to subaccount flow ${dstSid}…`);
  await subClient.studio.v2.flows(dstSid).update({ status: "draft", definition: definitionStr });
  const published = await subClient.studio.v2.flows(dstSid).update({ status: "published", definition: definitionStr });

  console.log("Done.");
  console.log(`  Destination SID: ${published.sid}`);
  console.log(`  Status: ${published.status}`);
  console.log("");
  console.log("Attach this flow to the Botswana sender in Twilio Console (subaccount) if not already.");
  console.log("Next: npm run deploy:twilio-flow && npm run twilio:whatsapp:wire-bw-studio");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
