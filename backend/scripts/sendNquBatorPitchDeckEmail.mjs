#!/usr/bin/env node
/**
 * Send NquBator pitch deck PPTX (+ PDF) to owner inboxes.
 *
 * From backend/:
 *   node scripts/sendNquBatorPitchDeckEmail.mjs
 *   node scripts/sendNquBatorPitchDeckEmail.mjs --to "ariel@vodamail.co.za,tshipla3@gmail.com" --cc administrator@qwertymates.com
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

const root = path.resolve(__dirname, "../..");
const dir = path.join(root, "DOCS", "NquBator-Pitch-Deck");
const pptx = path.join(dir, "Qwertymates-Pitch-Deck.pptx");
const pdf = path.join(dir, "Qwertymates-Pitch-Deck.pdf");
const readme = path.join(dir, "README.md");

const to = (
  arg("--to") ||
  "ariel@vodamail.co.za, tshipla3@gmail.com"
).trim();
const cc = (arg("--cc") || "administrator@qwertymates.com").trim();
const subject =
  arg("--subject") || "[Qwertymates] Pitch deck (NquBator) — 12 slides";

const body = `Qwertymates — NquBator pitch deck (12 slides)

Generated: ${new Date().toISOString()}

SUMMARY
=======
Professional 16:9 investor/accelerator PowerPoint from the owner’s final 12-slide copy.
Official Q emblem + sky/blue brand (#1F6DE0 / navy / white). No extra claims or numbers.

Update: Product slide now has 7 cards — original five plus Morongwa and Errands
(Morongwa: built-in messenger; Errands: local deliveries / collections / micro-jobs).

Slides:
1. Cover — Join the Qwerty Revolution; Ariel Madisha; business@qwertymates.com; +27 66 129 4468; WhatsApp BW + ZA
2. Problem
3. Vision
4. Product (QwertyHub, AskMacGyver, ACBPay Wallet, QwertyTV & QwertyMusic, WhatsApp, Morongwa, Errands)
5. Market & Customer
6. Traction
7. Business Model
8. Competitive Landscape
9. Team
10. Funding Ask
11. NquBator Fit
12. Closing

Files:
- ${pptx}
- ${pdf}
- ${readme}

Deployed: no (document pack only)
Build: pptxgenjs 12-slide deck

Attachments: PPTX (primary) and PDF companion.
`;

for (const f of [pptx, pdf]) {
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
  cc,
  subject,
  text: body,
  html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap;line-height:1.5">${body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</pre>`,
  attachments: [
    { filename: path.basename(pptx), path: pptx },
    { filename: path.basename(pdf), path: pdf },
  ],
});

console.log(
  JSON.stringify(
    {
      to,
      cc,
      messageId: info.messageId || "ok",
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response || "",
    },
    null,
    2
  )
);
