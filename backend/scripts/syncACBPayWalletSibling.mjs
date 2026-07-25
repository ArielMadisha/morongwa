#!/usr/bin/env node
/**
 * Sync ACBPayWallet satellite + wallet mirror refs from Morongwa monorepo
 * into the sibling Cursor project (and refresh standalone/ACBPayWallet in-repo).
 *
 *   node scripts/syncACBPayWalletSibling.mjs
 *   ACBPAYWALLET_SIBLING="C:/path/to/ACBPayWallet" node scripts/syncACBPayWalletSibling.mjs
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
  "ACBPayWallet"
);

const SIBLING_ROOT = path.resolve(process.env.ACBPAYWALLET_SIBLING || DEFAULT_SIBLING);

/** Morongwa sources → relative dest under each target root */
const MIRROR_FILES = [
  ["src/services/satelliteSync.ts", "mirror/morongwa/services/satelliteSync.ts"],
  ["src/services/walletBalanceSideEffects.ts", "mirror/morongwa/services/walletBalanceSideEffects.ts"],
  ["src/routes/wallet.ts", "mirror/morongwa/routes/wallet.ts"],
  ["src/services/walletQrPaymentService.ts", "mirror/morongwa/services/walletQrPaymentService.ts"],
  ["src/services/moneyRequestService.ts", "mirror/morongwa/services/moneyRequestService.ts"],
  ["src/services/agentEarningsService.ts", "mirror/morongwa/services/agentEarningsService.ts"],
  ["src/data/models/Wallet.ts", "mirror/morongwa/models/Wallet.ts"],
];

const STANDALONE_DEST = "standalone/ACBPayWallet/src/services/satelliteSync.ts";

async function copyFile(fromAbs, toAbs) {
  await fs.mkdir(path.dirname(toAbs), { recursive: true });
  await fs.copyFile(fromAbs, toAbs);
  console.log("copied", path.relative(repoRoot, fromAbs), "→", toAbs.replace(repoRoot + path.sep, ""));
}

async function syncToRoot(targetRoot, label) {
  let ok = true;
  try {
    await fs.access(targetRoot);
  } catch {
    console.warn(`[${label}] skip — folder not found: ${targetRoot}`);
    return false;
  }

  for (const [relFromBackend, relDest] of MIRROR_FILES) {
    const from = path.join(backendRoot, relFromBackend);
    const to = path.join(targetRoot, relDest);
    try {
      await fs.access(from);
      await copyFile(from, to);
    } catch (e) {
      console.warn(`[${label}] missing source ${relFromBackend}:`, e?.message || e);
      ok = false;
    }
  }

  const dispatchFrom = path.join(backendRoot, "src/services/satelliteSync.ts");
  const dispatchTo = path.join(targetRoot, "src/lib/sync/satelliteSync.dispatcher.ts");
  try {
    await copyFile(dispatchFrom, dispatchTo);
  } catch (e) {
    console.warn(`[${label}] satellite dispatcher copy failed:`, e?.message || e);
    ok = false;
  }

  const manifest = {
    syncedAt: new Date().toISOString(),
    source: "morongwa monorepo",
    apiBase: "https://api.qwertymates.com/api",
    walletWeb: "https://www.qwertymates.com/wallet",
    files: MIRROR_FILES.map(([src, dest]) => ({ src: `backend/${src}`, dest })),
    notes:
      "Reference mirrors only — live wallet API runs on Qwertymates backend. ACBPay mobile app calls the same /api/wallet and /api/auth endpoints.",
  };
  await fs.writeFile(
    path.join(targetRoot, "mirror", "SYNC_MANIFEST.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
  console.log(`[${label}] wrote mirror/SYNC_MANIFEST.json`);
  return ok;
}

async function main() {
  const dispatchFrom = path.join(backendRoot, "src/services/satelliteSync.ts");
  const dispatchToInRepo = path.join(repoRoot, STANDALONE_DEST);
  await copyFile(dispatchFrom, dispatchToInRepo);

  await syncToRoot(path.join(repoRoot, "standalone", "ACBPayWallet"), "standalone");
  await syncToRoot(SIBLING_ROOT, "sibling");

  console.log("\nDone. Review mirror/ in ACBPayWallet and commit when ready.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
