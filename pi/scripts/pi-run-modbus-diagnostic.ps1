param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi",
  [string]$RemoteDir = "/home/pi/dotwatch-pi-agent"
)

$ErrorActionPreference = "Stop"

$KeyPath = Join-Path $env:USERPROFILE ".ssh\dotwatch_pi"
$Workspace = Resolve-Path (Join-Path $PSScriptRoot "..")
$DiagFile = Join-Path $Workspace "dotwatch-pi-agent\modbus_connection_diag.py"

if (-not (Test-Path $KeyPath)) {
  Write-Host "ERROR: SSH key not found: $KeyPath" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $DiagFile)) {
  Write-Host "ERROR: Diagnostic file not found: $DiagFile" -ForegroundColor Red
  exit 1
}

Write-Host "Uploading Modbus diagnostic tool..." -ForegroundColor Cyan
scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes $DiagFile "${PiUser}@${PiHost}:${RemoteDir}/modbus_connection_diag.py"

Write-Host ""
Write-Host "Running diagnostic on Raspberry Pi..." -ForegroundColor Cyan
ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "cd ${RemoteDir} && if [ -x ./venv/bin/python ]; then ./venv/bin/python modbus_connection_diag.py; else python3 modbus_connection_diag.py; fi"
