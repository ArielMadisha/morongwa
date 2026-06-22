# Quickstart: run RTMP + HLS with Docker (media server)

The Qwertymates API **does not** start the media server. It only reads **env vars** and tells OBS the right URLs. This guide gives you a **minimal** ingest + HLS stack you can run on the same VPS as the API or on a small dedicated box.

**You do not need anything special from OBS** beyond normal **RTMP stream** settings (Server + Stream key from the app). Alternatives: **ffmpeg**, **Larix Broadcaster** (mobile), hardware encoders—anything that publishes **RTMP** to your host.

---

## Outstanding requirement (one sentence)

A process that **(1)** accepts **RTMP** on port **1935** and **(2)** writes **HLS** (`.m3u8` + segments) to disk or memory, **(3)** served over **HTTP/HTTPS** at the URL you put in `LIVESTREAM_HLS_PUBLIC_BASE`.

Until that exists and DNS/firewall point to it, **publish** stays “not configured” in Admin → Live streaming.

---

## Option A: Docker image `alfg/nginx-rtmp` (simple)

Create a folder on the server, e.g. `/opt/livestream`, with `docker-compose.yml`:

```yaml
services:
  nginx-rtmp:
    image: alfg/nginx-rtmp:latest
    restart: unless-stopped
    ports:
      - "1935:1935"   # RTMP publish (OBS → here)
      - "8081:80"     # HTTP: HLS + status (map to what your NPM proxy expects)
```

Start:

```bash
cd /opt/livestream && docker compose up -d
```

Default behaviour (typical for this image):

- **Publish:** `rtmp://YOUR_SERVER_IP:1935/live/STREAM_KEY`  
  - Application name is often **`live`** (matches `LIVESTREAM_RTMP_APP` default).
- **HLS:** served under **`/hls/``** on the container’s port **80** (you mapped it to **8081** on the host). Example playlist:  
  `http://YOUR_SERVER_IP:8081/hls/STREAM_KEY.m3u8`  
  (Exact path can vary slightly by image build—check the image docs or `curl` the root.)

Then:

1. Put **`LIVESTREAM_RTMP_PUBLIC_HOST`** = `YOUR_PUBLIC_HOST` (or `host:1935` if non-default port exposed to internet).
2. Put **`LIVESTREAM_HLS_PUBLIC_BASE`** = **`https://…/hls`** (or whatever path NPM proxies to `http://127.0.0.1:8081/hls`) **with no trailing slash**.
3. Restart **`morongwa-api`** so `GET /api/live/config` shows publish + playback ready.

**TLS:** Browsers need **HTTPS** for HLS in production. Usually **Nginx Proxy Manager** (or nginx) on **443** proxies `/hls` → `http://127.0.0.1:8081/hls` (this matches patterns already used in your deploy pipeline).

---

## Option B: install nginx + nginx-rtmp on the host (no Docker)

Use your distro’s packages or build **nginx with the RTMP module**, then add an `rtmp { }` block and an `http { server { location /hls { alias … } } }`. Same logical checklist as **`LIVESTREAM_MEDIA_SERVER.md`**.

---

## OBS (what you actually configure)

| Field | Value (from API / UI) |
|--------|------------------------|
| **Server** | `rtmp://<LIVESTREAM_RTMP_PUBLIC_HOST>/<app>` e.g. `rtmp://live.example.com/live` |
| **Stream key** | The key returned by **Go live** / `POST /api/live/start` (same as `liveStreamName`) |

No paid OBS plugins are required. **Stream** tab → **Service: Custom**, then paste Server + Stream key.

---

## What we need from you (checklist)

- [ ] A machine (usually your **existing VPS**) where **Docker** can bind **1935** and an **HTTP HLS** port.
- [ ] **Firewall**: allow **1935/tcp** from the internet (or only from your home IP while testing).
- [ ] **DNS** (optional but recommended): e.g. `live.example.com` → that server, for both RTMP hostname and HTTPS HLS if you terminate TLS on the same host.
- [ ] **NPM / nginx**: one stable HTTPS URL for **`…/hls/…`** pointing at the HLS HTTP upstream.
- [ ] **Env on API** (see `DOCS/LIVESTREAM_MEDIA_SERVER.md`) + **API restart**.

We do **not** need license keys, OBS account data, or access to your OBS install—only the **public** RTMP/HLS endpoints and correct **env** on the server.

---

## Verify end-to-end

1. `GET https://api.<domain>/api/live/config` → both flags true.  
2. OBS **Start Streaming** → no connection error.  
3. `curl -I https://<your-hls-base>/TESTKEY.m3u8` → **200** while streaming.  
4. Open the watch URL / HLS player on the site.

If you want this repo to include a **checked-in** `docker-compose` under `deploy/livestream/` (same content as above), say so and we can add it next to avoid copy-paste drift.
