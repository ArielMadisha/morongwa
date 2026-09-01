#!/usr/bin/env node
/**
 * Send Yeshasalem proposal pack to PLATFORM_OPS_EMAIL with attachments.
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const root = path.resolve(__dirname, "../..");
const dir = path.join(root, "DOCS", "Yeshasalem-District-Executive");
const pptx = path.join(dir, "Qwertymates-Partnership-Management-Proposal-Yeshasalem.pptx");
const docx = path.join(dir, "Letter-Yeshasalem-District-Executive-Qwertymates-Partnership.docx");
const pdf = path.join(dir, "Letter-Yeshasalem-District-Executive-Qwertymates-Partnership.pdf");

const to = (
  process.env.PLATFORM_OPS_EMAIL ||
  process.env.ADMINISTRATOR_EMAIL ||
  "administrator@qwertymates.com"
).trim();

const body = `Qwertymates — Yeshasalem District Executive partnership pack

Generated: ${new Date().toISOString()}

SUMMARY
=======
Combined partnership presentation (15 slides) and formal letter for Yeshasalem District Executive / Youth Development Team & District Executive Committee.

Merged sources:
1) Email from administrator@qwertymates.com (11 Aug 2026) — partnership letter + slide outline.
2) Correction email — expanded QwertyHub (essentials marketplace, food/Errands, groceries).
3) Execute email — Revenue & Impact Model (advertising, commissions, wallet fees).
4) Owner additions — QwertyTV data sovereignty + ThauThau Haramanuba; AskMacGyver data centres; Tau Skills Academy / bursaries in PMC.

Slide list (15):
1. Title — Partnership & Management Proposal
2. Vision
3. Introduction — Community Economy
4. Ecosystem Overview
5. QwertyHub (essentials / food / groceries)
6. ACBPAYWallet
7. QwertyTV (incl. ThauThau Haramanuba)
8. QwertyMusic
9. AskMacGyver AI (incl. data centres)
10. Morongwa Messenger
11. Errands
12. Job Creation Potential
13. Revenue & Impact Model
14. First Step — PMC
15. Conclusion & Call to Action

Files (also on disk):
- ${pptx}
- ${docx}
- ${pdf}
- ${path.join(dir, "README.md")}

Deployed: no
Build: n/a presentation/letter
Brand: official Q mark + wordmark; sky/blue (#1F6DE0 / navy)

Attachments included on this email.
`;

for (const f of [pptx, docx, pdf]) {
  if (!fs.existsSync(f)) {
    console.error("Missing file:", f);
    process.exit(1);
  }
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
  subject: "[Qwertymates] Yeshasalem District Executive — Partnership proposal deck + letter",
  text: body,
  html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap;line-height:1.5">${body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</pre>`,
  attachments: [
    { filename: path.basename(pptx), path: pptx },
    { filename: path.basename(docx), path: docx },
    { filename: path.basename(pdf), path: pdf },
  ],
});

console.log(
  `Sent to ${to} (messageId=${info.messageId || "ok"}, accepted=${JSON.stringify(info.accepted || [])}, rejected=${JSON.stringify(info.rejected || [])})`
);
