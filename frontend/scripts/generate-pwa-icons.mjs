/**
 * Resize app/icon.png into square PWA assets with honest dimensions for manifest validation.
 * Run: node scripts/generate-pwa-icons.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "app", "icon.png");

async function squarePad(input, size) {
  const base = await sharp(input)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  return base;
}

async function main() {
  if (!fs.existsSync(src)) {
    console.error("Missing", src);
    process.exit(1);
  }
  const outDir = path.join(root, "public");
  const targets = [
    ["pwa-192.png", 192],
    ["pwa-512.png", 512],
    ["apple-touch-icon-180.png", 180],
  ];
  for (const [name, px] of targets) {
    const buf = await squarePad(src, px);
    const dest = path.join(outDir, name);
    fs.writeFileSync(dest, buf);
    console.log("Wrote", path.relative(root, dest), buf.length, "bytes");
  }
  const legacy = path.join(outDir, "qwertymates-logo-icon.png");
  fs.copyFileSync(path.join(outDir, "pwa-512.png"), legacy);
  console.log("Wrote", path.relative(root, legacy), "(512×512 alias for cached manifest / OG URLs)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
