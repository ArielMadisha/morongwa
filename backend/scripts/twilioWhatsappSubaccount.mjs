#!/usr/bin/env node
/**
 * Inspect and manage WhatsApp Channel Senders (Twilio Messaging v2 API).
 *
 * Usage (from backend/, with dotenv):
 *   node scripts/twilioWhatsappSubaccount.mjs list
 *   node scripts/twilioWhatsappSubaccount.mjs inspect parent|sub
 *   node scripts/twilioWhatsappSubaccount.mjs support-snippet
 *   node scripts/twilioWhatsappSubaccount.mjs try-register-sa
 *
 * try-register-sa: POSTs a new sender on the SUBACCOUNT using META_WHATSAPP_BUSINESS_ACCOUNT_ID
 * and TWILIO_WHATSAPP_FROM. This only succeeds if Meta allows the number on that WABA (often fails
 * until the number is released from the old WABA / parent account — use Twilio Support or Meta migration).
 */
import "dotenv/config";
import twilio from "twilio";

const WA = "whatsapp";

function clientFor(which) {
  if (which === "sub") {
    const sid = String(process.env.TWILIO_SUBACCOUNT_SID || "").trim();
    const token = String(process.env.TWILIO_SUBACCOUNT_AUTH_TOKEN || "").trim();
    if (!sid || !token) throw new Error("Missing TWILIO_SUBACCOUNT_SID / TWILIO_SUBACCOUNT_AUTH_TOKEN");
    return { label: "subaccount", client: twilio(sid, token), accountSid: sid };
  }
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!sid || !token) throw new Error("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN");
  return { label: "parent", client: twilio(sid, token), accountSid: sid };
}

async function listSenders(which) {
  const { label, client, accountSid } = clientFor(which);
  const rows = await client.messaging.v2.channelsSenders.list({ channel: WA, limit: 50 });
  console.log(`\n=== ${label} (${accountSid}) ===`);
  for (const r of rows) {
    const waba = r.configuration?.wabaId || r.configuration?.waba_id || "";
    const hook = r.webhook?.callbackUrl || r.webhook?.callback_url || "";
    console.log(
      `${r.senderId}  status=${r.status}  waba=${waba}  studioWebhook=${hook || "(none)"}`
    );
  }
  if (!rows.length) console.log("(no WhatsApp senders)");
}

async function inspect(which) {
  const { label, client, accountSid } = clientFor(which);
  const rows = await client.messaging.v2.channelsSenders.list({ channel: WA, limit: 50 });
  console.log(`\n=== ${label} (${accountSid}) full JSON ===`);
  for (const r of rows) {
    console.log(JSON.stringify(r.toJSON(), null, 2));
    console.log("---");
  }
}

async function supportSnippet() {
  const parentSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const subSid = String(process.env.TWILIO_SUBACCOUNT_SID || "").trim();
  const saDigits = String(process.env.TWILIO_WHATSAPP_FROM || "").replace(/\D/g, "");
  const bw = String(process.env.TWILIO_WHATSAPP_FROM_BW || "").replace(/\D/g, "");
  const destWaba = String(process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || "").trim();

  let sourceWaba = "";
  let sourceChannelsSenderSid = "";
  try {
    const { client } = clientFor("parent");
    const rows = await client.messaging.v2.channelsSenders.list({ channel: WA, limit: 50 });
    const hit = rows.find((r) => String(r.senderId || "").replace(/\D/g, "") === saDigits);
    if (hit) {
      sourceWaba = hit.configuration?.wabaId || hit.configuration?.waba_id || "";
      sourceChannelsSenderSid = hit.sid || "";
    }
  } catch {
    // ignore; template still useful
  }

  console.log(`
--- Copy for Twilio Support (WhatsApp sender migration) ---
Please migrate WhatsApp sender for +${saDigits || "(set TWILIO_WHATSAPP_FROM)"} from:
  - Twilio Account SID: ${parentSid || "(missing)"}
  - Source WABA ID: ${sourceWaba || "(run npm run twilio:whatsapp:list)"}
  - Channels Sender SID (if applicable): ${sourceChannelsSenderSid || "(from list)"}
To:
  - Twilio Subaccount SID: ${subSid || "(missing)"}
  - Destination WABA ID: ${destWaba || "(set META_WHATSAPP_BUSINESS_ACCOUNT_ID)"}

Botswana sender already on subaccount: +${bw || "267..."} should remain on the same WABA ${destWaba || "..."}.

Reference: https://www.twilio.com/docs/whatsapp/migrate-numbers-and-senders
Section: "Migrate WhatsApp senders from another Twilio account"

Also attach Meta Business verification if they request it.
-----------------------------------------------------------
`);
}

async function tryRegisterSa() {
  const waba = String(process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || "").trim();
  const raw = String(process.env.TWILIO_WHATSAPP_FROM || "").trim();
  if (!waba) throw new Error("Set META_WHATSAPP_BUSINESS_ACCOUNT_ID (destination WABA on subaccount)");
  if (!raw) throw new Error("Set TWILIO_WHATSAPP_FROM (+27 E.164)");
  const digits = raw.replace(/^whatsapp:/i, "").replace(/\D/g, "");
  const senderId = `whatsapp:+${digits}`;

  const { client, accountSid } = clientFor("sub");
  const body = {
    sender_id: senderId,
    configuration: {
      waba_id: waba,
      verification_method: "sms",
    },
    profile: {
      name: String(process.env.TWILIO_WA_REGISTER_DISPLAY_NAME || "Qwertymates").trim(),
      websites: [{ website: String(process.env.FRONTEND_URL || "https://www.qwertymates.com").replace(/\/$/, ""), label: "Website" }],
    },
  };

  console.log(`POST /v2/Channels/Senders on subaccount ${accountSid} with:\n`, JSON.stringify(body, null, 2));

  const https = await import("https");
  const tok = String(process.env.TWILIO_SUBACCOUNT_AUTH_TOKEN || "").trim();
  const payload = JSON.stringify(body);
  const auth = Buffer.from(`${accountSid}:${tok}`).toString("base64");

  await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "messaging.twilio.com",
        path: "/v2/Channels/Senders",
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          console.log(`HTTP ${res.statusCode}`, d);
          if (res.statusCode && res.statusCode >= 400) reject(new Error(d));
          else resolve(d);
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const cmd = String(process.argv[2] || "help").toLowerCase();
  if (cmd === "list") {
    await listSenders("parent");
    await listSenders("sub");
    return;
  }
  if (cmd === "inspect") {
    const which = String(process.argv[3] || "sub").toLowerCase();
    await inspect(which === "parent" ? "parent" : "sub");
    return;
  }
  if (cmd === "support-snippet") {
    await supportSnippet();
    return;
  }
  if (cmd === "try-register-sa") {
    await tryRegisterSa();
    return;
  }
  console.log(`Commands: list | inspect [parent|sub] | support-snippet | try-register-sa`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
