/**
 * Build complete iOS App Store graphic packs for every app under
 * `App Stores Graphics/IOS/{App}/`, using finished Android assets where available.
 *
 * From morongwa/backend/:
 *   node scripts/generateIosStoreGraphicsPacks.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPHICS_ROOT = path.join("C:", "Users", "Dell", ".cursor", "projects", "App Stores Graphics");
const ANDROID_ROOT = path.join(GRAPHICS_ROOT, "Android");
const IOS_ROOT = path.join(GRAPHICS_ROOT, "IOS");

/** Apple sizes we generate (portrait unless noted). */
const IPHONE_67 = { w: 1290, h: 2796, folder: "iphone-6-7", label: "iPhone 6.7\"" };
const IPHONE_65 = { w: 1242, h: 2688, folder: "iphone-6-5", label: "iPhone 6.5\"" };
const IPHONE_55 = { w: 1242, h: 2208, folder: "iphone-5-5", label: "iPhone 5.5\"" };
const IPAD_129 = { w: 2048, h: 2732, folder: "ipad-12-9", label: "iPad Pro 12.9\"" };
const IPAD_129_LAND = { w: 2732, h: 2048, folder: "ipad-12-9-landscape", label: "iPad Pro 12.9\" landscape" };

const APPS = [
  {
    name: "Qwertymates",
    androidFolder: "Qwertymates",
    iosFolder: "Qwertymates",
    bundleId: "com.qwertymates.app",
    displayName: "Qwertymates",
    subtitle: "Wall, Hub, TV & Wallet",
    iconFull: "qwertymates-ios-icon-1024-fullbleed.png",
    iconWhite: "qwertymates-ios-icon-1024-white-bg.png",
    category: "Social Networking",
    website: "https://www.qwertymates.com",
    support: "support@qwertymates.com",
    keywords: "social,marketplace,video,wallet,africa,qwertyhub,qwertytv",
    privacy: "https://www.qwertymates.com/policies/privacy-policy",
    shortDesc:
      "Wall, Hub, TV & wallet — the digital home for doers, sellers & creators.",
    promoText: "Post on your Wall, shop QwertyHub, watch QwertyTV, and pay with ACBPay Wallet.",
    description: `Qwertymates is the digital home for doers, sellers and creators — post on your Wall, shop on QwertyHub, watch QwertyTV, explore QwertyWorld, play QwertyMusic, and pay with ACBPay Wallet.

YOUR WALL
• Share posts and statuses with a circular Create control
• Full-bleed images and videos
• Like, comment, share and support creators

SHOP & EARN
• Browse QwertyHub products and local stores
• Checkout with prepaid delivery when required

WATCH & EXPLORE
• QwertyTV for video posts
• QwertyWorld discovery
• QwertyMusic for audio

PAY WITH ACBPAY WALLET
• Top up securely and manage wallet activity in the app

Support: support@qwertymates.com
Web: https://www.qwertymates.com`
  },
  {
    name: "QwertyHub",
    androidFolder: "QwertyHub",
    iosFolder: "QwertyHub",
    bundleId: "com.qwertyhub.app",
    displayName: "QwertyHub",
    subtitle: "Marketplace for local shops",
    iconFull: "qwertyhub-ios-icon-1024-fullbleed.png",
    iconWhite: "qwertyhub-ios-icon-1024-white-bg.png",
    category: "Shopping",
    website: "https://www.qwertymates.com/marketplace",
    support: "support@qwertymates.com",
    privacy: "https://www.qwertymates.com/policies/privacy-policy",
    keywords: "marketplace,shop,grocery,food,africa,qwertymates",
    shortDesc: "List, browse and buy from local stores on QwertyHub.",
    promoText: "Shop essentials, food and groceries — powered by Qwertymates.",
    description: `QwertyHub is the marketplace for local shops and suppliers on Qwertymates.

• Browse stores and products
• Food & groceries with collection or delivery
• Secure checkout
• Grow your storefront as a seller

Part of the Qwertymates family.

Support: support@qwertymates.com
Web: https://www.qwertymates.com`
  },
  {
    name: "Ask MacGyver",
    androidFolder: "Ask MacGyver",
    iosFolder: "Ask MacGyver",
    bundleId: "com.qwertymates.askmacgyver",
    displayName: "Ask MacGyver AI",
    subtitle: "Ask anything, get practical answers",
    iconFull: "ask-macgyver-ios-icon-1024-fullbleed.png",
    iconWhite: "ask-macgyver-ios-icon-1024-white-bg.png",
    category: "Productivity",
    website: "https://www.qwertymates.com",
    support: "support@qwertymates.com",
    privacy: "https://www.qwertymates.com/policies/privacy-policy",
    keywords: "ai,assistant,macgyver,help,qwertymates",
    shortDesc: "Ask MacGyver AI — practical answers for everyday problems.",
    promoText: "Your resourceful AI assistant from the Qwertymates family.",
    description: `Ask MacGyver AI helps you solve everyday problems with practical, step-by-step answers.

• Ask anything in plain language
• Get clear, useful guidance
• Built for doers on Qwertymates

Support: support@qwertymates.com`
  },
  {
    name: "Morongwa - Messenger",
    androidFolder: "Morongwa - Messenger",
    iosFolder: "Morongwa - Messenger",
    bundleId: "com.morongwa.messenger",
    displayName: "Morongwa Messenger",
    subtitle: "Chat, Call, Meet, Errands",
    iconFull: "morongwa-ios-icon-1024-fullbleed.png",
    iconWhite: "morongwa-ios-icon-1024-white-bg.png",
    category: "Social Networking",
    website: "https://www.qwertymates.com",
    support: "support@qwertymates.com",
    privacy: "https://www.qwertymates.com/policies/privacy-policy",
    keywords: "chat,call,messenger,meet,errands,morongwa",
    shortDesc: "Chat, call, meet and errands — Morongwa Messenger.",
    promoText: "Stay connected with chat, calls, meetings and errands.",
    description: `Morongwa Messenger brings chat, calls, meetings and errands together.

• Chat with friends and teams
• Voice and video calls
• Meet and collaborate
• Errands when you need help on the ground

Support: support@qwertymates.com`
  },
  {
    name: "ACBPay",
    androidFolder: "ACBPay",
    iosFolder: "ACBPay",
    bundleId: "com.acbpay.wallet",
    displayName: "ACBPay",
    subtitle: "Prepaid wallet companion",
    iconFull: "acbpay-ios-icon-1024-fullbleed.png",
    iconWhite: "acbpay-ios-icon-1024-white-bg.png",
    category: "Finance",
    website: "https://www.qwertymates.com",
    support: "support@qwertymates.com",
    privacy: "https://www.qwertymates.com/policies/privacy-policy",
    keywords: "wallet,prepaid,pay,acbpay,qwertymates,topup,africa,finance",
    shortDesc: "Prepaid wallet for Qwertymates — top up, send, pay and track.",
    promoText: "ACBPayWallet — top up, send money, pay on Qwertymates, and track activity.",
    description: `ACBPay is the prepaid wallet companion for Qwertymates.

BALANCE & TOP UP
• See your available balance at a glance
• Top up securely when you need funds

SEND & PAY
• Send money to people on ACBPay
• Pay on Qwertymates and QwertyHub checkout

ACTIVITY
• Track wallet moves in one clear history

Same account ecosystem as Qwertymates — one wallet balance across the family of apps.

Support: support@qwertymates.com
Privacy: https://www.qwertymates.com/policies/privacy-policy
Web: https://www.qwertymates.com`
  }
];

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function listFiles(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => exts.some((e) => n.toLowerCase().endsWith(e)))
    .map((n) => path.join(dir, n))
    .sort();
}

