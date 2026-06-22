/**
 * Shared helpers for merging livestream-related keys into remote backend/.env.
 */

export function upsertEnvLines(originalText, updates) {
  const keys = new Set(Object.keys(updates));
  const out = [];
  const seen = new Set();
  const rawLines = (originalText || "").split(/\r?\n/);
  for (const line of rawLines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && keys.has(m[1])) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push(`${m[1]}=${updates[m[1]]}`);
      continue;
    }
    out.push(line);
  }
  for (const k of keys) {
    if (!seen.has(k)) {
      out.push(`${k}=${updates[k]}`);
    }
  }
  return out.join("\n") + (out.length ? "\n" : "");
}

export function resolveRemoteBackendRoot(cfg) {
  const explicit = (cfg.MORONGWA_BACKEND_HOST_PATH || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const live = (cfg.MORONGWA_LIVE_DIR || "").trim().replace(/\/$/, "");
  if (live) return `${live}/backend`;
  const deployPath = (cfg.DEPLOY_REMOTE_PATH || "").trim().replace(/\/$/, "");
  if (deployPath) return `${deployPath}/backend`;
  return "/home/zweppe/morongwa-live/backend";
}

export function resolveRemoteRepoRoot(cfg) {
  const live = (cfg.MORONGWA_LIVE_DIR || "").trim().replace(/\/$/, "");
  if (live) return live;
  const deployPath = (cfg.DEPLOY_REMOTE_PATH || "").trim().replace(/\/$/, "");
  if (deployPath) return deployPath;
  return "/var/www/morongwa";
}

/**
 * Build env updates from local backend/.env-style map.
 * RTMP_INGEST_URL may be derived from LIVESTREAM_RTMP_PUBLIC_HOST + LIVESTREAM_RTMP_APP.
 */
export function buildLivestreamEnvUpdates(local) {
  const hls = (local.LIVESTREAM_HLS_PUBLIC_BASE || local.HLS_PLAYBACK_BASE_URL || "").trim().replace(/\/$/, "");
  let rtmp = (local.RTMP_INGEST_URL || "").trim();
  const host = (local.LIVESTREAM_RTMP_PUBLIC_HOST || "").trim();
  const app = (local.LIVESTREAM_RTMP_APP || "live").trim();
  if (!rtmp && host) {
    rtmp = `rtmp://${host}/${app}`;
  }

  /** @type {Record<string, string>} */
  const updates = {};
  if (hls) {
    updates.HLS_PLAYBACK_BASE_URL = hls;
    const lb = (local.LIVESTREAM_HLS_PUBLIC_BASE || "").trim().replace(/\/$/, "");
    updates.LIVESTREAM_HLS_PUBLIC_BASE = lb || hls;
  }
  if (rtmp) updates.RTMP_INGEST_URL = rtmp;
  if (host) updates.LIVESTREAM_RTMP_PUBLIC_HOST = host;
  updates.LIVESTREAM_RTMP_APP = app;

  const ff = (local.TV_CHANNEL_FFMPEG_RTMP_URL || "").trim();
  if (ff) updates.TV_CHANNEL_FFMPEG_RTMP_URL = ff;

  return { hls, rtmp, updates, ok: !!(hls && rtmp) };
}
