# Upload morongwa-frontend-only.tgz and rebuild/restart morongwa-web-test Docker on the server.
# Prereq: SSH access (password or key).
#
# Usage (from repo root):
#   .\scripts\publish-frontend-test.ps1 -SshTarget root@YOUR_DROPLET_IP -RebuildTar `
#       -StagingParent /root -LiveDir /var/www/morongwa
#
# Default paths match legacy layout under /home/zweppe. For DigitalOcean as root, set -StagingParent /root
# and -LiveDir to where morongwa lives (e.g. /var/www/morongwa).

param(
    [string]$SshTarget = "",
    [string]$StagingParent = "",
    [string]$LiveDir = "",
    [string]$RemoteTarPath = "",
    [switch]$RebuildTar
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Tarball = Join-Path $Root "morongwa-frontend-only.tgz"

if (-not $SshTarget) {
    $cfg = Join-Path $Root "deploy-server.config"
    if (Test-Path $cfg) {
        Get-Content $cfg | ForEach-Object {
            if ($_ -match '^\s*DEPLOY_SSH_HOST\s*=\s*(.+)$') { $SshTarget = $matches[1].Trim() }
        }
    }
}

if (-not $SshTarget) {
    Write-Host "Usage: .\scripts\publish-frontend-test.ps1 -SshTarget root@your.ip -RebuildTar [-StagingParent /root] [-LiveDir /var/www/morongwa]"
    Write-Host "Or set DEPLOY_SSH_HOST in deploy-server.config"
    exit 1
}

if (-not $StagingParent) {
    $StagingParent = if ($SshTarget -match '^root@') { "/root" } else { "/home/zweppe" }
}

if (-not $LiveDir) {
    $LiveDir = if ($StagingParent -eq "/root") { "/var/www/morongwa" } else { "/home/zweppe/morongwa-live" }
}

if (-not $RemoteTarPath) {
    $RemoteTarPath = "$StagingParent/morongwa-frontend-only.tgz"
}

$remoteScriptName = "remote_refresh_frontend_test.sh"
$remoteScriptDest = "$StagingParent/$remoteScriptName"

function Build-Tarball {
    $stage = Join-Path $Root "_pack_frontend"
    $dest = Join-Path $stage "morongwa-frontend-only"
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    $frontend = Join-Path $Root "frontend"
    & robocopy $frontend $dest /MIR /XD node_modules .next /NFL /NDL /NJH /NJS /nc /ns /np
    $rc = $LASTEXITCODE
    if ($rc -ge 8) { throw "robocopy failed with exit $rc" }
    if (Test-Path $Tarball) { Remove-Item $Tarball -Force }
    & tar -czf $Tarball -C $stage morongwa-frontend-only
    Write-Host "Wrote $Tarball ($([math]::Round((Get-Item $Tarball).Length/1MB, 2)) MB)"
}

if ($RebuildTar -or -not (Test-Path $Tarball)) {
    Write-Host "==> Building tarball..."
    Build-Tarball
} else {
    Write-Host "==> Using existing $Tarball (use -RebuildTar to refresh)"
}

$remoteScript = Join-Path $Root "backend\scripts\remote_refresh_frontend_test.sh"
if (-not (Test-Path $remoteScript)) {
    throw "Missing $remoteScript"
}

Write-Host "==> scp tarball -> ${SshTarget}:$RemoteTarPath"
& scp $Tarball "${SshTarget}:$RemoteTarPath"
if ($LASTEXITCODE -ne 0) { throw "scp failed" }

Write-Host "==> scp refresh script -> ${SshTarget}:$remoteScriptDest"
& scp $remoteScript "${SshTarget}:$remoteScriptDest"
if ($LASTEXITCODE -ne 0) { throw "scp failed" }

$exports = "export MORONGWA_STAGING_PARENT=$StagingParent MORONGWA_LIVE_DIR=$LiveDir MORONGWA_FRONTEND_TGZ=$RemoteTarPath"
Write-Host "==> Running remote refresh (Docker build + start; staging=$StagingParent app=$LiveDir)..."
ssh $SshTarget "chmod +x $remoteScriptDest && $exports && bash $remoteScriptDest"
if ($LASTEXITCODE -ne 0) { throw "ssh remote script failed" }

Write-Host "==> Done. Open https://qwertymates.com/login in a private window to verify."
