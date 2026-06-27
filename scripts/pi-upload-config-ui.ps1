param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi",
  [string]$RemoteDir = "/home/pi/dotwatch-pi-agent"
)

$ErrorActionPreference = "Stop"

$Workspace = Resolve-Path (Join-Path $PSScriptRoot "..")
$SourceCandidates = @(
  (Join-Path $Workspace "dotwatch-pi-config-ui-status\pi_config_web.py"),
  (Join-Path $Workspace "dotwatch-pi-config-ui\pi_config_web.py"),
  (Join-Path $Workspace "pi_config_web.py")
)

$SourceFile = $null
foreach ($candidate in $SourceCandidates) {
  if (Test-Path $candidate) {
    $SourceFile = (Resolve-Path $candidate).Path
    break
  }
}

if (-not $SourceFile) {
  Write-Host ""
  Write-Host "ERROR: pi_config_web.py not found." -ForegroundColor Red
  Write-Host "Put pi_config_web.py in one of these paths:"
  Write-Host "  dotwatch-pi-config-ui-status\pi_config_web.py"
  Write-Host "  dotwatch-pi-config-ui\pi_config_web.py"
  Write-Host "  pi_config_web.py"
  exit 1
}

$RemoteFile = "${PiUser}@${PiHost}:${RemoteDir}/pi_config_web.py"

Write-Host "Uploading Config UI to Raspberry Pi..." -ForegroundColor Cyan
Write-Host "Source : $SourceFile"
Write-Host "Target : $RemoteFile"
Write-Host ""

scp $SourceFile $RemoteFile

Write-Host ""
Write-Host "Restarting dotwatch-pi-config-ui..." -ForegroundColor Cyan
ssh "${PiUser}@${PiHost}" "chmod +x ${RemoteDir}/pi_config_web.py && sudo -n systemctl restart dotwatch-pi-config-ui && sudo -n systemctl status dotwatch-pi-config-ui --no-pager"

Write-Host ""
Write-Host "Done. Open: http://${PiHost}:8080/status" -ForegroundColor Green
