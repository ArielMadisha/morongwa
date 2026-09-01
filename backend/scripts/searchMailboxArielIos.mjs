#!/usr/bin/env node
/**
 * One-shot IMAP search for ariel@vodamail.co.za (iOS / App Store).
 * Writes hits under backend/exports/ariel-ios-email/
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const outDir = path.join(__dirname, "..", "exports", "ariel-ios-email");
const senderRe = /ariel@vodamail\.co\.za/i;
const topicRe =
  /ios|app store|app review|rejection|rejected|att\b|tracking|privacy|qwertymates|acbpay|app store connect/i;

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
  const mailboxes = ["INBOX", "Sent", "Sent Items", "INBOX.Sent", "Junk", "Spam", "INBOX.Junk"];
  const hits = [];

  for (const box of mailboxes) {
    let lock;
    try {
      lock = await client.getMailboxLock(box);
    } catch {
      console.log(`skip mailbox ${box}`);
      continue;
    }
    try {
      const since = new Date(Date.now() - 180 * 24 * 3600 * 1000);
      for await (const msg of client.fetch(
        { since },
        { uid: true, envelope: true, source: true }
      )) {
        const env = msg.envelope || {};
        const from = (env.from || [])
          .map((a) => `${a.name || ""} <${a.address || ""}>`)
          .join(", ");
        const to = (env.to || []).map((a) => a.address || "").join(", ");
        const cc = (env.cc || []).map((a) => a.address || "").join(", ");
        const subject = env.subject || "";
        const parsed = msg.source ? await simpleParser(msg.source) : null;
        const body = String(parsed?.text || parsed?.html || "");
        const blob = `${from}\n${to}\n${cc}\n${subject}\n${body}`;
        if (!senderRe.test(blob) && !senderRe.test(String(parsed?.from?.text || ""))) continue;

        const id = `${box.replace(/[^\w]+/g, "_")}-uid-${msg.uid}`;
        const folder = path.join(outDir, id);
        fs.mkdirSync(folder, { recursive: true });
        const meta = {
          mailbox: box,
          uid: msg.uid,
          from,
          to,
          cc,
          subject,
          date: env.date,
          topicHit: topicRe.test(`${subject}\n${body}`),
          attachmentCount: (parsed?.attachments || []).length,
          attachments: (parsed?.attachments || []).map((a) => a.filename || ""),
        };
        fs.writeFileSync(path.join(folder, "meta.json"), JSON.stringify(meta, null, 2));
        fs.writeFileSync(
          path.join(folder, "body.txt"),
          String(parsed?.text || body || "").slice(0, 200000)
        );
        if (parsed?.html) {
          fs.writeFileSync(path.join(folder, "body.html"), String(parsed.html).slice(0, 400000));
        }
        hits.push({ ...meta, folder });
        console.log(
          `HIT box=${box} uid=${msg.uid} date=${env.date} subject=${subject} topic=${meta.topicHit}`
        );
      }
    } finally {
      lock.release();
    }
  }

  await client.logout();
  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify({ hits }, null, 2));
  console.log(`Done. hits=${hits.length} out=${outDir}`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
