param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi"
)

$ErrorActionPreference = "Stop"
$KeyPath = Join-Path $env:USERPROFILE ".ssh\dotwatch_pi"

if (-not (Test-Path $KeyPath)) {
  Write-Host "ERROR: SSH key not found: $KeyPath" -ForegroundColor Red
  exit 1
}

Write-Host "This will permanently delete /home/pi/dotwatch-file-trash on Raspberry Pi." -ForegroundColor Yellow
$Confirm = Read-Host "Type DELETE to continue"
if ($Confirm -ne "DELETE") {
  Write-Host "Cancelled."
  exit 0
}

ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "rm -rf /home/pi/dotwatch-file-trash && echo 'dotWatch trash permanently deleted.'"
