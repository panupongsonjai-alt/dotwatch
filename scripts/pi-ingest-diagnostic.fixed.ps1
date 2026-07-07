param(
  [string]$PiHost = '',
  [string]$PiUser = 'pi',
  [string]$RemoteDir = '/home/pi/dotwatch-pi-agent',
  [string]$DefaultApiUrl = 'https://dotwatch-backend.onrender.com',
  [switch]$SendProbe
)

$ErrorActionPreference = 'Continue'

if ([string]::IsNullOrWhiteSpace($PiHost)) {
  if (-not [string]::IsNullOrWhiteSpace($env:DOTWATCH_PI_HOST)) {
    $PiHost = $env:DOTWATCH_PI_HOST
  } else {
    $PiHost = '192.168.1.237'
  }
}

$Remote = "$PiUser@$PiHost"

function Write-Section {
  param([string]$Title)
  Write-Host ''
  Write-Host '============================================================'
  Write-Host $Title
  Write-Host '============================================================'
}

function Invoke-External {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$AllowFailure
  )

  Write-Host (($FilePath + ' ' + ($Arguments -join ' ')).Trim()) -ForegroundColor DarkGray
  & $FilePath @Arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0 -and -not $AllowFailure) {
    throw "Command failed with exit code $exitCode: $FilePath"
  }
  if ($exitCode -ne 0 -and $AllowFailure) {
    Write-Warning "Command failed or returned non-zero exit code: $exitCode"
  }
  return $exitCode
}

function Mask-Text {
  param([string]$Text)
  if ($null -eq $Text) { return '' }
  $masked = $Text
  $masked = $masked -replace '(?i)(deviceSecret"\s*:\s*")[^"]+', '$1***MASKED***'
  $masked = $masked -replace '(?i)(DEVICE_SECRET=).*', '$1***MASKED***'
  $masked = $masked -replace '(?i)(CONFIG_UI_PASSWORD=).*', '$1***MASKED***'
  $masked = $masked -replace '(?i)(PASSWORD=).*', '$1***MASKED***'
  $masked = $masked -replace '(?i)(TOKEN=).*', '$1***MASKED***'
  $masked = $masked -replace '(?i)(PRIVATE_KEY=).*', '$1***MASKED***'
  $masked = $masked -replace '(?i)(DATABASE_URL=).*', '$1***MASKED***'
  return $masked
}

Write-Host 'dotWatch Raspberry Pi ingest diagnostic'
Write-Host "Target: $Remote"
Write-Host "Remote dir: $RemoteDir"
Write-Host "Default API URL: $DefaultApiUrl"
Write-Host 'Secrets are masked. This script does not print DEVICE_SECRET.'

Write-Section 'Backend /health from this computer'
try {
  $healthUrl = $DefaultApiUrl.TrimEnd('/') + '/health'
  Write-Host "GET $healthUrl"
  $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 20
  Write-Host "Status: $($response.StatusCode)"
  Write-Host (Mask-Text $response.Content)
} catch {
  Write-Warning "Backend /health failed from this computer: $($_.Exception.Message)"
}

Write-Section 'Remote .env snapshot masked'
$envCmd = "cd '$RemoteDir' 2>/dev/null && if [ -f .env ]; then sed -E 's/(SECRET|PASSWORD|TOKEN|KEY|DATABASE_URL|PRIVATE_KEY)=.*/\1=***MASKED***/g' .env; else echo MISSING .env; fi"
Invoke-External -FilePath 'ssh' -Arguments @($Remote, $envCmd) -AllowFailure | Out-Null

$pythonDiag = @'
import json
import os
import pathlib
import sys
import time

try:
    import requests
except Exception as exc:
    print("REQUESTS_IMPORT_ERROR:", exc)
    sys.exit(2)


def mask_value(value):
    if value is None:
        return value
    return "***MASKED***"


def mask_obj(value):
    if isinstance(value, dict):
        masked = {}
        for key, item in value.items():
            if any(token in str(key).upper() for token in ["SECRET", "PASSWORD", "TOKEN", "KEY", "DATABASE_URL", "PRIVATE_KEY"]):
                masked[key] = "***MASKED***"
            else:
                masked[key] = mask_obj(item)
        return masked
    if isinstance(value, list):
        return [mask_obj(item) for item in value]
    return value


def print_json_line(label, raw_line):
    if not raw_line:
        print(f"{label}: EMPTY")
        return
    try:
        obj = json.loads(raw_line)
        print(f"{label}:", json.dumps(mask_obj(obj), ensure_ascii=False, sort_keys=True)[:1200])
    except Exception:
        text = raw_line
        text = text.replace(os.getenv("DEVICE_SECRET", "__NO_SECRET__"), "***MASKED***")
        print(f"{label}:", text[:1200])


