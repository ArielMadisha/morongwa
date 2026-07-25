#Requires -Version 5.1
<#
  Registers Windows task: poll agent@ IMAP + auto-execute allowlisted instructions
  every 3 hours during daytime (06:00-21:00 local).

  Allowlist (default): instructions@, instructions1@, administrator@

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File Register-AgentInstructionEmailPollTask.ps1

  Remove:
    Unregister-ScheduledTask -TaskName "Qwertymates-AgentInstructionEmailPoll" -Confirm:$false
#>

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunScript = Join-Path $ScriptDir "Run-AgentInstructionEmailPoll.ps1"
if (-not (Test-Path -LiteralPath $RunScript)) {
  throw "Missing: $RunScript"
}

$RunScriptFull = (Resolve-Path -LiteralPath $RunScript).Path
$BackendRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$TaskName = "Qwertymates-AgentInstructionEmailPoll"
$Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$RunScriptFull`""

Write-Host "Registering task $TaskName (every 3 hours, 06:00-21:00 local) - poll + auto-execute"
Write-Host "  Action: powershell.exe $Arguments"
Write-Host "  WorkingDirectory: $BackendRoot"

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Arguments -WorkingDirectory $BackendRoot

$Triggers = @()
foreach ($hour in @(6, 9, 12, 15, 18, 21)) {
  $Triggers += New-ScheduledTaskTrigger -Daily -At ("{0:D2}:00" -f $hour)
}

$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Triggers -Settings $Settings -Principal $Principal -Force | Out-Null

Get-ScheduledTask -TaskName $TaskName | Format-List TaskName, State
Get-ScheduledTaskInfo -TaskName $TaskName | Format-List LastRunTime, LastTaskResult, NextRunTime

Write-Host ""
Write-Host "Done. Test now with:" -ForegroundColor Green
Write-Host "  cd backend"
Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/Run-AgentInstructionEmailPoll.ps1"
Write-Host "Logs: backend/exports/agent-instruction-email-task.log"
