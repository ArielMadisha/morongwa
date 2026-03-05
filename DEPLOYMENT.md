# Deployment Guide

> **Note:** Linode sync has been disabled. Use Vercel/Render or manual deployment instead.

## Linode Deployment (Disabled)

### Prerequisites

- Linode server with Node.js 18+ and npm
- SSH access to your Linode
- MongoDB (local on Linode or MongoDB Atlas)

### 1. One-time server setup

```bash
# On your Linode server
sudo apt update && sudo apt install -y nodejs npm
# Or use nvm for Node 18+
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18

# Install PM2 for process management
npm install -g pm2

# Create app directory
sudo mkdir -p /var/www/morongwa
sudo chown $USER:$USER /var/www/morongwa
```

### 2. Configure deploy config

```bash
# From project root
cp deploy-linode.config.example deploy-linode.config

# Edit deploy-linode.config
# LINODE_HOST=root@your-linode-ip
# LINODE_PATH=/var/www/morongwa
```

### 3. Sync to Linode

**Using Git Bash or WSL (recommended on Windows):**

```bash
bash scripts/deploy-to-linode.sh
```

**Using PowerShell:**

```powershell
.\scripts\deploy-to-linode.ps1
```

**Manual sync (if scripts fail):**

```bash
rsync -avz --exclude=node_modules --exclude=.next --exclude=dist --exclude=.git \
  ./ root@YOUR_LINODE_IP:/var/www/morongwa/

ssh root@YOUR_LINODE_IP "cd /var/www/morongwa/backend && npm install && npm run build"
ssh root@YOUR_LINODE_IP "cd /var/www/morongwa/frontend && npm install && npm run build"
```

### 4. Environment on Linode

Create `.env` files on the server:

```bash
# backend/.env
MONGODB_URI=mongodb://localhost:27017/morongwa
JWT_SECRET=your-production-secret
PORT=4000
FRONTEND_URL=https://yourdomain.com
NODE_ENV=production

# frontend/.env.local
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
```

### 5. Start services with PM2

```bash
# On Linode
cd /var/www/morongwa
pm2 start backend/dist/server.js --name morongwa-api
pm2 start "npm run start" --name morongwa-web --cwd frontend
pm2 save
pm2 startup
```

### 6. Nginx reverse proxy (optional)

```nginx
# /etc/nginx/sites-available/morongwa
server {
    listen 80;
    server_name yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
server {
    listen 80;
    server_name api.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:4000;
    }
}
```

---

## Other deployment options

- **Backend**: Render, Railway, Fly.io
- **Frontend**: Vercel (`vercel --prod` from frontend/)
- **Database**: MongoDB Atlas