api_url = (
    os.getenv("DOTWATCH_API_URL")
    or os.getenv("API_URL")
    or os.getenv("BACKEND_URL")
    or ""
).strip()

device_code = (os.getenv("DEVICE_CODE") or "").strip()
device_secret = os.getenv("DEVICE_SECRET") or ""
firmware_version = os.getenv("FIRMWARE_VERSION") or "rpi-agent-diagnostic"
sensor_source = os.getenv("SENSOR_SOURCE") or "diagnostic"
queue_path = os.getenv("OFFLINE_QUEUE_PATH") or "/home/pi/dotwatch-pi-agent/data/offline_queue.jsonl"

print("dotWatch Pi ingest diagnostic")
print("requests OK", getattr(requests, "__version__", "unknown"))
print("API_URL:", api_url if api_url else "MISSING")
print("DEVICE_CODE:", device_code if device_code else "MISSING")
print("DEVICE_SECRET:", "FOUND_MASKED" if device_secret else "MISSING")
print("FIRMWARE_VERSION:", firmware_version)
print("SENSOR_SOURCE:", sensor_source)

queue_file = pathlib.Path(queue_path)
print("OFFLINE_QUEUE_PATH:", str(queue_file))
if queue_file.exists():
    lines = queue_file.read_text(encoding="utf-8", errors="replace").splitlines()
    print("OFFLINE_QUEUE_PENDING:", len(lines))
    if lines:
        print_json_line("OFFLINE_QUEUE_FIRST", lines[0])
        print_json_line("OFFLINE_QUEUE_LAST", lines[-1])
else:
    print("OFFLINE_QUEUE_PENDING: 0")
    print("OFFLINE_QUEUE_FILE: MISSING")

if not api_url:
    print("MISSING DOTWATCH_API_URL/API_URL/BACKEND_URL in .env")
    sys.exit(1)

health_url = api_url.rstrip("/") + "/health"
try:
    r = requests.get(health_url, timeout=15)
    print("HEALTH_STATUS:", r.status_code)
    print("HEALTH_BODY:", r.text[:800])
except Exception as exc:
    print("HEALTH_ERROR:", repr(exc))
    sys.exit(3)

if "--send-probe" in sys.argv:
    if not device_code or not device_secret:
        print("INGEST_SKIPPED: missing DEVICE_CODE or DEVICE_SECRET")
        sys.exit(4)

    ingest_url = api_url.rstrip("/") + "/api/ingest"
    payload = {
        "deviceCode": device_code,
        "deviceSecret": device_secret,
        "firmwareVersion": firmware_version,
        "sensorSource": sensor_source,
        "rssi": -45,
        "metrics": {
            "metric_1": 25.01,
            "metric_2": 50.02,
            "metric_3": -45,
        },
        "diagnostic": True,
        "clientTime": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    print("INGEST_URL:", ingest_url)
    print("INGEST_PAYLOAD_MASKED:", json.dumps(mask_obj(payload), ensure_ascii=False, sort_keys=True))
    try:
        r = requests.post(ingest_url, json=payload, timeout=20)
        print("INGEST_STATUS:", r.status_code)
        print("INGEST_BODY:", r.text[:1200])
        if r.status_code >= 400:
            sys.exit(5)
    except Exception as exc:
        print("INGEST_ERROR:", repr(exc))
        sys.exit(6)
else:
    print("INGEST_PROBE: skipped. Re-run with -SendProbe to post one diagnostic payload.")
'@

Write-Section 'Upload remote diagnostic script'
$tmpFile = [System.IO.Path]::GetTempFileName()
try {
  Set-Content -Path $tmpFile -Value $pythonDiag -Encoding UTF8
  Invoke-External -FilePath 'scp' -Arguments @($tmpFile, "$Remote:$RemoteDir/pi_ingest_diag_tmp.py") | Out-Null
} finally {
  Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
}

Write-Section 'Run ingest diagnostic from Raspberry Pi'
$probeArg = ''
if ($SendProbe) { $probeArg = '--send-probe' }
$runCmd = "cd '$RemoteDir' && set -a; [ -f .env ] && . ./.env; set +a; if [ -x venv/bin/python ]; then venv/bin/python pi_ingest_diag_tmp.py $probeArg; else python3 pi_ingest_diag_tmp.py $probeArg; fi"
Invoke-External -FilePath 'ssh' -Arguments @($Remote, $runCmd) -AllowFailure | Out-Null

Write-Section 'Cleanup temporary diagnostic file'
$cleanupCmd = "cd '$RemoteDir' 2>/dev/null && rm -f pi_ingest_diag_tmp.py || true"
Invoke-External -FilePath 'ssh' -Arguments @($Remote, $cleanupCmd) -AllowFailure | Out-Null

Write-Host ''
Write-Host 'Done.'
