param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi",
  [string]$RemoteDir = "/home/pi/dotwatch-pi-agent"
)

$ErrorActionPreference = "Stop"

$KeyPath = Join-Path $env:USERPROFILE ".ssh\dotwatch_pi"
$Workspace = Resolve-Path (Join-Path $PSScriptRoot "..")
$AgentDir = Join-Path $Workspace "dotwatch-pi-agent"

if (-not (Test-Path $KeyPath)) {
  Write-Host "ERROR: SSH key not found: $KeyPath" -ForegroundColor Red
  Write-Host "Run passwordless setup first."
  exit 1
}

Write-Host "Uploading missing Modbus agent files..." -ForegroundColor Cyan

ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "mkdir -p ${RemoteDir}/sensors"

scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes (Join-Path $AgentDir "modbus_test.py") "${PiUser}@${PiHost}:${RemoteDir}/modbus_test.py"
scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes (Join-Path $AgentDir "requirements.txt") "${PiUser}@${PiHost}:${RemoteDir}/requirements.txt"
scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes (Join-Path $AgentDir "modbus_config.example.json") "${PiUser}@${PiHost}:${RemoteDir}/modbus_config.example.json"
scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes (Join-Path $AgentDir "sensors\__init__.py") "${PiUser}@${PiHost}:${RemoteDir}/sensors/__init__.py"
scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes (Join-Path $AgentDir "sensors\modbus_sensor.py") "${PiUser}@${PiHost}:${RemoteDir}/sensors/modbus_sensor.py"

Write-Host ""
Write-Host "Creating modbus_config.json if missing and installing dependencies..." -ForegroundColor Cyan

ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "cd ${RemoteDir} && if [ ! -f modbus_config.json ]; then cp modbus_config.example.json modbus_config.json; fi && if [ ! -d venv ]; then python3 -m venv venv; fi && ./venv/bin/python -m pip install --upgrade pip && ./venv/bin/python -m pip install -r requirements.txt"

Write-Host ""
Write-Host "Testing modbus_test.py exists..." -ForegroundColor Cyan
ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "ls -la ${RemoteDir}/modbus_test.py ${RemoteDir}/sensors/modbus_sensor.py && echo OK"

Write-Host ""
Write-Host "Done. Open http://${PiHost}:8080/modbus and click Test Modbus Read again." -ForegroundColor Green
