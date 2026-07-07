# dotWatch Phase 3 Pi ingest headers hotfix

This package fixes the Raspberry Pi agent when Render backend `/api/ingest` returns:

```text
401 Missing device credentials
```

The hotfix updates `/home/pi/dotwatch-pi-agent/main.py` so it sends:

- `x-device-code`
- `x-device-secret`

as HTTP headers. It also provides an updated `scripts/pi-ingest-diagnostic.ps1` that sends the probe in the same format.

## Install

From the dotWatch project root:

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\fix-phase3-pi-agent-ingest-headers.ps1

Copy-Item ".\scripts\pi-ingest-diagnostic.ps1" ".\scripts\pi-ingest-diagnostic.ps1.bak-before-headers" -Force
Copy-Item ".\pi-ingest-diagnostic.ps1" ".\scripts\pi-ingest-diagnostic.ps1" -Force
```

## Test

```powershell
npm run check:pi:ingest
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pi-ingest-diagnostic.ps1 -SendProbe
npm run check:pi
```

Do not delete the offline queue until ingest returns 200/201 consistently.
