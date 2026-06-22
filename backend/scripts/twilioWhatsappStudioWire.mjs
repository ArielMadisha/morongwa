import https from "https";

export function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}

export function studioFlowWebhookUrl(accountSid, flowSid) {
  return `https://webhooks.twilio.com/v1/Accounts/${accountSid}/Flows/${flowSid}`;
}

export async function updateChannelsSenderWebhook({
  accountSid,
  authToken,
  senderResourceSid,
  flowSid,
  label,
}) {
  const acc = String(accountSid || "").trim();
  const tok = String(authToken || "").trim();
  const sid = String(senderResourceSid || "").trim();
  const fw = String(flowSid || "").trim();
  if (!acc || !tok || !sid || !fw) {
    throw new Error(`Missing webhook wire params for ${label || sid}`);
  }

  const studioUrl = studioFlowWebhookUrl(acc, fw);
  const body = JSON.stringify({
    webhook: {
      callback_url: studioUrl,
      callback_method: "POST",
    },
  });

  await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "messaging.twilio.com",
        path: `/v2/Channels/Senders/${sid}`,
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${acc}:${tok}`).toString("base64")}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} ${d}`));
            return;
          }
          resolve(d);
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  return studioUrl;
}

/**
 * Pick the Studio flow SID for an ONLINE WhatsApp sender after publish.
 * Prefer the flow just published on this Twilio account; env pins apply only when they match that account.
 */
export function pickFlowSidForSender(sender, publishedFlowSids = []) {
  const digits = digitsOnly(sender?.senderId);
  const published = publishedFlowSids.filter(Boolean);
  const publishedSet = new Set(published);

  const envSid = digits.startsWith("267")
    ? String(process.env.TWILIO_STUDIO_FLOW_SID_BW || "").trim()
    : digits.startsWith("27")
      ? String(process.env.TWILIO_STUDIO_FLOW_SID || "").trim()
      : "";

  if (envSid && publishedSet.has(envSid)) return envSid;
  if (published[0]) return published[0];
  return envSid;
}

/** Ensure each ONLINE WhatsApp sender on this account points at the correct published Studio flow. */
export async function ensureOnlineWhatsappSendersWired({
  client,
  accountSid,
  authToken,
  accountLabel,
  publishedFlowSids,
}) {
  const acc = String(accountSid || "").trim();
  const tok = String(authToken || "").trim();
  if (!client || !acc || !tok) return { wired: 0, skipped: 0, failed: [] };

  const senders = await client.messaging.v2.channelsSenders.list({ channel: "whatsapp", limit: 50 });
  let wired = 0;
  let skipped = 0;
  const failed = [];

  for (const sender of senders) {
    if (String(sender.status || "").toUpperCase() !== "ONLINE") {
      skipped += 1;
      continue;
    }

    const flowSid = pickFlowSidForSender(sender, publishedFlowSids);
    if (!flowSid) {
      skipped += 1;
      continue;
    }

    const wantUrl = studioFlowWebhookUrl(acc, flowSid);
    const current = String(sender.webhook?.callbackUrl || sender.webhook?.callback_url || "").trim();
    if (current === wantUrl) {
      console.log(`WhatsApp sender OK (${accountLabel}): ${sender.senderId} → ${flowSid}`);
      skipped += 1;
      continue;
    }

    try {
      await updateChannelsSenderWebhook({
        accountSid: acc,
        authToken: tok,
        senderResourceSid: sender.sid,
        flowSid,
        label: `${accountLabel}:${sender.senderId}`,
      });
      console.log(`Wired WhatsApp sender (${accountLabel}): ${sender.senderId} → ${flowSid}`);
      wired += 1;
    } catch (err) {
      failed.push({
        senderId: sender.senderId,
        flowSid,
        error: String(err?.message || err),
      });
    }
  }

  return { wired, skipped, failed };
}
