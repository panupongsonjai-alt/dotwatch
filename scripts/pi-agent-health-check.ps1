<#
 dotWatch Raspberry Pi agent health check
 Secrets are masked. This script does not print device secrets.

 Examples:
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pi-agent-health-check.ps1
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pi-agent-health-check.ps1 -PiHost 192.168.1.237 -PiUser pi
#>

[CmdletBinding()]
param(
    [string]$PiHost = "",
    [string]$PiUser = "pi",
    [string]$RemoteDir = "/home/pi/dotwatch-pi-agent",
    [string]$ApiUrl = "https://dotwatch-backend.onrender.com"
)

$ErrorActionPreference = "Continue"

function Resolve-DefaultValue {
    param(
        [string]$Value,
        [string]$EnvName,
        [string]$Fallback
    )

    if (-not [string]::IsNullOrWhiteSpace($Value)) {
        return $Value
    }

    $envValue = [Environment]::GetEnvironmentVariable($EnvName)
    if (-not [string]::IsNullOrWhiteSpace($envValue)) {
        return $envValue
    }

    return $Fallback
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host $Title -ForegroundColor Cyan
}

function Write-CommandLine {
    param([string]$Command)
    Write-Host $Command -ForegroundColor DarkGray
}

function Invoke-RemoteCheck {
    param(
        [string]$Title,
        [string]$Command
    )

    Write-Section $Title
    Write-CommandLine "ssh $Remote $Command"
    & ssh -o ConnectTimeout=8 $Remote $Command

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Command failed or returned non-zero exit code: $LASTEXITCODE"
    }
}

$PiHost = Resolve-DefaultValue -Value $PiHost -EnvName "DOTWATCH_PI_HOST" -Fallback "192.168.1.237"
$PiUser = Resolve-DefaultValue -Value $PiUser -EnvName "DOTWATCH_PI_USER" -Fallback "pi"
$RemoteDir = Resolve-DefaultValue -Value $RemoteDir -EnvName "DOTWATCH_PI_REMOTE_DIR" -Fallback "/home/pi/dotwatch-pi-agent"
$ApiUrl = Resolve-DefaultValue -Value $ApiUrl -EnvName "DOTWATCH_API_URL" -Fallback "https://dotwatch-backend.onrender.com"
$Remote = "$PiUser@$PiHost"

Write-Host "dotWatch Raspberry Pi agent health check" -ForegroundColor Cyan
Write-Host "Target: $Remote"
Write-Host "Remote dir: $RemoteDir"
Write-Host "API URL: $ApiUrl"
Write-Host "Secrets are masked. This script does not print device secrets."

Write-Section "Local SSH connectivity"
if (Get-Command Test-NetConnection -ErrorAction SilentlyContinue) {
    Test-NetConnection -ComputerName $PiHost -Port 22 -InformationLevel Detailed
} else {
    Write-Host "Test-NetConnection is not available on this PowerShell version. Skipping local TCP test."
}

Invoke-RemoteCheck -Title "Host info" -Command "hostname && date && uname -a"

Invoke-RemoteCheck -Title "Agent directory" -Command "test -d '$RemoteDir' && echo OK: '$RemoteDir' exists || echo MISSING: '$RemoteDir'"

Invoke-RemoteCheck -Title "Python and important files" -Command "cd '$RemoteDir' 2>/dev/null && pwd && ls -la main.py requirements.txt .env 2>/dev/null || true; python3 --version 2>/dev/null || true; test -x venv/bin/python && venv/bin/python --version || true"

Invoke-RemoteCheck -Title "Masked .env" -Command "cd '$RemoteDir' 2>/dev/null && if [ -f .env ]; then sed -E 's/(SECRET|PASSWORD|TOKEN|KEY|DATABASE_URL|PRIVATE_KEY)=.*/\1=***MASKED***/g' .env; else echo MISSING .env; fi"

Invoke-RemoteCheck -Title "Agent code ingest markers" -Command "cd '$RemoteDir' 2>/dev/null && if [ -f main.py ]; then grep -nE 'deviceSecret|x-device-code|x-device-secret|requests\.post|/api/ingest|metric_1|metric_2|metric_3|latest_metrics' main.py || true; else echo MISSING main.py; fi"

Invoke-RemoteCheck -Title "Agent process" -Command "ps aux | grep -E 'dotwatch|main.py|python' | grep -v grep || true"

$remoteApiCommand = "cd '$RemoteDir' 2>/dev/null && if [ -f .env ]; then API_FROM_ENV=`$(grep -E '^API_URL=' .env | tail -n 1 | cut -d= -f2-); if [ -n `"`$API_FROM_ENV`" ]; then echo API_URL=`$API_FROM_ENV; curl -fsS -m 12 `"`$API_FROM_ENV/health`" || true; else echo MISSING API_URL in .env; fi; else echo MISSING .env; fi"
Invoke-RemoteCheck -Title "Backend health from Raspberry Pi" -Command $remoteApiCommand

Write-Section "Backend health from this computer"
try {
    $healthUrl = $ApiUrl.TrimEnd('/') + "/health"
    Write-CommandLine "GET $healthUrl"
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 20
    Write-Host "Status: $($response.StatusCode)"
    Write-Host $response.Content
} catch {
    Write-Warning $_.Exception.Message
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
