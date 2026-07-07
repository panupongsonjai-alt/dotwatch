param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi",
  [string]$RemoteDir = "/home/pi/dotwatch-pi-agent"
)

$ErrorActionPreference = "Stop"
$KeyPath = Join-Path $env:USERPROFILE ".ssh\dotwatch_pi"
$Workspace = Resolve-Path (Join-Path $PSScriptRoot "..")
$UiFile = Join-Path $Workspace "dotwatch-pi-config-ui-status\pi_config_web.py"

scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes $UiFile "${PiUser}@${PiHost}:${RemoteDir}/pi_config_web.py"
ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "chmod +x ${RemoteDir}/pi_config_web.py && sudo -n systemctl restart dotwatch-pi-config-ui && sudo -n systemctl status dotwatch-pi-config-ui --no-pager"
