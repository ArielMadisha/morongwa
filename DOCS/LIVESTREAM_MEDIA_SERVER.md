# Livestream media server (RTMP → HLS)

This document describes how **user-generated live** (Wall **Go live** with OBS, `POST /api/live/start`, watch pages) expects the **RTMP ingest + HLS delivery** stack to be wired. It is separate from the **admin linear QwertyTV channel** (`/admin/tv-channel`), which uses **VOD files** under `/uploads/tv-channel/` and does **not** require RTMP.

**To actually run ingest + HLS on a server**, see **`LIVESTREAM_QUICKSTART_DOCKER.md`** (minimal Docker example + checklist of what you need to provide).

**Source of truth in code:** `backend/src/services/livestream.ts` (env parsing + URL building), `backend/src/routes/live.ts` (session/start/stop), `backend/.env.production.example` (commented template).

---

## What the API expects

When both **playback** and **publish** are configured, the backend can build URLs for a stream key `STREAMKEY`:

| Output | Shape |
|--------|--------|
| HLS (browser / players) | `{HLS_BASE}/{STREAMKEY}.m3u8` |
| OBS **Server** | `rtmp://{RTMP_HOST}/{APP}` |
| OBS **Stream key** | `{STREAMKEY}` (same as `liveStreamName` on the user) |
| Full RTMP URL (reference) | `rtmp://{RTMP_HOST}/{APP}/{STREAMKEY}` |

`HLS_BASE` must have **no trailing slash**. `RTMP_HOST` is **hostname only** (and optional non-1935 port), **no** `rtmp://` prefix.

---

## Environment variables (API container / `backend/.env`)

Set these on the host that runs **`morongwa-api`** (or equivalent), then restart the API.

### HLS playback (required for “playback configured”)

| Variable | Required | Description |
|----------|----------|-------------|
| `LIVESTREAM_HLS_PUBLIC_BASE` | One of the two | Public base URL where **`.m3u8`** (and segments) are reachable over **HTTPS** (or HTTP in dev), **no trailing slash**. Example: `https://live.example.com/hls` |
| `HLS_PLAYBACK_BASE_URL` | Alternate | Same meaning as `LIVESTREAM_HLS_PUBLIC_BASE`; either can be set. |

Admin UI: **Admin → Live streaming** shows whether HLS playback is configured (`GET /api/admin/live/settings`).

### RTMP publish (required for “publish configured” + OBS)

| Variable | Required | Description |
|----------|----------|-------------|
| `LIVESTREAM_RTMP_PUBLIC_HOST` | Recommended | Hostname (and port if not 1935) shown to OBS, e.g. `live.example.com` or `live.example.com:1935` |
| `RTMP_INGEST_URL` | Optional alternative | Full ingest URL, e.g. `rtmp://live.example.com/live` — used to **derive** host + app if explicit host/app not set |
| `LIVESTREAM_RTMP_APP` | Optional | RTMP application name (default `live` or first path segment of `RTMP_INGEST_URL`) |

**Logic (simplified):**

- `getRtmpPublicHost()` → `LIVESTREAM_RTMP_PUBLIC_HOST`, else host from `RTMP_INGEST_URL`.
- `getRtmpAppName()` → `LIVESTREAM_RTMP_APP`, else app segment from `RTMP_INGEST_URL`, else `live`.
- `isLivestreamPublishConfigured()` → HLS base **and** RTMP host are both non-empty.

---

## Typical ports

| Service | Default port | Notes |
|---------|----------------|------|
| RTMP (publish) | **1935** | OBS, ffmpeg, hardware encoders publish here. |
| HTTP HLS (origin) | **8080**, **8081**, or custom | nginx-rtmp often serves HLS over HTTP on a loopback or internal port; **public** access should be **HTTPS** on 443 via a reverse proxy. |
| HTTPS (public) | **443** | Nginx Proxy Manager / nginx terminates TLS and proxies to the HLS upstream. |

Exact ports depend on your VPS layout. This repo’s production deploy logs have referenced **HLS upstream on Docker bridge / host `nginx-rtmp` :8081** — treat **8081** as an example internal HLS port, not a hardcoded app default.

---

## Minimal nginx-rtmp checklist

Use a build that includes the **RTMP module** (e.g. `nginx-full` with rtmp, or a maintained **nginx-rtmp** Docker image).

1. **RTMP `application`** (often named `live`) accepting **publish** from your API users / OBS.
2. **`hls on;`** for that application, with a writable **`hls_path`** (e.g. under `/tmp/hls` or `/var/www/hls`).
3. **`hls_nested on;`** (recommended) so each stream key gets its own folder and `…/STREAMKEY.m3u8` matches the API’s URL pattern `{HLS_BASE}/{STREAMKEY}.m3u8` when `HLS_BASE` ends with `/hls` and nginx maps one-to-one.
4. **`hls_fragment`** / **`hls_playlist_length`** tuned for latency vs stability (defaults are OK to start).
5. **HTTP server block** (same nginx or sidecar) serving `hls_path` as **static files**, or proxy to that internal listener.
6. **Public HTTPS** (443): reverse proxy exposes something like `https://live.example.com/hls/...` → upstream HLS HTTP. Ensure **`.m3u8` and `.ts`** (or `.m4s` if fMP4) are cached / MIME types correct (`application/vnd.apple.mpegurl`, `video/mp2t`).
7. **Firewall:** allow **1935/tcp** from encoders if RTMP is public; restrict publish with **on_publish** callback or IP allowlist if you need extra safety (not implemented in this repo’s nginx config by default).
8. **DNS:** `LIVESTREAM_RTMP_PUBLIC_HOST` and the HTTPS host used in `LIVESTREAM_HLS_PUBLIC_BASE` must resolve for publishers and viewers respectively.

---

## Reverse proxy (NPM / nginx) alignment

- **`LIVESTREAM_HLS_PUBLIC_BASE`** must be exactly what browsers load (usually **https://** + host + path prefix where `.m3u8` lives).
- Avoid **duplicate location blocks** for `/hls/` when chaining proxies (this project has had deploy scripts that patch NPM for HLS upstream loops — keep one clear path from edge → HLS origin).
- **CSP / `connect-src`:** the site must allow fetches to the HLS host if it differs from the web origin (production CSP patches have been applied in deploy scripts for API/media — if you change hosts, re-check browser console).

---

## Verification

1. **Admin → Live streaming:** `HLS playback` and `RTMP publish` should show **ready** when env is correct.
2. **API:** `GET https://api.<your-domain>/api/live/config` → `playbackConfigured` / `publishConfigured`.
3. **OBS:** publish to `rtmp://<LIVESTREAM_RTMP_PUBLIC_HOST>/<app>` with stream key from **Go live** / `POST /api/live/start` response.
4. **Player:** open the returned **`.m3u8`** URL in Safari or your HLS player; expect 200 and a growing playlist while publishing.

---

## Related routes (reference)

| Method | Path | Role |
|--------|------|------|
| GET | `/api/live/config` | Client: is live configured? |
| GET | `/api/live/session` | Authenticated: current stream key + URLs |
| POST | `/api/live/start` | Start session (requires publish configured) |
| POST | `/api/live/stop` | End session |
| GET | `/api/admin/live/settings` | Admin: hints + env key names (no secrets) |

---

## Deploy reminder

After changing env on the API host, **restart the API container/process** so `livestream.ts` reads new values. Re-check **Admin → Live streaming** and the public site guardrail URLs if you touched edge nginx (`website-502-guardrail` rule in this repo).