function pickPortraitPhoneSources(androidAppDir) {
  const phoneDir = path.join(androidAppDir, "screenshots", "phone");
  const all = listFiles(phoneDir, [".jpg", ".jpeg", ".png"]);
  const prefer2400 = all.filter((f) => /1080x2400/i.test(f));
  const prefer1920 = all.filter((f) => /1080x1920/i.test(f));
  const preferred = prefer2400.length ? prefer2400 : prefer1920.length ? prefer1920 : all;
  // De-dupe by slide id prefix (01-..., 02-...)
  const byId = new Map();
  for (const f of preferred) {
    const base = path.basename(f);
    const id = base.split("-1080")[0] || base.replace(/\.(jpg|jpeg|png)$/i, "");
    if (!byId.has(id)) byId.set(id, f);
  }
  return [...byId.entries()].map(([id, file]) => ({ id, file }));
}

function pickTabletSources(androidAppDir) {
  const t10 = path.join(androidAppDir, "screenshots", "tablet-10");
  const t7 = path.join(androidAppDir, "screenshots", "tablet-7");
  const portraits = [
    ...listFiles(t10, [".jpg", ".jpeg", ".png"]).filter((f) => /1600x2560/i.test(f)),
    ...listFiles(t7, [".jpg", ".jpeg", ".png"]).filter((f) => /1200x1920/i.test(f))
  ];
  const landscapes = [
    ...listFiles(t10, [".jpg", ".jpeg", ".png"]).filter((f) => /2560x1600/i.test(f)),
    ...listFiles(t7, [".jpg", ".jpeg", ".png"]).filter((f) => /1920x1200/i.test(f))
  ];
  return { portraits, landscapes };
}

