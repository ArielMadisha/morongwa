import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = "";
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => {
        out += String(d);
      });
      stream.on("close", () => resolve(out));
    });
  });
}

const cfg = mergeDeployConfig(repoRoot);
const api = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim();
const conn = await sshConnect(cfg, repoRoot);
const out = await execSsh(
  conn,
  `docker exec ${api} bash -lc "cd /app && node -e \\"const m=require('mongoose');const T=require('./dist/data/models/TVPost').default;m.connect(process.env.MONGO_URI).then(async()=>{const p=await T.findOne({type:'video'}).select('mediaUrls caption createdAt').lean();console.log(JSON.stringify(p));await m.disconnect();});\\""`
);
console.log(out);
conn.end();
