#!/usr/bin/env node
/**
 * Build Qwertymates outdoor signboard at correct 2500×600 aspect (4.167:1).
 * Output: 5000×1200 px PNG (print-ready proportion).
 *
 *   node scripts/buildOutdoorSignboard.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import QRCode from "qrcode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

const W = 5000;
const H = 1200;
const NAVY = "#0B1F3A";
const ORANGE = "#FF7A00";
const WHITE = "#FFFFFF";

const outPublic = path.join(repoRoot, "frontend", "public", "qwertymates-outdoor-signboard-2500x600.png");
const outExport = path.join(backendRoot, "exports", "signboard", "qwertymates-outdoor-signboard-2500x600.png");

const col1 = ["Websites", "Mobile Apps", "AI Solutions"];
const col2 = ["Business Software & POS", "Hosting & Domains", "Online Marketplace"];
const col3 = ["Internet Cafe", "Printing & Photocopying", "Laminating", "CV Design & Printing"];

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colBlock(items, x) {
  return items
    .map((t, i) => {
      const y = 470 + i * 95;
      const cy = 450 + i * 95;
      return [
        `<circle cx="${x - 50}" cy="${cy}" r="14" fill="${ORANGE}"/>`,
        `<text x="${x}" y="${y}" fill="${WHITE}" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="48" font-weight="700">${escapeXml(t)}</text>`,
      ].join("\n");
    })
    .join("\n");
}

async function main() {
  fs.mkdirSync(path.dirname(outExport), { recursive: true });
  fs.mkdirSync(path.dirname(outPublic), { recursive: true });

  const qrPng = await QRCode.toBuffer("https://www.qwertymates.com", {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 300,
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  <text x="2500" y="160" text-anchor="middle" fill="${ORANGE}" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="140" font-weight="900" letter-spacing="4">QWERTYMATES</text>
  <text x="2500" y="240" text-anchor="middle" fill="${WHITE}" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="600">Marketplace • Technology • Print Solutions</text>
  ${colBlock(col1, 220)}
  ${colBlock(col2, 1750)}
  ${colBlock(col3, 3350)}
  <rect x="0" y="1020" width="${W}" height="180" fill="${ORANGE}"/>
  <text x="180" y="1135" fill="${WHITE}" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="64" font-weight="900">CALL / WHATSAPP</text>
  <text x="2500" y="1135" text-anchor="middle" fill="${WHITE}" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="64" font-weight="900">www.qwertymates.com</text>
</svg>`;

  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  const composed = await sharp(base)
    .composite([{ input: qrPng, left: 4550, top: 1045 }])
    .png()
    .toBuffer();

  await sharp(composed).toFile(outPublic);
  await sharp(composed).toFile(outExport);

  const meta = await sharp(outPublic).metadata();
  console.log(
    JSON.stringify(
      {
        outPublic,
        outExport,
        width: meta.width,
        height: meta.height,
        ratio: Number((meta.width / meta.height).toFixed(3)),
        targetRatio: Number((2500 / 600).toFixed(3)),
        bytes: fs.statSync(outPublic).size,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
