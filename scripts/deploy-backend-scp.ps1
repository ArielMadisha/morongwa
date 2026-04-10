# Deploy backend only (no rsync): local tsc, tarball, scp, remote npm install --omit=dev, pm2 restart.
# Requires: OpenSSH client (ssh, scp) + key-based auth to the server (same host as deploy-server.config).
# Usage: .\scripts\deploy-backend-scp.ps1
#
# If scp asks for a password, use ssh-agent with your key, or run ssh-add.

$ErrorActionPreference = "Stop"
$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$ConfigFile = Join-Path $RootDir "deploy-server.config"
if (-not (Test-Path $ConfigFile)) {
    Write-Host "Missing deploy-server.config (copy from deploy-server.config.example)"
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

$BackendDir = Join-Path $RootDir "backend"
Push-Location $BackendDir
try {
    Write-Host "==> npm run build (backend)..."
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

$Tarball = Join-Path $env:TEMP "morongwa-backend-deploy-$(Get-Date -Format 'yyyyMMddHHmmss').tgz"
Write-Host "==> Creating tarball (excludes node_modules, dist is included)..."
Push-Location $RootDir
try {
    if (Test-Path $Tarball) { Remove-Item $Tarball -Force }
    # BSD tar on Windows: exclude node_modules under backend/
    tar -czf $Tarball `
        --exclude=backend/node_modules `
        --exclude=backend/.git `
        --exclude=backend/uploads `
        --exclude=backend/logs `
        backend
} finally {
    Pop-Location
}

$RemoteTar = "/tmp/morongwa-backend-deploy.tgz"
Write-Host "==> scp -> ${SshTarget}:${RemoteTar}"
scp $Tarball "${SshTarget}:${RemoteTar}"
if ($LASTEXITCODE -ne 0) {
    Write-Host "scp failed. Configure SSH key: ssh-add ~/.ssh/your_key"
    exit $LASTEXITCODE
}

$RemoteCmd = "set -e; cd $RemotePath; tar -xzf $RemoteTar; rm -f $RemoteTar; cd backend; npm install --omit=dev; pm2 restart all || pm2 restart morongwa-api || pm2 restart api || true"
Write-Host "==> ssh: extract, npm install, pm2 restart..."
ssh $SshTarget $RemoteCmd

Remove-Item $Tarball -Force -ErrorAction SilentlyContinue
Write-Host "==> Done."
