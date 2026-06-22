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

const patchPy = `
from pathlib import Path

def must_replace(path, old, new):
    p = Path(path)
    s = p.read_text(encoding="utf-8")
    if old not in s:
        raise SystemExit(f"missing pattern in {path}")
    p.write_text(s.replace(old, new), encoding="utf-8")

base = Path("/home/zweppe/morongwa-live/frontend")

must_replace(
    base / "app/qwerty-music/page.tsx",
    "import { musicAPI, getImageUrl, API_BASE } from '@/lib/api';",
    "import { musicAPI, getImageUrl, getImageUrlFull, API_BASE } from '@/lib/api';",
)
must_replace(
    base / "app/qwerty-music/page.tsx",
    """  const loadMoreSongs = useCallback(async () => {
    if (loadingSongs || loadingMoreSongs) return;
    if (songsHasMore) {
      await loadSongs(songsPage + 1, true, false);
      return;
    }
    // Keep feed continuous after pagination is exhausted.
    await loadSongs(1, true, true);
  }, [loadingSongs, loadingMoreSongs, songsHasMore, songsPage, loadSongs]);""",
    """  const loadMoreSongs = useCallback(async () => {
    if (loadingSongs || loadingMoreSongs) return;
    if (!songsHasMore) return;
    await loadSongs(songsPage + 1, true, false);
  }, [loadingSongs, loadingMoreSongs, songsHasMore, songsPage, loadSongs]);""",
)
must_replace(
    base / "app/qwerty-music/page.tsx",
    "        if (first?.isIntersecting && songs.length > 0 && !loadingSongs && !loadingMoreSongs) {",
    "        if (first?.isIntersecting && songs.length > 0 && songsHasMore && !loadingSongs && !loadingMoreSongs) {",
)
must_replace(
    base / "app/qwerty-music/page.tsx",
    "  }, [songs.length, loadingSongs, loadingMoreSongs, loadMoreSongs]);",
    "  }, [songs.length, songsHasMore, loadingSongs, loadingMoreSongs, loadMoreSongs]);",
)
must_replace(
    base / "app/qwerty-music/page.tsx",
    """  const getArtworkUrl = (url: string) => {
    if (!url) return '';
    const path = getImageUrl(url) || url;
    return path || '';
  };""",
    """  const getArtworkUrl = (url: string) => {
    if (!url) return '';
    const path = getImageUrlFull(url) || url;
    return path || '';
  };""",
)
must_replace(
    base / "app/qwerty-music/page.tsx",
    "                              src={getImageUrl(s.audioUrl) || s.audioUrl}",
    "                              src={getImageUrlFull(s.audioUrl) || s.audioUrl}",
)

must_replace(
    base / "components/AppSidebar.tsx",
    "import { getImageUrl } from '@/lib/api';",
    "import { getImageUrlFull } from '@/lib/api';",
)
must_replace(
    base / "components/AppSidebar.tsx",
    """  const avatarSrc = avatarUrl
    ? `\${getImageUrl(avatarUrl)}\${getImageUrl(avatarUrl).includes("?") ? "&" : "?"}v=\${avatarVersion}`
    : "";""",
    """  const normalizedAvatar = avatarUrl ? getImageUrlFull(avatarUrl) : "";
  const avatarSrc = normalizedAvatar
    ? `\${normalizedAvatar}\${normalizedAvatar.includes("?") ? "&" : "?"}v=\${avatarVersion}`
    : "";""",
)

must_replace(
    base / "components/ProfileHeaderButton.tsx",
    "import { getImageUrl, usersAPI } from '@/lib/api';",
    "import { getImageUrlFull, usersAPI } from '@/lib/api';",
)
must_replace(
    base / "components/ProfileHeaderButton.tsx",
    '  const avatarSrc = avatarRaw ? `\\${getImageUrl(avatarRaw)}\\${getImageUrl(avatarRaw).includes("?") ? "&" : "?"}v=\\${avatarVersion}` : "";',
    '  const normalizedAvatar = avatarRaw ? getImageUrlFull(avatarRaw) : "";\\n  const avatarSrc = normalizedAvatar ? `\\${normalizedAvatar}\\${normalizedAvatar.includes("?") ? "&" : "?"}v=\\${avatarVersion}` : "";',
)

print("PATCH_OK")
`;

async function main() {
  const cfg = { ...loadKv(path.join(repoRoot, "deploy-server.config")), ...loadKv(path.join(repoRoot, "deploy-server.secrets")) };
  if (process.env.DEPLOY_SSH_PASSWORD) cfg.DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD.trim();
  const conn = await connect(cfg);
  const b64 = Buffer.from(patchPy, "utf8").toString("base64");
  const cmd = [
    `python3 - <<'PY'`,
    `import base64`,
    `exec(base64.b64decode(${JSON.stringify(b64)}).decode("utf-8"))`,
    `PY`,
    "docker restart morongwa-web-test",
    "sleep 8",
    "curl -sI --max-time 20 http://127.0.0.1:3010/qwerty-music | head -n 20",
  ].join("\n");
  const r = await execSsh(conn, cmd);
  conn.end();
  process.stdout.write(r.out);
  if (r.err) process.stderr.write(r.err);
  if (r.code !== 0) process.exit(r.code || 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
