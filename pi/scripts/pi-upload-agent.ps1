param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi",
  [string]$RemoteDir = "/home/pi/dotwatch-pi-agent"
)

$ErrorActionPreference = "Stop"

$KeyPath = Join-Path $env:USERPROFILE ".ssh\dotwatch_pi"

if (-not (Test-Path $KeyPath)) {
  Write-Host "ERROR: Dedicated key not found: $KeyPath" -ForegroundColor Red
  Write-Host "Run task: Pi: Setup Passwordless SSH and Sudo"
  exit 1
}

$Workspace = Resolve-Path (Join-Path $PSScriptRoot "..")
$AgentDirCandidates = @(
  (Join-Path $Workspace "dotwatch-pi-agent"),
  $Workspace
)

$AgentDir = $null
foreach ($candidate in $AgentDirCandidates) {
  if (
    (Test-Path (Join-Path $candidate "main.py")) -and
    (Test-Path (Join-Path $candidate "config.py"))
  ) {
    $AgentDir = (Resolve-Path $candidate).Path
    break
  }
}

if (-not $AgentDir) {
  Write-Host ""
  Write-Host "ERROR: dotwatch-pi-agent files not found." -ForegroundColor Red
  Write-Host "Expected main.py and config.py in:"
  Write-Host "  dotwatch-pi-agent\"
  Write-Host "  workspace root"
  exit 1
}

$RemoteBase = "${PiUser}@${PiHost}:${RemoteDir}"

Write-Host "Uploading Agent files to Raspberry Pi..." -ForegroundColor Cyan
Write-Host "Source : $AgentDir"
Write-Host "Target : $RemoteBase"
Write-Host "Key    : $KeyPath"
Write-Host ""

scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes (Join-Path $AgentDir "main.py") "${RemoteBase}/main.py"
scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes (Join-Path $AgentDir "config.py") "${RemoteBase}/config.py"

$ServicesDir = Join-Path $AgentDir "services"
$SensorsDir = Join-Path $AgentDir "sensors"
$RequirementsFile = Join-Path $AgentDir "requirements.txt"

if (Test-Path $ServicesDir) {
  scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes -r $ServicesDir "${RemoteBase}/"
}

if (Test-Path $SensorsDir) {
  scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes -r $SensorsDir "${RemoteBase}/"
}

if (Test-Path $RequirementsFile) {
  scp -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes $RequirementsFile "${RemoteBase}/requirements.txt"
}

Write-Host ""
Write-Host "Restarting dotwatch-pi-agent..." -ForegroundColor Cyan
ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "sudo -n systemctl restart dotwatch-pi-agent && sudo -n systemctl status dotwatch-pi-agent --no-pager"

Write-Host ""
Write-Host "Done. Agent uploaded and restarted." -ForegroundColor Green
