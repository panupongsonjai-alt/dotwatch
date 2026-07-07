param(
  [string]$PiHost = '192.168.1.237',
  [string]$PiUser = 'pi',
  [string]$RemoteDir = '/home/pi/dotwatch-pi-agent',
  [string]$DefaultApiUrl = 'https://dotwatch-backend.onrender.com',
  [switch]$SendProbe
)

$ErrorActionPreference = 'Stop'

function Write-Section {
  param([string]$Title)
  Write-Host ''
  Write-Host ('=' * 60)
  Write-Host $Title
  Write-Host ('=' * 60)
}

function Write-Warn {
  param([string]$Message)
  Write-Host "WARNING: $Message" -ForegroundColor Yellow
}

function Invoke-ExternalChecked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$AllowFailure
  )

  & $FilePath @Arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    $message = "Command failed or returned non-zero exit code: $exitCode"
    if ($AllowFailure) {
      Write-Warn $message
    } else {
      throw $message
    }
  }
}

$Remote = "$PiUser@$PiHost"
$ProbeFlag = if ($SendProbe) { '--send-probe' } else { '' }

Write-Host 'dotWatch Raspberry Pi ingest diagnostic'
Write-Host "Target: $Remote"
Write-Host "Remote dir: $RemoteDir"
Write-Host "Default API URL: $DefaultApiUrl"
Write-Host 'Secrets are masked. This script does not print DEVICE_SECRET.'

Write-Section 'Backend /health from this computer'
$healthUrl = $DefaultApiUrl.TrimEnd('/') + '/health'
Write-Host "GET $healthUrl"
try {
  $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 20
  Write-Host "Status: $($response.StatusCode)"
  Write-Host $response.Content
} catch {
  Write-Warn "Backend health check from this computer failed: $($_.Exception.Message)"
}

Write-Section 'Remote .env snapshot masked'
$envCommand = "cd '$RemoteDir' 2>/dev/null && if [ -f .env ]; then sed -E 's/(SECRET|PASSWORD|TOKEN|KEY|DATABASE_URL|PRIVATE_KEY)=.*/\1=***MASKED***/g' .env; else echo MISSING .env; fi"
Write-Host "ssh $Remote $envCommand"
Invoke-ExternalChecked -FilePath 'ssh' -Arguments @($Remote, $envCommand) -AllowFailure

$remotePython = @'
import argparse
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

SENSITIVE_WORDS = ("SECRET", "PASSWORD", "TOKEN", "KEY", "DATABASE_URL", "PRIVATE_KEY")


def mask_value(key, value):
    if key and any(word in str(key).upper() for word in SENSITIVE_WORDS):
        return "***MASKED***"
    return value


