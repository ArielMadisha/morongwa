import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const cfg = mergeDeployConfig(repoRoot);
const conn = await sshConnect(cfg, repoRoot, {
  secretsPath: path.join(repoRoot, "deploy-server.secrets"),
});
await new Promise((resolve, reject) => {
  const cmd =
    "docker logs morongwa-api-test --since 6h 2>&1 | grep -iE 'food menu|photoCards|marketplace gallery|media card send|sending photo' | tail -40";
  conn.exec(cmd, (err, stream) => {
    if (err) return reject(err);
    let o = "";
    stream.on("data", (d) => (o += d.toString()));
    stream.stderr.on("data", (d) => (o += d.toString()));
    stream.on("close", () => {
      console.log(o || "(no logs)");
      resolve();
    });
  });
});
conn.end();
