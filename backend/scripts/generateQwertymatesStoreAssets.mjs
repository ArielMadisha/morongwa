/**
 * Generate Qwertymates (main Android app) Play / iOS / Huawei store assets
 * from the official circular Q mark + live website UI references.
 *
 * From morongwa/backend/:
 *   node scripts/generateQwertymatesStoreAssets.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packRoot = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "App Stores Graphics",
  "Qwertymates"
);
const logosDir = path.join(packRoot, "logos");
const featDir = path.join(packRoot, "feature-graphics");
const refsDir = path.join(packRoot, "references");
const shotsPhone = path.join(packRoot, "screenshots", "phone");
const shotsTablet7 = path.join(packRoot, "screenshots", "tablet-7");
const shotsTablet10 = path.join(packRoot, "screenshots", "tablet-10");
const shotsChromebook = path.join(packRoot, "screenshots", "chromebook");
const templatesDir = path.join(packRoot, "templates");

const BLUE_TOP = "#00C2FF";
const BLUE_BOTTOM = "#007BFF";
const NAVY = "#003D82";
const ICE = "#E8F6FF";
const SURFACE = "#F8FAFC";

const officialQ = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "morongwa",
  "frontend",
  "public",
  "qwertymates-q-mark-official.png"
);
const wordmark = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "morongwa",
  "frontend",
  "public",
  "qwertymates-logo.png"
);
const sourceQ = path.join(logosDir, "qwertymates-q-mark-source.png");

const assetsRoot = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "c-Users-Dell-cursor-projects-morongwa",
  "assets"
);

function findRef(namePart) {
  if (!fs.existsSync(assetsRoot)) return null;
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const hit = walk(p);
        if (hit) return hit;
      } else if (ent.name.toLowerCase().includes(namePart.toLowerCase())) {
        return p;
      }
    }
    return null;
  };
  return walk(assetsRoot);
}

async function ensureDirs() {
  for (const d of [
    logosDir,
    featDir,
    refsDir,
    shotsPhone,
    shotsTablet7,
    shotsTablet10,
    shotsChromebook,
    path.join(packRoot, "docs"),
    templatesDir
  ]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

async function circularMaskedQ(size) {
  const circleSvg = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
  );
  const resized = await sharp(sourceQ).resize(size, size, { fit: "cover" }).png().toBuffer();
  return sharp(resized)
    .composite([{ input: await sharp(circleSvg).png().toBuffer(), blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function makeCircularQOnWhite(size, outName, fill = 0.88) {
  const qSize = Math.round(size * fill);
  const qSized = await circularMaskedQ(qSize);
  await sharp({
    create: { width: size, height: size, channels: 3, background: { r: 255, g: 255, b: 255 } }
  })
    .composite([{ input: qSized, gravity: "centre" }])
    .png()
    .toFile(path.join(logosDir, outName));
  console.log("wrote", outName, size);
}

async function makeCircularQTransparent(size, outName, fill = 0.92) {
  const qSize = Math.round(size * fill);
  const qSized = await circularMaskedQ(qSize);
  const pad = Math.floor((size - qSize) / 2);
  const padBottom = size - qSize - pad;
  const padRight = size - qSize - pad;
  await sharp(qSized)
    .extend({
      top: pad,
      bottom: padBottom,
      left: pad,
      right: padRight,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(path.join(logosDir, outName));
  console.log("wrote", outName, size, "(transparent)");
}

async function makeFeatureGraphic() {
  const w = 1024;
  const h = 500;
  const logoSize = 210;
  const logo = await circularMaskedQ(logoSize);
  let wordBuf = null;
  if (fs.existsSync(wordmark)) {
    wordBuf = await sharp(wordmark)
      .resize({ width: 420, height: 90, fit: "inside" })
      .png()
      .toBuffer();
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BLUE_TOP}"/>
      <stop offset="55%" stop-color="${BLUE_BOTTOM}"/>
      <stop offset="100%" stop-color="${NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  ${
    wordBuf
      ? ""
      : `<text x="290" y="210" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="64" font-weight="900">Qwertymates</text>`
  }
  <text x="290" y="${wordBuf ? 280 : 290}" fill="${ICE}" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="600">The Digital Home for Doers,</text>
  <text x="290" y="${wordBuf ? 320 : 330}" fill="${ICE}" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="600">Sellers &amp; Creators.</text>
  <text x="290" y="${wordBuf ? 380 : 390}" fill="#B8E4FF" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="600">Wall · Hub · TV · Music · Wallet</text>
</svg>`;

  const comps = [{ input: logo, left: 40, top: Math.round((h - logoSize) / 2) }];
  if (wordBuf) {
    const meta = await sharp(wordBuf).metadata();
    comps.push({
      input: wordBuf,
      left: 290,
      top: 150 - Math.round((meta.height || 70) / 2) + 40
    });
  }

  await sharp(Buffer.from(svg))
    .composite(comps)
    .png()
    .toFile(path.join(featDir, "google-play-feature-1024x500.png"));
  console.log("wrote google-play-feature-1024x500.png");
}

async function makeHuaweiFeature() {
  const w = 1080;
  const h = 600;
  const logoSize = 230;
  const logo = await circularMaskedQ(logoSize);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BLUE_TOP}"/>
      <stop offset="50%" stop-color="${BLUE_BOTTOM}"/>
      <stop offset="100%" stop-color="${NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <text x="310" y="245" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="62" font-weight="900">Qwertymates</text>
  <text x="310" y="325" fill="${ICE}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600">Wall · Hub · TV · Music · Wallet</text>
  <text x="310" y="385" fill="#B8E4FF" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="600">Doers, Sellers &amp; Creators</text>
</svg>`;

  await sharp(Buffer.from(svg))
    .composite([{ input: logo, left: 48, top: Math.round((h - logoSize) / 2) }])
    .png()
    .toFile(path.join(featDir, "huawei-feature-1080x600.png"));
  console.log("wrote huawei-feature-1080x600.png");
}

function templateSvg(w, h, title, platform) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BLUE_TOP}"/>
      <stop offset="55%" stop-color="${BLUE_BOTTOM}"/>
      <stop offset="100%" stop-color="${NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${SURFACE}"/>
  <rect width="${w}" height="${Math.round(h * 0.125)}" fill="url(#g)"/>
  <text x="${w / 2}" y="${Math.round(h * 0.055)}" text-anchor="middle" fill="#FFFFFF" font-family="Arial Black, Arial, sans-serif" font-size="${Math.round(
    w * 0.04
  )}" font-weight="900">PRIMARY CAPTION</text>
  <text x="${w / 2}" y="${Math.round(h * 0.085)}" text-anchor="middle" fill="${ICE}" font-family="Arial, sans-serif" font-size="${Math.round(
    w * 0.024
  )}">Optional subline</text>
  <rect x="${Math.round(w * 0.055)}" y="${Math.round(h * 0.15)}" width="${Math.round(
    w * 0.89
  )}" height="${Math.round(h * 0.78)}" rx="40" fill="#FFFFFF" stroke="${BLUE_BOTTOM}" stroke-width="4" stroke-dasharray="16 12"/>
  <text x="${w / 2}" y="${Math.round(h * 0.52)}" text-anchor="middle" fill="#64748B" font-family="Arial, sans-serif" font-size="${Math.round(
    w * 0.03
  )}">Paste live Qwertymates UI screenshot here</text>
  <text x="${w / 2}" y="${Math.round(h * 0.55)}" text-anchor="middle" fill="#94A3B8" font-family="Arial, sans-serif" font-size="${Math.round(
    w * 0.022
  )}">Safe zone · ${w}×${h} · ${platform}</text>
  <text x="${w / 2}" y="${h - 40}" text-anchor="middle" fill="${BLUE_BOTTOM}" font-family="Arial, sans-serif" font-size="${Math.round(
    w * 0.024
  )}" font-weight="700">${title}</text>
</svg>`;
}

async function writeTemplates() {
  const files = [
    ["android-screenshot-1080x2400.svg", 1080, 2400, "Google Play"],
    ["huawei-screenshot-1080x1920.svg", 1080, 1920, "Huawei"],
    ["ios-screenshot-1242x2688.svg", 1242, 2688, "App Store"]
  ];
  for (const [name, w, h, platform] of files) {
    fs.writeFileSync(path.join(templatesDir, name), templateSvg(w, h, "Qwertymates", platform));
    console.log("wrote templates/" + name);
  }
}

/**
 * Crop Android OS status bar (time / dual-signal / circular battery %) off mobile refs
 * so App Store screenshots do not show non-iOS chrome (Guideline 2.3.10).
 */
