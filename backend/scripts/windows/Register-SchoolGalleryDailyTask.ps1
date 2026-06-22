#Requires -Version 5.1
<#
  Registers a daily Windows Scheduled Task (06:30 local) to import one school gallery folder.

  Usage (PowerShell):
    powershell -NoProfile -ExecutionPolicy Bypass -File Register-SchoolGalleryDailyTask.ps1

  Remove:
    Unregister-ScheduledTask -TaskName "Qwertymates-SchoolGallery-Daily" -Confirm:$false
#>

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunScript = Join-Path $ScriptDir "Run-SchoolGalleryDailyImport.ps1"
if (-not (Test-Path -LiteralPath $RunScript)) {
  throw "Missing: $RunScript"
}

$RunScriptFull = (Resolve-Path -LiteralPath $RunScript).Path
$BackendRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$TaskName = "Qwertymates-SchoolGallery-Daily"
$Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$RunScriptFull`""

Write-Host "Registering daily task '$TaskName' at 06:30"
Write-Host "  Action: powershell.exe $Arguments"
Write-Host "  WorkingDirectory: $BackendRoot"

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Arguments -WorkingDirectory $BackendRoot
$Trigger = New-ScheduledTaskTrigger -Daily -At "06:30"
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -WakeToRun `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 4) `
  -RestartCount 2 `
  -RestartInterval (New-TimeSpan -Minutes 15)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null

Get-ScheduledTask -TaskName $TaskName | Format-List TaskName, State
Get-ScheduledTaskInfo -TaskName $TaskName | Format-List LastRunTime, LastTaskResult, NextRunTime

Write-Host "`nDone. Test now with:" -ForegroundColor Green
Write-Host "  powershell -File `"$RunScriptFull`" -DryRun"
Write-Host "Logs: backend/exports/school-gallery-daily-task.log"
