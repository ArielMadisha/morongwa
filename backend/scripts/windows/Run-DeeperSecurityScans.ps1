#Requires -Version 5.1
<#
  Runs deeper security scans (OWASP ZAP Docker baseline, registration probes, ops email).
  Logs: backend/exports/deeper-security-scan-task.log
#>

param(
  [switch]$SkipZap,
  [switch]$NoEmail
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$LogDir = Join-Path $BackendRoot "exports"
$LogFile = Join-Path $LogDir "deeper-security-scan-task.log"

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
  }
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

Set-Location -LiteralPath $BackendRoot
Write-Log "Run-DeeperSecurityScans starting (cwd=$BackendRoot)"

$nodeArgs = @("scripts/runDeeperSecurityScans.mjs")
if ($SkipZap) { $nodeArgs += "--skip-zap" }
if ($NoEmail) { $nodeArgs += "--no-email" }

& node @nodeArgs
$code = $LASTEXITCODE
Write-Log "Run-DeeperSecurityScans finished exit=$code"
exit $code
