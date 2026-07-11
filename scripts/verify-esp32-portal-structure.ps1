param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch",
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

function Write-Section([string]$Title) {
  Write-Host ""
  Write-Host "============================================================" -ForegroundColor DarkGray
  Write-Host $Title -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkGray
}

Write-Section "dotWatch ESP32 Portal Structure Verify"

$ProjectDir = Join-Path $RepoRoot 'esp32\dotwatch_esp32_product'
$PortalDir = Join-Path $ProjectDir 'src\portal'
$ViewDir = Join-Path $PortalDir 'views'
$PreviewDir = Join-Path $ProjectDir 'portal-preview'

Write-Host "RepoRoot  : $RepoRoot"
Write-Host "ProjectDir: $ProjectDir"
Write-Host "SkipBuild : $SkipBuild"

$requiredFiles = @(
  (Join-Path $PortalDir 'PortalServer.h'),
  (Join-Path $PortalDir 'PortalServer.cpp'),
  (Join-Path $PortalDir 'PortalAssets.h'),
  (Join-Path $ViewDir 'PortalView.h'),
  (Join-Path $ViewDir 'PortalView.cpp'),
  (Join-Path $ViewDir 'OverviewPage.cpp'),
  (Join-Path $ViewDir 'WifiPage.cpp'),
  (Join-Path $ViewDir 'DevicePage.cpp'),
  (Join-Path $ViewDir 'SensorPage.cpp'),
  (Join-Path $ViewDir 'SecurityPage.cpp'),
  (Join-Path $ViewDir 'SystemPage.cpp'),
  (Join-Path $PreviewDir 'index.html'),
  (Join-Path $PreviewDir 'src\portal.css'),
  (Join-Path $PreviewDir 'src\firmware.js'),
  (Join-Path $PreviewDir 'sync-portal-assets.mjs')
)

$missing = @($requiredFiles | Where-Object { -not (Test-Path -LiteralPath $_) })
if ($missing.Count -gt 0) {
  Write-Host 'Required files: FAILED' -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
  exit 1
}
Write-Host 'Required files: OK' -ForegroundColor Green

$serverPath = Join-Path $PortalDir 'PortalServer.cpp'
$serverText = Get-Content -LiteralPath $serverPath -Raw
$forbiddenMarkers = @(
  'overview-hero',
  'wifi-layout',
  'sensor-live-grid',
  'security-grid',
  'system-grid',
  'portal-sidebar'
)

$foundMarkers = @($forbiddenMarkers | Where-Object { $serverText.Contains($_) })
if ($foundMarkers.Count -gt 0) {
  Write-Host 'Controller/view separation: FAILED' -ForegroundColor Red
  $foundMarkers | ForEach-Object { Write-Host "- UI marker still found in PortalServer.cpp: $_" -ForegroundColor Red }
  exit 1
}
Write-Host 'Controller/view separation: OK' -ForegroundColor Green

$pageChecks = @{
  'OverviewPage.cpp' = 'overview-hero'
  'WifiPage.cpp' = 'wifi-layout'
  'DevicePage.cpp' = 'Device Settings'
  'SensorPage.cpp' = 'sensor-live-grid'
  'SecurityPage.cpp' = 'security-grid'
  'SystemPage.cpp' = 'system-grid'
}

foreach ($entry in $pageChecks.GetEnumerator()) {
  $path = Join-Path $ViewDir $entry.Key
  $content = Get-Content -LiteralPath $path -Raw
  if (-not $content.Contains($entry.Value)) {
    Write-Host "Page marker: FAILED - $($entry.Key)" -ForegroundColor Red
    exit 1
  }
}
Write-Host 'Page markers: OK' -ForegroundColor Green

$assetsText = Get-Content -LiteralPath (Join-Path $PortalDir 'PortalAssets.h') -Raw
if (-not $assetsText.Contains('Generated from portal-preview/src/portal.css') -or
    -not $assetsText.Contains('DOTWATCH_PORTAL_CSS') -or
    -not $assetsText.Contains('DOTWATCH_PORTAL_JS')) {
  Write-Host 'Generated PortalAssets.h: FAILED' -ForegroundColor Red
  exit 1
}
Write-Host 'Generated PortalAssets.h: OK' -ForegroundColor Green

Write-Section 'JavaScript checks'
Push-Location $PreviewDir
try {
  node --check .\dev-server.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node --check .\sync-portal-assets.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node --check .\src\preview.js
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node --check .\src\firmware.js
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}
Write-Host 'JavaScript syntax: OK' -ForegroundColor Green

if (-not $SkipBuild) {
  Write-Section 'PlatformIO build'
  Push-Location $ProjectDir
  try {
    python -m platformio run
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } finally {
    Pop-Location
  }
  Write-Host 'PlatformIO build: OK' -ForegroundColor Green
}

Write-Section 'Result'
Write-Host 'ESP32 portal structure verify: PASSED' -ForegroundColor Green
