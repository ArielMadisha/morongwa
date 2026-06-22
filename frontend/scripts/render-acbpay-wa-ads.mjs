/**
 * Builds `public/wa-adverts/acbpay-usage-a.mp4` and `acbpay-usage-b.mp4` — ACBPayWallet promos
 * for WhatsApp pre-menu (option 5): (A) Cash Agent benefits, (B) earn & pay everywhere.
 * Run from `frontend/`: npm run wa-ad:render-acbpay
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import sharp from "sharp";
import ffmpeg from "ffmpeg-static";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../public/wa-adverts");

const W = 1280;
const H = 720;

function baseDefs() {
  return `
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f766e;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#0d9488;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#134e4a;stop-opacity:1" />
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.35"/>
    </filter>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#5eead4;stop-opacity:0.9" />
      <stop offset="100%" style="stop-color:#2dd4bf;stop-opacity:0.85" />
    </linearGradient>
  </defs>`;
}

/** Version A: benefits of being a Cash Agent */
const svgA = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${baseDefs()}
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="200" cy="140" r="160" fill="#2dd4bf" opacity="0.12"/>
  <circle cx="1100" cy="580" r="200" fill="#14b8a6" opacity="0.1"/>
  <rect x="64" y="64" width="520" height="48" rx="8" fill="rgba(0,0,0,0.15)"/>
  <text x="88" y="100" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="rgba(255,255,255,0.95)" letter-spacing="0.14em">ACBPAYWALLET · CASH AGENT</text>
  <text x="${W / 2}" y="200" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="44" font-weight="700" fill="rgba(255,255,255,0.92)">Benefits of being a</text>
  <text x="${W / 2}" y="258" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="76" font-weight="800" fill="#ffffff" filter="url(#sh)">Cash Agent</text>
  <text x="${W / 2}" y="310" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="28" font-weight="500" fill="rgba(255,255,255,0.95)">Serve your community — earn on every cash-in &amp; cash-out</text>
  <rect x="140" y="340" width="1000" height="8" rx="4" fill="url(#accent)" opacity="0.9"/>
  <text x="${W / 2}" y="390" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="25" font-weight="600" fill="#ecfeff">Trusted ACBPayWallet tools: QR, balances, and agent workflows</text>
  <text x="${W / 2}" y="435" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="25" font-weight="600" fill="#ecfeff">Grow foot traffic — customers top up &amp; withdraw with you</text>
  <text x="${W / 2}" y="480" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="25" font-weight="600" fill="#ecfeff">Get verified on Qwertymates — we guide you step by step</text>
  <text x="${W / 2}" y="525" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="25" font-weight="600" fill="#ecfeff">Wallet + errands + marketplace — one ecosystem for your hustle</text>
  <text x="${W / 2}" y="590" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="21" font-weight="400" fill="rgba(255,255,255,0.78)">Main menu → 5️⃣ ACBPayWallet → explore agent &amp; merchant options</text>
</svg>`;

/** Version B: earn and pay everywhere with ACBPayWallet */
const svgB = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${baseDefs()}
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="1020" cy="160" r="150" fill="#5eead4" opacity="0.15"/>
  <circle cx="180" cy="600" r="190" fill="#0f766e" opacity="0.2"/>
  <rect x="64" y="64" width="480" height="48" rx="8" fill="rgba(0,0,0,0.15)"/>
  <text x="88" y="100" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="rgba(255,255,255,0.95)" letter-spacing="0.14em">ACBPAYWALLET</text>
  <text x="${W / 2}" y="208" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="64" font-weight="800" fill="#ffffff" filter="url(#sh)">Earn &amp; pay everywhere</text>
  <text x="${W / 2}" y="272" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="34" font-weight="600" fill="rgba(255,255,255,0.98)">with ACBPayWallet on Qwertymates</text>
  <text x="${W / 2}" y="318" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="26" font-weight="400" fill="rgba(255,255,255,0.9)">Your pocket bank for bills, sends, requests &amp; in-store QR pay</text>
  <rect x="140" y="348" width="1000" height="8" rx="4" fill="url(#accent)" opacity="0.9"/>
  <text x="${W / 2}" y="398" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="25" font-weight="600" fill="#ecfeff">Pay merchants &amp; runners — same wallet, same balance</text>
  <text x="${W / 2}" y="443" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="25" font-weight="600" fill="#ecfeff">Send money, request payments, show your QR to get paid fast</text>
  <text x="${W / 2}" y="488" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="25" font-weight="600" fill="#ecfeff">Top up once — spend across QwertyHub, errands &amp; more</text>
  <text x="${W / 2}" y="533" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="25" font-weight="600" fill="#ecfeff">Secure, instant, built for South Africa and beyond</text>
  <text x="${W / 2}" y="595" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="21" font-weight="400" fill="rgba(255,255,255,0.78)">Main menu → 5️⃣ ACBPayWallet — your menu opens right after this clip</text>
</svg>`;

function encodePngToMp4(pngPath, outMp4) {
  const args = [
    "-y",
    "-loop",
    "1",
    "-i",
    pngPath,
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
}

if (!ffmpeg || !fs.existsSync(ffmpeg)) {
  console.error("ffmpeg binary missing (install devDependency ffmpeg-static).");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

async function one(name, svg) {
  const tmpPng = path.join(outDir, `._tmp-acbpay-${name}.png`);
  const outMp4 = path.join(outDir, `acbpay-usage-${name}.mp4`);
  await sharp(Buffer.from(svg)).png().toFile(tmpPng);
  try {
    encodePngToMp4(tmpPng, outMp4);
  } finally {
    fs.rmSync(tmpPng, { force: true });
  }
  const st = fs.statSync(outMp4);
  console.log(`Wrote ${outMp4} (${(st.size / 1024).toFixed(0)} KB)`);
}

await one("a", svgA);
await one("b", svgB);
console.log("Done. Two variants for ACBPayWallet (option 5) random pre-menu.");
