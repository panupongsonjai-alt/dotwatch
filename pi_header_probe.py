import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone

api_url = os.environ.get("DOTWATCH_API_URL") or os.environ.get("API_URL")
device_code = os.environ.get("DEVICE_CODE")
device_secret = os.environ.get("DEVICE_SECRET")

if not api_url:
    raise SystemExit("MISSING DOTWATCH_API_URL")
if not device_code:
    raise SystemExit("MISSING DEVICE_CODE")
if not device_secret:
    raise SystemExit("MISSING DEVICE_SECRET")

payload = {
    "firmwareVersion": os.environ.get("FIRMWARE_VERSION", "rpi-agent-probe"),
    "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "metrics": {
        "metric_1": 25.5,
        "metric_2": 60.2,
        "metric_3": 220.0
    }
}

headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": "dotwatch-pi-agent/header-probe",
    "x-device-code": device_code,
    "x-device-secret": device_secret
}

request = urllib.request.Request(
    api_url.rstrip("/") + "/api/ingest",
    data=json.dumps(payload).encode("utf-8"),
    headers=headers,
    method="POST"
)

print("API_URL:", api_url)
print("DEVICE_CODE:", device_code)
print("DEVICE_SECRET: FOUND_MASKED")
print("HEADERS: x-device-code + x-device-secret")
print("PAYLOAD:", json.dumps({**payload, "deviceSecret": "***not-used***"}))

try:
    with urllib.request.urlopen(request, timeout=15) as response:
        body = response.read().decode("utf-8", errors="replace")
        print("INGEST_STATUS:", response.status)
        print("INGEST_BODY:", body)
except urllib.error.HTTPError as error:
    body = error.read().decode("utf-8", errors="replace")
    print("INGEST_STATUS:", error.code)
    print("INGEST_BODY:", body)
    raise SystemExit(3)