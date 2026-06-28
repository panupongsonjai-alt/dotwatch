param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi",
  [string]$RemoteDir = "/home/pi/dotwatch-pi-agent"
)

$ErrorActionPreference = "Stop"
$KeyPath = Join-Path $env:USERPROFILE ".ssh\dotwatch_pi"

if (-not (Test-Path $KeyPath)) {
  Write-Host "ERROR: SSH key not found: $KeyPath" -ForegroundColor Red
  exit 1
}

$RemoteScript = @'
set -e

REMOTE_DIR="__REMOTE_DIR__"
TRASH_ROOT="/home/pi/dotwatch-file-trash"
LATEST="$(ls -1dt "$TRASH_ROOT"/* 2>/dev/null | head -1 || true)"
LOG="/home/pi/dotwatch-restore-last-trash-$(date +%Y%m%d-%H%M%S).txt"

if [ -z "$LATEST" ] || [ ! -d "$LATEST" ]; then
  echo "No trash folder found."
  exit 0
fi

echo "Restoring latest trash folder: $LATEST" | tee "$LOG"
echo "Target: $REMOTE_DIR" | tee -a "$LOG"
echo "" | tee -a "$LOG"

find "$LATEST" -type f | while IFS= read -r file; do
  rel="${file#$LATEST/}"
  target="$REMOTE_DIR/$rel"
  mkdir -p "$(dirname "$target")"

  if [ -e "$target" ]; then
    echo "SKIP existing: $target" | tee -a "$LOG"
  else
    echo "RESTORE: $file -> $target" | tee -a "$LOG"
    mv "$file" "$target"
  fi
done

find "$LATEST" -depth -type d -empty -delete 2>/dev/null || true

echo "" | tee -a "$LOG"
echo "Restore finished." | tee -a "$LOG"
echo "RESTORE_DONE=$LOG"
'@

$RemoteScript = $RemoteScript.Replace("__REMOTE_DIR__", $RemoteDir)
$Encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($RemoteScript))

ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "echo '$Encoded' | base64 -d > /tmp/dotwatch-restore-trash.sh && chmod +x /tmp/dotwatch-restore-trash.sh && bash /tmp/dotwatch-restore-trash.sh"
