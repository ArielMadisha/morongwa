import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cfg = mergeDeployConfig(repoRoot);
const conn = await sshConnect(cfg, repoRoot);

const cmd = `bash -lc 'docker logs morongwa-api-test --tail 800 2>&1 | grep -iE "send-otp|/auth/send|twilio|otp|Coliben|21610|21408|21211|Permission" | tail -50 || true'`;

conn.exec(cmd, (err, stream) => {
  if (err) throw err;
  stream.on("data", (d) => process.stdout.write(String(d)));
  stream.stderr.on("data", (d) => process.stderr.write(String(d)));
  stream.on("close", () => conn.end());
});
