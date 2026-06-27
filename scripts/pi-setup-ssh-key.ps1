param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi"
)

$ErrorActionPreference = "Stop"

$KeyPath = Join-Path $env:USERPROFILE ".ssh\id_ed25519"
$PubKeyPath = "$KeyPath.pub"

if (-not (Test-Path $KeyPath)) {
  Write-Host "Creating SSH key..." -ForegroundColor Cyan
  ssh-keygen -t ed25519 -C "dotwatch-pi" -f $KeyPath
}

if (-not (Test-Path $PubKeyPath)) {
  Write-Host "ERROR: Public key not found: $PubKeyPath" -ForegroundColor Red
  exit 1
}

Write-Host "Installing public key to Raspberry Pi..." -ForegroundColor Cyan
Get-Content $PubKeyPath | ssh "${PiUser}@${PiHost}" "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"

Write-Host ""
Write-Host "Testing SSH..." -ForegroundColor Cyan
ssh "${PiUser}@${PiHost}" "echo SSH key login OK"

Write-Host ""
Write-Host "Done. VS Code tasks should now upload without asking password every time." -ForegroundColor Green
