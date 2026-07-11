$ErrorActionPreference = 'Stop'

$Root = Resolve-Path (Join-Path $PSScriptRoot '..')

Write-Host 'dotWatch Security verify' -ForegroundColor Cyan
Write-Host "Root: $Root" -ForegroundColor DarkGray

$requiredFiles = @(
  'pi\agent\pi_config_web.py',
  'pi\agent\install_config_ui_service.sh',
  'esp32\dotwatch_esp32_product\include\ProductConfig.h',
  'esp32\dotwatch_esp32_product\src\backend\BackendClient.cpp',
  'esp32\dotwatch_esp32_product\platformio.ini',
  'services\backend\Dockerfile',
  'services\backend\Dockerfile.dev',
  'services\backend\.env.production.example',
  'docker-compose.prod.example.yml'
)

foreach ($file in $requiredFiles) {
  $path = Join-Path $Root $file
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing required security file: $file"
  }
}

Write-Host 'Required files: OK' -ForegroundColor Green

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command python3 -ErrorAction SilentlyContinue }
if ($python) {
  Write-Host 'Checking Pi Config UI Python syntax...' -ForegroundColor Cyan
  & $python.Source -m py_compile (Join-Path $Root 'pi\agent\pi_config_web.py')
  if ($LASTEXITCODE -ne 0) { throw 'Python syntax check failed for pi_config_web.py' }
  Write-Host 'Python syntax: OK' -ForegroundColor Green
} else {
  Write-Host 'Python not found locally; skipped Pi Config UI syntax check.' -ForegroundColor Yellow
}

$piConfig = Get-Content -LiteralPath (Join-Path $Root 'pi\agent\pi_config_web.py') -Raw
if ($piConfig -notmatch 'DOTWATCH_CONFIG_HOST", "127\.0\.0\.1"') {
  throw 'Pi Config UI must default DOTWATCH_CONFIG_HOST to 127.0.0.1'
}
if ($piConfig -notmatch 'compare_digest') {
  throw 'Pi Config UI must use constant-time Basic Auth comparison'
}

$installer = Get-Content -LiteralPath (Join-Path $Root 'pi\agent\install_config_ui_service.sh') -Raw
if ($installer -notmatch 'CONFIG_HOST="\$\{DOTWATCH_CONFIG_HOST:-127\.0\.0\.1\}"') {
  throw 'Config UI installer must bind to 127.0.0.1 by default'
}
if ($installer -notmatch 'generate_password') {
  throw 'Config UI installer must generate a strong password when needed'
}

$productConfig = Get-Content -LiteralPath (Join-Path $Root 'esp32\dotwatch_esp32_product\include\ProductConfig.h') -Raw
$backendClient = Get-Content -LiteralPath (Join-Path $Root 'esp32\dotwatch_esp32_product\src\backend\BackendClient.cpp') -Raw
$platformio = Get-Content -LiteralPath (Join-Path $Root 'esp32\dotwatch_esp32_product\platformio.ini') -Raw

if ($productConfig -notmatch 'SETUP_AP_PASSWORD\s*=\s*"dotwatch-setup"') {
  throw 'ESP32 setup AP must not be open by default'
}
if ($productConfig -notmatch '#define\s+DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK\s+0') {
  throw 'ESP32 firmware must disable insecure TLS fallback by default'
}
if ($platformio -notmatch 'DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK=0') {
  throw 'ESP32 PlatformIO build flags must disable insecure TLS fallback'
}
if ($backendClient -notmatch 'setCACert') {
  throw 'ESP32 HTTPS client must install a Root CA'
}

$backendDocker = Get-Content -LiteralPath (Join-Path $Root 'services\backend\Dockerfile') -Raw
if ($backendDocker -match 'npm run dev') {
  throw 'Production backend Dockerfile must not run npm run dev'
}
if ($backendDocker -notmatch 'npm ci --omit=dev') {
  throw 'Production backend Dockerfile should install production dependencies with npm ci --omit=dev'
}

$prodEnv = Get-Content -LiteralPath (Join-Path $Root 'services\backend\.env.production.example') -Raw
if ($prodEnv -match 'localhost|127\.0\.0\.1|0\.0\.0\.0') {
  throw '.env.production.example must not include local origins/hosts'
}
if ($prodEnv -match 'DEV_AUTH_BYPASS=true') {
  throw '.env.production.example must not enable DEV_AUTH_BYPASS'
}

Write-Host 'Running backend syntax checks...' -ForegroundColor Cyan
Push-Location (Join-Path $Root 'services\backend')
try {
  node --check src/server.js
  node --check src/config/env.js
} finally {
  Pop-Location
}

Write-Host 'Running sensitive file scan...' -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'scripts\scan-sensitive-files.ps1')

Write-Host 'Security verification completed.' -ForegroundColor Green
