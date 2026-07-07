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
  Write-Host "Run your passwordless setup task first."
  exit 1
}

if (-not (Test-Path (Join-Path $AgentDir "main.py"))) {
  Write-Host "ERROR: dotwatch-pi-agent files not found: $AgentDir" -ForegroundColor Red
  exit 1
}

ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "mkdir -p ${RemoteDir}/services ${RemoteDir}/sensors"

scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes (Join-Path $AgentDir "main.py") "${PiUser}@${PiHost}:${RemoteDir}/main.py"
scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes (Join-Path $AgentDir "config.py") "${PiUser}@${PiHost}:${RemoteDir}/config.py"
scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes (Join-Path $AgentDir "modbus_test.py") "${PiUser}@${PiHost}:${RemoteDir}/modbus_test.py"
scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes (Join-Path $AgentDir "requirements.txt") "${PiUser}@${PiHost}:${RemoteDir}/requirements.txt"
scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes (Join-Path $AgentDir "modbus_config.example.json") "${PiUser}@${PiHost}:${RemoteDir}/modbus_config.example.json"
scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes -r (Join-Path $AgentDir "services") "${PiUser}@${PiHost}:${RemoteDir}/"
scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes -r (Join-Path $AgentDir "sensors") "${PiUser}@${PiHost}:${RemoteDir}/"

ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "cd ${RemoteDir} && if [ ! -f modbus_config.json ]; then cp modbus_config.example.json modbus_config.json; fi && if [ ! -d venv ]; then python3 -m venv venv; fi && ./venv/bin/python -m pip install --upgrade pip && ./venv/bin/python -m pip install -r requirements.txt && sudo -n systemctl restart dotwatch-pi-agent && sudo -n systemctl status dotwatch-pi-agent --no-pager"
