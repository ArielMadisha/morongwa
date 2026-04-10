# Sync Morongwa to a Linux VPS (e.g. DigitalOcean Droplet)
# Usage: .\scripts\deploy-to-server.ps1
# Requires: deploy-server.config with DEPLOY_SSH_HOST and DEPLOY_REMOTE_PATH

$ErrorActionPreference = "Stop"
$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$ConfigFile = Join-Path $RootDir "deploy-server.config"

if (-not (Test-Path $ConfigFile)) {
    Write-Host "Config not found. Copy deploy-server.config.example to deploy-server.config"
    exit 1
}

$config = @{}
Get-Content $ConfigFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)\s*=\s*(.*)$') {
        $config[$matches[1].Trim()] = $matches[2].Trim()
    }
}

$SshTarget = $config["DEPLOY_SSH_HOST"]
$RemotePath = $config["DEPLOY_REMOTE_PATH"]

if (-not $SshTarget -or -not $RemotePath) {
    Write-Host "Set DEPLOY_SSH_HOST and DEPLOY_REMOTE_PATH in deploy-server.config"
    exit 1
}

Push-Location $RootDir
try {
    Write-Host "==> Syncing to ${SshTarget}:${RemotePath} ..."

    $rsync = Get-Command rsync -ErrorAction SilentlyContinue
    if ($rsync) {
        & rsync -avz --progress --delete `
            --exclude=node_modules --exclude=.next --exclude=dist `
            --exclude=.git --exclude=.env --exclude='*.log' `
            ./ "${SshTarget}:${RemotePath}/"
    } else {
        Write-Host "rsync not found. Use Git Bash: bash scripts/deploy-to-server.sh"
        exit 1
    }

    Write-Host "==> Installing and building on server..."
    ssh $SshTarget "cd $RemotePath/backend && npm install && npm run build"
    ssh $SshTarget "cd $RemotePath/frontend && npm install && npm run build"

    Write-Host "==> Restarting services..."
    ssh $SshTarget "cd $RemotePath && (pm2 restart all 2>/dev/null || echo 'Run: pm2 start backend/dist/server.js --name api')"

    Write-Host "==> Done."
} finally {
    Pop-Location
}
