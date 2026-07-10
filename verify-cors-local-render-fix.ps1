[CmdletBinding()]
param(
  [string]$RepoRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

$envFile = Join-Path $RepoRoot 'services\backend\src\config\env.js'
$checkFile = Join-Path $RepoRoot 'scripts\check-production-env.mjs'

Write-Host ''
Write-Host 'dotWatch - Verify local CORS on Render fix' -ForegroundColor Cyan
Write-Host "RepoRoot: $RepoRoot"
Write-Host ''

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  throw "Missing file: $envFile"
}

if (-not (Test-Path -LiteralPath $checkFile -PathType Leaf)) {
  throw "Missing file: $checkFile"
}

$content = Get-Content -LiteralPath $envFile -Raw

$requiredPatterns = @(
  'ALLOW_LOCAL_CORS_IN_PRODUCTION',
  'allowLocalCorsInProduction',
  'allowLocalOrigins: env.allowLocalCorsInProduction'
)

foreach ($pattern in $requiredPatterns) {
  if ($content -notmatch [regex]::Escape($pattern)) {
    throw "Fix marker not found in env.js: $pattern"
  }
}

$oldMessage = 'CORS_ORIGIN must not include local address in production: ${origin}'
if ($content.Contains($oldMessage)) {
  throw 'Old CORS validation is still present in env.js. The file was not overwritten correctly.'
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw 'Node.js was not found in PATH.'
}

& node --check $envFile
if ($LASTEXITCODE -ne 0) {
  throw 'node --check failed for env.js'
}

& node --check $checkFile
if ($LASTEXITCODE -ne 0) {
  throw 'node --check failed for check-production-env.mjs'
}

Write-Host 'CORS fix markers: OK' -ForegroundColor Green
Write-Host 'JavaScript syntax: OK' -ForegroundColor Green
Write-Host ''
Write-Host 'Expected Render variables:' -ForegroundColor Yellow
Write-Host 'ALLOW_LOCAL_CORS_IN_PRODUCTION=true'
Write-Host 'CORS_ORIGIN=https://<dashboard-domain>,https://<admin-domain>,http://localhost:5173,http://127.0.0.1:5173'
Write-Host 'DEV_AUTH_BYPASS=false'
Write-Host ''
Write-Host 'Git status:' -ForegroundColor Cyan
& git -C $RepoRoot status --short -- services/backend/src/config/env.js services/backend/.env.production.example scripts/check-production-env.mjs verify-cors-local-render-fix.ps1
