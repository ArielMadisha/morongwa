#Requires -Version 5.1
<#
  Lesotho / Zambia / Zimbabwe / Namibia school pipeline (same approach as Botswana OSM import):
  1) OSM amenity=school import (--all-four)
  2) Profile photo backfill per country (limited batch per run — re-run with higher --offset later if needed)
  3) TV image posts from avatar/gallery
  4) Production deploy (same as manual: npm run deploy:production from backend/)

  Run from Task Scheduler or manually. The repo path is derived from this script location.
  Ensure backend/.env has MONGO_URI (and ideally GOOGLE_CUSTOM_SEARCH_* for better photos).

  Photo batches default to --limit=250 per country to stay within typical Custom Search daily caps;
  adjust LIMIT_PER_COUNTRY below or re-run the backfill loop with --offset=250,500,...
#>

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path

$LIMIT_PER_COUNTRY = 250
$SLEEP_MS = 350

Set-Location $BackendRoot
Write-Host "Backend: $BackendRoot"

function Invoke-BackendNpm {
  param([Parameter(Mandatory = $true)][string[]] $NpmArgs)
  & npm @NpmArgs
  if ($LASTEXITCODE -ne 0) {
    throw "npm failed (exit $LASTEXITCODE): npm $($NpmArgs -join ' ')"
  }
}

Write-Host "`n=== [1/4] OSM import LS, ZM, ZW, NA ===" -ForegroundColor Cyan
Invoke-BackendNpm @("run", "import:schools-osm:four")

Write-Host "`n=== [2/4] School photo backfill (per country, limit=$LIMIT_PER_COUNTRY) ===" -ForegroundColor Cyan
foreach ($cc in @("LS", "ZM", "ZW", "NA")) {
  Write-Host "`n-- country-code=$cc --" -ForegroundColor Yellow
  Invoke-BackendNpm @(
    "run", "backfill:school-photos", "--",
    "--country-code=$cc",
    "--limit=$LIMIT_PER_COUNTRY",
    "--sleep-ms=$SLEEP_MS",
    "--allow-fallback-only"
  )
}

Write-Host "`n=== [3/4] TV posts from profile media ===" -ForegroundColor Cyan
Invoke-BackendNpm @("run", "post:school-media-tv", "--", "--country-codes=LS,ZM,ZW,NA", "--max-per-school=4")

Write-Host "`n=== [4/4] deploy:production ===" -ForegroundColor Cyan
Invoke-BackendNpm @("run", "deploy:production")

Write-Host "`nPipeline finished." -ForegroundColor Green
