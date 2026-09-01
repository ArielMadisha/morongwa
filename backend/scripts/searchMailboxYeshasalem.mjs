#!/usr/bin/env node
/**
 * Search IMAP for Yeshasalem / partnership / youth development proposal emails.
 * Writes hits under backend/exports/yeshasalem-email/
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const outDir = path.join(__dirname, "..", "exports", "yeshasalem-email");
const keywords = [
  "yeshasalem",
  "youth development",
  "district executive",
  "partnership",
  "project management committee",
  "pmc",
  "thauthau",
  "haramanuba",
  "qwertymates partnership",
  "management proposal",
  "tau skills",
];

function matches(text) {
  const t = String(text || "").toLowerCase();
  return keywords.some((k) => t.includes(k));
}

function fromAdmin(from) {
  return /administrator@qwertymates\.com/i.test(String(from || ""));
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
  const mailboxes = ["INBOX", "Sent", "Sent Items", "INBOX.Sent"];
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
        const subject = env.subject || "";
        const parsed = msg.source ? await simpleParser(msg.source) : null;
        const body = String(parsed?.text || parsed?.html || "");
        const blob = `${from}\n${to}\n${subject}\n${body}`;
        const adminHit = fromAdmin(from) || fromAdmin(to) || fromAdmin(parsed?.from?.text);
        if (!matches(blob) && !adminHit) continue;
        // Prefer proposal-related; still keep admin messages that match keywords
        if (!matches(`${subject}\n${body}`) && !matches(blob)) continue;

        const id = `${box.replace(/\W+/g, "_")}-${msg.uid}`;
        const folder = path.join(outDir, `uid-${id}`);
        fs.mkdirSync(folder, { recursive: true });
        const meta = {
          mailbox: box,
          uid: msg.uid,
          from,
          to,
          subject,
          date: env.date,
          attachmentCount: (parsed?.attachments || []).length,
        };
        fs.writeFileSync(path.join(folder, "meta.json"), JSON.stringify(meta, null, 2));
        fs.writeFileSync(
          path.join(folder, "body.txt"),
          String(parsed?.text || body || "").slice(0, 300000)
        );
        if (parsed?.html) {
          fs.writeFileSync(path.join(folder, "body.html"), String(parsed.html).slice(0, 500000));
        }
        for (const a of parsed?.attachments || []) {
          const name = String(a.filename || `att-${Date.now()}`).replace(/[^\w.\-]+/g, "_");
          fs.writeFileSync(path.join(folder, name), a.content);
        }
        hits.push({ ...meta, folder });
      }
    } finally {
      lock.release();
    }
  }

  await client.logout();
  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(hits, null, 2));
  console.log(`hits=${hits.length}`);
  for (const h of hits.slice(0, 40)) {
    console.log(`- [${h.date}] ${h.subject} | from=${h.from}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
