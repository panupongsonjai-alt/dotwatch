param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$repoRootPath = (Resolve-Path -LiteralPath $RepoRoot).Path
$packageFile = Join-Path $repoRootPath 'package.json'

if (-not (Test-Path -LiteralPath $packageFile -PathType Leaf)) {
  throw "The target does not look like the dotWatch repository: $repoRootPath"
}

$obsoletePaths = @(
  'DELETE_FILES.txt',
  'README-CLEAR-ALARM-ROUTE-COMPAT.txt',
  'README-INSTALL-ESP32-PORTAL-VIEW-STRUCTURE.txt',
  'README.txt',
  'README_INSTALL.txt',
  'README_PATCH.txt',
  'apply-audit-cleanup.ps1',
  'apply-patch.ps1',
  'dotwatch-system-consistency-css-cleanup-report-20260713.txt',
  'dotwatch-clear-alarm-functional-fix-patch',
  'patch_alarm_filter_button_fix',
  'payload',
  'apps/dashboard/.prettierrc',
  'apps/dashboard/src/styles/alarm-notification-filter-final-fix.css',
  'apps/dashboard/src/styles/common-clear-filtered-dialog.css',
  'esp32/dotwatch_esp32_product/portal-preview/sync-portal-assets.mjs',
  'esp32/dotwatch_esp32_product/portal-preview/src/firmware.js',
  'esp32/dotwatch_esp32_product/portal-preview/src/mock-device.js',
  'esp32/dotwatch_esp32_product/portal-preview/src/portal.css',
  'esp32/dotwatch_esp32_product/portal-preview/src/preview.css',
  'esp32/dotwatch_esp32_product/portal-preview/src/preview.js',
  'scripts/verify-esp32-portal-structure.ps1',
  'docs/ESP32_PORTAL_VIEW_STRUCTURE.md'
)

$removed = 0

foreach ($relativePath in $obsoletePaths) {
  $targetPath = Join-Path $repoRootPath $relativePath
  if (Test-Path -LiteralPath $targetPath) {
    Remove-Item -LiteralPath $targetPath -Recurse -Force
    Write-Host "Removed: $relativePath" -ForegroundColor DarkGray
    $removed++
  }
}

Write-Host "Obsolete delivery cleanup completed. Removed paths: $removed" -ForegroundColor Green
