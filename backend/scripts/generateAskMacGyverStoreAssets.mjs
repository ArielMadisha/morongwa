/**
 * Generate Ask MacGyver App Store / Play / AppGallery assets.
 * Circular Q only — no white square plate / borderline around the mark.
 *
 * From morongwa/backend/:
 *   node scripts/generateAskMacGyverStoreAssets.mjs
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
  "Ask MacGyver"
);
const logosDir = path.join(packRoot, "logos");
const featDir = path.join(packRoot, "feature-graphics");
const sourceQ = path.join(logosDir, "ask-macgyver-q-mark-source.png");
const multitoolSvg = path.join(logosDir, "macgyver-multitool-mark.svg");
const officialQ = path.join(
  __dirname,
  "..",
  "..",
  "frontend",
  "public",
  "qwertymates-q-mark-official.png"
);

const BLUE_TOP = "#00C2FF";
const BLUE_MID = "#007BFF";
const BLUE_NAVY = "#003D82";
const AMBER = "#F59E0B";
const AMBER_DARK = "#D97706";

/** Circular-mask the Q so white square corners never show as a border plate. */
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

/** Circular Q centered on white — no blue square plate, no white ring border. */
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

/** Circular Q on transparent (adaptive foreground). */
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

/** In-app / alternate mark: multitool on amber. */
async function makeMultitoolIcon(size, outName) {
  if (!fs.existsSync(multitoolSvg)) return;
  const svg = fs.readFileSync(multitoolSvg, "utf8");
  const amberSvg = svg.replace(/#2563eb/g, AMBER).replace(/#1d4ed8/g, AMBER_DARK);
  const buf = await sharp(Buffer.from(amberSvg)).resize(size, size).png().toBuffer();
  await sharp(buf).png().toFile(path.join(logosDir, outName));
  console.log("wrote", outName, size);
}

async function makeFeatureGraphic() {
  const w = 1024;
  const h = 500;
  const logoSize = 200;
  const logo = await circularMaskedQ(logoSize);

  // Title + tagline only — no feature chips, no orange Ask button
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BLUE_TOP}"/>
      <stop offset="50%" stop-color="${BLUE_MID}"/>
      <stop offset="100%" stop-color="${BLUE_NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <text x="280" y="230" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="54" font-weight="900">Ask MacGyver AI</text>
  <text x="280" y="300" fill="#E8F6FF" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600">When there's no solution… MacGyver makes one.</text>
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
  const logoSize = 220;
  const logo = await circularMaskedQ(logoSize);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BLUE_TOP}"/>
      <stop offset="50%" stop-color="${BLUE_MID}"/>
      <stop offset="100%" stop-color="${BLUE_NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <text x="310" y="260" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="56" font-weight="900">Ask MacGyver AI</text>
  <text x="310" y="340" fill="#E8F6FF" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="600">When there's no solution… MacGyver makes one.</text>
  <text x="310" y="410" fill="#B8E4FF" font-family="Arial, Helvetica, sans-serif" font-size="24">Before Internet… there was MacGyver.</text>
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
  if (!fs.existsSync(sourceQ)) throw new Error(`Missing ${sourceQ}`);
  fs.mkdirSync(logosDir, { recursive: true });
  fs.mkdirSync(featDir, { recursive: true });

  // Clean circular Q on white (no white square border plate)
  await makeCircularQOnWhite(512, "ask-macgyver-google-play-icon-512.png", 0.9);
  await makeCircularQOnWhite(1024, "ask-macgyver-ios-icon-1024-fullbleed.png", 0.96);
  await makeCircularQOnWhite(1024, "ask-macgyver-ios-icon-1024-white-bg.png", 0.78);
  await makeCircularQOnWhite(216, "ask-macgyver-huawei-icon-216.png", 0.9);
  await makeCircularQTransparent(512, "ask-macgyver-adaptive-foreground-512.png", 0.92);

  await makeMultitoolIcon(512, "ask-macgyver-feature-wrench-icon-512.png");
  await makeMultitoolIcon(1024, "ask-macgyver-feature-wrench-icon-1024.png");
  await makeFeatureGraphic();
  await makeHuaweiFeature();
  console.log("Done →", packRoot);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
