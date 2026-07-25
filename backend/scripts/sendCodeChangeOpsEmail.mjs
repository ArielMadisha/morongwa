/**
 * Send a standard ops summary after code changes to PLATFORM_OPS_EMAIL.
 *
 * Usage (from backend/):
 *   npm run ops:email-change-summary -- --summary "Fixed WA marketplace cards"
 *   npm run ops:email-change-summary -- --summary "..." --files "backend/src/waFlow.ts,frontend/..." --deployed yes --build "backend+frontend OK" --health "www 200"
 *   npm run ops:email-change-summary -- --file exports/my-report.txt --subject "[Qwertymates] Custom subject"
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : "";
}

const summary = arg("--summary") || arg("--text") || "";
const files = arg("--files");
const deployed = arg("--deployed");
const build = arg("--build");
const health = arg("--health");
const mobile = arg("--mobile");
const blockers = arg("--blockers");
const subject =
  arg("--subject") ||
  `[Qwertymates] Code change summary (${new Date().toISOString().slice(0, 10)})`;
const fileIn = arg("--file");

let body = "";
if (fileIn && fs.existsSync(fileIn)) {
  body = fs.readFileSync(fileIn, "utf8");
} else {
  const lines = [
    "Qwertymates — automated code-change summary",
    `Generated: ${new Date().toISOString()}`,
    `Recipient: ${(process.env.PLATFORM_OPS_EMAIL || "administrator@qwertymates.com").trim()}`,
    "",
    "================================================================================",
    "SUMMARY",
    "================================================================================",
    summary.trim() || "(no summary provided)",
    "",
  ];
  if (files) {
    lines.push("Files / areas touched:", ...files.split(/[,;]/).map((f) => `- ${f.trim()}`).filter(Boolean), "");
  }
  if (build) lines.push("Build / test:", build, "");
  if (deployed) lines.push("Deployed:", deployed, "");
  if (health) lines.push("Health check:", health, "");
  if (mobile) lines.push("Mobile:", mobile, "");
  if (blockers) lines.push("Blockers:", blockers, "");
  lines.push(
    "—",
    "Policy: outbound ops email after every substantive code change.",
    "Script: backend/scripts/sendCodeChangeOpsEmail.mjs",
    ""
  );
  body = lines.join("\n");
}

if (!body.trim()) {
  console.error("Provide --summary or --file");
  process.exit(1);
}

const tmp = path.join(__dirname, "..", "exports", `code-change-email-${Date.now()}.txt`);
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, body, "utf8");

const sender = path.join(__dirname, "sendPlatformOpsEmail.mjs");
const r = spawnSync("node", [sender, "--subject", subject, "--file", tmp], {
  stdio: "inherit",
  env: process.env,
});

try {
  fs.unlinkSync(tmp);
} catch {
  /* ignore */
}

process.exit(r.status ?? 1);
