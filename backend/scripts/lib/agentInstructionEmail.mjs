/**
 * Shared helpers for agent@ IMAP instruction polling (option D).
 * Policy: allowlisted senders only, HTML→text, skip large attachments, audit log.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EXPORTS_DIR = path.resolve(__dirname, "../../exports");
export const QUEUE_PATH = path.join(EXPORTS_DIR, "agent-instruction-email-queue.json");
export const STATE_PATH = path.join(EXPORTS_DIR, "agent-instruction-email-state.json");
export const TASK_LOG_PATH = path.join(EXPORTS_DIR, "agent-instruction-email-task.log");

export const DEFAULT_ALLOWLIST = [
  "instructions@qwertymates.com",
  "instructions1@qwertymates.com",
  "administrator@qwertymates.com",
];

const MAX_BODY_CHARS = 50_000;

export function loadAllowlist() {
  const raw = String(process.env.AGENT_INSTRUCTION_ALLOWLIST || "").trim();
  const fromEnv = raw
    ? raw.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];
  const merged = [...DEFAULT_ALLOWLIST.map((e) => e.toLowerCase()), ...fromEnv];
  return [...new Set(merged)];
}

export function normalizeEmail(addr) {
  const s = String(addr || "").trim().toLowerCase();
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim();
}

export function isAllowlistedSender(fromAddress, allowlist) {
  const from = normalizeEmail(fromAddress);
  if (!from) return false;
  return allowlist.includes(from);
}

/** Strip HTML / reduce untrusted email body for agent queue. */
export function sanitizeInstructionBody(text) {
  let t = String(text || "")
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (t.length > MAX_BODY_CHARS) {
    t = `${t.slice(0, MAX_BODY_CHARS)}\n\n[truncated — max ${MAX_BODY_CHARS} chars]`;
  }
  return t;
}

export function maxAttachmentBytes() {
  const n = Number(process.env.AGENT_INSTRUCTION_MAX_ATTACHMENT_BYTES || 10 * 1024 * 1024);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10 * 1024 * 1024;
}

export function ensureExportFiles() {
  if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  if (!fs.existsSync(QUEUE_PATH)) {
    fs.writeFileSync(QUEUE_PATH, JSON.stringify({ items: [] }, null, 2), "utf8");
  }
  if (!fs.existsSync(STATE_PATH)) {
    fs.writeFileSync(
      STATE_PATH,
      JSON.stringify({ processedKeys: [], lastPollAt: null, lastResult: null }, null, 2),
      "utf8"
    );
  }
}

export function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function appendTaskLog(line) {
  ensureExportFiles();
  const ts = new Date().toISOString();
  fs.appendFileSync(TASK_LOG_PATH, `[${ts}] ${line}\n`, "utf8");
}

export function dedupeKey({ messageId, uid, subject, from, date }) {
  const mid = String(messageId || "").trim();
  if (mid) return `mid:${mid}`;
  const base = `${normalizeEmail(from)}|${String(subject || "").slice(0, 200)}|${date || ""}|uid:${uid || ""}`;
  return `hash:${crypto.createHash("sha256").update(base).digest("hex").slice(0, 32)}`;
}

export function queueInstructionItem(item) {
  ensureExportFiles();
  const queue = readJson(QUEUE_PATH, { items: [] });
  const items = Array.isArray(queue.items) ? queue.items : [];
  const key = dedupeKey(item);
  if (items.some((x) => x.dedupeKey === key && x.status !== "rejected")) {
    return { queued: false, reason: "duplicate", dedupeKey: key };
  }
  const row = {
    id: crypto.randomUUID(),
    dedupeKey: key,
    status: "pending",
    receivedAt: new Date().toISOString(),
    from: normalizeEmail(item.from),
    subject: String(item.subject || "").trim().slice(0, 500),
    bodyText: sanitizeInstructionBody(item.bodyText),
    messageId: item.messageId || null,
    imapUid: item.uid ?? null,
    hasAttachments: Boolean(item.hasAttachments),
    attachmentsSkipped: Boolean(item.attachmentsSkipped),
    attachmentNote: item.attachmentNote || null,
    securityNote:
      "Untrusted input — summarize in Cursor and confirm before deploy or production changes.",
  };
  items.unshift(row);
  writeJson(QUEUE_PATH, { items: items.slice(0, 200) });
  return { queued: true, item: row };
}

export function markProcessed(state, key, meta = {}) {
  const processedKeys = Array.isArray(state.processedKeys) ? state.processedKeys : [];
  if (!processedKeys.includes(key)) processedKeys.unshift(key);
  state.processedKeys = processedKeys.slice(0, 500);
  state.lastPollAt = new Date().toISOString();
  state.lastResult = meta;
  writeJson(STATE_PATH, state);
}

export function alreadyProcessed(state, key) {
  const processedKeys = Array.isArray(state.processedKeys) ? state.processedKeys : [];
  return processedKeys.includes(key);
}
