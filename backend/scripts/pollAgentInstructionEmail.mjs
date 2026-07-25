/**
 * Poll agent@qwertymates.com via IMAP for instruction emails (option D).
 *
 * Allowlisted senders only (default: instructions@, instructions1@, administrator@).
 * Queues plain-text body to backend/exports/agent-instruction-email-queue.json.
 *
 * Usage (from backend/):
 *   npm run agent:poll-instructions
 *   npm run agent:poll-instructions -- --dry-run
 *   npm run agent:list-instructions
 *
 * Env: IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS, AGENT_INSTRUCTION_ALLOWLIST, etc.
 */
import dotenv from "dotenv";
import path from "path";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { fileURLToPath } from "url";
import {
  appendTaskLog,
  dedupeKey,
  ensureExportFiles,
  isAllowlistedSender,
  loadAllowlist,
  markProcessed,
  maxAttachmentBytes,
  alreadyProcessed,
  normalizeEmail,
  queueInstructionItem,
  readJson,
  writeJson,
  STATE_PATH,
  QUEUE_PATH,
  sanitizeInstructionBody,
} from "./lib/agentInstructionEmail.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const dryRun = process.argv.includes("--dry-run");
const listOnly = process.argv.includes("--list");
const sinceHoursArg = process.argv.find((a) => a.startsWith("--since-hours="));
const sinceHours = sinceHoursArg ? Math.max(0, parseInt(sinceHoursArg.split("=")[1], 10) || 0) : 0;

function envBool(name, defaultVal = false) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (!v) return defaultVal;
  return v === "1" || v === "true" || v === "yes";
}

function imapConfig() {
  const user = String(process.env.IMAP_USER || process.env.AGENT_IMAP_USER || "").trim();
  const pass = String(process.env.IMAP_PASS || process.env.AGENT_IMAP_PASS || "").trim();
  if (!user || !pass) {
    throw new Error("Set IMAP_USER and IMAP_PASS in backend/.env (agent@ mailbox).");
  }
  return {
    host: String(process.env.IMAP_HOST || "mail.qwertymates.com").trim(),
    port: parseInt(process.env.IMAP_PORT || "993", 10),
    secure: envBool("IMAP_SECURE", true),
    auth: { user, pass },
    logger: false,
  };
}

async function sendAutoReply(to, subject) {
  if (!envBool("AGENT_INSTRUCTION_AUTO_REPLY", true)) return;
  const smtpUser = String(process.env.AGENT_INSTRUCTION_SMTP_USER || process.env.IMAP_USER || "").trim();
  const smtpPass = String(process.env.AGENT_INSTRUCTION_SMTP_PASS || process.env.IMAP_PASS || "").trim();
  if (!smtpUser || !smtpPass) return;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || process.env.AGENT_INSTRUCTION_SMTP_HOST || "mail.qwertymates.com",
    port: parseInt(process.env.SMTP_PORT || process.env.AGENT_INSTRUCTION_SMTP_PORT || "587", 10),
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const safeSubj = String(subject || "(no subject)").slice(0, 120);
  await transporter.sendMail({
    from: smtpUser,
    to,
    subject: `Re: ${safeSubj}`,
    text: [
      "Qwertymates agent inbox — received.",
      "",
      "Your instruction was queued and will be auto-executed when it matches a known ops pattern",
      "(Facebook tokens, school gallery imports, etc.).",
      "Complex code changes are flagged for the Cursor agent and emailed to administrator@",
      "so they are not left waiting until someone is back at the desk.",
      "",
      "Do not send passwords or production secrets by email when avoidable.",
      "",
      "— agent@qwertymates.com (automated)",
    ].join("\n"),
  });
}

function listPending() {
  ensureExportFiles();
  const queue = readJson(QUEUE_PATH, { items: [] });
  const pending = (queue.items || []).filter((x) => x.status === "pending");
  console.log(`Pending instructions: ${pending.length}`);
  for (const p of pending) {
    console.log(`- [${p.id}] ${p.receivedAt} from ${p.from}`);
    console.log(`  Subject: ${p.subject}`);
    console.log(`  Preview: ${String(p.bodyText || "").slice(0, 120).replace(/\n/g, " ")}…`);
  }
  process.exit(pending.length ? 0 : 0);
}

