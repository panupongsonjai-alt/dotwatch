param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi",
  [string]$RemoteDir = "/home/pi/dotwatch-pi-agent"
)

$ErrorActionPreference = "Stop"

$KeyPath = Join-Path $env:USERPROFILE ".ssh\dotwatch_pi"

if (-not (Test-Path $KeyPath)) {
  Write-Host "ERROR: SSH key not found: $KeyPath" -ForegroundColor Red
  Write-Host "Run passwordless setup first."
  exit 1
}

$RemoteScript = @'
set -e

cd /home/pi/dotwatch-pi-agent

touch .env

if grep -q "^SENSOR_SOURCE=" .env; then
  sed -i "s|^SENSOR_SOURCE=.*|SENSOR_SOURCE=modbus|" .env
else
  echo "SENSOR_SOURCE=modbus" >> .env
fi

if grep -q "^MODBUS_CONFIG_PATH=" .env; then
  sed -i "s|^MODBUS_CONFIG_PATH=.*|MODBUS_CONFIG_PATH=/home/pi/dotwatch-pi-agent/modbus_config.json|" .env
else
  echo "MODBUS_CONFIG_PATH=/home/pi/dotwatch-pi-agent/modbus_config.json" >> .env
fi

sudo -n systemctl restart dotwatch-pi-agent
sudo -n systemctl status dotwatch-pi-agent --no-pager
'@

$Encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($RemoteScript))

ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "echo '$Encoded' | base64 -d > /tmp/dotwatch-set-modbus.sh && chmod +x /tmp/dotwatch-set-modbus.sh && /tmp/dotwatch-set-modbus.sh"

Write-Host ""
Write-Host "Agent source set to Modbus and restarted." -ForegroundColor Green
