#Requires -Version 5.1
<#
  Runs EAS Android production build + Play submit when quota is open (from 2026-07-01).
  Logs to mobile/exports/eas-android-release-task.log
#>
param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MobileRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$NodeScript = Join-Path $MobileRoot "scripts\runEasAndroidPlayReleaseWhenQuotaOpen.mjs"
$LogFile = Join-Path $MobileRoot "exports\eas-android-release-task.log"

if (-not (Test-Path -LiteralPath $NodeScript)) {
  throw "Missing: $NodeScript"
}

New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $LogFile -Value "`n[$stamp] === Run-EasAndroidPlayRelease.ps1 ==="

if ($DryRun) {
  Add-Content -Path $LogFile -Value "[$stamp] DRY RUN — would execute node $NodeScript"
  Write-Host "DRY RUN: node $NodeScript"
  exit 0
}

Push-Location $MobileRoot
try {
  & node $NodeScript
  $code = $LASTEXITCODE
  if ($code -eq 2) {
    Write-Host "Quota still blocked — task will retry tomorrow if scheduled." -ForegroundColor Yellow
  } elseif ($code -ne 0) {
    Write-Host "Release script failed with exit $code — see $LogFile" -ForegroundColor Red
  } else {
    Write-Host "Android Play release completed — see $LogFile" -ForegroundColor Green
  }
  exit $code
} finally {
  Pop-Location
}
