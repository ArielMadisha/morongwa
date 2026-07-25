#!/usr/bin/env node
/**
 * Search IMAP mailbox for call-to-phone / telephony provider emails.
 * Defaults to agent@ credentials from .env; override with IMAP_USER/IMAP_PASS.
 *
 *   node scripts/searchMailboxCallToPhone.mjs
 *   node scripts/searchMailboxCallToPhone.mjs --mailbox=business@qwertymates.com
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const outDir = path.join(__dirname, "..", "exports", "call-to-phone-email");
const keywords = [
  "call to phone",
  "call-to-phone",
  "pstn",
  "voice sdk",
  "webrtc",
  "sip",
  "twilio",
  "vonage",
  "telnyx",
  "infobip",
  "outbound call",
  "phone call",
  "click to call",
];

function matches(text) {
  const t = String(text || "").toLowerCase();
  return keywords.some((k) => t.includes(k));
}

async function main() {
  const user = String(process.env.IMAP_USER || "").trim();
  const pass = String(process.env.IMAP_PASS || "").trim();
  if (!user || !pass) throw new Error("IMAP_USER/IMAP_PASS required");

  fs.mkdirSync(outDir, { recursive: true });
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || "mail.qwertymates.com",
    port: parseInt(process.env.IMAP_PORT || "993", 10),
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  const hits = [];
  try {
    // Search recent mail (last 60 days) or all if small
    const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
    for await (const msg of client.fetch(
      { since },
      { uid: true, envelope: true, source: true }
    )) {
      const env = msg.envelope || {};
      const from = (env.from || [])
        .map((a) => `${a.name || ""} <${a.address || ""}>`)
        .join(", ");
      const subject = env.subject || "";
      const parsed = msg.source ? await simpleParser(msg.source) : null;
      const body = parsed?.text || parsed?.html || "";
      const blob = `${from}\n${subject}\n${body}`;
      const fromBiz =
        /business@qwertymates\.com/i.test(from) ||
        /business@qwertymates\.com/i.test(String(parsed?.from?.text || ""));
      if (!fromBiz && !matches(blob)) continue;
      if (!matches(blob) && !fromBiz) continue;

      // Prefer business@ or keyword hits
      if (!fromBiz && !matches(`${subject}\n${body}`)) continue;

      const id = String(msg.uid);
      const folder = path.join(outDir, `uid-${id}`);
      fs.mkdirSync(folder, { recursive: true });
      const meta = {
        uid: msg.uid,
        from,
        to: (env.to || []).map((a) => a.address).filter(Boolean),
        subject,
        date: env.date,
        attachmentCount: (parsed?.attachments || []).length,
      };
      fs.writeFileSync(path.join(folder, "meta.json"), JSON.stringify(meta, null, 2));
      fs.writeFileSync(path.join(folder, "body.txt"), String(parsed?.text || body || "").slice(0, 200000));
      if (parsed?.html) fs.writeFileSync(path.join(folder, "body.html"), String(parsed.html).slice(0, 400000));
      for (const a of parsed?.attachments || []) {
        const name = String(a.filename || `att-${Date.now()}`).replace(/[^\w.\-]+/g, "_");
        fs.writeFileSync(path.join(folder, name), a.content);
      }
      hits.push({ ...meta, folder });
      console.log(`HIT uid=${msg.uid} from=${from} subject=${subject}`);
    }
  } finally {
    lock.release();
  }
  await client.logout();
  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify({ hits }, null, 2));
  console.log(`Done. hits=${hits.length} out=${outDir}`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
