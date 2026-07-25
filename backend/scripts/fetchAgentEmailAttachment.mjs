/** One-off: fetch attachments from agent@ message by IMAP UID */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const uid = Number(process.argv[2] || 2);
const outDir = path.join(__dirname, "..", "exports", "agent-instruction-attachments");

const client = new ImapFlow({
  host: process.env.IMAP_HOST || "mail.qwertymates.com",
  port: parseInt(process.env.IMAP_PORT || "993", 10),
  secure: true,
  auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
  logger: false,
});

await client.connect();
const lock = await client.getMailboxLock("INBOX");
try {
  const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
  if (!msg?.source) throw new Error("Message not found");
  const parsed = await simpleParser(msg.source);
  fs.mkdirSync(outDir, { recursive: true });
  const atts = parsed.attachments || [];
  console.log("subject:", parsed.subject);
  console.log("attachments:", atts.length);
  for (const a of atts) {
    const name = (a.filename || `attachment-${Date.now()}`).replace(/[^\w.\-]+/g, "_");
    const fp = path.join(outDir, name);
    fs.writeFileSync(fp, a.content);
    console.log("saved", fp, a.size);
  }
} finally {
  lock.release();
}
await client.logout();
