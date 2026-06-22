/**
 * Full production deploy: backend (Docker API) → Twilio WhatsApp flow → frontend (Docker).
 *
 * Run from backend/:  npm run deploy:production
 *
 * Requires: repo-root deploy-server.config + deploy-server.secrets (SSH password and/or private key;
 * see deploy-server.secrets.example), backend/.env with Twilio vars for the flow step.
 */
import { fileURLToPath } from "url";
import path from "path";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** backend/ — child scripts must run here so dotenv loads backend/.env (Twilio, etc.). */
const backendRoot = path.join(__dirname, "..");

function runStep(label, args, opts = {}) {
  console.log(`\n${"=".repeat(60)}\n${label}\n${"=".repeat(60)}\n`);
  const r = spawnSync(process.execPath, args, {
    cwd: backendRoot,
    stdio: "inherit",
    shell: false,
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(`${label} failed (exit ${r.status ?? r.signal})`);
  }
}

runStep(
  "1/3 Backend (upload, npm build in container, restart)",
  [path.join(__dirname, "pushBackendFullRemote.mjs")]
);

runStep("2/3 WhatsApp / Twilio Studio flow (publish from template)", [
  path.join(__dirname, "pushTwilioFlowV2.mjs"),
]);
try {
  runStep("2/3 WhatsApp / Twilio Studio flow (Botswana wire)", [
    path.join(__dirname, "wireWhatsappSenderStudioWebhook.mjs"),
  ]);
} catch (e) {
  console.warn("WARN: Botswana WhatsApp sender wire skipped or failed:", e.message || e);
}

runStep(
  "3/3 Frontend (tarball + remote Docker refresh)",
  [path.join(__dirname, "publishFrontendRemote.mjs")]
);

// Keep NPM/OpenResty edge stable after frontend refresh to prevent intermittent 502 regressions.
if (process.env.SKIP_NPM_EDGE_FIX === "1") {
  console.log("\nSKIP_NPM_EDGE_FIX=1 — skipping NPM edge + API upload limit patches.\n");
} else {
  runStep(
    "4/5 NPM edge hardening (nginx conf regen + ssl/listen patch + reload)",
    [path.join(__dirname, "remoteNpmEdgePermanentFix.mjs")]
  );
  try {
    runStep(
      "5/5 NPM upload limits (api + www proxy: large video body + long timeouts)",
      [path.join(__dirname, "remoteNpmApiUploadLimits.mjs")]
    );
  } catch (e) {
    console.warn("WARN: NPM upload limits step failed (api vhost may already be patched):", e.message || e);
  }
}

console.log(`\n${"=".repeat(60)}\nFull deploy finished: backend + WhatsApp flow + frontend.\n${"=".repeat(60)}\n`);
