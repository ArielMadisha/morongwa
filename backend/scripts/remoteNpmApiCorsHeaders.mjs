/**
 * Ensure api.qwertymates.com NPM vhost sends CORS headers even on 502/504 from dead upstream
 * (browsers otherwise report "blocked by CORS" when the API container is restarting).
 *
 * Run: cd backend && node scripts/remoteNpmApiCorsHeaders.mjs
 */
import fs from "fs";
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
      stream.stderr.on("data", (d) => {
        out += String(d);
      });
      stream.on("close", (code) => resolve({ code, stdout: out }));
    });
  });
}

const patchPy = `
import re, shutil, sys, glob
# Find api.qwertymates.com proxy_host conf
conf = None
for p in sorted(glob.glob("/data/nginx/proxy_host/*.conf")):
    try:
        s = open(p, encoding="utf-8").read()
    except OSError:
        continue
    if "api.qwertymates.com" in s and "server_name" in s:
        conf = p
        break
if not conf:
    print("ERR: no api.qwertymates.com proxy_host conf")
    sys.exit(1)
with open(conf, encoding="utf-8") as f:
    s = f.read()
if "QM_API_CORS_ALWAYS" in s:
    print("SKIP: already patched", conf)
    sys.exit(0)
shutil.copy(conf, conf + ".bak.api-cors")
# After first server_name line for api host
m = re.search(r"(?m)^(\\s*server_name\\s+[^;]*api\\.qwertymates\\.com[^;]*;\\s*)$", s)
if not m:
    print("ERR: server_name api.qwertymates.com not found in", conf)
    sys.exit(1)
block = """
  # QM_API_CORS_ALWAYS — mirror Express cors for www during upstream errors
  set $qm_cors_origin "";
  if ($http_origin ~* "^https://(www\\.)?qwertymates\\.com$") {
    set $qm_cors_origin $http_origin;
  }
  add_header Access-Control-Allow-Origin $qm_cors_origin always;
  add_header Access-Control-Allow-Credentials true always;
  add_header Vary Origin always;
"""
s2 = s[:m.end()] + block + s[m.end():]
with open(conf, "w", encoding="utf-8") as f:
    f.write(s2)
print("PATCHED_API_CORS", conf)
`;

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const conn = await sshConnect(cfg, repoRoot);
  const b64 = Buffer.from(patchPy, "utf8").toString("base64");
  const r = await execSsh(
    conn,
    `docker exec nginx-app-1 sh -lc 'echo ${JSON.stringify(b64)} | base64 -d | python3' && docker exec nginx-app-1 nginx -t && docker exec nginx-app-1 nginx -s reload`
  );
  console.log(r.stdout);
  conn.end();
  if (r.code !== 0) process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
