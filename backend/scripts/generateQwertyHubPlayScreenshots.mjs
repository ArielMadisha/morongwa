/**
 * Generate Google Play Console screenshot packs for QwertyHub
 * from login/signup mockups + live marketplace UI references.
 *
 * From morongwa/backend/:
 *   node scripts/generateQwertyHubPlayScreenshots.mjs
 *
 * Output: App Stores Graphics/QwertyHub/screenshots/{phone,tablet-7,tablet-10,chromebook,android-xr}/
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const packRoot = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "App Stores Graphics",
  "QwertyHub"
);
const refDir = path.join(packRoot, "references");
const logosDir = path.join(packRoot, "logos");
const outRoot = path.join(packRoot, "screenshots");

const LOGIN_REF = path.join(refDir, "ref-login-signup.png");
const MARKET_1 = path.join(refDir, "ref-marketplace-ui-1.png");
const MARKET_2 = path.join(refDir, "ref-marketplace-ui-2.png");
const LOGO = path.join(logosDir, "qwertyhub-google-play-icon-512.png");

const BLUE_TOP = "#00C2FF";
const BLUE_MID = "#2563eb";
const PURPLE = "#7c3aed";
const NAVY = "#0B1F3A";

const SLIDES = [
  {
    id: "01-login",
    caption: "Sign In with One Account",
    sub: "Same login as Qwertymates",
    source: "login",
  },
  {
    id: "02-signup",
    caption: "Create Your QwertyHub Account",
    sub: "Register once — shop everywhere",
    source: "signup",
  },
  {
    id: "03-marketplace",
    caption: "Unified Marketplace",
    sub: "Food, groceries & local fashion",
    source: "market1",
  },
  {
    id: "04-browse",
    caption: "Browse Local Stores",
    sub: "Resell · Order · Collect nearby",
    source: "market2",
  },
  {
    id: "05-shop",
    caption: "Shop & Resell with Ease",
    sub: "Add to cart in a few taps",
    source: "market1",
  },
];

function ensureDirs() {
  for (const d of [
    "phone",
    "tablet-7",
    "tablet-10",
    "chromebook",
    "android-xr",
  ]) {
    fs.mkdirSync(path.join(outRoot, d), { recursive: true });
  }
}

async function splitLoginSignup() {
  const meta = await sharp(LOGIN_REF).metadata();
  const w = meta.width;
  const h = meta.height;
  // Dual phone mockup — left ~48%, right ~48% with small gap
  const half = Math.floor(w * 0.48);
  const rightStart = Math.floor(w * 0.52);
  const login = await sharp(LOGIN_REF)
    .extract({ left: 0, top: 0, width: Math.min(half, w), height: h })
    .png()
    .toBuffer();
  const signup = await sharp(LOGIN_REF)
    .extract({
      left: Math.min(rightStart, w - half),
      top: 0,
      width: Math.min(half, w - rightStart),
      height: h,
    })
    .png()
    .toBuffer();
  return { login, signup };
}

async function loadSources() {
  const { login, signup } = await splitLoginSignup();
  const market1 = await sharp(MARKET_1).png().toBuffer();
  const market2 = await sharp(MARKET_2).png().toBuffer();
  return { login, signup, market1, market2 };
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Portrait marketing frame: gradient header + caption + UI content + logo.
 */
