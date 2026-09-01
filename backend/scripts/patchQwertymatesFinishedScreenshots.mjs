/**
 * Cover obsolete UI in finished Qwertymates store screenshots (Guideline 2.3.10).
 * Patches phone + iOS sized wallet shots after generation.
 *
 * From backend/:
 *   node scripts/patchQwertymatesFinishedScreenshots.mjs
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const ROOT = path.join("C:", "Users", "Dell", ".cursor", "projects", "App Stores Graphics");

const TARGETS = [
  path.join(ROOT, "Qwertymates", "screenshots", "phone"),
  path.join(ROOT, "Android", "Qwertymates", "screenshots", "phone"),
  path.join(ROOT, "IOS", "Qwertymates", "screenshots", "iphone-6-7"),
  path.join(ROOT, "IOS", "Qwertymates", "screenshots", "iphone-6-5"),
  path.join(ROOT, "IOS", "Qwertymates", "screenshots", "iphone-5-5"),
  path.join(ROOT, "IOS", "Qwertymates", "screenshots", "ipad-12-9")
];

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function patchWalletShot(file) {
  const meta = await sharp(file).metadata();
  const w = meta.width;
  const h = meta.height;

  // Marketing frame: header ~12%, phone UI starts below. Website CTA sits mid-UI.
  // Tuned for 1080x2400 / 1242x2688 / 1290x2796 framed shots.
  const ctaLeft = Math.round(w * 0.08);
  const ctaTop = Math.round(h * 0.58);
  const ctaW = Math.round(w * 0.84);
  const ctaH = Math.round(h * 0.1);

  const card = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${ctaW}" height="${ctaH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${ctaW}" height="${ctaH}" fill="#FFFFFF"/>
  <rect x="2" y="4" width="${ctaW - 4}" height="${ctaH - 8}" rx="14" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="2"/>
  <text x="${ctaW / 2}" y="${Math.round(ctaH * 0.4)}" text-anchor="middle" fill="#0F172A"
    font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(18, Math.round(w * 0.028))}" font-weight="700">${escapeXml(
      "ACBPay Wallet"
    )}</text>
  <text x="${ctaW / 2}" y="${Math.round(ctaH * 0.68)}" text-anchor="middle" fill="#64748B"
    font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(14, Math.round(w * 0.02))}">${escapeXml(
      "Top up, send money and pay in-app"
    )}</text>
</svg>`);

  // Cover website CTA only — header caption already says "ACBPay Wallet"
  const outTmp = file + ".tmp.jpg";
  await sharp(file)
    .composite([{ input: await sharp(card).png().toBuffer(), left: ctaLeft, top: ctaTop }])
    .jpeg({ quality: 90 })
    .toFile(outTmp);
  fs.renameSync(outTmp, file);
  console.log("patched", path.relative(ROOT, file));
}

async function patchWallShot(file) {
  const meta = await sharp(file).metadata();
  const w = meta.width;
  const h = meta.height;
  // Cover tip/coffee icon in action row + wallet nav label
  const tipLeft = Math.round(w * 0.42);
  const tipTop = Math.round(h * 0.72);
  const tipW = Math.round(w * 0.08);
  const tipH = Math.round(h * 0.04);
  const navLeft = Math.round(w * 0.72);
  const navTop = Math.round(h * 0.86);
  const navW = Math.round(w * 0.2);
  const navH = Math.round(h * 0.035);

  const white = await sharp(
    Buffer.from(
      `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${tipW}" height="${tipH}"><rect width="${tipW}" height="${tipH}" fill="#FFFFFF"/></svg>`
    )
  )
    .png()
    .toBuffer();
  const nav = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${navW}" height="${navH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${navW}" height="${navH}" fill="#FFFFFF"/>
  <text x="${navW / 2}" y="${Math.round(navH * 0.72)}" text-anchor="middle" fill="#64748B"
    font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(12, Math.round(w * 0.018))}" font-weight="700">${escapeXml(
      "Wallet"
    )}</text>
</svg>`);

  const outTmp = file + ".tmp.jpg";
  await sharp(file)
    .composite([
      { input: white, left: tipLeft, top: tipTop },
      { input: await sharp(nav).png().toBuffer(), left: navLeft, top: navTop }
    ])
    .jpeg({ quality: 90 })
    .toFile(outTmp);
  fs.renameSync(outTmp, file);
  console.log("patched", path.relative(ROOT, file));
}

for (const dir of TARGETS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (/05-acbpay-wallet/i.test(f) && /\.jpe?g$/i.test(f)) await patchWalletShot(fp);
    if (/01-wall-feed/i.test(f) && /\.jpe?g$/i.test(f) && !/desktop|landscape/i.test(f)) {
      await patchWallShot(fp);
    }
  }
}
console.log("Done.");