async function poll() {
  ensureExportFiles();
  const allowlist = loadAllowlist();
  const state = readJson(STATE_PATH, { processedKeys: [] });
  const cfg = imapConfig();
  const maxAtt = maxAttachmentBytes();

  appendTaskLog(`poll start dryRun=${dryRun} allowlist=${allowlist.join(",")}`);

  const client = new ImapFlow(cfg);
  let queued = 0;
  let rejected = 0;
  let skipped = 0;

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    let uids;
    if (sinceHours > 0) {
      const since = new Date(Date.now() - sinceHours * 3600 * 1000);
      uids = await client.search({ since }, { uid: true });
      console.log(`Scanning inbox since ${since.toISOString()} (${uids.length} messages)`);
    } else {
      uids = await client.search({ seen: false }, { uid: true });
    }
    if (!uids.length) {
      console.log(sinceHours > 0 ? "OK: no messages in window" : "OK: no unread messages");
      state.lastPollAt = new Date().toISOString();
      state.lastResult = { queued: 0, rejected: 0, skipped: 0, dryRun, sinceHours };
      writeJson(STATE_PATH, state);
      return;
    }

    for (const uid of uids) {
      const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
      if (!msg?.source) continue;

      const parsed = await simpleParser(msg.source);
      const from = parsed.from?.value?.[0]?.address || "";
      const subject = parsed.subject || "";
      const messageId = parsed.messageId || "";
      const date = parsed.date ? parsed.date.toISOString() : "";
      const key = dedupeKey({ messageId, uid, subject, from, date });

      if (alreadyProcessed(state, key)) {
        skipped++;
        if (!dryRun) await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
        continue;
      }

      let attachmentsSkipped = false;
      let attachmentNote = null;
      const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
      if (attachments.length) {
        const tooLarge = attachments.filter((a) => (a.size || 0) > maxAtt);
        if (tooLarge.length) {
          attachmentsSkipped = true;
          attachmentNote = `Ignored ${attachments.length} attachment(s); ${tooLarge.length} over ${maxAtt} bytes limit.`;
        } else if (attachments.length) {
          attachmentNote = `Ignored ${attachments.length} attachment(s) per policy (text instructions only).`;
          attachmentsSkipped = true;
        }
      }

      const bodyText = sanitizeInstructionBody(
        parsed.text ||
          (parsed.html
            ? String(parsed.html)
                .replace(/<style[\s\S]*?<\/style>/gi, " ")
                .replace(/<script[\s\S]*?<\/script>/gi, " ")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
            : "")
      );

      if (!isAllowlistedSender(from, allowlist)) {
        rejected++;
        appendTaskLog(`rejected sender=${normalizeEmail(from)} subject=${subject.slice(0, 80)}`);
        if (!dryRun) {
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          markProcessed(state, key, { rejected: true, from: normalizeEmail(from) });
        }
        continue;
      }

      if (!bodyText.trim() && !subject.trim()) {
        skipped++;
        appendTaskLog(`skip empty from=${normalizeEmail(from)}`);
        if (!dryRun) await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
        markProcessed(state, key, { skipped: true });
        continue;
      }

      const instructionBody = bodyText.trim()
        ? bodyText
        : `(no body — subject only)\n${subject}`;

      if (dryRun) {
        console.log(`[dry-run] would queue from=${normalizeEmail(from)} subject=${subject.slice(0, 80)}`);
        queued++;
        continue;
      }

      const result = queueInstructionItem({
        from,
        subject,
        bodyText: instructionBody,
        messageId,
        uid,
        hasAttachments: attachments.length > 0,
        attachmentsSkipped,
        attachmentNote,
      });

      if (result.queued) {
        queued++;
        appendTaskLog(`queued id=${result.item.id} from=${result.item.from} subject=${result.item.subject.slice(0, 80)}`);
        try {
          await sendAutoReply(normalizeEmail(from), subject);
        } catch (e) {
          appendTaskLog(`auto-reply failed: ${String(e?.message || e)}`);
        }
      } else {
        skipped++;
        appendTaskLog(`duplicate ${result.dedupeKey}`);
      }

      await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
      markProcessed(state, key, { queued: result.queued });
    }
  } finally {
    lock.release();
  }

  await client.logout();

  const summary = { queued, rejected, skipped, dryRun };
  console.log("OK: poll complete", summary);
  appendTaskLog(`poll done ${JSON.stringify(summary)}`);
  const finalState = readJson(STATE_PATH, state);
  finalState.lastPollAt = new Date().toISOString();
  finalState.lastResult = summary;
  writeJson(STATE_PATH, finalState);
}

if (listOnly) {
  listPending();
} else {
  poll().catch((e) => {
    console.error("Poll failed:", e?.message || e);
    appendTaskLog(`poll error: ${String(e?.message || e)}`);
    process.exit(1);
  });
}