async function uiBufferWithoutAndroidStatusBar(src, frameW, frameH, { position = "north" } = {}) {
  const meta = await sharp(src).metadata();
  const base = path.basename(src);
  const isMobileUi = /^ref-mobile-/i.test(base) || /mobile/i.test(base);
  // ~4.8% of phone height covers OEM status bars on these reference captures.
  const cropTop = isMobileUi ? Math.max(18, Math.round((meta.height || 0) * 0.048)) : 0;
  let pipeline = sharp(src);
  if (cropTop > 0 && meta.width && meta.height && meta.height > cropTop + 40) {
    pipeline = pipeline.extract({
      left: 0,
      top: cropTop,
      width: meta.width,
      height: meta.height - cropTop
    });
  }
  return pipeline.resize(frameW, frameH, { fit: "cover", position }).jpeg({ quality: 88 }).toBuffer();
}

/**
 * Portrait marketing frame: gradient caption bar + UI screenshot.
 */
async function makePortraitShot({ src, outDir, outName, caption, sub, width = 1080, height = 2400 }) {
  if (!src || !fs.existsSync(src)) {
    console.warn("skip shot (missing src):", outName);
    return;
  }
  const headerH = Math.max(160, Math.round(height * 0.12));
  const pad = Math.max(28, Math.round(width * 0.033));
  const frameW = width - pad * 2;
  const frameH = height - headerH - pad * 2 - Math.round(height * 0.03);
  const titleSize = Math.max(32, Math.round(width * 0.041));
  const subSize = Math.max(20, Math.round(width * 0.024));
  const ui = await uiBufferWithoutAndroidStatusBar(src, frameW, frameH, { position: "north" });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BLUE_TOP}"/>
      <stop offset="55%" stop-color="${BLUE_BOTTOM}"/>
      <stop offset="100%" stop-color="${NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="${SURFACE}"/>
  <rect width="${width}" height="${headerH}" fill="url(#g)"/>
  <text x="${width / 2}" y="${Math.round(headerH * 0.45)}" text-anchor="middle" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="900">${escapeXml(
    caption
  )}</text>
  <text x="${width / 2}" y="${Math.round(headerH * 0.72)}" text-anchor="middle" fill="${ICE}" font-family="Arial, Helvetica, sans-serif" font-size="${subSize}" font-weight="600">${escapeXml(
    sub
  )}</text>
  <rect x="${pad}" y="${headerH + pad}" width="${frameW}" height="${frameH}" rx="28" fill="#FFFFFF"/>
  <text x="${width / 2}" y="${height - Math.round(height * 0.015)}" text-anchor="middle" fill="${BLUE_BOTTOM}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(
    18,
    Math.round(width * 0.022)
  )}" font-weight="700">Qwertymates</text>