async function coverResize(src, w, h, outPath) {
  await sharp(src)
    .resize(w, h, { fit: "cover", position: "centre" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outPath);
}

async function containOnCanvas(src, w, h, outPath, bg = "#0B1220") {
  const resized = await sharp(src)
    .resize(w, h, { fit: "inside", withoutEnlargement: false })
    .jpeg({ quality: 90 })
    .toBuffer();
  const meta = await sharp(resized).metadata();
  const left = Math.max(0, Math.round((w - (meta.width || w)) / 2));
  const top = Math.max(0, Math.round((h - (meta.height || h)) / 2));
  await sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: bg
    }
  })
    .composite([{ input: resized, left, top }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outPath);
}

async function marketingFrameShot({
  iconPath,
  title,
  subtitle,
  refPath,
  w,
  h,
  outPath
}) {
  const canvas = sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 11, g: 18, b: 32 }
    }
  });

  const layers = [];
  // Brand gradient header band
  const headerH = Math.round(h * 0.22);
  const gradSvg = Buffer.from(`<svg width="${w}" height="${headerH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00C2FF"/>
      <stop offset="100%" stop-color="#003D82"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${headerH}" fill="url(#g)"/>
</svg>`);
  layers.push({ input: await sharp(gradSvg).png().toBuffer(), left: 0, top: 0 });

  if (iconPath && fs.existsSync(iconPath)) {
    const iconSize = Math.round(Math.min(w, h) * 0.18);
    const icon = await sharp(iconPath)
      .resize(iconSize, iconSize, { fit: "cover" })
      .png()
      .toBuffer();
    layers.push({
      input: icon,
      left: Math.round((w - iconSize) / 2),
      top: Math.round(headerH * 0.18)
    });
  }

  const titleY = Math.round(headerH * 0.72);
  const titleSvg = Buffer.from(`<svg width="${w}" height="${Math.round(h * 0.2)}" xmlns="http://www.w3.org/2000/svg">
  <text x="50%" y="36" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.055)}" font-weight="700" fill="#FFFFFF">${escapeXml(title)}</text>
  <text x="50%" y="78" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.032)}" fill="#E8F6FF">${escapeXml(subtitle)}</text>
</svg>`);
  layers.push({ input: await sharp(titleSvg).png().toBuffer(), left: 0, top: titleY });

  if (refPath && fs.existsSync(refPath)) {
    const frameTop = Math.round(h * 0.32);
    const frameH = h - frameTop - Math.round(h * 0.06);
    const frameW = Math.round(w * 0.86);
    const frameLeft = Math.round((w - frameW) / 2);
    const shot = await sharp(refPath)
      .resize(frameW, frameH, { fit: "cover", position: "centre" })
      .jpeg({ quality: 88 })
      .toBuffer();
    // Rounded device frame via SVG mask-ish border
    const border = Buffer.from(`<svg width="${frameW + 16}" height="${frameH + 16}" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="${frameW + 14}" height="${frameH + 14}" rx="36" ry="36" fill="none" stroke="#94A3B8" stroke-width="4"/>
</svg>`);
    layers.push({
      input: await sharp(border).png().toBuffer(),
      left: frameLeft - 8,
      top: frameTop - 8
    });
    layers.push({ input: shot, left: frameLeft, top: frameTop });
  }

  await canvas.composite(layers).jpeg({ quality: 90, mozjpeg: true }).toFile(outPath);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function writeDocs(app, iosAppDir, shotSummary) {
  const docs = path.join(iosAppDir, "docs");
  ensureDir(docs);

  fs.writeFileSync(
    path.join(iosAppDir, "00-README.md"),
    `# ${app.displayName} — iOS App Store pack

**Bundle ID:** \`${app.bundleId}\`  
**Generated:** ${new Date().toISOString().slice(0, 10)}  
**Location:** \`App Stores Graphics/IOS/${app.iosFolder}/\`

## Contents

| Folder | Purpose |
|---|---|
| \`logos/\` | App Store icon **1024×1024** (full-bleed + white bg) |
| \`screenshots/iphone-6-7/\` | ${IPHONE_67.w}×${IPHONE_67.h} (required modern iPhone) |
| \`screenshots/iphone-6-5/\` | ${IPHONE_65.w}×${IPHONE_65.h} |
| \`screenshots/iphone-5-5/\` | ${IPHONE_55.w}×${IPHONE_55.h} |
| \`screenshots/ipad-12-9/\` | ${IPAD_129.w}×${IPAD_129.h} |
| \`screenshots/ipad-12-9-landscape/\` | ${IPAD_129_LAND.w}×${IPAD_129_LAND.h} |
| \`docs/\` | App Store Connect paste-ready listing + checklist |

## Upload to App Store Connect

1. **App Icon** → \`logos/${app.iconFull}\` (or white-bg variant if ASC prefers)
2. **iPhone screenshots** → \`screenshots/iphone-6-7/\` (min 3)
3. Paste listing from \`docs/03-APP-STORE-LISTING.md\`

## Regenerate

\`\`\`bash
cd morongwa/backend
node scripts/generateIosStoreGraphicsPacks.mjs
\`\`\`
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(docs, "03-APP-STORE-LISTING.md"),
    `# ${app.displayName} — App Store Connect listing (paste-ready)

**Name:** ${app.displayName}  
**Bundle ID:** \`${app.bundleId}\`  
**Category:** ${app.category}  
**Website:** ${app.website}  
**Support:** ${app.support}  
**Privacy:** ${app.privacy || `${app.website}/policies/privacy-policy`}

---

## Name (≤ 30)

\`\`\`
${app.displayName.slice(0, 30)}
\`\`\`

---

## Subtitle (≤ 30)

\`\`\`
${app.subtitle.slice(0, 30)}
\`\`\`

---

## Promotional text (≤ 170)

\`\`\`
${app.promoText}
\`\`\`

---

## Description

\`\`\`
${app.description}
\`\`\`

---

## Keywords (≤ 100 chars, comma-separated)

\`\`\`
${app.keywords.slice(0, 100)}
\`\`\`

---

## Support URL

\`\`\`
${app.website}
\`\`\`

## Marketing URL

\`\`\`
${app.website}
\`\`\`

## Privacy Policy URL

\`\`\`
${app.privacy || `${app.website}/policies/privacy-policy`}
\`\`\`

---

## Graphics

| Field | Path |
|---|---|
| App icon 1024 | \`../logos/${app.iconFull}\` |
| App icon white | \`../logos/${app.iconWhite}\` |
| iPhone 6.7" | \`../screenshots/iphone-6-7/\` |
| iPhone 6.5" | \`../screenshots/iphone-6-5/\` |
| iPhone 5.5" | \`../screenshots/iphone-5-5/\` |
| iPad 12.9" | \`../screenshots/ipad-12-9/\` |

${shotSummary}
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(docs, "06-ASSET-CHECKLIST.md"),
    `# ${app.displayName} — iOS asset checklist

## Icons

- [x] 1024×1024 full-bleed → \`logos/${app.iconFull}\`
- [x] 1024×1024 white bg → \`logos/${app.iconWhite}\`

## Screenshots

- [x] iPhone 6.7" (${IPHONE_67.w}×${IPHONE_67.h}) → \`screenshots/iphone-6-7/\`
- [x] iPhone 6.5" (${IPHONE_65.w}×${IPHONE_65.h}) → \`screenshots/iphone-6-5/\`
- [x] iPhone 5.5" (${IPHONE_55.w}×${IPHONE_55.h}) → \`screenshots/iphone-5-5/\`
- [x] iPad Pro 12.9" portrait → \`screenshots/ipad-12-9/\`
- [x] iPad Pro 12.9" landscape → \`screenshots/ipad-12-9-landscape/\`

## Listing

- [x] Paste-ready copy → \`docs/03-APP-STORE-LISTING.md\`
- [ ] Paste into App Store Connect for \`${app.bundleId}\`
- [ ] Privacy policy URL + App Privacy questionnaire

## Notes

Apple does **not** use a Play-style 1024×500 feature graphic. Focus on icon + screenshots + listing copy.
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(docs, "01-DESIGN-BRIEF.md"),
    `# ${app.displayName} — iOS design brief

Match Android branding already approved under \`App Stores Graphics/Android/${app.androidFolder}/\`.

- Official circular brand mark (no purple AI defaults)
- Screenshot framing: clean product UI, readable captions when used
- iPhone sizes prioritize **6.7"** (${IPHONE_67.w}×${IPHONE_67.h}) for App Store Connect
`,
    "utf8"
  );
}

