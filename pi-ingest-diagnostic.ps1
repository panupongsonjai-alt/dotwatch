param(
  [string]$PiHost = '192.168.1.237',
  [string]$PiUser = 'pi',
  [string]$RemoteDir = '/home/pi/dotwatch-pi-agent',
  [string]$DefaultApiUrl = 'https://dotwatch-backend.onrender.com',
  [switch]$SendProbe
)

$ErrorActionPreference = 'Continue'
$Remote = "$PiUser@$PiHost"

function Write-Section {
  param([string]$Text)
  Write-Host ''
  Write-Host ('=' * 60)
  Write-Host $Text
  Write-Host ('=' * 60)
}

function Invoke-Native {
  param([scriptblock]$Command)
  & $Command
  if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Command failed or returned non-zero exit code: $LASTEXITCODE" -ForegroundColor Yellow
  }
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
  Write-Host $response.Content
} catch {
  Write-Host "WARNING: Backend health check from this computer failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Section 'Remote .env snapshot masked'
Invoke-Native { ssh $Remote "cd '$RemoteDir' 2>/dev/null && if [ -f .env ]; then sed -E 's/(SECRET|PASSWORD|TOKEN|KEY|DATABASE_URL|PRIVATE_KEY)=.*/\1=***MASKED***/g' .env; else echo MISSING .env; fi" }

$TempPy = Join-Path $env:TEMP ('dotwatch-pi-ingest-diag-' + [guid]::NewGuid().ToString('N') + '.py')
$RemotePy = "$RemoteDir/pi_ingest_diag_tmp.py"

$Python = @'
from __future__ import print_function
import json
import os
import sys
import time
from datetime import datetime, timezone

try:
    import requests
except Exception as exc:
    print('REQUESTS_IMPORT_ERROR:', str(exc))
    sys.exit(2)

send_probe = '--send-probe' in sys.argv
api_url = (
    os.environ.get('DOTWATCH_API_URL')
    or os.environ.get('API_URL')
    or os.environ.get('BACKEND_URL')
    or ''
).strip().rstrip('/')
device_code = (os.environ.get('DEVICE_CODE') or os.environ.get('DOTWATCH_DEVICE_CODE') or '').strip()
device_secret = (os.environ.get('DEVICE_SECRET') or os.environ.get('DOTWATCH_DEVICE_SECRET') or '').strip()
timeout = int(os.environ.get('REQUEST_TIMEOUT_SECONDS') or '15')
queue_path = os.environ.get('OFFLINE_QUEUE_PATH') or os.path.join(os.getcwd(), 'data', 'offline_queue.jsonl')

print('dotWatch Pi ingest diagnostic')
print('requests OK', getattr(requests, '__version__', 'unknown'))
print('API_URL:', api_url or 'MISSING')
print('DEVICE_CODE:', device_code or 'MISSING')
print('DEVICE_SECRET:', 'FOUND_MASKED' if device_secret else 'MISSING')
print('SEND_PROBE:', 'yes' if send_probe else 'no')

if not api_url:
    print('MISSING API URL. Expected DOTWATCH_API_URL, API_URL, or BACKEND_URL in .env')
    sys.exit(1)

try:
    r = requests.get(api_url + '/health', timeout=timeout)
    print('HEALTH_STATUS:', r.status_code)
    print('HEALTH_BODY:', r.text[:1000])
except Exception as exc:
    print('HEALTH_ERROR:', str(exc))

print('OFFLINE_QUEUE_PATH:', queue_path)
if os.path.exists(queue_path):
    try:
        with open(queue_path, 'r', encoding='utf-8') as f:
            lines = [line.strip() for line in f if line.strip()]
        print('OFFLINE_QUEUE_PENDING:', len(lines))
        if lines:
            print('OFFLINE_QUEUE_FIRST_SAMPLE:', lines[0][:1000])
            print('OFFLINE_QUEUE_LATEST_SAMPLE:', lines[-1][:1000])
    except Exception as exc:
        print('OFFLINE_QUEUE_ERROR:', str(exc))
else:
    print('OFFLINE_QUEUE_PENDING: 0')
    print('OFFLINE_QUEUE_NOTE: file not found')

if send_probe:
    if not device_code or not device_secret:
        print('INGEST_PROBE_ERROR: missing DEVICE_CODE or DEVICE_SECRET')
        sys.exit(3)

    payload = {
        'deviceCode': device_code,
        'firmwareVersion': os.environ.get('FIRMWARE_VERSION') or 'rpi-agent-diagnostic',
        'metrics': {
            'metric_1': 25.5,
            'metric_2': 60.2,
            'metric_3': 220.0,
        },
        'rssi': -55,
        'timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    }
    safe_payload = dict(payload)
    headers = {
        'Content-Type': 'application/json',
        'x-device-code': device_code,
        'x-device-secret': device_secret,
    }
    safe_headers = {
        'Content-Type': 'application/json',
        'x-device-code': device_code,
        'x-device-secret': '***MASKED***',
    }
    print('INGEST_HEADERS_SAFE:', json.dumps(safe_headers, ensure_ascii=False))
    print('INGEST_PAYLOAD_SAFE:', json.dumps(safe_payload, ensure_ascii=False))
    try:
        r = requests.post(api_url + '/api/ingest', json=payload, headers=headers, timeout=timeout)
        print('INGEST_STATUS:', r.status_code)
        print('INGEST_BODY:', r.text[:2000])
        if r.status_code >= 400:
            sys.exit(4)
    except Exception as exc:
        print('INGEST_ERROR:', str(exc))
        sys.exit(5)
else:
    print('INGEST_PROBE: skipped')
'@

Set-Content -Path $TempPy -Value $Python -Encoding UTF8

try {
  Write-Section 'Upload remote diagnostic script'
  Invoke-Native { scp $TempPy ("${Remote}:${RemotePy}") }

  Write-Section 'Run ingest diagnostic from Raspberry Pi'
  $probeArg = ''
  if ($SendProbe) { $probeArg = '--send-probe' }
  Invoke-Native { ssh $Remote "cd '$RemoteDir' && set -a; [ -f .env ] && . ./.env; set +a; if [ -x venv/bin/python ]; then venv/bin/python pi_ingest_diag_tmp.py $probeArg; else python3 pi_ingest_diag_tmp.py $probeArg; fi" }
}
finally {
  Write-Section 'Cleanup temporary diagnostic file'
  Invoke-Native { ssh $Remote "cd '$RemoteDir' 2>/dev/null && rm -f pi_ingest_diag_tmp.py || true" }
  Remove-Item $TempPy -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Done.'
