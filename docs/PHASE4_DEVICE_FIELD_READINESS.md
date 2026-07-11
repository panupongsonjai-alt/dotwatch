# dotWatch Phase 4 — Device Field Readiness

Last updated: 2026-07-08

Phase 4 prepares dotWatch devices for real-world setup and field testing before the next dashboard/admin UX phase.

## Goals

- Commission Raspberry Pi devices repeatably over SSH.
- Verify the Pi agent `.env`, sensor source, backend health and ingest path without exposing secrets.
- Provide a manual field test that can read real metrics and optionally send a controlled number of payloads.
- Keep offline queue behavior testable without flooding the backend.
- Keep ESP32 production candidate checks separate from old/root firmware copies.

## New canonical tools

| Tool | Purpose |
|---|---|
| `pi/agent/agent_field_test.py` | Runs controlled sensor reads, optional backend sends, optional offline queue append/flush test. |
| `scripts/pi-field-commissioning.ps1` | Windows-side SSH commissioning runner for Raspberry Pi. |
| `scripts/esp32-field-check.ps1` | Static ESP32 firmware safety check, optional PlatformIO build/upload/monitor. |
| `scripts/phase4-device-verify.ps1` | Repo verification for this Phase 4 device-readiness patch. |

## Raspberry Pi recommended flow

### 1. Copy patch into repo

Copy the patch files into:

```powershell
D:\IoT Project\dotwatch
```

### 2. Verify local repo files

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase4:device
```

### 3. Upload Pi agent and run dry field test

Use the latest Pi host you are testing. Example:

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\pi-field-commissioning.ps1 `
  -PiHost 192.168.1.237 `
  -PiUser pi `
  -UploadAgent `
  -InstallDependencies `
  -Cycles 3 `
  -ServiceStatus `
  -OpenTunnelHint
```

This performs sensor reads but does not send ingest payloads unless `-Send` is added.

### 4. Send real ingest test

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\pi-field-commissioning.ps1 `
  -PiHost 192.168.1.237 `
  -PiUser pi `
  -Cycles 3 `
  -Send `
  -QueueTest `
  -ServiceStatus `
  -TailLogs
```

Expected result:

- `Settings validation` = OK
- `Backend health` = OK
- `Sensor read` = OK
- `Backend ingest` = OK when `-Send` is used
- `Offline queue` = OK when `-QueueTest` is used

A JSON report is written on the Pi:

```text
/home/pi/dotwatch-pi-agent/reports/field-test-latest.json
```

## Manual Pi commands

Dry run:

```bash
cd /home/pi/dotwatch-pi-agent
./venv/bin/python agent_field_test.py --cycles 3
```

Send real ingest payloads:

```bash
cd /home/pi/dotwatch-pi-agent
./venv/bin/python agent_field_test.py --cycles 3 --send
```

Queue test:

```bash
cd /home/pi/dotwatch-pi-agent
./venv/bin/python agent_field_test.py --cycles 1 --send --queue-test
```

Self-check:

```bash
cd /home/pi/dotwatch-pi-agent
./venv/bin/python agent_self_check.py --send-test
```

## Pi security rules added in this phase

`pi/agent/config.py` now refuses unsafe device runtime configuration:

- Missing `DEVICE_CODE`
- Missing or weak/default `DEVICE_SECRET`
- Bad `DOTWATCH_API_URL` scheme
- Non-local HTTP backend URL unless `ALLOW_HTTP_API=true`
- Missing `modbus_config.json` when using `SENSOR_SOURCE=modbus`, `modbus_tcp`, or `modbus_rtu`

Use HTTPS for Render:

```env
DOTWATCH_API_URL=https://dotwatch-backend.onrender.com
ALLOW_HTTP_API=false
```

Use HTTP only for trusted lab/local network tests:

```env
DOTWATCH_API_URL=http://192.168.1.100:4000
ALLOW_HTTP_API=true
```

## ESP32 recommended flow

Static safety check only:

```powershell
cd "D:\IoT Project\dotwatch"
npm run check:esp32:field
```

Build with PlatformIO:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\esp32-field-check.ps1 -Build
```

Upload to board:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\esp32-field-check.ps1 -Build -Upload -Monitor
```

Production ESP32 source of truth remains:

```text
esp32/dotwatch_esp32_product/src/main.cpp
```

## Done criteria for Phase 4

- `npm run verify:phase4:device` passes locally.
- Pi dry field test passes.
- Pi `--send` field test creates new readings on backend.
- Offline queue test passes and does not leave a large queue pending.
- ESP32 static field check passes.
- ESP32 PlatformIO build passes before any board upload.
- Field notes are recorded using the checklist docs.

## What Phase 4 does not change

- It does not modify database schema.
- It does not change dashboard layout.
- It does not rotate real device secrets automatically.
- It does not expose the Pi Config UI on LAN by default.