async function buildFallbackSlides(app, androidDir) {
  const refsDir = path.join(androidDir, "references");
  const featDir = path.join(androidDir, "feature-graphics");
  const logosDir = path.join(androidDir, "logos");
  const refs = listFiles(refsDir, [".png", ".jpg", ".jpeg"]);
  const feat = listFiles(featDir, [".png", ".jpg", ".jpeg"]);
  const icon = path.join(logosDir, app.iconFull);
  const sources = [...refs, ...feat].slice(0, 5);
  while (sources.length < 5) sources.push(sources[0] || icon);

  const captions = [
    { id: "01-home", caption: app.displayName, sub: app.subtitle },
    { id: "02-feature", caption: "Built for you", sub: app.shortDesc.slice(0, 48) },
    { id: "03-experience", caption: "Simple & fast", sub: "Designed for everyday use" },
    { id: "04-connect", caption: "Stay connected", sub: "Part of the Qwertymates family" },
    { id: "05-get-started", caption: "Get started", sub: app.website.replace(/^https?:\/\//, "") }
  ];

  return captions.map((c, i) => ({
    id: c.id,
    caption: c.caption,
    sub: c.sub,
    file: sources[i] || icon,
    icon,
    marketing: true
  }));
}

async function generateApp(app) {
  const androidDir = path.join(ANDROID_ROOT, app.androidFolder);
  const iosDir = path.join(IOS_ROOT, app.iosFolder);
  const logosOut = path.join(iosDir, "logos");
  const shotRoot = path.join(iosDir, "screenshots");
  ensureDir(logosOut);
  for (const size of [IPHONE_67, IPHONE_65, IPHONE_55, IPAD_129, IPAD_129_LAND]) {
    ensureDir(path.join(shotRoot, size.folder));
  }

  // Icons
  const androidLogos = path.join(androidDir, "logos");
  for (const name of [app.iconFull, app.iconWhite]) {
    const src = path.join(androidLogos, name);
    if (!fs.existsSync(src)) throw new Error(`Missing Android iOS icon: ${src}`);
    fs.copyFileSync(src, path.join(logosOut, name));
  }

  let slides = pickPortraitPhoneSources(androidDir).map((s) => ({
    ...s,
    marketing: false,
    icon: path.join(androidLogos, app.iconFull)
  }));
  if (slides.length < 3) {
    slides = await buildFallbackSlides(app, androidDir);
  }
  slides = slides.slice(0, 8);

  const { portraits: tabletPortraits, landscapes: tabletLands } = pickTabletSources(androidDir);

  for (const slide of slides) {
    for (const size of [IPHONE_67, IPHONE_65, IPHONE_55]) {
      const out = path.join(shotRoot, size.folder, `${slide.id}-${size.w}x${size.h}.jpg`);
      if (slide.marketing) {
        await marketingFrameShot({
          iconPath: slide.icon,
          title: slide.caption || app.displayName,
          subtitle: slide.sub || app.subtitle,
          refPath: slide.file,
          w: size.w,
          h: size.h,
          outPath: out
        });
      } else {
        await coverResize(slide.file, size.w, size.h, out);
      }
      console.log("wrote", path.relative(IOS_ROOT, out));
    }

    // iPad portrait
    const padSrc =
      tabletPortraits.find((f) => path.basename(f).startsWith(slide.id.split("-").slice(0, 2).join("-"))) ||
      tabletPortraits[slides.indexOf(slide)] ||
      slide.file;
    const padOut = path.join(
      shotRoot,
      IPAD_129.folder,
      `${slide.id}-${IPAD_129.w}x${IPAD_129.h}.jpg`
    );
    if (slide.marketing) {
      await marketingFrameShot({
        iconPath: slide.icon,
        title: slide.caption || app.displayName,
        subtitle: slide.sub || app.subtitle,
        refPath: padSrc,
        w: IPAD_129.w,
        h: IPAD_129.h,
        outPath: padOut
      });
    } else {
      await coverResize(padSrc, IPAD_129.w, IPAD_129.h, padOut);
    }
    console.log("wrote", path.relative(IOS_ROOT, padOut));
  }

  // iPad landscape set (up to 5)
  const landSources = tabletLands.length
    ? tabletLands.slice(0, 5)
    : slides.slice(0, 5).map((s) => s.file);
  for (let i = 0; i < landSources.length; i++) {
    const src = landSources[i];
    const id = `0${i + 1}-landscape`;
    const out = path.join(
      shotRoot,
      IPAD_129_LAND.folder,
      `${id}-${IPAD_129_LAND.w}x${IPAD_129_LAND.h}.jpg`
    );
    await containOnCanvas(src, IPAD_129_LAND.w, IPAD_129_LAND.h, out);
    console.log("wrote", path.relative(IOS_ROOT, out));
  }

  const shotSummary = `
### Generated counts
- iPhone 6.7": ${slides.length} images
- iPhone 6.5": ${slides.length} images
- iPhone 5.5": ${slides.length} images
- iPad 12.9" portrait: ${slides.length} images
- iPad 12.9" landscape: ${landSources.length} images
`;
  writeDocs(app, iosDir, shotSummary);
  console.log(`\n✓ ${app.displayName} iOS pack → ${iosDir}\n`);
}

async function main() {
  ensureDir(IOS_ROOT);
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  const apps = only
    ? APPS.filter((a) => a.iosFolder.toLowerCase() === only.toLowerCase() || a.name.toLowerCase() === only.toLowerCase())
    : APPS;
  if (!apps.length) {
    throw new Error(`No app matched --only=${only}. Known: ${APPS.map((a) => a.iosFolder).join(", ")}`);
  }
  for (const app of apps) {
    console.log(`\n======== ${app.displayName} ========`);
    await generateApp(app);
  }
  fs.writeFileSync(
    path.join(IOS_ROOT, "00-README.md"),
    `# iOS App Store Graphics

Generated packs for:

${APPS.map((a) => `- **${a.displayName}** (\`${a.bundleId}\`) → \`${a.iosFolder}/\``).join("\n")}

Regenerate from \`morongwa/backend/\`:

\`\`\`bash
node scripts/generateIosStoreGraphicsPacks.mjs
\`\`\`
`,
    "utf8"
  );
  console.log("All iOS packs complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
