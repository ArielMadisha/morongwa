/**
 * Full production deploy: backend (Docker API) → Twilio WhatsApp flow → frontend (Docker).
 *
 * Run from backend/:  npm run deploy:production
 *
 * Requires: repo-root deploy-server.config + deploy-server.secrets, backend/.env with Twilio vars for the flow step.
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

runStep("2/3 WhatsApp / Twilio Studio flow (publish)", [path.join(__dirname, "pushTwilioFlowV2.mjs")]);

runStep(
  "3/3 Frontend (tarball + remote Docker refresh --rebuild)",
  [path.join(__dirname, "publishFrontendRemote.mjs"), "--rebuild"]
);

console.log(`\n${"=".repeat(60)}\nFull deploy finished: backend + WhatsApp flow + frontend.\n${"=".repeat(60)}\n`);
