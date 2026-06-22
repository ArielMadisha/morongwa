import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import twilio from "twilio";
import { ensureOnlineWhatsappSendersWired } from "./twilioWhatsappStudioWire.mjs";

/**
 * Publish Studio v2 flow definition from twilio-flow-v2.template.json.
 *
 * Safe default:
 * - auto-discovers WhatsApp sender webhook flow SIDs on available Twilio accounts
 * - publishes the template to ALL discovered active flow SIDs
 * - also honors explicit TWILIO_STUDIO_FLOW_SID / TWILIO_STUDIO_FLOW_SID_BW when set
 */
function studioPublishClient() {
  const explicitSid = String(process.env.TWILIO_STUDIO_PUBLISH_ACCOUNT_SID || "").trim();
  const explicitTok = String(process.env.TWILIO_STUDIO_PUBLISH_AUTH_TOKEN || "").trim();
  if (explicitSid && explicitTok) {
    return { client: twilio(explicitSid, explicitTok), accountSid: explicitSid, label: "explicit" };
  }

  const useSub = String(process.env.TWILIO_STUDIO_PUBLISH_USE_SUBACCOUNT || "").trim() === "1";
  if (useSub) {
    const subSid = String(process.env.TWILIO_WA_ACCOUNT_SID || process.env.TWILIO_SUBACCOUNT_SID || "").trim();
    const subTok = String(process.env.TWILIO_SUBACCOUNT_AUTH_TOKEN || "").trim();
    if (subSid && subTok) {
      return { client: twilio(subSid, subTok), accountSid: subSid, label: "subaccount" };
    }
    throw new Error(
      "TWILIO_STUDIO_PUBLISH_USE_SUBACCOUNT=1 but missing TWILIO_WA_ACCOUNT_SID (or TWILIO_SUBACCOUNT_SID) / TWILIO_SUBACCOUNT_AUTH_TOKEN"
    );
  }

  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!sid || !token) {
    throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN (or set TWILIO_STUDIO_PUBLISH_USE_SUBACCOUNT=1 for subaccount flows)");
  }
  return { client: twilio(sid, token), accountSid: sid, label: "parent" };
}

async function publishFlowDefinition(client, flowSid, definitionStr, label) {
  const sid = String(flowSid || "").trim();
  if (!sid) return null;
  await client.studio.v2.flows(sid).update({
    status: "draft",
    definition: definitionStr,
  });
  const published = await client.studio.v2.flows(sid).update({
    status: "published",
  });
  console.log(`Updated Twilio Flow (${label}):`);
  console.log(`  SID: ${published.sid}`);
  console.log(`  FriendlyName: ${published.friendlyName}`);
  console.log(`  Status: ${published.status}`);
  return published;
}

function parseFlowSidFromWebhook(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  const m = s.match(/\/Flows\/(FW[A-Za-z0-9]{32})/i);
  return m?.[1] || "";
}

async function discoverFlowSidsFromWhatsappSenders(client, accountLabel) {
  const rows = await client.messaging.v2.channelsSenders.list({ channel: "whatsapp", limit: 100 });
  const sids = new Set();
  for (const sender of rows) {
    const callbackUrl = sender.webhook?.callbackUrl || sender.webhook?.callback_url || "";
    const sid = parseFlowSidFromWebhook(callbackUrl);
    if (sid) sids.add(sid);
  }
  if (sids.size > 0) {
    console.log(`Discovered ${sids.size} WhatsApp flow SID(s) from ${accountLabel} sender webhooks.`);
  }
  return sids;
}

async function assignExplicitSidToOwningAccount(flowSid, accountTargets) {
  const sid = String(flowSid || "").trim();
  if (!sid) return;
  for (const [accountSid, target] of accountTargets.entries()) {
    try {
      await target.client.studio.v2.flows(sid).fetch();
      target.flowSids.add(sid);
      return;
    } catch {
      // try next account
    }
  }
  const fallback = accountTargets.values().next().value;
  fallback.flowSids.add(sid);
  console.warn(`Could not verify account owner for explicit flow ${sid}; attached to fallback publish target.`);
}

