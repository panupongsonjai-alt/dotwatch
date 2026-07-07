param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi"
)

$ErrorActionPreference = "Stop"

$KeyPath = Join-Path $env:USERPROFILE ".ssh\dotwatch_pi"

if (-not (Test-Path $KeyPath)) {
  Write-Host "ERROR: Dedicated key not found: $KeyPath" -ForegroundColor Red
  Write-Host "Run task: Pi: Setup Passwordless SSH Sudo Network"
  exit 1
}

Write-Host "Testing SSH passwordless..." -ForegroundColor Cyan
ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "echo SSH_OK"

Write-Host ""
Write-Host "Testing SCP passwordless..." -ForegroundColor Cyan
$tmp = New-TemporaryFile
Set-Content -Path $tmp -Value "dotwatch scp test"
scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes $tmp "${PiUser}@${PiHost}:/tmp/dotwatch_scp_test.txt"
Remove-Item $tmp -Force

Write-Host ""
Write-Host "Testing sudo service and nmcli passwordless..." -ForegroundColor Cyan
ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "sudo -n systemctl status dotwatch-pi-config-ui --no-pager > /dev/null && sudo -n nmcli device status > /dev/null && echo SUDO_NMCLI_OK"

Write-Host ""
Write-Host "All passwordless tests passed." -ForegroundColor Green
