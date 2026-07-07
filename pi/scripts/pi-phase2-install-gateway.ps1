param(
  [string] $PiHost = "192.168.1.154",
  [string] $PiUser = "pi",
  [Parameter(Mandatory=$true)] [string] $DeviceCode,
  [Parameter(Mandatory=$true)] [string] $DeviceSecret,
  [string] $ApiUrl = "https://dotwatch-backend.onrender.com",
  [ValidateSet("dummy", "modbus", "modbus_tcp", "modbus_rtu")] [string] $SensorSource = "dummy",
  [int] $SendIntervalSeconds = 10,
  [int] $RequestTimeoutSeconds = 15,
  [string] $ConfigUiUsername = "admin",
  [string] $ConfigUiPassword = "change-this-config-password",
  [switch] $SkipAgentService,
  [switch] $SkipConfigUiService
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$AgentPath = Join-Path $ProjectRoot "pi\agent"
$Remote = "$PiUser@$PiHost"
$RemoteDir = "/home/$PiUser/dotwatch-pi-agent"

if (-not (Test-Path $AgentPath)) {
  throw "Agent path not found: $AgentPath"
}

Write-Host "dotWatch Phase 2 Pi Gateway install" -ForegroundColor Cyan
Write-Host "Pi: ${Remote}" -ForegroundColor Cyan
Write-Host "Remote dir: ${RemoteDir}" -ForegroundColor Cyan

ssh $Remote "mkdir -p '$RemoteDir' '$RemoteDir/data' '$RemoteDir/logs'"

Write-Host "Uploading pi/agent files..." -ForegroundColor Cyan
scp -r "$AgentPath\*" "${Remote}:${RemoteDir}/"

$envContent = @"
DOTWATCH_API_URL=$ApiUrl
DEVICE_CODE=$DeviceCode
DEVICE_SECRET=$DeviceSecret
SEND_INTERVAL_SECONDS=$SendIntervalSeconds
REQUEST_TIMEOUT_SECONDS=$RequestTimeoutSeconds
FIRMWARE_VERSION=rpi-agent-0.2.0
SENSOR_SOURCE=$SensorSource
MODBUS_CONFIG_PATH=$RemoteDir/modbus_config.json
OFFLINE_QUEUE_ENABLED=true
OFFLINE_QUEUE_PATH=$RemoteDir/data/offline_queue.jsonl
OFFLINE_QUEUE_MAX_ITEMS=1000
QUEUE_FLUSH_LIMIT=20
MAX_BACKOFF_SECONDS=60
LOG_METRICS=true
CONFIG_UI_USERNAME=$ConfigUiUsername
CONFIG_UI_PASSWORD=$ConfigUiPassword
"@

$tempEnv = New-TemporaryFile
Set-Content -Path $tempEnv -Value $envContent -Encoding UTF8
scp "$tempEnv" "${Remote}:${RemoteDir}/.env"
Remove-Item $tempEnv -Force

Write-Host "Installing Python virtual environment and dependencies..." -ForegroundColor Cyan
$installDeps = "cd '$RemoteDir' && python3 -m venv venv && ./venv/bin/python -m pip install --upgrade pip && ./venv/bin/python -m pip install -r requirements.txt && chmod +x install_agent_service.sh install_config_ui_service.sh dotwatch-pi-health.sh agent_self_check.py"
ssh $Remote $installDeps

if (-not $SkipAgentService) {
  Write-Host "Installing/restarting dotwatch-pi-agent service..." -ForegroundColor Cyan
  ssh $Remote ("cd '{0}' && ./install_agent_service.sh '{0}'" -f $RemoteDir)
}

if (-not $SkipConfigUiService) {
  Write-Host "Installing/restarting dotwatch-pi-config-ui service..." -ForegroundColor Cyan
  ssh $Remote ("cd '{0}' && ./install_config_ui_service.sh '{0}'" -f $RemoteDir)
}

Write-Host "Running self check..." -ForegroundColor Cyan
ssh $Remote ("cd '{0}' && ./venv/bin/python agent_self_check.py" -f $RemoteDir)

Write-Host "Done." -ForegroundColor Green
Write-Host "Config UI: http://${PiHost}:8080" -ForegroundColor Green
Write-Host "Health check:" -ForegroundColor Green
Write-Host ("powershell -NoProfile -ExecutionPolicy Bypass -File pi\scripts\pi-phase2-check-gateway.ps1 -PiHost {0} -PiUser {1}" -f $PiHost, $PiUser)
