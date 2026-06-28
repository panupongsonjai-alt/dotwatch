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
REPORT="/home/pi/dotwatch-file-audit-${TS}.txt"
SAFE_LIST="/home/pi/dotwatch-safe-cleanup-candidates-${TS}.txt"
OPTIONAL_LIST="/home/pi/dotwatch-optional-old-files-${TS}.txt"

line() {
  echo "$@" | tee -a "$REPORT"
}

section() {
  echo "" | tee -a "$REPORT"
  echo "========================================================================" | tee -a "$REPORT"
  echo "$1" | tee -a "$REPORT"
  echo "========================================================================" | tee -a "$REPORT"
}

if [ ! -d "$REMOTE_DIR" ]; then
  echo "ERROR: Remote directory not found: $REMOTE_DIR"
  exit 1
fi

section "DOTWATCH FILE AUDIT"
line "Remote dir : $REMOTE_DIR"
line "Report     : $REPORT"
line "Safe list  : $SAFE_LIST"
line "Time       : $(date)"
line "Host       : $(hostname)"
line "User       : $(whoami)"

section "RUNNING SERVICES"
for svc in dotwatch-pi-agent dotwatch-pi-config-ui; do
  line ""
  line "Service: $svc"
  systemctl is-active "$svc" 2>&1 | sed 's/^/  active: /' | tee -a "$REPORT" || true
  systemctl is-enabled "$svc" 2>&1 | sed 's/^/  enabled: /' | tee -a "$REPORT" || true
done

section "SYSTEMD SERVICE DEFINITIONS"
for svc in dotwatch-pi-agent dotwatch-pi-config-ui; do
  line ""
  line "----- systemctl cat $svc -----"
  systemctl cat "$svc" --no-pager 2>&1 | tee -a "$REPORT" || true
done

section "PROTECTED RUNTIME FILES"
cat <<EOF | tee -a "$REPORT"
These files are treated as protected and will not be removed by safe cleanup:

$REMOTE_DIR/.env
$REMOTE_DIR/main.py
$REMOTE_DIR/config.py
$REMOTE_DIR/pi_config_web.py
$REMOTE_DIR/modbus_test.py
$REMOTE_DIR/modbus_config.json
$REMOTE_DIR/modbus_last_test_result.json
$REMOTE_DIR/requirements.txt
$REMOTE_DIR/services/
$REMOTE_DIR/sensors/
$REMOTE_DIR/venv/
EOF

section "CURRENT FILE INVENTORY"
if find "$REMOTE_DIR" -xdev -printf "%TY-%Tm-%Td %TH:%TM  %9s bytes  %p\n" >/tmp/dotwatch-file-inventory.$$ 2>/dev/null; then
  sort /tmp/dotwatch-file-inventory.$$ | tee -a "$REPORT"
  rm -f /tmp/dotwatch-file-inventory.$$
else
  find "$REMOTE_DIR" -xdev -type f -exec ls -lh {} \; | tee -a "$REPORT"
fi

section "SAFE CLEANUP CANDIDATES"
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
} | sort -u > "$SAFE_LIST"

if [ -s "$SAFE_LIST" ]; then
  cat "$SAFE_LIST" | tee -a "$REPORT"
else
  line "No safe cleanup candidates found."
fi

section "OPTIONAL / OLD FILE CANDIDATES - REVIEW BEFORE DELETE"
{
  find "$REMOTE_DIR" -xdev -type f \( \
    -name "*.bak" -o \
    -name "*.backup" -o \
    -name "*.old" -o \
    -name "*.orig" -o \
    -name "*.zip" -o \
    -name "*.tar" -o \
    -name "*.tar.gz" -o \
    -name "*backup*" -o \
    -name "*copy*" -o \
    -name "modbus_config.example.json" \
  \) ! -path "*/venv/*" -print 2>/dev/null
} | sort -u > "$OPTIONAL_LIST"

if [ -s "$OPTIONAL_LIST" ]; then
  cat "$OPTIONAL_LIST" | tee -a "$REPORT"
else
  line "No optional old-file candidates found."
fi

section "DISK USAGE"
du -h -d 2 "$REMOTE_DIR" 2>/dev/null | sort -h | tee -a "$REPORT" || du -h "$REMOTE_DIR" | tee -a "$REPORT"
line ""
df -h / | tee -a "$REPORT"

section "NEXT STEP"
cat <<EOF | tee -a "$REPORT"
1) Review this report first:
   $REPORT

2) To move safe cleanup candidates to trash:
   Run VS Code task or script: Pi: Clean Safe Unused Files

3) Safe cleanup only moves files to:
   /home/pi/dotwatch-file-trash/<timestamp>/

4) It does not remove protected runtime files, .env, config, venv, services, sensors, or active Python files.
EOF

echo ""
echo "AUDIT_DONE=$REPORT"
echo "SAFE_LIST=$SAFE_LIST"
echo "OPTIONAL_LIST=$OPTIONAL_LIST"
'@

$RemoteScript = $RemoteScript.Replace("__REMOTE_DIR__", $RemoteDir)
$Encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($RemoteScript))

Write-Host "Running dotWatch file audit on Raspberry Pi..." -ForegroundColor Cyan
ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "echo '$Encoded' | base64 -d > /tmp/dotwatch-file-audit.sh && chmod +x /tmp/dotwatch-file-audit.sh && bash /tmp/dotwatch-file-audit.sh"
