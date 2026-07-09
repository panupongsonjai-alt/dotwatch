param(
  [Parameter(Mandatory=$true)] [string] $PiHost,
  [string] $PiUser = "pi",
  [string] $RemoteDir = "/home/pi/dotwatch-pi-agent",
  [int] $Cycles = 3,
  [int] $IntervalSeconds = 3,
  [switch] $UploadAgent,
  [switch] $InstallDependencies,
  [switch] $Send,
  [switch] $QueueTest,
  [switch] $ServiceStatus,
  [switch] $TailLogs,
  [switch] $OpenTunnelHint
)

$ErrorActionPreference = "Stop"

function Write-Step([string] $Message) {
  Write-Host ""
  Write-Host "============================================================" -ForegroundColor DarkGray
  Write-Host $Message -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkGray
}

function Invoke-Remote([string] $Command) {
  Write-Host "ssh $Remote \"$Command\"" -ForegroundColor DarkGray
  ssh $Remote $Command
}

function Assert-Command([string] $Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Required command not found in PATH: $Name"
  }
}

$Root = Split-Path -Parent $PSScriptRoot
$AgentPath = Join-Path $Root "pi\agent"
$Remote = "${PiUser}@${PiHost}"

if ($Cycles -lt 1) { $Cycles = 1 }
if ($IntervalSeconds -lt 0) { $IntervalSeconds = 0 }

Write-Step "dotWatch Pi field commissioning"
Write-Host "PiHost              : $PiHost"
Write-Host "PiUser              : $PiUser"
Write-Host "RemoteDir           : $RemoteDir"
Write-Host "UploadAgent         : $UploadAgent"
Write-Host "InstallDependencies : $InstallDependencies"
Write-Host "Send                : $Send"
Write-Host "QueueTest           : $QueueTest"

Assert-Command ssh
if ($UploadAgent) { Assert-Command scp }

Write-Step "1. SSH connectivity"
Invoke-Remote "echo connected && uname -a && python3 --version"

if ($UploadAgent) {
  Write-Step "2. Upload canonical pi/agent files"
  if (-not (Test-Path $AgentPath)) {
    throw "Agent path not found: $AgentPath"
  }

  Invoke-Remote "mkdir -p '$RemoteDir' '$RemoteDir/data' '$RemoteDir/logs' '$RemoteDir/reports'"
  scp -r "$AgentPath\*" "${Remote}:${RemoteDir}/"
  Invoke-Remote "chmod +x '$RemoteDir/agent_field_test.py' '$RemoteDir/agent_self_check.py' '$RemoteDir/install_agent_service.sh' '$RemoteDir/install_config_ui_service.sh' 2>/dev/null || true"
} else {
  Write-Step "2. Check required remote files"
  Invoke-Remote "test -f '$RemoteDir/main.py' && test -f '$RemoteDir/agent_self_check.py' && test -f '$RemoteDir/agent_field_test.py' && echo required-files-ok"
}

if ($InstallDependencies) {
  Write-Step "3. Install/update Python dependencies"
  Invoke-Remote "cd '$RemoteDir' && python3 -m venv venv && ./venv/bin/python -m pip install --upgrade pip && ./venv/bin/python -m pip install -r requirements.txt"
} else {
  Write-Step "3. Check Python virtual environment"
  Invoke-Remote "test -x '$RemoteDir/venv/bin/python' && '$RemoteDir/venv/bin/python' --version || python3 --version"
}

Write-Step "4. Agent self-check"
$sendTestArg = ""
if ($Send) { $sendTestArg = " --send-test" }
Invoke-Remote "cd '$RemoteDir' && ./venv/bin/python agent_self_check.py$sendTestArg"

Write-Step "5. Field sensor/ingest test"
$fieldArgs = "--cycles $Cycles --interval $IntervalSeconds --output '$RemoteDir/reports/field-test-latest.json'"
if ($Send) { $fieldArgs += " --send" }
if ($QueueTest) { $fieldArgs += " --queue-test" }
Invoke-Remote "cd '$RemoteDir' && ./venv/bin/python agent_field_test.py $fieldArgs"

if ($ServiceStatus) {
  Write-Step "6. systemd service status"
  Invoke-Remote "systemctl status dotwatch-pi-agent --no-pager || true; systemctl status dotwatch-pi-config-ui --no-pager || true"
}

if ($TailLogs) {
  Write-Step "7. Latest service logs"
  Invoke-Remote "journalctl -u dotwatch-pi-agent -n 80 --no-pager || true"
}

Write-Step "Commissioning summary"
Write-Host "Report on Pi: $RemoteDir/reports/field-test-latest.json" -ForegroundColor Green
Write-Host "Next manual run:" -ForegroundColor Green
Write-Host "ssh $Remote \"cd '$RemoteDir' && ./venv/bin/python agent_field_test.py --cycles 3 --send\""

if ($OpenTunnelHint) {
  Write-Host ""
  Write-Host "Config UI safe tunnel:" -ForegroundColor Green
  Write-Host "ssh -L 8080:127.0.0.1:8080 $Remote"
  Write-Host "Open: http://127.0.0.1:8080"
}