def mask_obj(value):
    if isinstance(value, dict):
        return {k: mask_value(k, mask_obj(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [mask_obj(item) for item in value]
    return value


def truncate(text, limit=900):
    text = str(text)
    if len(text) <= limit:
        return text
    return text[:limit] + "...<truncated>"


def get_env_first(*names):
    for name in names:
        value = os.environ.get(name)
        if value:
            return value.strip()
    return ""


def print_queue_info():
    queue_path = os.environ.get("OFFLINE_QUEUE_PATH") or str(pathlib.Path.cwd() / "data" / "offline_queue.jsonl")
    print("OFFLINE_QUEUE_PATH:", queue_path)
    path = pathlib.Path(queue_path)
    if not path.exists():
        print("OFFLINE_QUEUE_PENDING: 0")
        print("OFFLINE_QUEUE_STATUS: missing")
        return

    lines = []
    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                if line.strip():
                    lines.append(line.rstrip("\n"))
    except Exception as exc:
        print("OFFLINE_QUEUE_ERROR:", exc)
        return

    print("OFFLINE_QUEUE_PENDING:", len(lines))
    if not lines:
        return

    for label, line in (("FIRST", lines[0]), ("LATEST", lines[-1])):
        try:
            parsed = json.loads(line)
            safe = mask_obj(parsed)
            print(f"OFFLINE_QUEUE_{label}_SAMPLE:", truncate(json.dumps(safe, ensure_ascii=False, sort_keys=True)))
        except Exception:
            print(f"OFFLINE_QUEUE_{label}_SAMPLE:", truncate(line))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--send-probe", action="store_true")
    args = parser.parse_args()

    api_url = get_env_first("DOTWATCH_API_URL", "API_URL", "BACKEND_URL")
    device_code = get_env_first("DEVICE_CODE", "DOTWATCH_DEVICE_CODE")
    device_secret = get_env_first("DEVICE_SECRET", "DOTWATCH_DEVICE_SECRET")

    print("dotWatch Pi ingest diagnostic")
    print("requests OK", getattr(requests, "__version__", "unknown"))
    print("API_URL:", api_url or "MISSING")
    print("DEVICE_CODE:", device_code or "MISSING")
    print("DEVICE_SECRET:", "FOUND_MASKED" if device_secret else "MISSING")
    print("SEND_PROBE:", "yes" if args.send_probe else "no")

    if not api_url:
        print("MISSING DOTWATCH_API_URL/API_URL/BACKEND_URL in .env")
        print_queue_info()
        sys.exit(1)

    api_url = api_url.rstrip("/")

    try:
        response = requests.get(api_url + "/health", timeout=15)
        print("HEALTH_STATUS:", response.status_code)
        print("HEALTH_BODY:", truncate(response.text, 700))
    except Exception as exc:
        print("HEALTH_ERROR:", repr(exc))

    print_queue_info()

    if not args.send_probe:
        print("INGEST_PROBE: skipped")
        return

    if not device_code or not device_secret:
        print("INGEST_PROBE: skipped missing device code/secret")
        sys.exit(1)

    payload = {
        "deviceCode": device_code,
        "deviceSecret": device_secret,
        "firmwareVersion": os.environ.get("FIRMWARE_VERSION", "rpi-agent-diagnostic"),
        "metrics": {
            "metric_1": 25.5,
            "metric_2": 60.2,
            "metric_3": 220.0,
        },
        "rssi": -55,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    print("INGEST_PAYLOAD_SAFE:", json.dumps(mask_obj(payload), ensure_ascii=False, sort_keys=True))
    try:
        response = requests.post(api_url + "/api/ingest", json=payload, timeout=20)
        print("INGEST_STATUS:", response.status_code)
        print("INGEST_BODY:", truncate(response.text, 1200))
        if response.status_code >= 400:
            sys.exit(3)
    except Exception as exc:
        print("INGEST_ERROR:", repr(exc))
        sys.exit(4)


if __name__ == "__main__":
    main()
'@

$tempFile = [System.IO.Path]::GetTempFileName()
$remoteTmp = "$RemoteDir/pi_ingest_diag_tmp.py"

try {
  Set-Content -Path $tempFile -Value $remotePython -Encoding UTF8

  Write-Section 'Upload remote diagnostic script'
  $scpTarget = "${Remote}:$remoteTmp"
  Write-Host "scp $tempFile $scpTarget"
  Invoke-ExternalChecked -FilePath 'scp' -Arguments @($tempFile, $scpTarget)

  Write-Section 'Run ingest diagnostic from Raspberry Pi'
  $runCommand = "cd '$RemoteDir' && set -a; [ -f .env ] && . ./.env; set +a; if [ -x venv/bin/python ]; then venv/bin/python pi_ingest_diag_tmp.py $ProbeFlag; else python3 pi_ingest_diag_tmp.py $ProbeFlag; fi"
  Write-Host "ssh $Remote $runCommand"
  Invoke-ExternalChecked -FilePath 'ssh' -Arguments @($Remote, $runCommand) -AllowFailure
} finally {
  if (Test-Path $tempFile) {
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
  }

  Write-Section 'Cleanup temporary diagnostic file'
  $cleanupCommand = "cd '$RemoteDir' 2>/dev/null && rm -f pi_ingest_diag_tmp.py || true"
  Write-Host "ssh $Remote $cleanupCommand"
  Invoke-ExternalChecked -FilePath 'ssh' -Arguments @($Remote, $cleanupCommand) -AllowFailure
}

Write-Host ''
Write-Host 'Done.'
