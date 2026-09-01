#Requires -Version 5.1
<#
  Registers a one-shot Windows Scheduled Task for deeper security scans tonight at 22:00 local.

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File Register-DeeperSecurityScanTonight.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File Register-DeeperSecurityScanTonight.ps1 -At "22:00"

  Remove:
    Unregister-ScheduledTask -TaskName "Qwertymates-DeeperSecurityScan-Tonight" -Confirm:$false
#>

param(
  [string]$At = "22:00"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunScript = Join-Path $ScriptDir "Run-DeeperSecurityScans.ps1"
if (-not (Test-Path -LiteralPath $RunScript)) {
  throw "Missing: $RunScript"
}

$RunScriptFull = (Resolve-Path -LiteralPath $RunScript).Path
$BackendRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$TaskName = "Qwertymates-DeeperSecurityScan-Tonight"
$Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$RunScriptFull`""

$today = Get-Date
$parts = $At.Split(":")
$hour = [int]$parts[0]
$minute = if ($parts.Length -gt 1) { [int]$parts[1] } else { 0 }
$runAt = Get-Date -Year $today.Year -Month $today.Month -Day $today.Day -Hour $hour -Minute $minute -Second 0
if ($runAt -le (Get-Date).AddMinutes(2)) {
  throw "Target time $runAt is too soon or already passed. Pass -At with a future local time."
}

Write-Host "Registering one-shot task '$TaskName' at $runAt"
Write-Host "  Action: powershell.exe $Arguments"
Write-Host "  WorkingDirectory: $BackendRoot"

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Arguments -WorkingDirectory $BackendRoot
$Trigger = New-ScheduledTaskTrigger -Once -At $runAt
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -WakeToRun `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
  -RestartCount 1 `
  -RestartInterval (New-TimeSpan -Minutes 10)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null

Get-ScheduledTask -TaskName $TaskName | Format-List TaskName, State
Get-ScheduledTaskInfo -TaskName $TaskName | Format-List LastRunTime, LastTaskResult, NextRunTime

Write-Host "`nScheduled for $runAt (local)." -ForegroundColor Green
Write-Host "Manual test:"
Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File `"$RunScriptFull`" -SkipZap"
Write-Host "Logs: backend/exports/deeper-security-scan-task.log"
Write-Host "Reports: backend/exports/deeper-security-scans/"
