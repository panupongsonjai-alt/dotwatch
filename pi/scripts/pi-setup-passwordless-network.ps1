param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi"
)

$ErrorActionPreference = "Stop"

$KeyDir = Join-Path $env:USERPROFILE ".ssh"
$KeyPath = Join-Path $KeyDir "dotwatch_pi"
$PubKeyPath = "$KeyPath.pub"

Write-Host "dotWatch Pi Passwordless + Network Setup" -ForegroundColor Cyan
Write-Host "Target : ${PiUser}@${PiHost}"
Write-Host "Key    : $KeyPath"
Write-Host ""

if (-not (Test-Path $KeyDir)) {
  New-Item -ItemType Directory -Path $KeyDir -Force | Out-Null
}

if (-not (Test-Path $KeyPath)) {
  Write-Host "Creating dedicated SSH key without passphrase..." -ForegroundColor Cyan
  $cmd = 'ssh-keygen -t ed25519 -C "dotwatch-pi" -f "' + $KeyPath + '" -N ""'
  cmd.exe /d /c $cmd

  if ($LASTEXITCODE -ne 0) {
    throw "ssh-keygen failed with exit code $LASTEXITCODE"
  }
} else {
  Write-Host "Dedicated SSH key already exists." -ForegroundColor Green
}

if (-not (Test-Path $PubKeyPath)) {
  Write-Host "Public key missing. Rebuilding public key from private key..." -ForegroundColor Yellow
  $pub = & ssh-keygen -y -f $KeyPath
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($pub)) {
    throw "Could not rebuild public key from $KeyPath"
  }
  Set-Content -Path $PubKeyPath -Value $pub -Encoding ascii
}

$PubKey = (Get-Content $PubKeyPath -Raw).Trim()

Write-Host ""
Write-Host "Installing SSH public key to Raspberry Pi." -ForegroundColor Cyan
Write-Host "This step may ask Raspberry Pi password ONE time."

$InstallKeyScript = @"
set -e
mkdir -p ~/.ssh
touch ~/.ssh/authorized_keys
grep -qxF '$PubKey' ~/.ssh/authorized_keys || echo '$PubKey' >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
echo "authorized_keys OK"
"@

$InstallKeyEncoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($InstallKeyScript))
ssh "${PiUser}@${PiHost}" "echo '$InstallKeyEncoded' | base64 -d | sh"

Write-Host ""
Write-Host "Testing SSH key login." -ForegroundColor Cyan
ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "echo SSH key login OK"

Write-Host ""
Write-Host "Installing limited passwordless sudo for dotWatch + NetworkManager." -ForegroundColor Cyan
Write-Host "This step may ask Raspberry Pi sudo password ONE time."

$RemoteScript = @'
set -e

SYSTEMCTL="$(command -v systemctl)"
JOURNALCTL="$(command -v journalctl)"
NMCLI="$(command -v nmcli)"
IP="$(command -v ip)"
SUDOERS_FILE="/etc/sudoers.d/dotwatch-pi"

sudo tee "$SUDOERS_FILE" > /dev/null <<EOF
# dotWatch limited sudo access
pi ALL=(root) NOPASSWD: $SYSTEMCTL restart dotwatch-pi-agent
pi ALL=(root) NOPASSWD: $SYSTEMCTL status dotwatch-pi-agent --no-pager
pi ALL=(root) NOPASSWD: $SYSTEMCTL status dotwatch-pi-agent *
pi ALL=(root) NOPASSWD: $SYSTEMCTL is-active dotwatch-pi-agent
pi ALL=(root) NOPASSWD: $SYSTEMCTL is-enabled dotwatch-pi-agent
pi ALL=(root) NOPASSWD: $SYSTEMCTL restart dotwatch-pi-config-ui
pi ALL=(root) NOPASSWD: $SYSTEMCTL status dotwatch-pi-config-ui --no-pager
pi ALL=(root) NOPASSWD: $SYSTEMCTL status dotwatch-pi-config-ui *
pi ALL=(root) NOPASSWD: $SYSTEMCTL is-active dotwatch-pi-config-ui
pi ALL=(root) NOPASSWD: $SYSTEMCTL is-enabled dotwatch-pi-config-ui
pi ALL=(root) NOPASSWD: $JOURNALCTL -u dotwatch-pi-agent *
pi ALL=(root) NOPASSWD: $JOURNALCTL -u dotwatch-pi-config-ui *
pi ALL=(root) NOPASSWD: $NMCLI *
pi ALL=(root) NOPASSWD: $IP *
EOF

sudo chmod 440 "$SUDOERS_FILE"
sudo visudo -cf "$SUDOERS_FILE"
echo "sudoers OK: $SUDOERS_FILE"
'@

$RemoteEncoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($RemoteScript))
ssh -i $KeyPath -o IdentitiesOnly=yes "${PiUser}@${PiHost}" "echo '$RemoteEncoded' | base64 -d > /tmp/dotwatch-sudoers-network.sh && chmod +x /tmp/dotwatch-sudoers-network.sh && /tmp/dotwatch-sudoers-network.sh"

Write-Host ""
Write-Host "Testing sudo without password." -ForegroundColor Cyan
ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "sudo -n systemctl status dotwatch-pi-config-ui --no-pager > /dev/null && sudo -n nmcli device status > /dev/null && echo Passwordless sudo OK"

Write-Host ""
Write-Host "Done." -ForegroundColor Green