</svg>`;

  await sharp(Buffer.from(svg))
    .composite([{ input: ui, left: pad, top: headerH + pad }])
    .jpeg({ quality: 90 })
    .toFile(path.join(outDir, outName));
  console.log("wrote", path.relative(packRoot, path.join(outDir, outName)));
}

/**
 * Landscape marketing frame (10" tablet / Chromebook): side brand panel + UI.
 */
async function makeLandscapeShot({ src, outDir, outName, caption, sub, width, height }) {
  if (!src || !fs.existsSync(src)) {
    console.warn("skip shot (missing src):", outName);
    return;
  }
  const sideW = Math.round(width * 0.32);
  const pad = Math.round(height * 0.05);
  const contentW = width - sideW;
  const ui = await uiBufferWithoutAndroidStatusBar(src, contentW - pad * 2, height - pad * 2, {
    position: "north"
  });

  const logoSize = Math.round(sideW * 0.28);
  const logo = await circularMaskedQ(logoSize);
  const titleSize = Math.round(sideW * 0.095);
  const subSize = Math.round(sideW * 0.055);
  const words = String(caption || "").trim().split(/\s+/);
  const line1 = words.slice(0, 2).join(" ");
  const line2 = words.slice(2).join(" ");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BLUE_TOP}"/>
      <stop offset="55%" stop-color="${BLUE_BOTTOM}"/>
      <stop offset="100%" stop-color="${NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="${SURFACE}"/>
  <rect width="${sideW}" height="${height}" fill="url(#sg)"/>
  <text x="${Math.round(sideW * 0.1)}" y="${Math.round(height * 0.42)}"
    fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif"
    font-size="${titleSize}" font-weight="900">
    <tspan x="${Math.round(sideW * 0.1)}" dy="0">${escapeXml(line1)}</tspan>
    ${
      line2
        ? `<tspan x="${Math.round(sideW * 0.1)}" dy="${Math.round(titleSize * 1.15)}">${escapeXml(line2)}</tspan>`
        : ""
    }
  </text>
  <text x="${Math.round(sideW * 0.1)}" y="${Math.round(height * 0.62)}"
    fill="${ICE}" font-family="Arial, Helvetica, sans-serif"
    font-size="${subSize}" font-weight="600">${escapeXml(sub)}</text>
  <text x="${Math.round(sideW * 0.1)}" y="${Math.round(height * 0.92)}"
    fill="#B8E4FF" font-family="Arial, Helvetica, sans-serif"
    font-size="${Math.round(subSize * 0.85)}" font-weight="700">Qwertymates</text>
</svg>`;

  await sharp(Buffer.from(svg))
    .composite([
      { input: logo, left: Math.round(sideW * 0.1), top: Math.round(height * 0.12) },
      { input: ui, left: sideW + pad, top: pad }
    ])
    .jpeg({ quality: 90 })
    .toFile(path.join(outDir, outName));
  console.log("wrote", path.relative(packRoot, path.join(outDir, outName)));
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function copyReferences() {
  const pairs = [
    ["ref-website-wall-desktop.png", "image-d84556f1"],
    ["ref-mobile-wall-layout.png", "image-a3fff81d"],
    ["ref-mobile-hub-grid.png", "15.41.50"],
    ["ref-mobile-tiktok.png", "15.55.08"],
    ["ref-mobile-wallet.png", "15.47.11"],
    ["ref-mobile-untitled-posts.png", "15.47.12"]
  ];
  for (const [destName, part] of pairs) {
    const src = findRef(part);
    if (src) {
      fs.copyFileSync(src, path.join(refsDir, destName));
      console.log("copied reference", destName);
    }
  }
  if (fs.existsSync(officialQ)) {
    fs.copyFileSync(officialQ, path.join(refsDir, "qwertymates-q-mark-official.png"));
  }
  if (fs.existsSync(wordmark)) {
    fs.copyFileSync(wordmark, path.join(refsDir, "qwertymates-logo-wordmark.png"));
  }
}

