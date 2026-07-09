# Phase 10D - Production Device Operations UX

Phase 10D improves the Devices page after ESP32 field ingest is working. It does not change backend, database schema, Pi agent, or ESP32 firmware.

## Goal

Make a real production device easier to evaluate from the dashboard. Operators should quickly see whether a device is online, recently ingested data, has usable metrics, has acceptable Wi-Fi signal, reports a production firmware, and has alarm rules ready.

## Changes

- Adds an **Operations** tab to the selected device panel.
- Adds a **Production Operations** checklist card inside Overview and Operations.
- Shows readiness score such as `5/6 Ready`.
- Shows field checks for:
  - Device connection
  - Latest ingest freshness
  - Metric payload availability
  - Wi-Fi signal quality
  - Firmware / TLS readiness
  - Alarm readiness
- Adds an ESP32-DHT3 field note with Local Admin PIN hint.
- Adds latest metric strip for quick checking.
- Adds `phase10d-device-operations.css` as the last dashboard CSS import so it stabilizes Devices UX without deleting existing styles.

## How to verify

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase10d:device-ops
npm run dashboard:build
```

## What to check manually

Open the dashboard and go to Devices. Select the ESP32 device that successfully posted to Render, for example `DW-1783498262178`.

Expected result:

- `Live Device Snapshot` still appears.
- `Production Operations` appears in Overview.
- The new `Operations` tab exists.
- The checklist shows current connection, latest ingest, metrics, Wi-Fi signal, firmware/TLS, and alarm readiness.
- The page stays visually consistent with the Dashboard cards and spacing.

## Release note

Strict database parity is not required for this phase. Phase 10D only changes frontend UX and can be deployed after Phase 10B ingest is confirmed.
