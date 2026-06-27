param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi"
)

$ErrorActionPreference = "Stop"

$KeyPath = Join-Path $env:USERPROFILE ".ssh\id_ed25519"
$PubKeyPath = "$KeyPath.pub"

Write-Host "dotWatch Pi Passwordless Setup" -ForegroundColor Cyan
Write-Host "Target: ${PiUser}@${PiHost}"
Write-Host ""

if (-not (Test-Path $KeyPath)) {
  Write-Host "Creating SSH key..." -ForegroundColor Cyan
  ssh-keygen -t ed25519 -C "dotwatch-pi" -f $KeyPath
} else {
  Write-Host "SSH key already exists: $KeyPath" -ForegroundColor Green
}

if (-not (Test-Path $PubKeyPath)) {
  Write-Host "ERROR: Public key not found: $PubKeyPath" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Installing SSH public key to Raspberry Pi." -ForegroundColor Cyan
Write-Host "You may need to enter Raspberry Pi password once here."
Get-Content $PubKeyPath | ssh "${PiUser}@${PiHost}" "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"

Write-Host ""
Write-Host "Testing SSH key login..." -ForegroundColor Cyan
ssh "${PiUser}@${PiHost}" "echo SSH key login OK"

Write-Host ""
Write-Host "Installing limited passwordless sudo for dotWatch services." -ForegroundColor Cyan
Write-Host "You may need to enter Raspberry Pi sudo password once here."

$RemoteScript = @'
set -e

SYSTEMCTL="$(command -v systemctl)"
JOURNALCTL="$(command -v journalctl)"
SUDOERS_FILE="/etc/sudoers.d/dotwatch-pi"

sudo tee "$SUDOERS_FILE" > /dev/null <<EOF
# dotWatch limited sudo access
# Allows user pi to manage only dotWatch services without sudo password.
pi ALL=(root) NOPASSWD: $SYSTEMCTL restart dotwatch-pi-agent
pi ALL=(root) NOPASSWD: $SYSTEMCTL status dotwatch-pi-agent --no-pager
pi ALL=(root) NOPASSWD: $SYSTEMCTL is-active dotwatch-pi-agent
pi ALL=(root) NOPASSWD: $SYSTEMCTL is-enabled dotwatch-pi-agent
pi ALL=(root) NOPASSWD: $SYSTEMCTL restart dotwatch-pi-config-ui
pi ALL=(root) NOPASSWD: $SYSTEMCTL status dotwatch-pi-config-ui --no-pager
pi ALL=(root) NOPASSWD: $SYSTEMCTL is-active dotwatch-pi-config-ui
pi ALL=(root) NOPASSWD: $SYSTEMCTL is-enabled dotwatch-pi-config-ui
pi ALL=(root) NOPASSWD: $JOURNALCTL -u dotwatch-pi-agent *
pi ALL=(root) NOPASSWD: $JOURNALCTL -u dotwatch-pi-config-ui *
EOF

sudo chmod 440 "$SUDOERS_FILE"
sudo visudo -cf "$SUDOERS_FILE"

echo "sudoers OK: $SUDOERS_FILE"
'@

ssh "${PiUser}@${PiHost}" $RemoteScript

Write-Host ""
Write-Host "Testing sudo without password..." -ForegroundColor Cyan
ssh "${PiUser}@${PiHost}" "sudo -n systemctl status dotwatch-pi-config-ui --no-pager > /dev/null && echo Passwordless sudo OK"

Write-Host ""
Write-Host "Done. VS Code tasks should now upload/restart without repeatedly asking password." -ForegroundColor Green
