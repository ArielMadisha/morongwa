# Poll agent@ IMAP inbox for Cursor instruction emails, then auto-execute the queue.
param(
  [switch]$DryRun,
  [switch]$List,
  [switch]$SkipExecute
)

$ErrorActionPreference = "Stop"
$backend = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $backend

$pollArgs = @("scripts/pollAgentInstructionEmail.mjs", "--since-hours=4")
if ($DryRun) { $pollArgs += "--dry-run" }
if ($List) {
  $pollArgs = @("scripts/pollAgentInstructionEmail.mjs", "--list")
}

& node @pollArgs
$pollExit = $LASTEXITCODE
if ($List) { exit $pollExit }

if (-not $SkipExecute) {
  $execArgs = @("scripts/executeAgentInstructionQueue.mjs")
  if ($DryRun) { $execArgs += "--dry-run" }
  & node @execArgs
  $execExit = $LASTEXITCODE
  if ($pollExit -ne 0) { exit $pollExit }
  exit $execExit
}

exit $pollExit
