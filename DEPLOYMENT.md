# Deployment guide

Use a Linux VPS (e.g. **DigitalOcean Droplet**) or any host with Node.js 20+ (LTS recommended), plus MongoDB Atlas or a self-hosted MongoDB instance.

## One-time server setup

```bash
# On the droplet
sudo apt update && sudo apt install -y nodejs npm git nginx
# Prefer Node 20+ (nvm or NodeSource)

npm install -g pm2

sudo mkdir -p /var/www/morongwa
sudo chown $USER:$USER /var/www/morongwa
```

## Configure deploy config (project root)

```bash
cp deploy-server.config.example deploy-server.config
# Edit: DEPLOY_SSH_HOST=root@your.droplet.ip
#       DEPLOY_REMOTE_PATH=/var/www/morongwa
```

## Full production deploy (backend + frontend + WhatsApp)

From **`backend/`**, one command pushes the API (Docker rebuild + restart), publishes the **Twilio Studio** WhatsApp flow, then rebuilds and refreshes the **Next.js** frontend on the server:

```bash
cd backend
npm run deploy:production
```

Needs **`deploy-server.config`** and **`deploy-server.secrets`** at the repo root, and **`backend/.env`** with Twilio vars for the flow step.
Recommended minimum for multi-number WhatsApp publish safety:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_SUBACCOUNT_SID`
- `TWILIO_SUBACCOUNT_AUTH_TOKEN`

`deploy:twilio-flow` now auto-discovers active WhatsApp sender webhook flow SIDs and publishes to all of them, so new numbers added later are included automatically.

Individual steps: `npm run deploy:backend-remote`, `npm run deploy:twilio-flow`, `npm run deploy:frontend-remote:rebuild`.

## Sync and build on the server

**Git Bash or WSL:**

```bash
bash scripts/deploy-to-server.sh
```

**PowerShell (requires `rsync` in PATH):**

```powershell
.\scripts\deploy-to-server.ps1
```

**Frontend-only Docker flow (see `backend/scripts/remote_refresh_frontend_test.sh`):**

Password in a **local gitignored file** (never commit):

```bash
cp deploy-server.config.example deploy-server.config
cp deploy-server.secrets.example deploy-server.secrets
# Edit both files; put the SSH password only in deploy-server.secrets

cd backend
npm run deploy:frontend-remote:rebuild
```

Key-based SSH (no password file):

```powershell
.\scripts\publish-frontend-test.ps1 -SshTarget root@your.droplet.ip -RebuildTar
```

## Environment on the server

```bash
# backend/.env — production URLs, MONGO_URI, secrets, etc.
# frontend/.env.local or set NEXT_PUBLIC_API_URL at build time
```

## PM2 example

```bash
cd /var/www/morongwa
pm2 start backend/dist/server.js --name morongwa-api
pm2 start "npm run start" --name morongwa-web --cwd frontend
pm2 save
pm2 startup
```

## Nginx reverse proxy (example)

Point `qwertymates.com` at your Next port (e.g. 3000 or 3010) and `api.qwertymates.com` at the API port (e.g. 4000).

## Livestream media server (same VPS)

The API already expects **RTMP ingest** and an **HTTPS URL base for HLS** (`LIVESTREAM_HLS_PUBLIC_BASE`, `LIVESTREAM_RTMP_PUBLIC_HOST`, `LIVESTREAM_RTMP_APP` — see `backend/.env.production.example` and `backend/src/services/livestream.ts`).

You can run nginx with nginx-rtmp **on the same droplet** in either of these ways:

1. **Docker (recommended beside Nginx Proxy Manager)** — build and run the bundled stack from the repo:

   ```bash
   cd infra/media-server
   docker compose up -d --build
   ```

   Or from `backend/`: `npm run media-server:compose-up`.

   **Automated remote deploy** (upload `infra/media-server`, `docker compose up`, UFW `1935`/`8081`, merge livestream env + restart API — NPM HTTPS steps printed at end):

   ```bash
   cd backend
   npm run deploy:media-server-remote
   ```

   Requires the same SSH/deploy files as `deploy:production`. Put `LIVESTREAM_HLS_PUBLIC_BASE` and `LIVESTREAM_RTMP_PUBLIC_HOST` (or `RTMP_INGEST_URL`) in local `backend/.env` before running so the script can sync server `.env`.

   This publishes **RTMP on port 1935** (application name **`live`**) and **HLS HTTP on 8081** at `/hls`. Add an NPM proxy host (HTTPS) to `http://127.0.0.1:8081`, forward `/hls`, allow large requests/timeouts as needed, and open **1935/tcp** on the firewall for OBS/mobile publishers.

2. **One-shot SSH provisioning (nginx + coturn on the host)** — installs distro nginx + `libnginx-mod-rtmp` and serves HLS on a configurable port (default **8081**). From `backend/`:

   ```bash
   npm run setup:realtime-remote:dry   # preview remote shell script
   npm run setup:realtime-remote       # requires deploy-server.* + TURN_* secrets
   ```

   Prefer the **Docker** option if you already rely on containerized edge routing and want to avoid touching host nginx.

After either setup, set backend env (and run `npm run sync:livestream-env-remote` if you use that helper), then `/api/live/start` and the admin live hub can show OBS + playback URLs.

## Other options

- **Frontend**: Vercel (`vercel --prod` from `frontend/`)
- **Backend**: Render, Railway, Fly.io
- **Database**: MongoDB Atlas

See repository root **README.md** for the high-level link to this file.
