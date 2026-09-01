#!/usr/bin/env node
/**
 * Search IMAP for NquBator / pitch-deck emails from owner inboxes.
 * Writes hits under backend/exports/nqubator-pitch-email/
 *
 * From backend/: node scripts/searchMailboxPitchDeck.mjs
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const outDir = path.join(__dirname, "..", "exports", "nqubator-pitch-email");
const senderRe = /ariel@vodamail\.co\.za|administrator@qwertymates\.com|tshipla3@gmail\.com/i;
const topicRe =
  /nqubator|nqbator|pitch\s*deck|pitchdeck|investor|accelerator|12[\s-]*slide|funding ask|join the qwerty revolution/i;

function blobPeople(from, to, cc, subject) {
  return senderRe.test(`${from}\n${to}\n${cc}\n${subject}`);
}

async function searchAccount({ host, port, user, pass, label }) {
  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });
  await client.connect();
  const mailboxes = ["INBOX", "Sent", "Sent Items", "INBOX.Sent", "Junk", "Spam", "INBOX.Junk"];
  const hits = [];
  const since = new Date(Date.now() - 180 * 24 * 3600 * 1000);

  for (const box of mailboxes) {
    let lock;
    try {
      lock = await client.getMailboxLock(box);
    } catch {
      console.log(`[${label}] skip mailbox ${box}`);
      continue;
    }
    try {
      const candidates = [];
      for await (const msg of client.fetch({ since }, { uid: true, envelope: true })) {
        const env = msg.envelope || {};
        const from = (env.from || []).map((a) => `${a.name || ""} <${a.address || ""}>`).join(", ");
        const to = (env.to || []).map((a) => a.address || "").join(", ");
        const cc = (env.cc || []).map((a) => a.address || "").join(", ");
        const subject = env.subject || "";
        const people = blobPeople(from, to, cc, subject);
        const topic = topicRe.test(subject);
        if (topic || (people && /pitch|nqubator|nqbator|deck|investor|accelerator|slide|qwertymates/i.test(subject))) {
          candidates.push({ uid: msg.uid, from, to, cc, subject, date: env.date });
        }
      }

      if (!candidates.length) continue;
      const uids = candidates.map((c) => c.uid);
      const byUid = new Map(candidates.map((c) => [c.uid, c]));
      for await (const msg of client.fetch({ uid: uids.join(",") }, { uid: true, source: true, envelope: true })) {
        const env = msg.envelope || {};
        const meta0 = byUid.get(msg.uid) || {};
        const from = meta0.from || (env.from || []).map((a) => `${a.name || ""} <${a.address || ""}>`).join(", ");
        const to = meta0.to || (env.to || []).map((a) => a.address || "").join(", ");
        const cc = meta0.cc || (env.cc || []).map((a) => a.address || "").join(", ");
        const subject = meta0.subject || env.subject || "";
        const parsed = msg.source ? await simpleParser(msg.source) : null;
        const body = String(parsed?.text || parsed?.html || "");
        const blob = `${from}\n${to}\n${cc}\n${subject}\n${body}`;
        if (!topicRe.test(blob) && !topicRe.test(subject)) continue;
        if (!senderRe.test(blob) && !topicRe.test(subject) && !topicRe.test(body)) continue;

        const id = `${label}-${box.replace(/[^\w]+/g, "_")}-uid-${msg.uid}`;
        const folder = path.join(outDir, id);
        fs.mkdirSync(folder, { recursive: true });
        const meta = {
          account: label,
          mailbox: box,
          uid: msg.uid,
          from,
          to,
          cc,
          subject,
          date: env.date || meta0.date,
          attachmentCount: (parsed?.attachments || []).length,
          attachments: (parsed?.attachments || []).map((a) => a.filename || ""),
        };
        fs.writeFileSync(path.join(folder, "meta.json"), JSON.stringify(meta, null, 2));
        fs.writeFileSync(path.join(folder, "body.txt"), String(parsed?.text || body || "").slice(0, 300000));
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
  return hits;
}

async function main() {
  const host = process.env.IMAP_HOST || "mail.qwertymates.com";
  const port = parseInt(process.env.IMAP_PORT || "993", 10);
  const accounts = [];
  const primaryUser = String(process.env.IMAP_USER || "").trim();
  const primaryPass = String(process.env.IMAP_PASS || "").trim();
  if (!primaryUser || !primaryPass) throw new Error("IMAP_USER/IMAP_PASS required");
  accounts.push({ user: primaryUser, pass: primaryPass, label: "imap" });

  const adminUser = String(process.env.ADMINISTRATOR_IMAP_USER || process.env.SMTP_USER || "").trim();
  const adminPass = String(process.env.ADMINISTRATOR_IMAP_PASS || "").trim();
  if (adminUser && adminPass && adminUser.toLowerCase() !== primaryUser.toLowerCase()) {
    accounts.push({ user: adminUser, pass: adminPass, label: "admin" });
  }

  fs.mkdirSync(outDir, { recursive: true });
  const hits = [];
  for (const acct of accounts) {
    const found = await searchAccount({ host, port, ...acct });
    hits.push(...found);
  }

  hits.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(hits, null, 2));
  console.log(`hits=${hits.length}`);
  for (const h of hits.slice(0, 50)) {
    console.log(`- [${h.date}] ${h.subject} | from=${h.from} | to=${h.to}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
