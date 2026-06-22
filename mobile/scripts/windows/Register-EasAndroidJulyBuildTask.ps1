#Requires -Version 5.1
<#
  Registers daily Windows task (08:00) from 2026-07-01 through 2026-07-07 to run EAS Android Play release.

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File Register-EasAndroidJulyBuildTask.ps1

  Remove:
    Unregister-ScheduledTask -TaskName "Qwertymates-EAS-Android-July-Release" -Confirm:$false
#>

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunScript = Join-Path $ScriptDir "Run-EasAndroidPlayRelease.ps1"
if (-not (Test-Path -LiteralPath $RunScript)) {
  throw "Missing: $RunScript"
}

$RunScriptFull = (Resolve-Path -LiteralPath $RunScript).Path
$MobileRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$TaskName = "Qwertymates-EAS-Android-July-Release"
$Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$RunScriptFull`""

Write-Host "Registering task '$TaskName' - daily 08:00 from 2026-07-01 for 7 days"
Write-Host "  Action: powershell.exe $Arguments"
Write-Host "  WorkingDirectory: $MobileRoot"

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Arguments -WorkingDirectory $MobileRoot

# Daily trigger starting 1 July 2026, 7 occurrences
$Start = Get-Date "2026-07-01 08:00:00"
$Trigger = New-ScheduledTaskTrigger -Daily -At "08:00" -DaysInterval 1
$Trigger.StartBoundary = $Start.ToString("s")

$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -WakeToRun `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
  -RestartCount 1 `
  -RestartInterval (New-TimeSpan -Minutes 30)

$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null

Get-ScheduledTask -TaskName $TaskName | Format-List TaskName, State
Get-ScheduledTaskInfo -TaskName $TaskName | Format-List LastRunTime, LastTaskResult, NextRunTime

Write-Host "`nDone. Dry-run:" -ForegroundColor Green
Write-Host "  powershell -File `"$RunScriptFull`" -DryRun"
Write-Host "Log: mobile/exports/eas-android-release-task.log"
