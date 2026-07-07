param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi",
  [string]$RemoteDir = "/home/pi/dotwatch-pi-agent"
)

$ErrorActionPreference = "Stop"

$KeyPath = Join-Path $env:USERPROFILE ".ssh\dotwatch_pi"

if (-not (Test-Path $KeyPath)) {
  Write-Host "ERROR: SSH key not found: $KeyPath" -ForegroundColor Red
  Write-Host "Run passwordless setup first."
  exit 1
}

$RemoteScript = @'
set -e

REMOTE_DIR="__REMOTE_DIR__"
TS="$(date +%Y%m%d-%H%M%S)"
TRASH="/home/pi/dotwatch-file-trash/${TS}"
LOG="/home/pi/dotwatch-safe-cleanup-${TS}.txt"
CANDIDATES="/tmp/dotwatch-safe-cleanup-candidates-${TS}.txt"

if [ ! -d "$REMOTE_DIR" ]; then
  echo "ERROR: Remote directory not found: $REMOTE_DIR"
  exit 1
fi

{
  find "$REMOTE_DIR" -xdev -type d -name "__pycache__" -print 2>/dev/null
  find "$REMOTE_DIR" -xdev -type f \( \
    -name "*.pyc" -o \
    -name "*.pyo" -o \
    -name "*.tmp" -o \
    -name "*.temp" -o \
    -name "*.log" -o \
    -name ".DS_Store" -o \
    -name "Thumbs.db" -o \
    -name "*:Zone.Identifier" \
  \) ! -path "*/venv/*" ! -path "*/__pycache__/*" -print 2>/dev/null
} | sort -u > "$CANDIDATES"

echo "dotWatch Safe Cleanup" | tee "$LOG"
echo "Remote dir : $REMOTE_DIR" | tee -a "$LOG"
echo "Trash      : $TRASH" | tee -a "$LOG"
echo "Time       : $(date)" | tee -a "$LOG"
echo "" | tee -a "$LOG"

if [ ! -s "$CANDIDATES" ]; then
  echo "No safe cleanup candidates found." | tee -a "$LOG"
  echo "CLEANUP_DONE=$LOG"
  exit 0
fi

mkdir -p "$TRASH"

echo "Moving safe candidates to trash..." | tee -a "$LOG"
echo "" | tee -a "$LOG"

while IFS= read -r item; do
  [ -e "$item" ] || continue

  rel="${item#$REMOTE_DIR/}"
  dest="$TRASH/$rel"

  mkdir -p "$(dirname "$dest")"

  if [ -e "$dest" ]; then
    dest="${dest}.$(date +%s)"
  fi

  echo "MOVE: $item -> $dest" | tee -a "$LOG"
  mv "$item" "$dest"
done < "$CANDIDATES"

echo "" | tee -a "$LOG"
echo "Cleanup finished." | tee -a "$LOG"
echo "Files were moved to trash, not permanently deleted." | tee -a "$LOG"
echo "Trash path: $TRASH" | tee -a "$LOG"
echo "" | tee -a "$LOG"
echo "Service check:" | tee -a "$LOG"
systemctl is-active dotwatch-pi-agent 2>&1 | sed 's/^/dotwatch-pi-agent: /' | tee -a "$LOG" || true
systemctl is-active dotwatch-pi-config-ui 2>&1 | sed 's/^/dotwatch-pi-config-ui: /' | tee -a "$LOG" || true

echo ""
echo "CLEANUP_DONE=$LOG"
echo "TRASH=$TRASH"
'@

$RemoteScript = $RemoteScript.Replace("__REMOTE_DIR__", $RemoteDir)
$Encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($RemoteScript))

Write-Host "Moving safe unused files to trash on Raspberry Pi..." -ForegroundColor Yellow
ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "echo '$Encoded' | base64 -d > /tmp/dotwatch-safe-cleanup.sh && chmod +x /tmp/dotwatch-safe-cleanup.sh && bash /tmp/dotwatch-safe-cleanup.sh"
