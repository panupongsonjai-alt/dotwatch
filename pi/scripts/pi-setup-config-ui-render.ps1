param(
  [Parameter(Mandatory=$true)] [string] $PiHost,
  [string] $PiUser = "pi",
  [string] $RemoteDir = "/home/pi/dotwatch-pi-agent"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$ConfigUiPath = Join-Path $ProjectRoot "pi\config-ui"
$Remote = "$PiUser@$PiHost"

if (-not (Test-Path (Join-Path $ConfigUiPath "pi_config_web.py"))) {
  Write-Host "ERROR: pi_config_web.py not found: $ConfigUiPath" -ForegroundColor Red
  exit 1
}

Write-Host "Uploading dotWatch Pi Config UI to ${Remote}:${RemoteDir}" -ForegroundColor Cyan
ssh $Remote "mkdir -p '$RemoteDir'"
scp "$ConfigUiPath\pi_config_web.py" "${Remote}:${RemoteDir}/pi_config_web.py"
scp "$ConfigUiPath\install_config_ui_service.sh" "${Remote}:${RemoteDir}/install_config_ui_service.sh"

Write-Host "Installing/restarting Config UI service..." -ForegroundColor Cyan
ssh $Remote "cd '$RemoteDir' && chmod +x pi_config_web.py install_config_ui_service.sh && ./install_config_ui_service.sh '$RemoteDir'"

Write-Host "Config UI ready:" -ForegroundColor Green
Write-Host "http://${PiHost}:8080"
