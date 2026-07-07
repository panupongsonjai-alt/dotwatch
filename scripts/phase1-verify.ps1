param(
  [string]$BackendUrl = '',
  [switch]$RunBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Set-Location $root

Write-Host 'dotWatch Phase 1 verification' -ForegroundColor Yellow

Write-Host 'Checking backend JavaScript syntax...' -ForegroundColor Cyan
node --check services/backend/src/config/env.js
node --check services/backend/src/config/firebaseAdmin.js
node --check services/backend/src/middlewares/errorHandler.js
node --check services/backend/src/middlewares/requestContext.js
node --check services/backend/src/services/deviceStatus.service.js
node --check services/backend/src/utils/health.js
node --check services/backend/src/server.js
node --check scripts/check-production-env.mjs

Write-Host 'Running sensitive file scan...' -ForegroundColor Cyan
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/scan-sensitive-files.ps1

if ($RunBuild) {
  Write-Host 'Running full build checks...' -ForegroundColor Cyan
  npm run check:all
}

if ($BackendUrl) {
  Write-Host "Running backend smoke test against $BackendUrl" -ForegroundColor Cyan
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backend-smoke-test.ps1 -BaseUrl $BackendUrl
}
else {
  Write-Host 'Backend smoke test skipped because -BackendUrl was not provided.' -ForegroundColor DarkGray
  Write-Host 'Example: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/phase1-verify.ps1 -BackendUrl http://localhost:4000' -ForegroundColor DarkGray
}

Write-Host 'Phase 1 verification completed.' -ForegroundColor Green
