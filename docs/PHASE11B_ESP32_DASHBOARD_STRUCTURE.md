# Phase 11B — ESP32 Local Portal Dashboard Structure

## Summary

Phase 11B updates the ESP32-DHT3 local web portal so it feels structurally consistent with the dotWatch Dashboard while keeping ESP32 configuration, security, and firmware details separate.

Firmware version is now:

```text
esp32-dht3-security-0.9.0
```

## Changed files

```text
esp32/dotwatch_esp32_dht3_tls_hardened/src/main.cpp
esp32/dotwatch_esp32_dht3_tls_hardened/dotwatch_esp32_dht3_tls_hardened.ino
scripts/phase11b-esp32-dashboard-structure-verify.mjs
docs/PHASE11B_ESP32_STRUCTURE_ANALYSIS.md
docs/PHASE11B_ESP32_DASHBOARD_STRUCTURE.md
package.json
```

## What changed

### 1. Dashboard-like shell

The ESP32 portal now uses a workspace-like shell:

- Sidebar brand area
- Workspace navigation anchors
- Local status card
- Page hero
- Card sections
- Status badges
- Responsive mobile layout

### 2. Sections are grouped by intent

The old long form is now organized into sections:

```text
Overview
Network
Security
Device
Sensor
Operations
Danger zone
```

### 3. Live Device Snapshot

The portal now shows a top snapshot area similar to Dashboard cards:

- Wi-Fi status
- IP address
- RSSI
- Device code
- TLS mode
- Last send status
- remembered Wi-Fi summary
- backend URL
- masked device secret
- DHT settings
- uptime/send counters
- last error

### 4. ESP32 details remain separate

The portal still uses ESP32-specific routes and firmware logic:

```text
/
/save
/reset
/json
/test
```

No Dashboard React component is imported or reused.

### 5. Security behavior preserved

The change does not weaken ESP32 security:

- Local Admin PIN protection remains
- Device secret remains masked
- HTTPS Root CA requirement remains
- `DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK` remains the only way to allow insecure fallback

## Verify

Run:

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase11b:esp32-structure
```

Expected:

```text
Phase 11B ESP32/Dashboard structure verify: OK
```

## Build/upload ESP32

Use PlatformIO from Python module if `pio` is not on PATH:

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_dht3_tls_hardened"
py -m platformio run
py -m platformio run -t upload
py -m platformio device monitor
```

## Push commands

```powershell
cd "D:\IoT Project\dotwatch"
git status
git add .
git commit -m "Align ESP32 local portal with dashboard structure"
git push origin main
```
