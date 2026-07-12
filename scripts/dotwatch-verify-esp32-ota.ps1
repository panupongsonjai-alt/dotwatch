param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch",
  [switch]$BuildFirmware
)

$ErrorActionPreference = "Stop"
$ProductDir = Join-Path $RepoRoot "esp32\dotwatch_esp32_product"
$PreviewDir = Join-Path $ProductDir "portal-preview"
$OtaServerDir = Join-Path $RepoRoot "services\ota-server"

$required = @(
  (Join-Path $ProductDir "partitions_ota.csv"),
  (Join-Path $ProductDir "src\ota\OtaManager.h"),
  (Join-Path $ProductDir "src\ota\OtaManager.cpp"),
  (Join-Path $ProductDir "src\portal\views\FirmwarePage.cpp"),
  (Join-Path $OtaServerDir "server.mjs"),
  (Join-Path $OtaServerDir "scripts\publish-release.mjs")
)

Write-Host "dotWatch ESP32 OTA verification" -ForegroundColor Cyan
foreach ($file in $required) {
  if (-not (Test-Path $file)) { throw "Missing required file: $file" }
}
Write-Host "Required files: OK" -ForegroundColor Green

Push-Location $PreviewDir
try {
  npm run check
  if ($LASTEXITCODE -ne 0) { throw "ESP32 portal check failed" }
}
finally { Pop-Location }

Push-Location $OtaServerDir
try {
  npm run check
  if ($LASTEXITCODE -ne 0) { throw "OTA server check failed" }
}
finally { Pop-Location }

if ($BuildFirmware.IsPresent) {
  Push-Location $ProductDir
  try {
    py -m platformio run
    if ($LASTEXITCODE -ne 0) { throw "PlatformIO build failed" }
  }
  finally { Pop-Location }
}

Write-Host "ESP32 OTA verification: PASSED" -ForegroundColor Green
