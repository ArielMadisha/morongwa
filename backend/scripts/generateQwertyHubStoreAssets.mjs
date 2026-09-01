/**
 * Generate QwertyHub App Store / Play / AppGallery logo + feature graphics
 * from the official circular Q mark — no square blue border plate, no extra rings.
 *
 * From morongwa/backend/:
 *   node scripts/generateQwertyHubStoreAssets.mjs
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
  "QwertyHub"
);
const sourceQ = path.join(packRoot, "logos", "qwertyhub-q-mark-source.png");
const logosDir = path.join(packRoot, "logos");
const featDir = path.join(packRoot, "feature-graphics");

const BLUE_TOP = "#00C2FF";
const BLUE_BOTTOM = "#007BFF";
const NAVY = "#003D82";

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

async function ensureDirs() {
  for (const d of [logosDir, featDir]) fs.mkdirSync(d, { recursive: true });
}

/** Circular-mask the official Q so white square corners do not show. */
async function circularMaskedQ(size) {
  const circleSvg = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
  );
  const resized = await sharp(sourceQ)
    .resize(size, size, { fit: "cover" })
    .png()
    .toBuffer();
  return sharp(resized)
    .composite([{ input: await sharp(circleSvg).png().toBuffer(), blend: "dest-in" }])
    .png()
    .toBuffer();
}

/**
 * Circular Q only, centered on white — no square blue border/frame, no rings.
 */
async function makeCircularQOnWhite(size, outName, fill = 0.88) {
  const qSize = Math.round(size * fill);
  const qSized = await circularMaskedQ(qSize);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: qSized, gravity: "centre" }])
    .png()
    .toFile(path.join(logosDir, outName));
  console.log("wrote", outName, size, `(Q fill ${fill})`);
}

/** Adaptive / foreground: circular Q on transparent. */
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
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path.join(logosDir, outName));
  console.log("wrote", outName, size, "(transparent)");
}

async function makeFeatureGraphic() {
  const w = 1024;
  const h = 500;
  const logoSize = 220;
  const logo = await circularMaskedQ(logoSize);

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
  <text x="300" y="220" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="72" font-weight="900">QwertyHub</text>
  <text x="300" y="310" fill="#E8F6FF" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600">Shop Local. Pay Securely.</text>
  <text x="300" y="360" fill="#E8F6FF" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600">Collect or Deliver Instantly.</text>
</svg>`;

  await sharp(Buffer.from(svg))
    .composite([{ input: logo, left: 48, top: Math.round((h - logoSize) / 2) }])
    .png()
    .toFile(path.join(featDir, "google-play-feature-1024x500.png"));
  console.log("wrote google-play-feature-1024x500.png");
}

async function makeHuaweiFeature() {
  const w = 1080;
  const h = 600;
  const logoSize = 240;
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
  <text x="320" y="260" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="70" font-weight="900">QwertyHub</text>
  <text x="320" y="350" fill="#E8F6FF" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="600">Shop Local. Pay Securely.</text>
  <text x="320" y="400" fill="#E8F6FF" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="600">Collect or Deliver Instantly.</text>
</svg>`;

  await sharp(Buffer.from(svg))
    .composite([{ input: logo, left: 52, top: Math.round((h - logoSize) / 2) }])
    .png()
    .toFile(path.join(featDir, "huawei-feature-1080x600.png"));
  console.log("wrote huawei-feature-1080x600.png");
}

async function main() {
  if (fs.existsSync(officialQ)) {
    fs.copyFileSync(officialQ, sourceQ);
  }
  if (!fs.existsSync(sourceQ)) throw new Error(`Missing source: ${sourceQ}`);
  await ensureDirs();

  // Clean circular Q only on white (previous version before concentric rings)
  await makeCircularQOnWhite(512, "qwertyhub-google-play-icon-512.png", 0.9);
  await makeCircularQOnWhite(1024, "qwertyhub-ios-icon-1024-fullbleed.png", 0.96);
  await makeCircularQOnWhite(1024, "qwertyhub-ios-icon-1024-white-bg.png", 0.78);
  await makeCircularQOnWhite(216, "qwertyhub-huawei-icon-216.png", 0.9);
  await makeCircularQTransparent(512, "qwertyhub-adaptive-foreground-512.png", 0.92);

  // Remove temp crops if present
  for (const tmp of ["_ref-q-crop.png", "_ref-q-512.png"]) {
    const p = path.join(logosDir, tmp);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  await makeFeatureGraphic();
  await makeHuaweiFeature();
  console.log("Done →", packRoot);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
