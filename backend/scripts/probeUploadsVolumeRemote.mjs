import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cfg = mergeDeployConfig(repoRoot);
const conn = await sshConnect(cfg, repoRoot);

function exec(cmd) {
  return new Promise((resolve, reject) => {
    let out = "";
    conn.exec(cmd, (e, stream) => {
      if (e) return reject(e);
      stream.on("data", (d) => {
        out += String(d);
      });
      stream.on("close", (code) => resolve({ code, stdout: out }));
    });
  });
}

const r = await exec(
  [
    "docker inspect morongwa-api-test --format '{{json .Mounts}}'",
    "docker exec morongwa-api-test sh -lc 'echo PWD=$(pwd); ls -la uploads/tv 2>&1 | head -8; ls -la /app/uploads/tv 2>&1 | head -8; touch uploads/tv/.write-test 2>&1; ls uploads/tv/.write-test 2>&1'",
  ].join(" && ")
);
console.log(r.stdout);
conn.end();
