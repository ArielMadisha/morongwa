import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const conn = await sshConnect(mergeDeployConfig(repoRoot), repoRoot);
conn.exec(
  "docker exec nginx-app-1 sh -lc 'grep -n server_name /data/nginx/proxy_host/7.conf | head -8'",
  (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      conn.end();
    });
  }
);
