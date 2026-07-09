param(
  [string] $ProjectDir = "esp32\dotwatch_esp32_dht3_tls_hardened",
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

Write-Step "dotWatch ESP32 field check"
Write-Host "ProjectDir : $FullProjectDir"
Write-Host "Build      : $Build"
Write-Host "Upload     : $Upload"
Write-Host "Monitor    : $Monitor"

if (-not (Test-Path $FullProjectDir)) { throw "ESP32 project dir not found: $FullProjectDir" }
if (-not (Test-Path $MainFile)) { throw "ESP32 main file not found: $MainFile" }
if (-not (Test-Path $PlatformioFile)) { throw "platformio.ini not found: $PlatformioFile" }

Write-Step "1. Static firmware safety checks"
$Main = Get-Content $MainFile -Raw
if ($Main -notmatch 'SETUP_AP_PASSWORD\s*=\s*"dotwatch-setup"') {
  throw "Setup AP password is not hardened in src/main.cpp"
}
if ($Main -notmatch 'DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK 0') {
  throw "Insecure TLS fallback is not disabled by default"
}
if ($Main -notmatch 'setCACert') {
  throw "Root CA setCACert() support not found"
}
if ($Main -match 'SETUP_AP_PASSWORD\s*=\s*""') {
  throw "Setup AP password is blank"
}
Write-Host "ESP32 static safety checks passed." -ForegroundColor Green

$p = Get-Command pio -ErrorAction SilentlyContinue
if (-not $p) {
  Write-Host "PlatformIO command 'pio' not found. Static checks passed, but build/upload cannot run here." -ForegroundColor Yellow
  Write-Host "Install PlatformIO or use VS Code PlatformIO, then run: pio run" -ForegroundColor Yellow
  return
}

Push-Location $FullProjectDir
try {
  if ($Build -or $Upload -or $Monitor) {
    Write-Step "2. PlatformIO version"
    pio --version
  }

  if ($Build) {
    Write-Step "3. Build firmware"
    pio run
  }

  if ($Upload) {
    Write-Step "4. Upload firmware"
    pio run -t upload
  }

  if ($Monitor) {
    Write-Step "5. Serial monitor"
    pio device monitor
  }
} finally {
  Pop-Location
}
