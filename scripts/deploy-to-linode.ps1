# Sync Morongwa to Linode (PowerShell)
# Usage: .\scripts\deploy-to-linode.ps1
# Requires: deploy-linode.config with LINODE_HOST and LINODE_PATH

$ErrorActionPreference = "Stop"
$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$ConfigFile = Join-Path $RootDir "deploy-linode.config"

if (-not (Test-Path $ConfigFile)) {
    Write-Host "Config not found. Copy deploy-linode.config.example to deploy-linode.config"
    Write-Host "  Copy-Item deploy-linode.config.example deploy-linode.config"
    exit 1
}

$config = @{}
Get-Content $ConfigFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)\s*=\s*(.*)$') {
        $config[$matches[1].Trim()] = $matches[2].Trim()
    }
}

$HostName = $config["LINODE_HOST"]
$RemotePath = $config["LINODE_PATH"]

if (-not $HostName -or -not $RemotePath) {
    Write-Host "Set LINODE_HOST and LINODE_PATH in deploy-linode.config"
    exit 1
}

Push-Location $RootDir
try {
    Write-Host "==> Syncing to ${HostName}:${RemotePath} ..."

    $rsync = Get-Command rsync -ErrorAction SilentlyContinue
    if ($rsync) {
        & rsync -avz --progress --delete `
            --exclude=node_modules --exclude=.next --exclude=dist `
            --exclude=.git --exclude=.env --exclude='*.log' `
            ./ "${HostName}:${RemotePath}/"
    } else {
        Write-Host "rsync not found. Use Git Bash: bash scripts/deploy-to-linode.sh"
        Write-Host "Or install rsync (e.g. via Chocolatey: choco install rsync)"
        exit 1
    }

    Write-Host "==> Installing and building on server..."
    ssh $HostName "cd $RemotePath/backend && npm install && npm run build"
    ssh $HostName "cd $RemotePath/frontend && npm install && npm run build"

    Write-Host "==> Restarting services..."
    ssh $HostName "cd $RemotePath && (pm2 restart all 2>/dev/null || echo 'Run: pm2 start backend/dist/server.js --name api')"

    Write-Host "==> Done! Synced to Linode."
} finally {
    Pop-Location
}
