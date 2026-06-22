/**
 * Builds `public/wa-adverts/qwertyhub-sample-ad.mp4` — QwertyHub-branded 8s MP4
 * (gradient + type + product lines). Requires: sharp, ffmpeg-static.
 *
 * Run from `frontend/`:  node scripts/render-qwertyhub-wa-ad.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import sharp from "sharp";
import ffmpeg from "ffmpeg-static";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../public/wa-adverts");
const outMp4 = path.join(outDir, "qwertyhub-sample-ad.mp4");
const tmpPng = path.join(outDir, "._tmp-qh-frame.png");

const W = 1280;
const H = 720;

// Brand-aligned palette from globals (sky/blue scale)
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1f6de0;stop-opacity:1" />
      <stop offset="45%" style="stop-color:#2e8aff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0c4a6e;stop-opacity:1" />
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.35"/>
    </filter>
    <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.2" />
      <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="140" fill="url(#glow)"/>
  <circle cx="1080" cy="120" r="220" fill="#5aa8ff" opacity="0.12"/>
  <circle cx="120" cy="600" r="180" fill="#b6dbff" opacity="0.08"/>
  <rect x="64" y="64" width="400" height="48" rx="8" fill="rgba(0,0,0,0.12)"/>
  <text x="88" y="100" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="rgba(255,255,255,0.95)" letter-spacing="0.12em">QWERTYHUB</text>
  <rect x="120" y="180" width="1040" height="360" rx="20" fill="rgba(0,0,0,0.15)" stroke="rgba(255,255,255,0.2)"/>
  <text x="${W / 2}" y="300" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="90" font-weight="700" fill="#ffffff" filter="url(#sh)">QwertyHub</text>
  <text x="${W / 2}" y="370" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="32" font-weight="600" fill="rgba(255,255,255,0.98)">Resell with zero stock</text>
  <text x="${W / 2}" y="420" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="28" font-weight="400" fill="rgba(255,255,255,0.9)">No inventory · Suppliers ship direct · You earn on every sale</text>
  <text x="${W / 2}" y="470" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="24" font-weight="500" fill="rgba(255,255,255,0.85)">Your MyStore link — share and get paid</text>
  <rect x="${(W - 400) / 2}" y="500" width="400" height="2" rx="1" fill="rgba(255,255,255,0.45)"/>
  <text x="${W / 2}" y="550" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="28" font-weight="700" fill="#ffffff">qwertymates.com</text>
  <text x="${W / 2}" y="600" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="19" font-weight="400" fill="rgba(255,255,255,0.65)">WhatsApp: open the main menu, then QwertyHub or MyStore</text>
</svg>`;

if (!ffmpeg || !fs.existsSync(ffmpeg)) {
  console.error("ffmpeg binary missing (install devDependency ffmpeg-static).");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(tmpPng);

const args = [
  "-y",
  "-loop",
  "1",
  "-i",
  tmpPng,
  "-c:v",
  "libx264",
  "-t",
  "8",
  "-pix_fmt",
  "yuv420p",
  "-vf",
  "scale=1280:720:flags=lanczos,fps=30",
  "-g",
  "30",
  "-keyint_min",
  "30",
  "-sc_threshold",
  "0",
  "-crf",
  "24",
  "-profile:v",
  "main",
  "-movflags",
  "+faststart",
  outMp4,
];
execFileSync(ffmpeg, args, { stdio: "inherit" });
fs.rmSync(tmpPng, { force: true });
const st = fs.statSync(outMp4);
console.log(`Wrote ${outMp4} (${(st.size / 1024).toFixed(0)} KB)`);
