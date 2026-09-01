# Interactive first iOS App Store build + submit for Qwertymates (com.qwertymates.app).
# Run in a normal PowerShell window (needs Apple login prompts — not --non-interactive).
# ASC App ID: 6798004708 (already in eas.json submit.production.ios)

$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))

Write-Host ""
Write-Host "=== Qwertymates iOS production build + submit ===" -ForegroundColor Cyan
Write-Host "Bundle: com.qwertymates.app"
Write-Host "ASC App ID: 6798004708"
Write-Host ""
Write-Host "If credentials are missing, EAS will prompt you to:"
Write-Host "  1) Log in to Apple Developer"
Write-Host "  2) Select your team (ARIEL CAPITAL INVESTMENT...)"
Write-Host "  3) Create/validate Distribution Certificate + App Store profile"
Write-Host ""

$env:EAS_NO_VCS = "1"
$env:EAS_BUILD_NO_EXPO_GO_WARNING = "true"

Write-Host "Starting interactive production iOS build..." -ForegroundColor Yellow
npx eas-cli build --platform ios --profile production
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed (exit $LASTEXITCODE). Fix credentials and re-run this script." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Submitting latest iOS build to App Store Connect..." -ForegroundColor Yellow
npx eas-cli submit --platform ios --profile production --latest
if ($LASTEXITCODE -ne 0) {
  Write-Host "Submit failed. You can retry with: npm run submit:ios:production" -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Done. Complete listing (screenshots, privacy, age rating) in App Store Connect," -ForegroundColor Green
Write-Host "then submit 1.0 for review. ASC: https://appstoreconnect.apple.com/apps/6798004708" -ForegroundColor Green
