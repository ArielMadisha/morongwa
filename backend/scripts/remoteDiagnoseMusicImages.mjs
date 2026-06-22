import { Client } from "ssh2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadKv(p) {
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    const h = v.indexOf(" #");
    if (h >= 0) v = v.slice(0, h).trim();
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}

function connect(cfg) {
  const raw = (cfg.DEPLOY_SSH_HOST || "").trim();
  const user = raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : "root";
  const host = raw.includes("@") ? raw.slice(raw.indexOf("@") + 1) : raw;
  const password = (process.env.DEPLOY_SSH_PASSWORD || cfg.DEPLOY_SSH_PASSWORD || "").trim();
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => resolve(c)).on("error", reject).connect({
      host,
      username: user,
      password,
      port: parseInt(cfg.DEPLOY_SSH_PORT || "22", 10) || 22,
      readyTimeout: 120000,
    });
  });
}

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    conn.exec(cmd, (e, stream) => {
      if (e) return reject(e);
      stream.on("data", (d) => (out += String(d)));
      stream.stderr.on("data", (d) => (err += String(d)));
      stream.on("close", (code) => resolve({ code, out, err }));
    });
  });
}

const script = `
set -e
curl -s "https://api.qwertymates.com/api/music/songs?type=song&page=1&limit=8" > /tmp/music_songs.json
python3 - <<'PY'
import json, subprocess
rows = json.load(open('/tmp/music_songs.json','r',encoding='utf-8')).get('data') or []
print('songs', len(rows))
for r in rows[:8]:
    artwork = (r.get('artworkUrl') or '').strip()
    audio = (r.get('audioUrl') or '').strip()
    print('id', r.get('_id'))
    print('artwork', artwork)
    print('audio', audio)
    if artwork:
        u = artwork if artwork.startswith('http') else ('https://api.qwertymates.com' + artwork)
        h = subprocess.check_output(['bash','-lc', f'curl -sI --max-time 15 "{u}" | head -n 1 || true']).decode('utf-8','ignore').strip()
        print('artwork_head', h)
    if audio:
        u = audio if audio.startswith('http') else ('https://api.qwertymates.com' + audio)
        h = subprocess.check_output(['bash','-lc', f'curl -sI --max-time 15 "{u}" | head -n 1 || true']).decode('utf-8','ignore').strip()
        print('audio_head', h)
    print('---')
PY
curl -sI --max-time 20 "https://www.qwertymates.com/uploads/music/test.png" | head -n 1 || true
`;

async function main() {
  const cfg = { ...loadKv(path.join(repoRoot, "deploy-server.config")), ...loadKv(path.join(repoRoot, "deploy-server.secrets")) };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  const conn = await connect(cfg);
  const b64 = Buffer.from(script, "utf8").toString("base64");
  const r = await execSsh(conn, `echo ${JSON.stringify(b64)} | base64 -d | bash`);
  conn.end();
  process.stdout.write(r.out);
  if (r.err) process.stderr.write(r.err);
  if (r.code !== 0) process.exit(r.code || 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
