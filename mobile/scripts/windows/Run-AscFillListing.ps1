# One-shot: fill ASC listing + screenshots for Qwertymates, then open review pages.
# Requires a Team App Store Connect API key (.p8) — EAS already has one on the server,
# but we need a local .p8 + Issuer ID for metadata automation.
#
# 1) Open ASC → Users and Access → Integrations → App Store Connect API
# 2) Copy Issuer ID
# 3) Create a new Team key (Admin or App Manager), DOWNLOAD the .p8 once
# 4) Save as mobile/credentials/AuthKey_ASC.p8
# 5) Run this script:
#    powershell -File mobile/scripts/windows/Run-AscFillListing.ps1 -IssuerId "<uuid>" -KeyId "<KEYID>"

param(
  [Parameter(Mandatory = $true)][string]$IssuerId,
  [Parameter(Mandatory = $true)][string]$KeyId,
  [string]$KeyPath = "",
  [switch]$SubmitReview
)

$ErrorActionPreference = "Stop"
$mobile = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $mobile

if (-not $KeyPath) {
  $KeyPath = Join-Path $mobile "credentials\AuthKey_ASC.p8"
}
if (-not (Test-Path $KeyPath)) {
  Write-Host "Missing private key: $KeyPath" -ForegroundColor Red
  Write-Host "Create a Team API key in ASC and save the .p8 there." -ForegroundColor Yellow
  Start-Process "https://appstoreconnect.apple.com/access/integrations/api"
  exit 1
}

$env:ASC_ISSUER_ID = $IssuerId
$env:ASC_KEY_ID = $KeyId
$env:ASC_PRIVATE_KEY_PATH = $KeyPath

$args = @()
if ($SubmitReview) { $args += "--submit-review" }

Write-Host "Filling App Store Connect listing for 6798004708…" -ForegroundColor Cyan
node .\scripts\ascFillListing.mjs @args
$code = $LASTEXITCODE

Write-Host ""
Write-Host "Opening ASC pages for age rating + privacy (complete any remaining questionnaires)…" -ForegroundColor Yellow
Start-Process "https://appstoreconnect.apple.com/apps/6798004708/appstore/ios/version/inflight"
Start-Process "https://appstoreconnect.apple.com/apps/6798004708/appPrivacy"
Start-Process "https://appstoreconnect.apple.com/apps/6798004708/appstore/ios/version/inflight/age-rating"

exit $code
