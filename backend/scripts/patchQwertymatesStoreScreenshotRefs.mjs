/**
 * Patch Qwertymates store screenshot references for App Store Guideline 2.3.10.
 * From backend/: node scripts/patchQwertymatesStoreScreenshotRefs.mjs
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

// Canonical pack used by generateQwertymatesStoreAssets.mjs
const GRAPHICS = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "App Stores Graphics",
  "Qwertymates",
  "references"
);
const ANDROID_MIRROR_REFS = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "App Stores Graphics",
  "Android",
  "Qwertymates",
  "references"
);

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function whiteRect(w, h) {
  return sharp(
    Buffer.from(
      `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#FFFFFF"/></svg>`
    )
  )
    .png()
    .toBuffer();
}

async function patchWallet() {
  const file = path.join(GRAPHICS, "ref-mobile-wallet.png");
  const bak = file.replace(/\.png$/i, ".pre-2310.png");
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
  // Always patch from backup so re-runs are idempotent
  const src = bak;
  const meta = await sharp(src).metadata();
  const w = meta.width;
  const h = meta.height;

  // Measured for 460x1024 capture: website CTA ~y 500-620; bottom nav label ~y 930
  const ctaLeft = Math.round(w * 0.05);
  const ctaTop = Math.round(h * 0.49);
  const ctaW = Math.round(w * 0.9);
  const ctaH = Math.round(h * 0.13);

  const navLeft = Math.round(w * 0.78);
  const navTop = Math.round(h * 0.91);
  const navW = Math.round(w * 0.2);
  const navH = Math.round(h * 0.04);

  const ctaCard = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${ctaW}" height="${ctaH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${ctaW}" height="${ctaH}" fill="#FFFFFF"/>
  <rect x="4" y="8" width="${ctaW - 8}" height="${ctaH - 16}" rx="10" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="2"/>
  <text x="${ctaW / 2}" y="${Math.round(ctaH * 0.42)}" text-anchor="middle" fill="#0F172A"
    font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700">${escapeXml("ACBPay Wallet")}</text>
  <text x="${ctaW / 2}" y="${Math.round(ctaH * 0.68)}" text-anchor="middle" fill="#64748B"
    font-family="Arial, Helvetica, sans-serif" font-size="12">${escapeXml("Top up, send &amp; pay in-app")}</text>
</svg>`);

  const navLabel = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${navW}" height="${navH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${navW}" height="${navH}" fill="#FFFFFF"/>
  <text x="${navW / 2}" y="${Math.round(navH * 0.7)}" text-anchor="middle" fill="#0B5FFF"
    font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700">${escapeXml("Wallet")}</text>
</svg>`);

  await sharp(src)
    .composite([
      { input: await whiteRect(ctaW, ctaH), left: ctaLeft, top: ctaTop },
      { input: await sharp(ctaCard).png().toBuffer(), left: ctaLeft, top: ctaTop },
      { input: await sharp(navLabel).png().toBuffer(), left: navLeft, top: navTop }
    ])
    .png()
    .toFile(file);
  console.log("patched wallet", `${w}x${h}`);
}

async function patchWall() {
  const file = path.join(GRAPHICS, "ref-mobile-wall-layout.png");
  const bak = file.replace(/\.png$/i, ".pre-2310.png");
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
  const src = bak;
  const meta = await sharp(src).metadata();
  const w = meta.width;
  const h = meta.height;

  // 210x453: tip cup ~ mid action row; wallet nav label bottom-right
  const tipLeft = Math.round(w * 0.4);
  const tipTop = Math.round(h * 0.7);
  const tipW = Math.round(w * 0.12);
  const tipH = Math.round(h * 0.05);

  const navLeft = Math.round(w * 0.78);
  const navTop = Math.round(h * 0.905);
  const navW = Math.round(w * 0.2);
  const navH = Math.round(h * 0.045);

  const navLabel = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${navW}" height="${navH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${navW}" height="${navH}" fill="#FFFFFF"/>
  <text x="${navW / 2}" y="${Math.round(navH * 0.7)}" text-anchor="middle" fill="#64748B"
    font-family="Arial, Helvetica, sans-serif" font-size="8" font-weight="700">${escapeXml("Wallet")}</text>
</svg>`);

  await sharp(src)
    .composite([
      { input: await whiteRect(tipW, tipH), left: tipLeft, top: tipTop },
      { input: await sharp(navLabel).png().toBuffer(), left: navLeft, top: navTop }
    ])
    .png()
    .toFile(file);
  console.log("patched wall", `${w}x${h}`);
}

await patchWallet();
await patchWall();
// Keep Android/IOS pipeline refs in sync when present
for (const name of ["ref-mobile-wallet.png", "ref-mobile-wall-layout.png"]) {
  const src = path.join(GRAPHICS, name);
  const dest = path.join(ANDROID_MIRROR_REFS, name);
  if (fs.existsSync(src) && fs.existsSync(path.dirname(dest))) {
    fs.copyFileSync(src, dest);
    console.log("mirrored", name, "→ Android/Qwertymates/references");
  }
}
console.log("Done.");
