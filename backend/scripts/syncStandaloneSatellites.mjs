#!/usr/bin/env node
/**
 * Copy MacGyver (+ minimal ACBPayWallet satellite reference) sources into standalone/* for git tracking.
 *
 *   node scripts/syncStandaloneSatellites.mjs
 *
 * Run from backend/ (loads paths relative to backend root's parent = repo root).
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

async function copyFile(relFromBackend, relUnderStandalone) {
  const from = path.join(backendRoot, relFromBackend);
  const to = path.join(repoRoot, relUnderStandalone);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
  console.log("copied", relFromBackend, "→", relUnderStandalone);
}

async function main() {
  const askDest = "standalone/AskMacGyver/src";

  await copyFile("src/services/macgyverSearch.ts", `${askDest}/services/macgyverSearch.ts`);
  await copyFile("src/services/macgyverService.ts", `${askDest}/services/macgyverService.ts`);
  await copyFile("src/services/macgyverLLM.ts", `${askDest}/services/macgyverLLM.ts`);
  await copyFile("src/data/macgyverKnowledge.ts", `${askDest}/data/macgyverKnowledge.ts`);

  const walletDest = "standalone/ACBPayWallet/src";
  await copyFile("src/services/satelliteSync.ts", `${walletDest}/services/satelliteSync.ts`);

  console.log("\nDone. Commit standalone/AskMacGyver and standalone/ACBPayWallet when ready.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
