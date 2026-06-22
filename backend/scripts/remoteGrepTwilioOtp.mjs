import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cfg = mergeDeployConfig(repoRoot);
const conn = await sshConnect(cfg, repoRoot);

const pattern = process.argv[2] || "Twilio OTP|whatsapp|send-otp|21610|63016|21211|21408";
const cmd = `bash -lc 'docker logs morongwa-api-test --tail 400 2>&1 | grep -iE "${pattern}" | tail -40 || true'`;

conn.exec(cmd, (err, stream) => {
  if (err) throw err;
  stream.on("data", (d) => process.stdout.write(String(d)));
  stream.stderr.on("data", (d) => process.stderr.write(String(d)));
  stream.on("close", () => conn.end());
});
