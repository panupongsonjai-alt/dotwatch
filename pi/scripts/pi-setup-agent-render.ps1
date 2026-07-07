param(
  [Parameter(Mandatory=$true)] [string] $PiHost,
  [string] $PiUser = "pi",
  [Parameter(Mandatory=$true)] [string] $DeviceCode,
  [Parameter(Mandatory=$true)] [string] $DeviceSecret,
  [string] $ApiUrl = "https://dotwatch-backend.onrender.com",
  [ValidateSet("dummy", "modbus", "modbus_tcp", "modbus_rtu")] [string] $SensorSource = "dummy",
  [int] $SendIntervalSeconds = 10,
  [int] $RequestTimeoutSeconds = 15,
  [switch] $InstallService,
  [switch] $InstallConfigUi
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$AgentPath = Join-Path $ProjectRoot "pi\agent"
$ConfigUiPath = Join-Path $ProjectRoot "pi\config-ui"
$Remote = "$PiUser@$PiHost"
$RemoteDir = "/home/$PiUser/dotwatch-pi-agent"

Write-Host "Uploading dotWatch Pi Agent to ${Remote}:${RemoteDir}" -ForegroundColor Cyan
ssh $Remote "mkdir -p '$RemoteDir' '$RemoteDir/data' '$RemoteDir/logs'"
scp -r "$AgentPath\*" "${Remote}:${RemoteDir}/"

if (Test-Path $ConfigUiPath) {
  Write-Host "Uploading dotWatch Pi Config UI..." -ForegroundColor Cyan
  scp "$ConfigUiPath\pi_config_web.py" "${Remote}:${RemoteDir}/pi_config_web.py"
  scp "$ConfigUiPath\install_config_ui_service.sh" "${Remote}:${RemoteDir}/install_config_ui_service.sh"
}

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
CONFIG_UI_USERNAME=admin
CONFIG_UI_PASSWORD=change-this-config-password
"@

$tempEnv = New-TemporaryFile
Set-Content -Path $tempEnv -Value $envContent -Encoding UTF8
scp "$tempEnv" "${Remote}:${RemoteDir}/.env"
Remove-Item $tempEnv -Force

Write-Host "Installing Python dependencies on Raspberry Pi..." -ForegroundColor Cyan
ssh $Remote "cd '$RemoteDir' && python3 -m venv venv && ./venv/bin/python -m pip install --upgrade pip && ./venv/bin/python -m pip install -r requirements.txt"

if ($InstallService) {
  Write-Host "Installing dotWatch Pi Agent service..." -ForegroundColor Cyan
  ssh $Remote "cd '$RemoteDir' && chmod +x install_agent_service.sh && ./install_agent_service.sh"
}

if ($InstallConfigUi) {
  Write-Host "Installing dotWatch Pi Config UI service..." -ForegroundColor Cyan
  ssh $Remote "cd '$RemoteDir' && chmod +x install_config_ui_service.sh && ./install_config_ui_service.sh '$RemoteDir'"
}

Write-Host "Done." -ForegroundColor Green
Write-Host "Manual agent test:" -ForegroundColor Green
Write-Host ('ssh {0} "cd ''{1}'' && ./venv/bin/python main.py"' -f $Remote, $RemoteDir)
Write-Host "Config UI:" -ForegroundColor Green
Write-Host "http://${PiHost}:8080"