async function main() {
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

  const parentSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const parentToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const subSid = String(process.env.TWILIO_WA_ACCOUNT_SID || process.env.TWILIO_SUBACCOUNT_SID || "").trim();
  const subToken = String(process.env.TWILIO_SUBACCOUNT_AUTH_TOKEN || "").trim();

  const accountTargets = new Map();
  if (parentSid && parentToken) {
    accountTargets.set(parentSid, {
      client: twilio(parentSid, parentToken),
      label: "parent",
      flowSids: new Set(),
    });
  }
  if (subSid && subToken) {
    accountTargets.set(subSid, {
      client: twilio(subSid, subToken),
      label: "subaccount",
      flowSids: new Set(),
    });
  }

  if (accountTargets.size === 0) {
    const fallback = studioPublishClient();
    accountTargets.set(fallback.accountSid, {
      client: fallback.client,
      label: fallback.label,
      flowSids: new Set(),
    });
  }

  // Explicit env targets remain supported.
  const rsaSid = String(process.env.TWILIO_STUDIO_FLOW_SID || "").trim();
  const bwSid = String(process.env.TWILIO_STUDIO_FLOW_SID_BW || "").trim();
  if (rsaSid) await assignExplicitSidToOwningAccount(rsaSid, accountTargets);
  if (bwSid) await assignExplicitSidToOwningAccount(bwSid, accountTargets);

  // Auto-discover currently wired WhatsApp sender flows so newly added numbers are included.
  for (const target of accountTargets.values()) {
    const discovered = await discoverFlowSidsFromWhatsappSenders(target.client, target.label);
    for (const sid of discovered) target.flowSids.add(sid);
  }

  let publishedCount = 0;
  const failedTargets = [];
  const publishedByAccount = new Map();
  for (const [accSid, target] of accountTargets.entries()) {
    if (!publishedByAccount.has(accSid)) publishedByAccount.set(accSid, []);
    for (const flowSid of target.flowSids) {
      try {
        await publishFlowDefinition(
          target.client,
          flowSid,
          definitionStr,
          `WhatsApp ${target.label} (${accSid})`
        );
        publishedCount += 1;
        publishedByAccount.get(accSid).push(flowSid);
      } catch (err) {
        failedTargets.push({
          accountSid: accSid,
          label: target.label,
          flowSid,
          error: String(err?.message || err),
        });
      }
    }
  }

  if (publishedCount > 0) {
    console.log("\nVerifying WhatsApp sender Studio webhooks (RSA + Botswana)…");
    for (const [accSid, target] of accountTargets.entries()) {
      const publishedFlowSids = publishedByAccount.get(accSid) || [];
      if (!publishedFlowSids.length) continue;
      const authToken =
        accSid === String(process.env.TWILIO_ACCOUNT_SID || "").trim()
          ? String(process.env.TWILIO_AUTH_TOKEN || "").trim()
          : accSid === String(process.env.TWILIO_SUBACCOUNT_SID || "").trim()
            ? String(process.env.TWILIO_SUBACCOUNT_AUTH_TOKEN || "").trim()
            : accSid === String(process.env.TWILIO_WA_ACCOUNT_SID || "").trim()
              ? String(process.env.TWILIO_WA_AUTH_TOKEN || process.env.TWILIO_SUBACCOUNT_AUTH_TOKEN || "").trim()
              : "";
      const wire = await ensureOnlineWhatsappSendersWired({
        client: target.client,
        accountSid: accSid,
        authToken,
        accountLabel: target.label,
        publishedFlowSids,
      });
      if (wire.failed.length) {
        console.warn(`Webhook wire warnings (${target.label}):`);
        for (const f of wire.failed) {
          console.warn(`  - ${f.senderId} → ${f.flowSid}: ${f.error}`);
        }
      }
    }

    if (failedTargets.length) {
      console.warn("Some flow targets failed publish:");
      for (const f of failedTargets) {
        console.warn(`  - ${f.label} ${f.accountSid} ${f.flowSid}: ${f.error}`);
      }
    }
    console.log(`Published template to ${publishedCount} flow(s) across ${accountTargets.size} account target(s).`);
    return;
  }

  if (failedTargets.length) {
    console.error("All Twilio flow publish attempts failed:");
    for (const f of failedTargets) {
      console.error(`  - ${f.label} ${f.accountSid} ${f.flowSid}: ${f.error}`);
    }
  }

  const fallback = studioPublishClient();
  const friendlyName = `Morongwa WhatsApp Flow v2 ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
  const flow = await fallback.client.studio.v2.flows.create({
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
  if (!bwSid) {
    console.log("If a second WhatsApp flow exists, set TWILIO_STUDIO_FLOW_SID_BW=");
  }
  if (!subSid || !subToken) {
    console.log("For subaccount auto-publish add: TWILIO_SUBACCOUNT_SID and TWILIO_SUBACCOUNT_AUTH_TOKEN");
  }
}

main().catch((err) => {
  const message = String(err?.message || err || "unknown");
  if (message.includes("was not found")) {
    console.error("Failed to push Twilio Flow: a configured/discovered Flow SID was not found on that account.");
    console.error("Tip: run `node scripts/twilioWhatsappSubaccount.mjs list` and update sender webhook Flow SIDs.");
  } else {
    console.error("Failed to push Twilio Flow:", message);
  }
  process.exit(1);
});
