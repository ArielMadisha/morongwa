import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";
import path from "path";
import { fileURLToPath } from "url";

const q = process.argv[2] || "Coliben";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cfg = mergeDeployConfig(repoRoot);
const conn = await sshConnect(cfg, repoRoot);

const script = `
const { MongoClient } = require("mongodb");
(async () => {
  const uri = process.env.MONGO_URI;
  const c = new MongoClient(uri);
  await c.connect();
  const users = await c.db().collection("users").find({
    $or: [
      { name: { $regex: ${JSON.stringify(q)}, $options: "i" } },
      { username: { $regex: ${JSON.stringify(q)}, $options: "i" } },
    ],
  }).project({ name: 1, username: 1, phone: 1, email: 1, createdAt: 1 }).limit(5).toArray();
  console.log(JSON.stringify(users, null, 2));
  await c.close();
})().catch((e) => { console.error(e); process.exit(1); });
`;

const b64 = Buffer.from(script, "utf8").toString("base64");
const cmd = `bash -lc 'docker exec morongwa-api-test node -e "$(echo ${b64} | base64 -d)"'`;

conn.exec(cmd, (err, stream) => {
  if (err) throw err;
  stream.on("data", (d) => process.stdout.write(String(d)));
  stream.stderr.on("data", (d) => process.stderr.write(String(d)));
  stream.on("close", () => conn.end());
});
