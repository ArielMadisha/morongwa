#Requires -Version 5.1
<#
  Import one school photo folder per day into Qwertymates (existing account or auto-create).
  Retries until today's school is loaded or max attempts exhausted.

  Logs: backend/exports/school-gallery-daily-task.log
#>

param(
  [switch]$DryRun,
  [switch]$Force,
  [string]$Root = "C:\Users\Dell\OneDrive - Bonakude Consulting PTY LTD\Documents\Coding\Schools",
  [string]$Country = "ZA",
  [int]$MaxAttempts = 20,
  [int]$RetryDelaySec = 90
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$LogDir = Join-Path $BackendRoot "exports"
$LogFile = Join-Path $LogDir "school-gallery-daily-task.log"
$StateFile = Join-Path $LogDir "school-gallery-daily-state.json"

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  for ($i = 0; $i -lt 5; $i++) {
    try {
      Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 -ErrorAction Stop
      return
    } catch {
      Start-Sleep -Milliseconds (200 * ($i + 1))
    }
  }
  Write-Host "WARN: could not write to log file: $LogFile"
}

function Append-LogLine([string]$Message) {
  for ($i = 0; $i -lt 5; $i++) {
    try {
      Add-Content -LiteralPath $LogFile -Value $Message -Encoding UTF8 -ErrorAction Stop
      return
    } catch {
      Start-Sleep -Milliseconds (200 * ($i + 1))
    }
  }
}

function Test-TodayImportSucceeded {
  if (-not (Test-Path -LiteralPath $StateFile)) { return $false }
  try {
    $state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
    $today = (Get-Date).ToString("yyyy-MM-dd")
    $ok = @("imported", "dry_run_ok", "would_create_user")
    foreach ($entry in @($state.history)) {
      if ([string]$entry.date -eq $today -and ($ok -contains [string]$entry.status)) {
        return $true
      }
    }
    return $false
  } catch {
    return $false
  }
}

$NodeDirs = @(
  "C:\Program Files\nodejs",
  "$env:ProgramFiles\nodejs",
  "$env:LOCALAPPDATA\Programs\nodejs"
)
$NpmCmd = $null
foreach ($dir in $NodeDirs) {
  if (-not $dir) { continue }
  $candidate = Join-Path $dir "npm.cmd"
  if (Test-Path -LiteralPath $candidate) {
    $NpmCmd = $candidate
    if ($env:PATH -notlike "*$dir*") {
      $env:PATH = "$dir;$env:PATH"
    }
    break
  }
}
if (-not $NpmCmd) {
  throw "npm.cmd not found. Install Node.js or add it to PATH for scheduled tasks."
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Write-Log "=== School gallery daily import started (DryRun=$DryRun Force=$Force MaxAttempts=$MaxAttempts) ==="
Write-Log "Backend: $BackendRoot"
Write-Log "School photos root: $Root"
Write-Log "npm: $NpmCmd"

if (-not (Test-Path -LiteralPath $Root)) {
  throw "Schools folder not found: $Root (OneDrive may be offline - open File Explorer and sync first)"
}

Set-Location $BackendRoot
$env:SCHOOL_GALLERY_IMPORT_ROOT = $Root

$npmArgs = @("run", "school:import-gallery-daily", "--", "--country=$Country")
if ($DryRun) { $npmArgs += "--dry-run" }
if ($Force) { $npmArgs += "--force" }

$attempt = 0
$exitCode = 1
while ($attempt -lt $MaxAttempts) {
  $attempt++
  Write-Log "Attempt $attempt/$MaxAttempts"

  try {
    & $NpmCmd @npmArgs 2>&1 | ForEach-Object {
      $text = "$_"
      Write-Host $text
      Append-LogLine $text
    }
    $exitCode = $LASTEXITCODE
  } catch {
    Write-Log "Attempt $attempt exception: $($_.Exception.Message)"
    $exitCode = 1
  }

  if ($exitCode -eq 0) {
    if ($DryRun -or (Test-TodayImportSucceeded)) {
      Write-Log "School gallery daily import finished OK (attempt $attempt)."
      exit 0
    }
    Write-Log "Exit 0 but state not updated for today - retrying."
    $exitCode = 1
  } else {
    Write-Log "FAILED attempt $attempt exit $exitCode"
  }

  if ($attempt -lt $MaxAttempts) {
    Write-Log "Waiting ${RetryDelaySec}s before retry..."
    Start-Sleep -Seconds $RetryDelaySec
  }
}

Write-Log "FAILED after $MaxAttempts attempts."
exit $exitCode
