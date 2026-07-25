#!/usr/bin/env node
/**
 * Auto-execute pending agent instruction emails (instructions@ allowlist).
 *
 * Handles common ops patterns without waiting for an interactive Cursor session:
 * - Facebook page tokens (EAA…)
 * - School gallery batch imports (--count=N / "load N schools")
 * - Explicit ops email requests
 *
 * Everything else is marked needs_agent, written to exports/agent-instruction-urgent-pending.md,
 * and emailed to PLATFORM_OPS_EMAIL so it is visible while the owner is away.
 *
 *   node scripts/executeAgentInstructionQueue.mjs
 *   node scripts/executeAgentInstructionQueue.mjs --dry-run
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import {
  appendTaskLog,
  ensureExportFiles,
  QUEUE_PATH,
  EXPORTS_DIR,
  readJson,
  writeJson,
  normalizeEmail,
} from "./lib/agentInstructionEmail.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const URGENT_PATH = path.join(EXPORTS_DIR, "agent-instruction-urgent-pending.md");

function runNode(scriptRel, args = []) {
  const r = spawnSync(process.execPath, [scriptRel, ...args], {
    cwd: backendRoot,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  return {
    code: r.status ?? 1,
    stdout: String(r.stdout || "").slice(-4000),
    stderr: String(r.stderr || "").slice(-2000),
  };
}

function runNpm(script, extraArgs = []) {
  const r = spawnSync("npm", ["run", script, "--", ...extraArgs], {
    cwd: backendRoot,
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  return {
    code: r.status ?? 1,
    stdout: String(r.stdout || "").slice(-4000),
    stderr: String(r.stderr || "").slice(-2000),
  };
}

function extractFacebookToken(text) {
  const m = String(text || "").match(/\bEAA[A-Za-z0-9]+/);
  return m ? m[0] : null;
}

function extractSchoolCount(subject, body) {
  const blob = `${subject}\n${body}`;
  const m1 = blob.match(/\b(?:load|import|add)\s+(\d+)\s+schools?\b/i);
  if (m1) return Math.min(20, Math.max(1, parseInt(m1[1], 10)));
  const m2 = blob.match(/\b--count\s*=\s*(\d+)\b/i);
  if (m2) return Math.min(20, Math.max(1, parseInt(m2[1], 10)));
  const m3 = blob.match(/\b(\d+)\s+schools?\s+(?:today|now)\b/i);
  if (m3) return Math.min(20, Math.max(1, parseInt(m3[1], 10)));
  return null;
}

async function notifyOps(subject, text) {
  const to = (process.env.PLATFORM_OPS_EMAIL || "administrator@qwertymates.com").trim();
  const cc = (process.env.AGENT_INSTRUCTION_NOTIFY_CC || "tshipla3@gmail.com").trim();
  const user = process.env.AGENT_INSTRUCTION_SMTP_USER || process.env.SMTP_USER || process.env.IMAP_USER;
  const pass = process.env.AGENT_INSTRUCTION_SMTP_PASS || process.env.SMTP_PASS || process.env.IMAP_PASS;
  if (!user || !pass) {
    appendTaskLog("execute notify skipped — no SMTP");
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "mail.qwertymates.com",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: false,
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: user,
    to,
    ...(cc ? { cc } : {}),
    subject,
    text,
  });
}

function rewriteUrgentFile(pendingItems) {
  if (!pendingItems.length) {
    if (fs.existsSync(URGENT_PATH)) fs.unlinkSync(URGENT_PATH);
    return;
  }
  const lines = [
    "# Pending instruction emails needing Cursor agent",
    "",
    `Updated: ${new Date().toISOString()}`,
    "",
    "These were queued from instructions@ (or allowlist) and could not be auto-executed by pattern.",
    "Open this file in Cursor and ask the agent to execute them.",
    "",
  ];
  for (const it of pendingItems) {
    lines.push(`## ${it.subject}`);
    lines.push(`- id: ${it.id}`);
    lines.push(`- from: ${it.from}`);
    lines.push(`- received: ${it.receivedAt}`);
    lines.push("");
    lines.push("```");
    lines.push(String(it.bodyText || "").slice(0, 8000));
    lines.push("```");
    lines.push("");
  }
  fs.writeFileSync(URGENT_PATH, lines.join("\n"), "utf8");
}

async function executeOne(item) {
  const subject = String(item.subject || "");
  const body = String(item.bodyText || "");
  const blob = `${subject}\n${body}`;

  const token = extractFacebookToken(blob);
  if (token && token.length >= 40) {
    if (dryRun) return { ok: true, note: `dry-run apply Facebook token len=${token.length}` };
    const r = runNode("scripts/applyFacebookTokenFromArg.mjs", [`--token=${token}`, "--sync-remote"]);
    return {
      ok: r.code === 0,
      note: r.code === 0 ? `Facebook token applied+synced (len=${token.length})` : `Facebook token failed: ${r.stderr || r.stdout}`,
    };
  }

  const schoolCount = extractSchoolCount(subject, body);
  if (schoolCount) {
    if (dryRun) return { ok: true, note: `dry-run school import --count=${schoolCount}` };
    const r = runNpm("school:import-gallery-daily", [`--count=${schoolCount}`]);
    return {
      ok: r.code === 0,
      note: r.code === 0 ? `School gallery imported count=${schoolCount}` : `School import failed: ${r.stderr || r.stdout}`,
    };
  }

  // Explicit “check/execute emails” meta — already handled by poll+execute pipeline
  if (/\b(check emails|execute.*(emails|instructions)|poll.*(agent|instructions))\b/i.test(blob)) {
    return { ok: true, note: "Meta instruction acknowledged — poll+execute pipeline is active." };
  }

  return { ok: false, needsAgent: true, note: "No auto pattern matched — needs Cursor agent." };
}

async function main() {
  ensureExportFiles();
  const queue = readJson(QUEUE_PATH, { items: [] });
  const items = Array.isArray(queue.items) ? queue.items : [];
  const pending = items.filter((x) => x.status === "pending");
  appendTaskLog(`execute start pending=${pending.length} dryRun=${dryRun}`);

  if (!pending.length) {
    console.log("OK: no pending instructions to execute");
    rewriteUrgentFile(items.filter((x) => x.status === "needs_agent"));
    return;
  }

  const doneNotes = [];
  const needsAgent = [];

  for (const item of pending) {
    console.log(`Executing [${item.id}] ${item.subject}`);
    let result;
    try {
      result = await executeOne(item);
    } catch (e) {
      result = { ok: false, needsAgent: true, note: String(e?.message || e) };
    }

    const now = new Date().toISOString();
    if (result.ok && !result.needsAgent) {
      item.status = "done";
      item.completedAt = now;
      item.completionNote = result.note;
      doneNotes.push(`✓ ${item.subject}: ${result.note}`);
      appendTaskLog(`execute done id=${item.id} ${result.note}`);
    } else {
      item.status = "needs_agent";
      item.completedAt = now;
      item.completionNote = result.note;
      needsAgent.push(item);
      doneNotes.push(`… ${item.subject}: ${result.note}`);
      appendTaskLog(`execute needs_agent id=${item.id} ${result.note}`);
    }
  }

  writeJson(QUEUE_PATH, { items });
  rewriteUrgentFile([
    ...needsAgent,
    ...items.filter((x) => x.status === "needs_agent" && !needsAgent.some((n) => n.id === x.id)),
  ]);

  const summary = [
    `Agent instruction auto-execute (${new Date().toISOString()})`,
    "",
    ...doneNotes,
    "",
    needsAgent.length
      ? `${needsAgent.length} item(s) need interactive Cursor — see exports/agent-instruction-urgent-pending.md`
      : "No items left needing interactive Cursor.",
  ].join("\n");

  console.log(summary);
  if (!dryRun) {
    try {
      await notifyOps(
        `[Qwertymates] Agent instructions executed (${doneNotes.length} processed, ${needsAgent.length} need agent)`,
        summary
      );
    } catch (e) {
      appendTaskLog(`execute notify failed: ${String(e?.message || e)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  appendTaskLog(`execute error: ${String(e?.message || e)}`);
  process.exit(1);
});