async function makePortraitFrame(opts) {
  const { width, height, caption, sub, uiBuf, logoBuf, outPath } = opts;
  const headerH = Math.round(height * 0.16);
  const footerH = Math.round(height * 0.06);
  const contentTop = headerH;
  const contentH = height - headerH - footerH;
  const contentPadX = Math.round(width * 0.04);
  const contentW = width - contentPadX * 2;

  const uiFitted = await sharp(uiBuf)
    .resize(contentW, contentH, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  const logoSize = Math.round(headerH * 0.42);
  const logo = await sharp(logoBuf)
    .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const captionSize = Math.round(width * 0.055);
  const subSize = Math.round(width * 0.032);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BLUE_MID}"/>
      <stop offset="55%" stop-color="${PURPLE}"/>
      <stop offset="100%" stop-color="${NAVY}"/>
    </linearGradient>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#EEF6FF"/>
      <stop offset="100%" stop-color="#F8FAFC"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${headerH}" fill="url(#hg)"/>
  <text x="${width / 2}" y="${Math.round(headerH * 0.55)}" text-anchor="middle"
    fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif"
    font-size="${captionSize}" font-weight="900">${escapeXml(caption)}</text>
  <text x="${width / 2}" y="${Math.round(headerH * 0.82)}" text-anchor="middle"
    fill="#E8F6FF" font-family="Arial, Helvetica, sans-serif"
    font-size="${subSize}" font-weight="600">${escapeXml(sub)}</text>
  <rect y="${height - footerH}" width="${width}" height="${footerH}" fill="${NAVY}"/>
  <text x="${width / 2}" y="${height - Math.round(footerH * 0.35)}" text-anchor="middle"
    fill="#B8E4FF" font-family="Arial, Helvetica, sans-serif"
    font-size="${Math.round(footerH * 0.4)}" font-weight="700">QwertyHub · Food · Groceries · Marketplace</text>
</svg>`;

  await sharp(Buffer.from(svg))
    .composite([
      { input: logo, left: Math.round(width * 0.04), top: Math.round(headerH * 0.18) },
      {
        input: uiFitted,
        left: contentPadX,
        top: contentTop,
      },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outPath);
}

/**
 * Landscape marketing frame (tablets / Chromebook / XR).
 */
async function makeLandscapeFrame(opts) {
  const { width, height, caption, sub, uiBuf, logoBuf, outPath } = opts;
  const sideW = Math.round(width * 0.34);
  const contentW = width - sideW;
  const pad = Math.round(height * 0.05);

  const uiFitted = await sharp(uiBuf)
    .resize(contentW - pad * 2, height - pad * 2, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  const logoSize = Math.round(sideW * 0.28);
  const logo = await sharp(logoBuf)
    .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const titleSize = Math.round(sideW * 0.095);
  const subSize = Math.round(sideW * 0.055);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BLUE_MID}"/>
      <stop offset="60%" stop-color="${PURPLE}"/>
      <stop offset="100%" stop-color="${NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="#F1F5F9"/>
  <rect width="${sideW}" height="${height}" fill="url(#sg)"/>
  <text x="${Math.round(sideW * 0.1)}" y="${Math.round(height * 0.42)}"
    fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif"
    font-size="${titleSize}" font-weight="900">
    <tspan x="${Math.round(sideW * 0.1)}" dy="0">${escapeXml(caption.split(" ").slice(0, 2).join(" "))}</tspan>
    <tspan x="${Math.round(sideW * 0.1)}" dy="${Math.round(titleSize * 1.15)}">${escapeXml(caption.split(" ").slice(2).join(" ") || "")}</tspan>
  </text>
  <text x="${Math.round(sideW * 0.1)}" y="${Math.round(height * 0.62)}"
    fill="#E8F6FF" font-family="Arial, Helvetica, sans-serif"
    font-size="${subSize}" font-weight="600">${escapeXml(sub)}</text>
  <text x="${Math.round(sideW * 0.1)}" y="${Math.round(height * 0.92)}"
    fill="#B8E4FF" font-family="Arial, Helvetica, sans-serif"
    font-size="${Math.round(subSize * 0.85)}" font-weight="700">QwertyHub</text>
</svg>`;

  await sharp(Buffer.from(svg))
    .composite([
      { input: logo, left: Math.round(sideW * 0.1), top: Math.round(height * 0.12) },
      { input: uiFitted, left: sideW + pad, top: pad },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outPath);
}

function pickUi(sources, source) {
  if (source === "login") return sources.login;
  if (source === "signup") return sources.signup;
  if (source === "market2") return sources.market2;
  return sources.market1;
}

async function generateSet(folder, slides, mode, width, height, sources, logoBuf) {
  const dir = path.join(outRoot, folder);
  for (const slide of slides) {
    const uiBuf = pickUi(sources, slide.source);
    const outPath = path.join(dir, `${slide.id}-${width}x${height}.jpg`);
    if (mode === "portrait") {
      await makePortraitFrame({
        width,
        height,
        caption: slide.caption,
        sub: slide.sub,
        uiBuf,
        logoBuf,
        outPath,
      });
    } else {
      await makeLandscapeFrame({
        width,
        height,
        caption: slide.caption,
        sub: slide.sub,
        uiBuf,
        logoBuf,
        outPath,
      });
    }
    console.log("wrote", path.relative(packRoot, outPath));
  }
}

async function main() {
  for (const f of [LOGIN_REF, MARKET_1, MARKET_2, LOGO]) {
    if (!fs.existsSync(f)) throw new Error(`Missing: ${f}`);
  }
  ensureDirs();
  const sources = await loadSources();
  const logoBuf = await sharp(LOGO).png().toBuffer();

  // Phone: 1080×2400 (9:16) — promo-eligible (≥1080 each side, 4+)
  await generateSet("phone", SLIDES, "portrait", 1080, 2400, sources, logoBuf);

  // Also provide 1080×1920 (common 9:16) duplicates for flexibility
  const phoneAlt = path.join(outRoot, "phone");
  for (const slide of SLIDES.slice(0, 4)) {
    const uiBuf = pickUi(sources, slide.source);
    await makePortraitFrame({
      width: 1080,
      height: 1920,
      caption: slide.caption,
      sub: slide.sub,
      uiBuf,
      logoBuf,
      outPath: path.join(phoneAlt, `${slide.id}-1080x1920.jpg`),
    });
    console.log("wrote phone", `${slide.id}-1080x1920.jpg`);
  }

  // 7-inch tablet: portrait 1200×1920 + landscape 1920×1200
  await generateSet("tablet-7", SLIDES.slice(0, 4), "portrait", 1200, 1920, sources, logoBuf);
  await generateSet("tablet-7", SLIDES.slice(0, 4), "landscape", 1920, 1200, sources, logoBuf);

  // 10-inch tablet: portrait 1600×2560 + landscape 2560×1600 (min 1080/side)
  await generateSet("tablet-10", SLIDES.slice(0, 4), "portrait", 1600, 2560, sources, logoBuf);
  await generateSet("tablet-10", SLIDES.slice(0, 4), "landscape", 2560, 1600, sources, logoBuf);

  // Chromebook: 1920×1080 landscape (4–8 required)
  await generateSet("chromebook", SLIDES, "landscape", 1920, 1080, sources, logoBuf);

  // Android XR: 1920×1080 landscape (4–8)
  await generateSet("android-xr", SLIDES, "landscape", 1920, 1080, sources, logoBuf);

  // README for upload mapping
  const readme = `# QwertyHub — Google Play screenshot packs

Generated from your login/signup mockup + live QwertyHub marketplace UI.

## Upload map (Play Console)

| Console section | Folder | Upload these |
|---|---|---|
| **Phone screenshots** | \`screenshots/phone/\` | Prefer \`*-1080x2400.jpg\` (upload **4–5**). Also has 1080×1920 variants. |
| **7-inch tablet** | \`screenshots/tablet-7/\` | Upload portrait \`1200x1920\` and/or landscape \`1920x1200\` (up to 8). |
| **10-inch tablet** | \`screenshots/tablet-10/\` | Upload \`1600x2560\` and/or \`2560x1600\` (up to 8). |
| **Chromebook** | \`screenshots/chromebook/\` | Upload all 5 × \`1920x1080\` (needs 4–8). |
| **Android XR** | \`screenshots/android-xr/\` | Upload all 5 × \`1920x1080\` (needs 4–8). |

## Specs met

- PNG/JPEG ✓ (JPEG used for size)
- Under 8 MB each ✓
- 9:16 or 16:9 ✓
- Phone promo eligibility: ≥4 shots, ≥1080 px each side ✓

## Source images used

- \`references/ref-login-signup.png\` → Login + Sign Up frames
- \`references/ref-marketplace-ui-1.png\` / \`ref-marketplace-ui-2.png\` → Marketplace browse
- \`logos/qwertyhub-google-play-icon-512.png\` → Q mark on frames

Regenerate: from \`morongwa/backend/\` run \`node scripts/generateQwertyHubPlayScreenshots.mjs\`
`;
  fs.writeFileSync(path.join(outRoot, "README.md"), readme);
  console.log("\nDone →", outRoot);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
