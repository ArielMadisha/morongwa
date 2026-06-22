#!/usr/bin/env node
/**
 * Point a WhatsApp Channel Sender (Messaging v2) at a Studio Flow webhook on the **same** Twilio account.
 *
 * Studio "Connected phone numbers" in Console often stays empty for WhatsApp; inbound still works if
 * the sender's callback_url is https://webhooks.twilio.com/v1/Accounts/{AccountSid}/Flows/{FlowSid}
 *
 * Env:
 *   TWILIO_SUBACCOUNT_SID or TWILIO_WA_ACCOUNT_SID / TWILIO_SUBACCOUNT_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM_BW — E.164 digits to find the sender (e.g. +26775184537)
 *   TWILIO_STUDIO_FLOW_SID_BW — Botswana flow on subaccount (preferred)
 *   TWILIO_STUDIO_FLOW_SID — fallback only when BW env unset
 *
 * Usage: node scripts/wireWhatsappSenderStudioWebhook.mjs
 */
import "dotenv/config";
import twilio from "twilio";
import {
  digitsOnly,
  ensureOnlineWhatsappSendersWired,
  updateChannelsSenderWebhook,
} from "./twilioWhatsappStudioWire.mjs";

async function main() {
  const acc = String(process.env.TWILIO_WA_ACCOUNT_SID || process.env.TWILIO_SUBACCOUNT_SID || "").trim();
  const tok = String(process.env.TWILIO_SUBACCOUNT_AUTH_TOKEN || "").trim();
  const flowSid = String(
    process.env.TWILIO_STUDIO_FLOW_SID_BW || process.env.TWILIO_STUDIO_FLOW_SID || ""
  ).trim();
  const bwRaw = String(process.env.TWILIO_WHATSAPP_FROM_BW || "").trim();
  const wantDigits = digitsOnly(bwRaw);
  if (!acc || !tok || !flowSid || wantDigits.length < 10) {
    throw new Error(
      "Need TWILIO_SUBACCOUNT_SID (or TWILIO_WA_ACCOUNT_SID), TWILIO_SUBACCOUNT_AUTH_TOKEN, TWILIO_STUDIO_FLOW_SID_BW, TWILIO_WHATSAPP_FROM_BW"
    );
  }

  const client = twilio(acc, tok);
  const senders = await client.messaging.v2.channelsSenders.list({ channel: "whatsapp", limit: 50 });
  const hit = senders.find((r) => digitsOnly(r.senderId) === wantDigits);
  if (!hit?.sid) {
    throw new Error(`No WhatsApp sender found on subaccount matching digits ${wantDigits}`);
  }

  const studioUrl = await updateChannelsSenderWebhook({
    accountSid: acc,
    authToken: tok,
    senderResourceSid: hit.sid,
    flowSid,
    label: `BW ${hit.senderId}`,
  });

  console.log(`Sender ${hit.senderId} (${hit.sid}) → ${studioUrl}`);

  const summary = await ensureOnlineWhatsappSendersWired({
    client,
    accountSid: acc,
    authToken: tok,
    accountLabel: "subaccount",
    publishedFlowSids: [flowSid],
  });
  console.log(`Done. Wired=${summary.wired} already_ok=${summary.skipped}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
