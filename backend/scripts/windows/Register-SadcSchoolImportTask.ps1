#Requires -Version 5.1
<#
  Registers a one-time Windows Scheduled Task to run Run-SadcSchoolImportPipeline.ps1
  **tomorrow at 18:00** (6 PM) local time.

  Usage (PowerShell as current user, from any directory):
    powershell -NoProfile -ExecutionPolicy Bypass -File "...\Register-SadcSchoolImportTask.ps1"

  Remove task later:
    schtasks /Delete /TN "Morongwa-SadcSchoolImport-6pm" /F
#>

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunScript = Join-Path $ScriptDir "Run-SadcSchoolImportPipeline.ps1"
if (-not (Test-Path -LiteralPath $RunScript)) {
  throw "Missing pipeline script: $RunScript"
}

$RunScriptFull = (Resolve-Path -LiteralPath $RunScript).Path
$TaskName = "Morongwa-SadcSchoolImport-6pm"

# Tomorrow 18:00 local
$when = [DateTime]::Today.AddDays(1).AddHours(18)
if ($when -le [DateTime]::Now) {
  $when = $when.AddDays(1)
}

# schtasks /SD expects yyyy/MM/dd on many locales (see error message if MM/dd fails).
$sd = $when.ToString("yyyy/MM/dd")
$st = $when.ToString("HH:mm")

$tr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$RunScriptFull`""

Write-Host "Registering scheduled task '$TaskName'"
Write-Host "  Run once: $sd $st (local time)"
Write-Host "  Action: $tr"

& schtasks /Create /TN $TaskName /TR $tr /SC ONCE /SD $sd /ST $st /F
if ($LASTEXITCODE -ne 0) {
  throw "schtasks /Create failed with exit $LASTEXITCODE"
}

Write-Host "`nDone. Task list:" 
& schtasks /Query /TN $TaskName /V /FO LIST
