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

ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "echo 'dotWatch trash folders:'; ls -lah /home/pi/dotwatch-file-trash 2>/dev/null || echo 'No trash folder found'; echo ''; du -h -d 2 /home/pi/dotwatch-file-trash 2>/dev/null || true"
