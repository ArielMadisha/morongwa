import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cfg = mergeDeployConfig(repoRoot);
const conn = await sshConnect(cfg, repoRoot);

const q = process.argv[2] || "send-otp";
const cmd = `bash -lc 'docker logs morongwa-api-test --tail 8000 2>&1 | grep -i "${q}" | tail -80 || true'`;

conn.exec(cmd, (err, stream) => {
  if (err) throw err;
  stream.on("data", (d) => process.stdout.write(String(d)));
  stream.stderr.on("data", (d) => process.stderr.write(String(d)));
  stream.on("close", () => conn.end());
});
