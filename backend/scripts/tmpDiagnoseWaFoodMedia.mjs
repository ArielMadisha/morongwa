/**
 * Diagnose WA food media: pull latest logs + compare media URLs.
 */
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
  const cmd = [
    "echo '=== FOOD LOGS ==='",
    "docker logs morongwa-api-test --since 6h 2>&1 | grep -iE 'food menu|sending photo|marketplace card send|mediaUrl|photoCards' | tail -40",
    "echo '=== CURL FOOD VS PRODUCT ==='",
    "curl -sI 'https://api.qwertymates.com/uploads/food/calibas-kota-1.png' | head -15",
    "curl -sI 'https://api.qwertymates.com/uploads/1779306055969-616632678-7efab166-1e8e-421b-a9e2-a1709ce56f21.jpeg' | head -15",
  ].join("; ");
  conn.exec(cmd, (err, stream) => {
    if (err) return reject(err);
    let o = "";
    stream.on("data", (d) => (o += d.toString()));
    stream.stderr.on("data", (d) => (o += d.toString()));
    stream.on("close", () => {
      console.log(o);
      resolve();
    });
  });
});
conn.end();
