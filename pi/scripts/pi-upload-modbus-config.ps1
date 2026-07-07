param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi",
  [string]$RemoteDir = "/home/pi/dotwatch-pi-agent"
)

$ErrorActionPreference = "Stop"

$KeyPath = Join-Path $env:USERPROFILE ".ssh\dotwatch_pi"
$Workspace = Resolve-Path (Join-Path $PSScriptRoot "..")
$ConfigFile = Join-Path $Workspace "dotwatch-pi-agent\modbus_config.json"

if (-not (Test-Path $KeyPath)) {
  Write-Host "ERROR: SSH key not found: $KeyPath" -ForegroundColor Red
  Write-Host "Run passwordless setup first."
  exit 1
}

if (-not (Test-Path $ConfigFile)) {
  Write-Host "ERROR: modbus_config.json not found: $ConfigFile" -ForegroundColor Red
  exit 1
}

Write-Host "Uploading modbus_config.json..." -ForegroundColor Cyan
Write-Host "Source: $ConfigFile"
Write-Host "Target: ${PiUser}@${PiHost}:${RemoteDir}/modbus_config.json"

scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes $ConfigFile "${PiUser}@${PiHost}:${RemoteDir}/modbus_config.json"

Write-Host ""
Write-Host "Done. Open http://${PiHost}:8080/modbus and click Test Modbus Read." -ForegroundColor Green
