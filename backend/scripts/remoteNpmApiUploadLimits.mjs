/**
 * NPM api.qwertymates.com vhost: allow large TV/video uploads and long proxy timeouts.
 * Default NPM client_max_body_size (1m) rejects wall videos with 413 and can leave the UI spinning.
 *
 * Run: cd backend && node scripts/remoteNpmApiUploadLimits.mjs
 * Wired into deploy:production (step 4b) unless SKIP_NPM_EDGE_FIX=1
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    conn.exec(cmd, (e, stream) => {
      if (e) return reject(e);
      stream.on("data", (d) => {
        out += String(d);
      });
      stream.stderr.on("data", (d) => {
        err += String(d);
      });
      stream.on("close", (code) => resolve({ code, stdout: out, stderr: err }));
    });
  });
}

const patchPy = `
import re, shutil, sys, glob

BLOCK = """
  # QM_API_UPLOAD_LIMITS — wall/TV video uploads (multer allows up to 1GB)
  client_max_body_size 1024M;
  proxy_read_timeout 900s;
  proxy_send_timeout 900s;
  proxy_connect_timeout 75s;
  proxy_request_buffering off;
"""

def patch_conf(conf, host_hint):
    with open(conf, encoding="utf-8") as f:
        s = f.read()
    if "QM_API_UPLOAD_LIMITS" in s:
        print("SKIP", conf)
        return False
    shutil.copy(conf, conf + ".bak.api-upload-limits")
    insert_at = None
    for line_m in re.finditer(r"(?m)^\s*server_name\s+[^;]+;\s*", s):
        if host_hint in line_m.group(0):
            insert_at = line_m.end()
            break
    if insert_at is None:
        marker = "server_name " + host_hint
        idx = s.find(marker)
        if idx >= 0:
            insert_at = s.find(";", idx) + 1
    if insert_at is None:
        print("WARN: server_name with", host_hint, "not found in", conf)
        return False
    s2 = s[:insert_at] + BLOCK + s[insert_at:]
    with open(conf, "w", encoding="utf-8") as f:
        f.write(s2)
    print("PATCHED", conf)
    return True

targets = []
for p in sorted(glob.glob("/data/nginx/proxy_host/*.conf")):
    try:
        s = open(p, encoding="utf-8").read()
    except OSError:
        continue
    if re.search(r"server_name[^;\\n]*api\\.qwertymates\\.com", s):
        targets.append((p, "api.qwertymates.com"))
    elif re.search(r"server_name[^;\\n]*(www\\.)?qwertymates\\.com", s):
        targets.append((p, "qwertymates.com"))

if not targets:
    print("ERR: no api/www qwertymates proxy_host conf")
    sys.exit(1)
patched = 0
for conf, hint in targets:
    if patch_conf(conf, hint):
        patched += 1
if patched == 0:
    print("ALL_SKIP")
else:
    print("PATCHED_COUNT", patched)
`;

export async function runApiUploadLimitsFix() {
  const cfgPath = path.join(repoRoot, "deploy-server.config");
  if (!fs.existsSync(cfgPath)) {
    console.log("remoteNpmApiUploadLimits: skip (no deploy-server.config)");
    return;
  }
  const cfg = mergeDeployConfig(repoRoot);
  const conn = await sshConnect(cfg, repoRoot);
  const b64 = Buffer.from(patchPy, "utf8").toString("base64");
  const r = await execSsh(
    conn,
    `docker exec nginx-app-1 sh -lc 'echo ${JSON.stringify(b64)} | base64 -d | python3' && docker exec nginx-app-1 nginx -t && docker exec nginx-app-1 nginx -s reload`
  );
  console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  conn.end();
  if (r.code !== 0) throw new Error(`remoteNpmApiUploadLimits failed (exit ${r.code})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runApiUploadLimitsFix().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
