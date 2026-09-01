/**
 * Generate Morongwa Messenger App Store / Play / AppGallery logos + feature graphics.
 * Brand: chat-bubble mark (from website header) on Qwertymates blue.
 *
 * From morongwa/backend/:
 *   node scripts/generateMorongwaMessengerStoreAssets.mjs
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
  "Morongwa - Messenger"
);
const logosDir = path.join(packRoot, "logos");
const featDir = path.join(packRoot, "feature-graphics");
const refsDir = path.join(packRoot, "references");
const qMark = path.join(refsDir, "qwertymates-q-mark-official.png");

const BLUE = "#0E5BB5";
const BLUE_LIGHT = "#2B7DE0";
const BLUE_TOP = "#4AA3F0";
const NAVY = "#0A3D7A";

function ensureDirs() {
  for (const d of [logosDir, featDir]) fs.mkdirSync(d, { recursive: true });
}

/** SVG: dual chat bubbles (solid + outline) — matches brand header icon. */
function chatBubbleSvg(size, { onTransparent = false } = {}) {
  const pad = size * 0.14;
  const w = size - pad * 2;
  const h = w * 0.78;
  const x = pad;
  const y = (size - h) / 2 - size * 0.02;
  // Back outline bubble (bottom-right)
  const bx = x + w * 0.22;
  const by = y + h * 0.18;
  const bw = w * 0.72;
  const bh = h * 0.72;
  // Front solid bubble (top-left)
  const fx = x;
  const fy = y;
  const fw = w * 0.72;
  const fh = h * 0.72;
  const r = Math.min(fw, fh) * 0.22;
  const dotsY = fy + fh * 0.42;
  const dotsR = size * 0.028;
  const c1 = fx + fw * 0.28;
  const c2 = fx + fw * 0.5;
  const c3 = fx + fw * 0.72;

  const bg = onTransparent
    ? ""
    : `<defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BLUE_TOP}"/>
      <stop offset="55%" stop-color="${BLUE}"/>
      <stop offset="100%" stop-color="${NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#bg)"/>`;

  // On blue plate use white bubbles; on transparent/white use brand blue
  const solid = onTransparent ? BLUE : "#FFFFFF";
  const outline = onTransparent ? BLUE : "rgba(255,255,255,0.92)";
  const dots = onTransparent ? "#FFFFFF" : BLUE;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  ${bg}
  <!-- Outline bubble (back) -->
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${r}" ry="${r}"
    fill="none" stroke="${outline}" stroke-width="${size * 0.035}"/>
  <!-- Solid bubble (front) -->
  <rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="${r}" ry="${r}" fill="${solid}"/>
  <!-- Typing dots -->
  <circle cx="${c1}" cy="${dotsY}" r="${dotsR}" fill="${dots}"/>
  <circle cx="${c2}" cy="${dotsY}" r="${dotsR}" fill="${dots}"/>
  <circle cx="${c3}" cy="${dotsY}" r="${dotsR}" fill="${dots}"/>
</svg>`;
}

async function writePngFromSvg(svg, outPath) {
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log("wrote", path.basename(outPath));
}

async function makePlayIcon(size, name) {
  await writePngFromSvg(chatBubbleSvg(size), path.join(logosDir, name));
}

async function makeWhiteBgIcon(size, name) {
  const bubble = await sharp(Buffer.from(chatBubbleSvg(size, { onTransparent: true })))
    .resize(Math.round(size * 0.72), Math.round(size * 0.72))
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: bubble, gravity: "centre" }])
    .png()
    .toFile(path.join(logosDir, name));
  console.log("wrote", name);
}

async function makeAdaptiveForeground(size, name) {
  // Transparent canvas + blue chat bubbles (system mask applies)
  const bubble = await sharp(Buffer.from(chatBubbleSvg(Math.round(size * 0.78), { onTransparent: true })))
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: bubble, gravity: "centre" }])
    .png()
    .toFile(path.join(logosDir, name));
  console.log("wrote", name);
}

async function makeFeatureGraphic() {
  const w = 1024;
  const h = 500;
  const iconSize = 200;
  const icon = await sharp(Buffer.from(chatBubbleSvg(iconSize))).png().toBuffer();

  let qBuf = null;
  if (fs.existsSync(qMark)) {
    qBuf = await sharp(qMark)
      .resize(56, 56, { fit: "cover" })
      .png()
      .toBuffer();
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BLUE_TOP}"/>
      <stop offset="50%" stop-color="${BLUE}"/>
      <stop offset="100%" stop-color="${NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <text x="280" y="230" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="64" font-weight="900">Morongwa</text>
  <text x="280" y="300" fill="#E8F4FF" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="600">Chat - Call - Meet - Errands</text>
</svg>`;

  const composites = [{ input: icon, left: 48, top: Math.round((h - iconSize) / 2) }];
  if (qBuf) {
    composites.push({ input: qBuf, left: w - 72, top: h - 72 });
  }

  await sharp(Buffer.from(svg))
    .composite(composites)
    .png()
    .toFile(path.join(featDir, "google-play-feature-1024x500.png"));
  console.log("wrote google-play-feature-1024x500.png");
}

async function makeHuaweiFeature() {
  const w = 1080;
  const h = 600;
  const iconSize = 220;
  const icon = await sharp(Buffer.from(chatBubbleSvg(iconSize))).png().toBuffer();

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BLUE_TOP}"/>
      <stop offset="50%" stop-color="${BLUE}"/>
      <stop offset="100%" stop-color="${NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <text x="300" y="260" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="66" font-weight="900">Morongwa</text>
  <text x="300" y="340" fill="#E8F4FF" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="600">Chat - Call - Meet - Errands</text>
  <text x="300" y="410" fill="#B8D9F8" font-family="Arial, Helvetica, sans-serif" font-size="22">Same Qwertymates account · Secure &amp; fast</text>
</svg>`;

  await sharp(Buffer.from(svg))
    .composite([{ input: icon, left: 52, top: Math.round((h - iconSize) / 2) }])
    .png()
    .toFile(path.join(featDir, "huawei-feature-1080x600.png"));
  console.log("wrote huawei-feature-1080x600.png");
}

async function main() {
  ensureDirs();
  await makePlayIcon(512, "morongwa-google-play-icon-512.png");
  await makePlayIcon(1024, "morongwa-ios-icon-1024-fullbleed.png");
  await makeWhiteBgIcon(1024, "morongwa-ios-icon-1024-white-bg.png");
  await makePlayIcon(216, "morongwa-huawei-icon-216.png");
  await makeAdaptiveForeground(512, "morongwa-adaptive-foreground-512.png");
  // Source mark for reuse
  await makePlayIcon(512, "morongwa-chat-mark-source.png");
  await makeFeatureGraphic();
  await makeHuaweiFeature();
  console.log("Done →", packRoot);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
