param(
  [Parameter(Mandatory=$true)] [string] $PiHost,
  [string] $PiUser = "pi",
  [string] $RemoteDir = "/home/pi/dotwatch-pi-agent"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$SourceFile = Join-Path $ProjectRoot "pi\config-ui\pi_config_web.py"
$Remote = "$PiUser@$PiHost"

if (-not (Test-Path $SourceFile)) {
  Write-Host "ERROR: pi_config_web.py not found: $SourceFile" -ForegroundColor Red
  exit 1
}

scp $SourceFile "${Remote}:${RemoteDir}/pi_config_web.py"
ssh $Remote "chmod +x '${RemoteDir}/pi_config_web.py' && sudo -n systemctl restart dotwatch-pi-config-ui && sudo -n systemctl status dotwatch-pi-config-ui --no-pager"
