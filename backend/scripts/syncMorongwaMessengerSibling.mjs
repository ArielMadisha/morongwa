#!/usr/bin/env node
/**
 * Sync Morongwa hub/messenger reference sources from Morongwa monorepo
 * into the sibling morongwa-messenger project.
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

const DEFAULT_SIBLING = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".cursor",
  "projects",
  "morongwa-messenger"
);

const SIBLING_ROOT = path.resolve(process.env.MORONGWA_MESSENGER_SIBLING || DEFAULT_SIBLING);

const MIRROR_FILES = [
  ["src/routes/morongwaHub.ts", "mirror/morongwa/routes/morongwaHub.ts"],
  ["src/routes/messenger.ts", "mirror/morongwa/routes/messenger.ts"],
  ["src/services/webrtcSignaling.ts", "mirror/morongwa/services/webrtcSignaling.ts"],
  ["src/data/models/MorongwaContact.ts", "mirror/morongwa/models/MorongwaContact.ts"],
  ["src/data/models/MorongwaMeeting.ts", "mirror/morongwa/models/MorongwaMeeting.ts"],
  ["src/data/models/MorongwaUserFile.ts", "mirror/morongwa/models/MorongwaUserFile.ts"],
];

async function copyFile(fromAbs, toAbs) {
  await fs.mkdir(path.dirname(toAbs), { recursive: true });
  await fs.copyFile(fromAbs, toAbs);
  console.log("copied", path.relative(repoRoot, fromAbs), "→", toAbs.replace(SIBLING_ROOT + path.sep, ""));
}

async function main() {
  try {
    await fs.access(SIBLING_ROOT);
  } catch {
    console.error("Sibling not found:", SIBLING_ROOT);
    process.exit(1);
  }

  for (const [relFromBackend, relDest] of MIRROR_FILES) {
    await copyFile(path.join(backendRoot, relFromBackend), path.join(SIBLING_ROOT, relDest));
  }

  const manifest = {
    syncedAt: new Date().toISOString(),
    apiBase: "https://api.qwertymates.com/api",
    morongwaWeb: "https://www.qwertymates.com/messages",
    mobileApp: "morongwa-messenger/mobile/",
    notes:
      "Native Morongwa app uses Qwertymates auth + /api/messenger + /api/morongwa + /api/voice + WebRTC socket. Chat UI mirrors www.qwertymates.com/messages (filters, call history, hub rail)."
  };
  await fs.writeFile(
    path.join(SIBLING_ROOT, "mirror", "SYNC_MANIFEST.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
