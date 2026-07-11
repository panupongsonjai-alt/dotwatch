$ErrorActionPreference = "Stop"

function Write-Step([string] $Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Step "Checking Phase 4 device field readiness files"
$RequiredFiles = @(
  "pi/agent/agent_field_test.py",
  "pi/agent/agent_self_check.py",
  "pi/agent/config.py",
  "scripts/pi-field-commissioning.ps1",
  "scripts/esp32-field-check.ps1",
  "docs/PHASE4_DEVICE_FIELD_READINESS.md",
  "docs/PI_FIELD_COMMISSIONING_CHECKLIST.md",
  "docs/ESP32_FIELD_COMMISSIONING_CHECKLIST.md"
)

foreach ($File in $RequiredFiles) {
  if (-not (Test-Path $File)) {
    throw "Missing required Phase 4 device file: $File"
  }
  Write-Host "OK $File" -ForegroundColor Green
}

Write-Step "Checking Pi agent safety/config changes"
$Config = Get-Content "pi/agent/config.py" -Raw
$SelfCheck = Get-Content "pi/agent/agent_self_check.py" -Raw
$FieldTest = Get-Content "pi/agent/agent_field_test.py" -Raw

if ($Config -notmatch "ALLOW_HTTP_API") { throw "ALLOW_HTTP_API guard is missing from pi/agent/config.py" }
if ($Config -notmatch "safe_summary") { throw "safe_summary() is missing from pi/agent/config.py" }
if ($Config -notmatch "DEVICE_SECRET is missing, too short") { throw "DEVICE_SECRET placeholder validation is missing" }
if ($SelfCheck -notmatch "Settings validation") { throw "agent_self_check.py does not validate settings" }
if ($FieldTest -notmatch "queue-test") { throw "agent_field_test.py queue-test support is missing" }
if ($FieldTest -match "device_secret.*print") { throw "agent_field_test.py may print raw device_secret" }

Write-Step "Checking ESP32 Product Core safety source"
$ProductConfig = Get-Content "esp32/dotwatch_esp32_product/include/ProductConfig.h" -Raw
$BackendClient = Get-Content "esp32/dotwatch_esp32_product/src/backend/BackendClient.cpp" -Raw
$Platformio = Get-Content "esp32/dotwatch_esp32_product/platformio.ini" -Raw
if ($ProductConfig -notmatch 'SETUP_AP_PASSWORD\s*=\s*"dotwatch-setup"') { throw "ESP32 setup AP password is not set" }
if ($ProductConfig -notmatch '#define\s+DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK\s+0') { throw "ESP32 insecure TLS fallback is not disabled by default" }
if ($Platformio -notmatch 'DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK=0') { throw "ESP32 build flags do not disable insecure TLS fallback" }
if ($BackendClient -notmatch 'setCACert') { throw "ESP32 Root CA support is missing" }
if ($ProductConfig -match 'SETUP_AP_PASSWORD\s*=\s*""') { throw "ESP32 setup AP password is blank" }

Write-Step "Checking package scripts"
$Package = Get-Content "package.json" -Raw | ConvertFrom-Json
if (-not $Package.scripts.'verify:phase4:device') { throw "package.json script verify:phase4:device is missing" }
if (-not $Package.scripts.'check:esp32:field') { throw "package.json script check:esp32:field is missing" }

Write-Step "Optional Python compile check"
$Python = Get-Command python -ErrorAction SilentlyContinue
if (-not $Python) { $Python = Get-Command python3 -ErrorAction SilentlyContinue }
if ($Python) {
  & $Python.Source -m py_compile `
    pi/agent/config.py `
    pi/agent/agent_self_check.py `
    pi/agent/agent_field_test.py `
    pi/agent/main.py `
    pi/agent/services/dotwatch_api.py `
    pi/agent/runtime/offline_queue.py `
    pi/agent/sensors/modbus_sensor.py
  Write-Host "Python compile check passed." -ForegroundColor Green
} else {
  Write-Host "Python not found; skipped py_compile check." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Phase 4 device field readiness verification passed." -ForegroundColor Green
