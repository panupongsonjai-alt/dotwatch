$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$AgentDir = Join-Path $Root "pi\agent"

Write-Host "dotWatch Phase 2 verify" -ForegroundColor Cyan
Write-Host "Root: $Root" -ForegroundColor DarkGray

$requiredFiles = @(
  "pi\agent\main.py",
  "pi\agent\config.py",
  "pi\agent\agent_self_check.py",
  "pi\agent\runtime\offline_queue.py",
  "pi\agent\services\dotwatch_api.py",
  "pi\agent\sensors\modbus_sensor.py",
  "pi\agent\install_agent_service.sh",
  "pi\agent\install_config_ui_service.sh",
  "pi\agent\dotwatch-pi-health.sh",
  "pi\scripts\pi-phase2-install-gateway.ps1",
  "pi\scripts\pi-phase2-check-gateway.ps1"
)

foreach ($file in $requiredFiles) {
  $path = Join-Path $Root $file
  if (-not (Test-Path $path)) {
    throw "Missing required Phase 2 file: $file"
  }
}

Write-Host "Required files: OK" -ForegroundColor Green

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  $python = Get-Command python3 -ErrorAction SilentlyContinue
}

if ($python) {
  Write-Host "Checking Python syntax..." -ForegroundColor Cyan
  & $python.Source -m compileall -q $AgentDir
  if ($LASTEXITCODE -ne 0) {
    throw "Python syntax check failed"
  }
  Write-Host "Python syntax: OK" -ForegroundColor Green
} else {
  Write-Host "Python not found locally; skipped Python syntax check." -ForegroundColor Yellow
}

Write-Host "Running sensitive file scan..." -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\scan-sensitive-files.ps1")

Write-Host "Phase 2 verification completed." -ForegroundColor Green
