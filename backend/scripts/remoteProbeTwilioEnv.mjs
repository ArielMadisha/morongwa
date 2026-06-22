import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cfg = mergeDeployConfig(repoRoot);
const conn = await sshConnect(cfg, repoRoot);

const cmd = `bash -lc 'docker exec morongwa-api-test printenv | grep -E "^TWILIO_(SMS|ACCOUNT|WHATSAPP|WA)" | sed -E "s/(AUTH_TOKEN|TOKEN)=.+/\\1=***MASKED***/" | sort'`;

conn.exec(cmd, (err, stream) => {
  if (err) throw err;
  stream.on("data", (d) => process.stdout.write(String(d)));
  stream.stderr.on("data", (d) => process.stderr.write(String(d)));
  stream.on("close", () => conn.end());
});
