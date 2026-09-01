/**
 * Generate ACBPay / ACBPayWallet Android + shared store assets under
 * `App Stores Graphics/Android/ACBPay/`, using official marks from the
 * ACBPayWallet mobile project.
 *
 * From morongwa/backend/:
 *   node scripts/generateACBPayStoreAssets.mjs
 *
 * Then build iOS pack:
 *   node scripts/generateIosStoreGraphicsPacks.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GRAPHICS_ROOT = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "App Stores Graphics"
);
const packRoot = path.join(GRAPHICS_ROOT, "Android", "ACBPay");
const logosDir = path.join(packRoot, "logos");
const featDir = path.join(packRoot, "feature-graphics");
const refsDir = path.join(packRoot, "references");
const templatesDir = path.join(packRoot, "templates");
const docsDir = path.join(packRoot, "docs");
const shotsPhone = path.join(packRoot, "screenshots", "phone");
const shotsTablet7 = path.join(packRoot, "screenshots", "tablet-7");
const shotsTablet10 = path.join(packRoot, "screenshots", "tablet-10");

const MOBILE_ASSETS = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "ACBPayWallet",
  "mobile",
  "assets"
);

const SOURCE_ICON = path.join(MOBILE_ASSETS, "icon.png");
const SOURCE_MARK = path.join(MOBILE_ASSETS, "favicon-source.png");
const SOURCE_WORDMARK = path.join(MOBILE_ASSETS, "logo-primary-color.png");
const SOURCE_LOGO = path.join(MOBILE_ASSETS, "acbpay-logo.png");

/** Brand — from ACBPay mobile `acbpayBrand.ts` + icon sampling */
const CYAN = "#22d3ee";
const CYAN_SOFT = "#67e8f9";
const CHARCOAL = "#3d4f5f";
const MARK_NAVY = "#101038";
const BLACK = "#0a0a0a";
const SURFACE = "#0B1220";
const ICE = "#E8F6FF";
const SLATE = "#94A3B8";

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Flatten mark onto solid black (App Store icons cannot be transparent). */
async function makeFullBleedIcon(size, outName) {
  const src = fs.existsSync(SOURCE_ICON) ? SOURCE_ICON : SOURCE_MARK;
  if (!fs.existsSync(src)) throw new Error(`Missing ACBPay icon source: ${src}`);
  const mark = await sharp(src)
    .resize(size, size, { fit: "contain", background: { r: 10, g: 10, b: 10, alpha: 1 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 10, g: 10, b: 10 }
    }
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toFile(path.join(logosDir, outName));
  console.log("wrote", outName, size);
}

/** Mark on white — ASC / Play alternate. */
async function makeWhiteBgIcon(size, outName, fill = 0.72) {
  const src = fs.existsSync(SOURCE_MARK) ? SOURCE_MARK : SOURCE_ICON;
  const markSize = Math.round(size * fill);
  const mark = await sharp(src)
    .resize(markSize, markSize, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toFile(path.join(logosDir, outName));
  console.log("wrote", outName, size, `(fill ${fill})`);
}

/** Transparent adaptive foreground. */
async function makeAdaptiveForeground(size, outName) {
  const src = fs.existsSync(SOURCE_ICON) ? SOURCE_ICON : SOURCE_MARK;
  await sharp(src)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(logosDir, outName));
  console.log("wrote", outName, size, "(transparent)");
}

async function makeFeatureGraphic() {
  const w = 1024;
  const h = 500;
  const logoSize = 190;
  const icon = await sharp(path.join(logosDir, "acbpay-ios-icon-1024-fullbleed.png"))
    .resize(logoSize, logoSize)
    .png()
    .toBuffer();

  let wordmark = null;
  const wmSrc = fs.existsSync(SOURCE_WORDMARK) ? SOURCE_WORDMARK : SOURCE_LOGO;
  if (fs.existsSync(wmSrc)) {
    wordmark = await sharp(wmSrc)
      .resize(480, 150, { fit: "inside" })
      .png()
      .toBuffer();
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${CYAN}"/>
      <stop offset="45%" stop-color="#0891b2"/>
      <stop offset="100%" stop-color="${MARK_NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <text x="280" y="210" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="58" font-weight="900">ACBPay</text>
  <text x="280" y="275" fill="${ICE}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600">Prepaid wallet for Qwertymates</text>
  <text x="280" y="340" fill="#B8E4FF" font-family="Arial, Helvetica, sans-serif" font-size="22">Top up · Send · Pay · Track</text>
</svg>`;

  const layers = [{ input: icon, left: 48, top: Math.round((h - logoSize) / 2) }];
  if (wordmark) {
    const meta = await sharp(wordmark).metadata();
    layers.push({
      input: wordmark,
      left: 280,
      top: Math.min(360, h - (meta.height || 80) - 24)
    });
  }

  await sharp(Buffer.from(svg))
    .composite(layers)
    .png()
    .toFile(path.join(featDir, "google-play-feature-1024x500.png"));
  console.log("wrote google-play-feature-1024x500.png");
}

async function makeHuaweiFeature() {
  const w = 1080;
  const h = 600;
  const logoSize = 210;
  const icon = await sharp(path.join(logosDir, "acbpay-ios-icon-1024-fullbleed.png"))
    .resize(logoSize, logoSize)
    .png()
    .toBuffer();

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${CYAN}"/>
      <stop offset="45%" stop-color="#0891b2"/>
      <stop offset="100%" stop-color="${MARK_NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <text x="300" y="250" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="60" font-weight="900">ACBPay</text>
  <text x="300" y="320" fill="${ICE}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="600">Your prepaid wallet companion</text>
  <text x="300" y="390" fill="#B8E4FF" font-family="Arial, Helvetica, sans-serif" font-size="24">Powered by Qwertymates</text>
</svg>`;

  await sharp(Buffer.from(svg))
    .composite([{ input: icon, left: 52, top: Math.round((h - logoSize) / 2) }])
    .png()
    .toFile(path.join(featDir, "huawei-feature-1080x600.png"));
  console.log("wrote huawei-feature-1080x600.png");
}

/** Synthetic wallet UI panel used as screenshot body. */
async function makeWalletUiPanel(w, h, variant) {
  const titles = {
    balance: { h1: "Available balance", h2: "R 1,250.00", hint: "ZAR · Prepaid wallet" },
    send: { h1: "Send money", h2: "To anyone on ACBPay", hint: "Instant · Secure" },
    topup: { h1: "Top up", h2: "Add funds securely", hint: "Card · Instant EFT" },
    activity: { h1: "Activity", h2: "Recent transactions", hint: "Clear history" },
    pay: { h1: "Pay & QR", h2: "Checkout with wallet", hint: "Qwertymates · Hub" }
  };
  const t = titles[variant] || titles.balance;
  const iconSize = Math.round(Math.min(w, h) * 0.14);
  const icon = await sharp(path.join(logosDir, "acbpay-ios-icon-1024-fullbleed.png"))
    .resize(iconSize, iconSize)
    .png()
    .toBuffer();

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="card" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="${MARK_NAVY}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="1" y2="0">
      <stop offset="0%" stop-color="${CYAN}"/>
      <stop offset="100%" stop-color="#0891b2"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#eef2f7"/>
  <rect x="${Math.round(w * 0.06)}" y="${Math.round(h * 0.12)}" width="${Math.round(w * 0.88)}" height="${Math.round(h * 0.32)}" rx="28" fill="url(#card)"/>
  <text x="${Math.round(w * 0.1)}" y="${Math.round(h * 0.22)}" fill="${SLATE}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.035)}">${escapeXml(t.h1)}</text>
  <text x="${Math.round(w * 0.1)}" y="${Math.round(h * 0.3)}" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.08)}" font-weight="900">${escapeXml(t.h2)}</text>
  <text x="${Math.round(w * 0.1)}" y="${Math.round(h * 0.37)}" fill="${CYAN_SOFT}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.03)}">${escapeXml(t.hint)}</text>
  <rect x="${Math.round(w * 0.06)}" y="${Math.round(h * 0.5)}" width="${Math.round(w * 0.42)}" height="${Math.round(h * 0.12)}" rx="18" fill="#FFFFFF"/>
  <rect x="${Math.round(w * 0.52)}" y="${Math.round(h * 0.5)}" width="${Math.round(w * 0.42)}" height="${Math.round(h * 0.12)}" rx="18" fill="#FFFFFF"/>
  <text x="${Math.round(w * 0.27)}" y="${Math.round(h * 0.575)}" text-anchor="middle" fill="${CHARCOAL}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.032)}" font-weight="700">Send</text>
  <text x="${Math.round(w * 0.73)}" y="${Math.round(h * 0.575)}" text-anchor="middle" fill="${CHARCOAL}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.032)}" font-weight="700">Top up</text>
  <rect x="${Math.round(w * 0.06)}" y="${Math.round(h * 0.68)}" width="${Math.round(w * 0.88)}" height="${Math.round(h * 0.22)}" rx="22" fill="#FFFFFF"/>
  <rect x="${Math.round(w * 0.06)}" y="${Math.round(h * 0.68)}" width="${Math.round(w * 0.88)}" height="6" rx="3" fill="url(#accent)"/>
  <text x="${Math.round(w * 0.1)}" y="${Math.round(h * 0.78)}" fill="${CHARCOAL}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.034)}" font-weight="700">ACBPay Wallet</text>
  <text x="${Math.round(w * 0.1)}" y="${Math.round(h * 0.84)}" fill="${SLATE}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.028)}">Companion to Qwertymates</text>
</svg>`;

  return sharp(Buffer.from(svg))
    .composite([
      {
        input: icon,
        left: Math.round(w * 0.72),
        top: Math.round(h * 0.16)
      }
    ])
    .png()
    .toBuffer();
}

async function makePortraitShot({ panel, outDir, outName, caption, sub, width, height }) {
  const headerH = Math.max(160, Math.round(height * 0.12));
  const pad = Math.max(28, Math.round(width * 0.033));
  const frameW = width - pad * 2;
  const frameH = height - headerH - pad * 2 - Math.round(height * 0.03);
  const titleSize = Math.max(32, Math.round(width * 0.041));
  const subSize = Math.max(20, Math.round(width * 0.024));
  const ui = await sharp(panel)
    .resize(frameW, frameH, { fit: "cover", position: "north" })
    .jpeg({ quality: 88 })
    .toBuffer();

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${CYAN}"/>
      <stop offset="55%" stop-color="#0891b2"/>
      <stop offset="100%" stop-color="${MARK_NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="${SURFACE}"/>
  <rect width="${width}" height="${headerH}" fill="url(#g)"/>
  <text x="${width / 2}" y="${Math.round(headerH * 0.45)}" text-anchor="middle" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="900">${escapeXml(caption)}</text>
  <text x="${width / 2}" y="${Math.round(headerH * 0.72)}" text-anchor="middle" fill="${ICE}" font-family="Arial, Helvetica, sans-serif" font-size="${subSize}" font-weight="600">${escapeXml(sub)}</text>
  <rect x="${pad}" y="${headerH + pad}" width="${frameW}" height="${frameH}" rx="28" fill="#FFFFFF"/>
  <text x="${width / 2}" y="${height - Math.round(height * 0.015)}" text-anchor="middle" fill="${CYAN}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(18, Math.round(width * 0.022))}" font-weight="700">ACBPay</text>
</svg>`;

  await sharp(Buffer.from(svg))
    .composite([{ input: ui, left: pad, top: headerH + pad }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(path.join(outDir, outName));
  console.log("wrote", path.relative(packRoot, path.join(outDir, outName)));
}

async function makeLandscapeShot({ panel, outDir, outName, caption, sub, width, height }) {
  const sideW = Math.round(width * 0.28);
  const pad = Math.max(24, Math.round(height * 0.04));
  const frameW = width - sideW - pad * 2;
  const frameH = height - pad * 2;
  const ui = await sharp(panel)
    .resize(frameW, frameH, { fit: "cover", position: "centre" })
    .jpeg({ quality: 88 })
    .toBuffer();

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${CYAN}"/>
      <stop offset="100%" stop-color="${MARK_NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="${SURFACE}"/>
  <rect width="${sideW}" height="${height}" fill="url(#g)"/>
  <text x="${Math.round(sideW / 2)}" y="${Math.round(height * 0.42)}" text-anchor="middle" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${Math.round(sideW * 0.12)}" font-weight="900">${escapeXml(caption)}</text>
  <text x="${Math.round(sideW / 2)}" y="${Math.round(height * 0.52)}" text-anchor="middle" fill="${ICE}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(sideW * 0.07)}">${escapeXml(sub)}</text>
</svg>`;

  await sharp(Buffer.from(svg))
    .composite([{ input: ui, left: sideW + pad, top: pad }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(path.join(outDir, outName));
  console.log("wrote", path.relative(packRoot, path.join(outDir, outName)));
}

async function makeScreenshots() {
  const slides = [
    { id: "01-balance", variant: "balance", caption: "Your wallet", sub: "Balance at a glance" },
    { id: "02-send", variant: "send", caption: "Send money", sub: "Pay people instantly" },
    { id: "03-topup", variant: "topup", caption: "Top up", sub: "Add funds securely" },
    { id: "04-activity", variant: "activity", caption: "Activity", sub: "Track every move" },
    { id: "05-pay", variant: "pay", caption: "Pay on Qwertymates", sub: "Checkout with ACBPay" }
  ];

  const panels = {};
  for (const s of slides) {
    panels[s.id] = await makeWalletUiPanel(1080, 1920, s.variant);
    await sharp(panels[s.id]).png().toFile(path.join(refsDir, `ref-${s.id}.png`));
  }

  for (const s of slides) {
    await makePortraitShot({
      panel: panels[s.id],
      outDir: shotsPhone,
      outName: `${s.id}-1080x2400.jpg`,
      caption: s.caption,
      sub: s.sub,
      width: 1080,
      height: 2400
    });
    await makePortraitShot({
      panel: panels[s.id],
      outDir: shotsPhone,
      outName: `${s.id}-1080x1920.jpg`,
      caption: s.caption,
      sub: s.sub,
      width: 1080,
      height: 1920
    });
  }

  for (const s of slides.slice(0, 4)) {
    await makePortraitShot({
      panel: panels[s.id],
      outDir: shotsTablet7,
      outName: `${s.id}-1200x1920.jpg`,
      caption: s.caption,
      sub: s.sub,
      width: 1200,
      height: 1920
    });
    await makeLandscapeShot({
      panel: panels[s.id],
      outDir: shotsTablet7,
      outName: `${s.id}-1920x1200.jpg`,
      caption: s.caption,
      sub: s.sub,
      width: 1920,
      height: 1200
    });
    await makePortraitShot({
      panel: panels[s.id],
      outDir: shotsTablet10,
      outName: `${s.id}-1600x2560.jpg`,
      caption: s.caption,
      sub: s.sub,
      width: 1600,
      height: 2560
    });
    await makeLandscapeShot({
      panel: panels[s.id],
      outDir: shotsTablet10,
      outName: `${s.id}-2560x1600.jpg`,
      caption: s.caption,
      sub: s.sub,
      width: 2560,
      height: 1600
    });
  }
}

function writeTemplates() {
  const files = [
    ["android-screenshot-1080x2400.svg", 1080, 2400, "Google Play"],
    ["huawei-screenshot-1080x1920.svg", 1080, 1920, "Huawei"],
    ["ios-screenshot-1242x2688.svg", 1242, 2688, "App Store"]
  ];
  for (const [name, w, h, platform] of files) {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${CYAN}"/>
      <stop offset="100%" stop-color="${MARK_NAVY}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${SURFACE}"/>
  <rect width="${w}" height="${Math.round(h * 0.125)}" fill="url(#g)"/>
  <text x="${w / 2}" y="${Math.round(h * 0.055)}" text-anchor="middle" fill="#FFFFFF" font-family="Arial Black, Arial, sans-serif" font-size="${Math.round(w * 0.04)}" font-weight="900">PRIMARY CAPTION</text>
  <text x="${w / 2}" y="${Math.round(h * 0.085)}" text-anchor="middle" fill="${ICE}" font-family="Arial, sans-serif" font-size="${Math.round(w * 0.024)}">Optional subline</text>
  <rect x="${Math.round(w * 0.055)}" y="${Math.round(h * 0.15)}" width="${Math.round(w * 0.89)}" height="${Math.round(h * 0.78)}" rx="40" fill="#FFFFFF" stroke="${CYAN}" stroke-width="4" stroke-dasharray="16 12"/>
  <text x="${w / 2}" y="${Math.round(h * 0.52)}" text-anchor="middle" fill="#64748B" font-family="Arial, sans-serif" font-size="${Math.round(w * 0.03)}">Paste live ACBPay UI screenshot here</text>
  <text x="${w / 2}" y="${Math.round(h * 0.55)}" text-anchor="middle" fill="#94A3B8" font-family="Arial, sans-serif" font-size="${Math.round(w * 0.022)}">Safe zone · ${w}×${h} · ${platform}</text>
  <text x="${w / 2}" y="${h - 40}" text-anchor="middle" fill="${CYAN}" font-family="Arial, sans-serif" font-size="${Math.round(w * 0.024)}" font-weight="700">ACBPay</text>
</svg>`;
    fs.writeFileSync(path.join(templatesDir, name), svg);
    console.log("wrote templates/" + name);
  }
}

function writeDocs() {
  fs.writeFileSync(
    path.join(packRoot, "00-README.md"),
    `# ACBPay — Android / shared store pack

**Bundle ID:** \`com.acbpay.wallet\`  
**Display name:** ACBPay  
**Generated:** ${new Date().toISOString().slice(0, 10)}

Source marks: \`ACBPayWallet/mobile/assets/\` (\`icon.png\`, \`favicon-source.png\`, wordmarks).

## Contents

| Folder | Purpose |
|---|---|
| \`logos/\` | Play 512, iOS 1024 full-bleed + white, adaptive, Huawei 216 |
| \`feature-graphics/\` | Play 1024×500 + Huawei 1080×600 |
| \`screenshots/\` | Phone + tablet marketing frames |
| \`references/\` | Synthetic wallet UI panels |
| \`docs/\` | Listing + checklist |

## Regenerate

\`\`\`bash
cd morongwa/backend
node scripts/generateACBPayStoreAssets.mjs
node scripts/generateIosStoreGraphicsPacks.mjs
\`\`\`
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(docsDir, "01-DESIGN-BRIEF.md"),
    `# ACBPay — design brief

- Geometric “A” mark on black (#0a0a0a); mark navy ~#101038
- Accent cyan **#22d3ee** (official “pay” wordmark colour)
- Charcoal **#3d4f5f** for secondary text
- Prepaid wallet companion to Qwertymates — not a separate bank brand
- Prefer official assets from \`ACBPayWallet/mobile/assets/\`
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(docsDir, "02-BRAND-SPECS.md"),
    `# ACBPay — brand specs

| Token | Value |
|---|---|
| Cyan | \`#22d3ee\` |
| Charcoal | \`#3d4f5f\` |
| Mark navy | \`#101038\` |
| Icon bg | \`#0a0a0a\` |
| Surface | \`#0B1220\` |

Do not use purple AI-default gradients.
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(docsDir, "03-GOOGLE-PLAY-LISTING.md"),
    `# ACBPay — Google Play listing (paste-ready)

**Name:** ACBPay  
**Package:** \`com.acbpay.wallet\`  
**Category:** Finance  

## Short description (≤ 80)

\`\`\`
Prepaid wallet for Qwertymates — top up, send, pay and track.
\`\`\`

## Full description

\`\`\`
ACBPay is the prepaid wallet companion for Qwertymates.

• Check your available balance
• Top up securely
• Send money to people on ACBPay
• Pay on Qwertymates and QwertyHub checkout
• Track wallet activity in one place

Same account ecosystem as Qwertymates — one wallet balance across the family of apps.

Support: support@qwertymates.com
Privacy: https://www.qwertymates.com/policies/privacy-policy
Web: https://www.qwertymates.com
\`\`\`
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(docsDir, "06-ASSET-CHECKLIST.md"),
    `# ACBPay — Android asset checklist

- [x] Play icon 512
- [x] iOS 1024 full-bleed + white bg (shared logos for iOS pack)
- [x] Adaptive foreground 512
- [x] Feature graphic 1024×500
- [x] Phone screenshots 1080×2400
- [x] Tablet 7" / 10" portrait + landscape
- [ ] Replace synthetic UI panels with live device captures when available
`,
    "utf8"
  );
}

/** Keep Expo app icon aligned with store full-bleed 1024. */
async function syncMobileIcon() {
  const full = path.join(logosDir, "acbpay-ios-icon-1024-fullbleed.png");
  if (!fs.existsSync(full) || !fs.existsSync(MOBILE_ASSETS)) return;
  const destIcon = path.join(MOBILE_ASSETS, "icon.png");
  const destAdaptive = path.join(MOBILE_ASSETS, "adaptive-icon.png");
  const destStore = path.join(MOBILE_ASSETS, "acbpay-ios-icon-1024-fullbleed.png");
  fs.copyFileSync(full, destIcon);
  fs.copyFileSync(full, destAdaptive);
  fs.copyFileSync(full, destStore);
  const white = path.join(logosDir, "acbpay-ios-icon-1024-white-bg.png");
  if (fs.existsSync(white)) {
    fs.copyFileSync(white, path.join(MOBILE_ASSETS, "acbpay-ios-icon-1024-white-bg.png"));
  }
  console.log("synced 1024 icons → ACBPayWallet/mobile/assets/");
}

async function main() {
  if (!fs.existsSync(SOURCE_ICON) && !fs.existsSync(SOURCE_MARK)) {
    throw new Error("Missing ACBPay icon sources under ACBPayWallet/mobile/assets");
  }

  for (const d of [
    logosDir,
    featDir,
    refsDir,
    templatesDir,
    docsDir,
    shotsPhone,
    shotsTablet7,
    shotsTablet10
  ]) {
    ensureDir(d);
  }

  // Copy source references
  for (const [src, name] of [
    [SOURCE_ICON, "current-app-icon.png"],
    [SOURCE_MARK, "acbpay-mark-source.png"],
    [SOURCE_WORDMARK, "acbpay-wordmark-primary.png"],
    [SOURCE_LOGO, "acbpay-logo.png"]
  ]) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(refsDir, name));
      if (name.includes("mark") || name.includes("icon") || name.includes("logo")) {
        fs.copyFileSync(src, path.join(logosDir, path.basename(src)));
      }
    }
  }

  await makeFullBleedIcon(1024, "acbpay-ios-icon-1024-fullbleed.png");
  await makeWhiteBgIcon(1024, "acbpay-ios-icon-1024-white-bg.png", 0.72);
  await makeWhiteBgIcon(512, "acbpay-google-play-icon-512.png", 0.88);
  await makeFullBleedIcon(512, "acbpay-google-play-icon-512-black.png");
  await makeWhiteBgIcon(216, "acbpay-huawei-icon-216.png", 0.88);
  await makeAdaptiveForeground(512, "acbpay-adaptive-foreground-512.png");

  await makeFeatureGraphic();
  await makeHuaweiFeature();
  await makeScreenshots();
  writeTemplates();
  writeDocs();
  await syncMobileIcon();

  console.log("\nDone →", packRoot);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