async function makeScreenshots() {
  const web = path.join(refsDir, "ref-website-wall-desktop.png");
  const hub = path.join(refsDir, "ref-mobile-hub-grid.png");
  const wallet = path.join(refsDir, "ref-mobile-wallet.png");
  const tv = path.join(refsDir, "ref-mobile-tiktok.png");
  const mobileWall = path.join(refsDir, "ref-mobile-wall-layout.png");

  const slides = [
    {
      id: "01-wall-feed",
      src: fs.existsSync(mobileWall) ? mobileWall : web,
      caption: "Your Wall",
      sub: "Statuses, posts & creators",
      landscapeSrc: web
    },
    {
      id: "02-qwertyhub",
      src: hub,
      caption: "QwertyHub",
      sub: "Shop local products & stores",
      landscapeSrc: hub
    },
    {
      id: "03-qwertytv",
      src: tv,
      caption: "QwertyTV",
      sub: "Watch videos full screen",
      landscapeSrc: tv
    },
    {
      id: "04-explore",
      src: web,
      caption: "Explore Qwertymates",
      sub: "Hub · TV · Music · Wallet",
      landscapeSrc: web
    },
    {
      id: "05-acbpay-wallet",
      src: wallet,
      // Spaced brand — compound "ACBPayWallet" read as garbled metadata (e.g. AGBFryWallet) → 2.3.10
      caption: "ACBPay Wallet",
      sub: "Top up & pay securely",
      landscapeSrc: wallet
    }
  ];

  for (const s of slides) {
    await makePortraitShot({
      src: s.src,
      outDir: shotsPhone,
      outName: `${s.id}-1080x2400.jpg`,
      caption: s.caption,
      sub: s.sub,
      width: 1080,
      height: 2400
    });
    await makePortraitShot({
      src: s.src,
      outDir: shotsPhone,
      outName: `${s.id}-1080x1920.jpg`,
      caption: s.caption,
      sub: s.sub,
      width: 1080,
      height: 1920
    });
  }

  // 7-inch tablet: portrait 1200×1920 + landscape 1920×1200 (Play up to 8)
  for (const s of slides.slice(0, 4)) {
    await makePortraitShot({
      src: s.src,
      outDir: shotsTablet7,
      outName: `${s.id}-1200x1920.jpg`,
      caption: s.caption,
      sub: s.sub,
      width: 1200,
      height: 1920
    });
    await makeLandscapeShot({
      src: s.landscapeSrc || s.src,
      outDir: shotsTablet7,
      outName: `${s.id}-1920x1200.jpg`,
      caption: s.caption,
      sub: s.sub,
      width: 1920,
      height: 1200
    });
  }

  // Keep legacy tablet-7 desktop sample name for older docs
  if (fs.existsSync(web)) {
    await makeLandscapeShot({
      src: web,
      outDir: shotsTablet7,
      outName: "01-wall-desktop-1920x1200.jpg",
      caption: "Your Wall",
      sub: "Statuses, posts & creators",
      width: 1920,
      height: 1200
    });
  }

  // 10-inch tablet: portrait 1600×2560 + landscape 2560×1600
  for (const s of slides.slice(0, 4)) {
    await makePortraitShot({
      src: s.src,
      outDir: shotsTablet10,
      outName: `${s.id}-1600x2560.jpg`,
      caption: s.caption,
      sub: s.sub,
      width: 1600,
      height: 2560
    });
    await makeLandscapeShot({
      src: s.landscapeSrc || s.src,
      outDir: shotsTablet10,
      outName: `${s.id}-2560x1600.jpg`,
      caption: s.caption,
      sub: s.sub,
      width: 2560,
      height: 1600
    });
  }

  // Chromebook: 1920×1080 landscape (Play needs 4–8)
  for (const s of slides) {
    await makeLandscapeShot({
      src: s.landscapeSrc || s.src,
      outDir: shotsChromebook,
      outName: `${s.id}-1920x1080.jpg`,
      caption: s.caption,
      sub: s.sub,
      width: 1920,
      height: 1080
    });
  }
}

async function main() {
  await ensureDirs();
  if (!fs.existsSync(officialQ)) throw new Error(`Missing official Q: ${officialQ}`);
  fs.copyFileSync(officialQ, sourceQ);
  console.log("source Q →", sourceQ);

  await makeCircularQOnWhite(512, "qwertymates-google-play-icon-512.png", 0.9);
  await makeCircularQOnWhite(1024, "qwertymates-ios-icon-1024-fullbleed.png", 0.96);
  await makeCircularQOnWhite(1024, "qwertymates-ios-icon-1024-white-bg.png", 0.78);
  await makeCircularQOnWhite(216, "qwertymates-huawei-icon-216.png", 0.9);
  await makeCircularQTransparent(512, "qwertymates-adaptive-foreground-512.png", 0.92);

  await makeFeatureGraphic();
  await makeHuaweiFeature();
  await writeTemplates();
  await copyReferences();
  await makeScreenshots();

  console.log("Done →", packRoot);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
