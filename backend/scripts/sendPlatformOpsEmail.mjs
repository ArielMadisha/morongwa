/**
 * Send a one-off ops report to PLATFORM_OPS_EMAIL (default administrator@qwertymates.com).
 * Usage: node scripts/sendPlatformOpsEmail.mjs --subject "..." --file report.txt
 *    or: node scripts/sendPlatformOpsEmail.mjs --subject "..." --text "body"
 * Optional: --to a@x.com,b@y.com  --cc c@z.com
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : "";
}

const subject = arg("--subject") || "[Qwertymates] Platform ops notice";
const file = arg("--file");
const text = file && fs.existsSync(file) ? fs.readFileSync(file, "utf8") : arg("--text") || "";
const to = (
  arg("--to") ||
  process.env.PLATFORM_OPS_EMAIL ||
  process.env.ADMINISTRATOR_EMAIL ||
  "administrator@qwertymates.com"
).trim();
const cc = (arg("--cc") || "").trim();

if (!text.trim()) {
  console.error("Provide --text or --file");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const info = await transporter.sendMail({
  from: process.env.SMTP_USER || "no-reply@qwertymates.com",
  to,
  ...(cc ? { cc } : {}),
  subject,
  text,
  html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap;line-height:1.5">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</pre>`,
});

console.log(
  `Sent to ${to}${cc ? ` cc=${cc}` : ""} (messageId=${info.messageId || "ok"}, accepted=${JSON.stringify(info.accepted || [])}, rejected=${JSON.stringify(info.rejected || [])})`
);