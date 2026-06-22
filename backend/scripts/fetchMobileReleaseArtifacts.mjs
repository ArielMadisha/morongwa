#!/usr/bin/env node
/**
 * Download latest known EAS Android artifacts into backend/uploads/mobile-releases/.
 * Does not use EAS build quota — only fetches finished artifact URLs.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const releasesRoot = path.join(__dirname, "..", "uploads", "mobile-releases");
const manifestPath = path.join(releasesRoot, "manifest.json");

const ARTIFACTS = [
  {
    url: "https://expo.dev/artifacts/eas/j0M_lY7tAxmef52AV6cnSmlaFUyDlzFX84zFtZJl1Mo.aab",
    rel: "android/qwertymates-1.2.8.aab",
    channel: "android",
    version: "1.2.8",
    versionCode: 36,
  },
];

/** Fallback when preview APK artifact expired on Expo CDN. */
const HUAWEI_AAB_COPY_FROM = "android/qwertymates-1.2.8.aab";
const HUAWEI_AAB_REL = "huawei/qwertymates-1.2.8.aab";

async function download(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  console.log("==> Fetching mobile release artifacts (EAS download, no new build) …\n");
  const manifest = readManifest();

  for (const item of ARTIFACTS) {
    const dest = path.join(releasesRoot, item.rel);
    console.log(`  ${item.rel} …`);
    const bytes = await download(item.url, dest);
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    console.log(`    OK ${mb} MB`);

    if (item.channel === "android") {
      manifest.android = {
        ...(manifest.android || {}),
        version: item.version,
        versionCode: item.versionCode,
        file: item.rel,
        url: `https://api.qwertymates.com/uploads/mobile-releases/${item.rel.replace(/\\/g, "/")}`,
      };
    }
    if (item.channel === "huawei") {
      manifest.huawei = {
        ...(manifest.huawei || {}),
        version: item.version,
        versionCode: item.versionCode,
        file: item.rel,
        url: `https://api.qwertymates.com/uploads/mobile-releases/${item.rel.replace(/\\/g, "/")}`,
      };
    }
  }

  const androidAab = path.join(releasesRoot, HUAWEI_AAB_COPY_FROM);
  const huaweiDest = path.join(releasesRoot, HUAWEI_AAB_REL);
  if (fs.existsSync(androidAab)) {
    fs.mkdirSync(path.dirname(huaweiDest), { recursive: true });
    fs.copyFileSync(androidAab, huaweiDest);
    console.log(`  ${HUAWEI_AAB_REL} (copy of production AAB for Huawei AppGallery)`);
    manifest.huawei = {
      ...(manifest.huawei || {}),
      version: manifest.android?.version || "1.2.8",
      versionCode: manifest.android?.versionCode || 36,
      label: "Huawei AppGallery (AAB)",
      file: HUAWEI_AAB_REL,
      url: `https://api.qwertymates.com/uploads/mobile-releases/${HUAWEI_AAB_REL}`,
      note: "Huawei AppGallery accepts AAB. Sideload APK for v1.3.1+ after EAS quota resets 2026-07-01.",
    };
  }

  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log("\n==> manifest.json updated");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
