param(
  [string] $ProjectDir = "esp32\dotwatch_esp32_product",
  [switch] $Build,
  [switch] $Upload,
  [switch] $Monitor
)

$ErrorActionPreference = "Stop"

function Write-Step([string] $Message) {
  Write-Host ""
  Write-Host "============================================================" -ForegroundColor DarkGray
  Write-Host $Message -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkGray
}

$Root = Split-Path -Parent $PSScriptRoot
$FullProjectDir = Join-Path $Root $ProjectDir
$MainFile = Join-Path $FullProjectDir "src\main.cpp"
$PlatformioFile = Join-Path $FullProjectDir "platformio.ini"
$ProductConfigFile = Join-Path $FullProjectDir "include\ProductConfig.h"
$BackendClientFile = Join-Path $FullProjectDir "src\backend\BackendClient.cpp"

Write-Step "dotWatch ESP32 Product Core field check"
Write-Host "ProjectDir : $FullProjectDir"
Write-Host "Build      : $Build"
Write-Host "Upload     : $Upload"
Write-Host "Monitor    : $Monitor"

foreach ($required in @($FullProjectDir, $MainFile, $PlatformioFile, $ProductConfigFile, $BackendClientFile)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required ESP32 path not found: $required"
  }
}

Write-Step "1. Static firmware safety checks"
$ProductConfig = Get-Content -LiteralPath $ProductConfigFile -Raw
$BackendClient = Get-Content -LiteralPath $BackendClientFile -Raw
$Platformio = Get-Content -LiteralPath $PlatformioFile -Raw

if ($ProductConfig -notmatch 'SETUP_AP_PASSWORD\s*=\s*"dotwatch-setup"') {
  throw "Setup AP password is not hardened in include/ProductConfig.h"
}
if ($ProductConfig -notmatch '#define\s+DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK\s+0') {
  throw "Insecure TLS fallback is not disabled by default"
}
if ($Platformio -notmatch 'DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK=0') {
  throw "PlatformIO build flag does not disable insecure TLS fallback"
}
if ($BackendClient -notmatch 'setCACert') {
  throw "Root CA setCACert() support not found"
}
if ($BackendClient -notmatch 'metric_1') {
  throw "metric_1 telemetry mapping not found"
}
if ($ProductConfig -match 'SETUP_AP_PASSWORD\s*=\s*""') {
  throw "Setup AP password is blank"
}
Write-Host "ESP32 static safety checks passed." -ForegroundColor Green

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  $python = Get-Command py -ErrorAction SilentlyContinue
}

if (-not $python) {
  Write-Host "Python launcher not found. Static checks passed; PlatformIO actions were skipped." -ForegroundColor Yellow
  return
}

Push-Location $FullProjectDir
try {
  if ($Build -or $Upload -or $Monitor) {
    Write-Step "2. PlatformIO version"
    & $python.Source -m platformio --version
    if ($LASTEXITCODE -ne 0) { throw "PlatformIO is not available through Python" }
  }

  if ($Build) {
    Write-Step "3. Build firmware"
    & $python.Source -m platformio run
    if ($LASTEXITCODE -ne 0) { throw "PlatformIO build failed" }
  }

  if ($Upload) {
    Write-Step "4. Upload firmware"
    & $python.Source -m platformio run --target upload
    if ($LASTEXITCODE -ne 0) { throw "PlatformIO upload failed" }
  }

  if ($Monitor) {
    Write-Step "5. Serial monitor"
    & $python.Source -m platformio device monitor --baud 115200
  }
} finally {
  Pop-Location
}
