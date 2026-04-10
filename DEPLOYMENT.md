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

Needs **`deploy-server.config`** and **`deploy-server.secrets`** at the repo root, and **`backend/.env`** with Twilio vars for the flow step: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_STUDIO_FLOW_SID`.

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

## Other options

- **Frontend**: Vercel (`vercel --prod` from `frontend/`)
- **Backend**: Render, Railway, Fly.io
- **Database**: MongoDB Atlas

See repository root **README.md** for the high-level link to this file.
