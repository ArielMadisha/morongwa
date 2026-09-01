#!/usr/bin/env node
/** Search IMAP for Apple App Store emails. Writes exports/ariel-ios-email/apple-hits.json */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const outDir = path.join(__dirname, "..", "exports", "ariel-ios-email");

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
    logger: false
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  const hits = [];
  try {
    const uids = await client.search({
      since: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      or: [
        { from: "no_reply@email.apple.com" },
        { from: "ariel@vodamail.co.za" },
        { subject: "Qwertymates" },
        { subject: "App Store" }
      ]
    });
    console.log("search uids", (uids || []).length);
    if (!uids?.length) {
      await client.logout();
      return;
    }
    for await (const msg of client.fetch(uids, { uid: true, envelope: true, source: true })) {
      const env = msg.envelope || {};
      const from = (env.from || [])
        .map((a) => `${a.name || ""} <${a.address || ""}>`)
        .join(", ");
      const subject = env.subject || "";
      const parsed = msg.source ? await simpleParser(msg.source) : null;
      const text = String(parsed?.text || "").slice(0, 8000);
      const html = String(parsed?.html || "");
      const guideline =
        html.match(/Guideline\s+[0-9.]+[^\n<]{0,200}/i)?.[0] ||
        text.match(/Guideline\s+[0-9.]+[^\n]{0,200}/i)?.[0] ||
        null;
      const meta = {
        uid: msg.uid,
        from,
        subject,
        date: env.date,
        guideline
      };
      hits.push(meta);
      console.log(`HIT uid=${msg.uid} date=${env.date} subject=${subject} guideline=${guideline || "none"}`);
      const folder = path.join(outDir, `apple-uid-${msg.uid}`);
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, "meta.json"), JSON.stringify(meta, null, 2));
      fs.writeFileSync(path.join(folder, "body.txt"), text.slice(0, 50000));
    }
  } finally {
    lock.release();
  }
  await client.logout();
  fs.writeFileSync(path.join(outDir, "apple-hits.json"), JSON.stringify({ hits }, null, 2));
  console.log("Done hits", hits.length);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
