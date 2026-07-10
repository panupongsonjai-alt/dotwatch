# Phase 11C — ESP32 Friendly Portal UX

## Summary

Phase 11C makes the ESP32 Local Portal easier for general users while keeping the visual tone aligned with the Dashboard.

Firmware version:

```text
esp32-dht3-security-0.9.1
```

## What users should see

The ESP32 portal now starts with:

- a simple Dashboard-like hero section
- a 4-step setup guide
- a readiness score
- friendly Wi-Fi, signal, HTTPS, send status and device status cards
- required setup fields first
- advanced settings collapsed below

## Main setup flow

1. Connect Wi-Fi
2. Set Backend URL
3. Enter Device Code and Device Secret
4. Save & Restart ESP32

Advanced panels still exist for:

- Root CA override
- Local Admin PIN
- DHT pin/type
- send interval
- fallback dummy mode
- factory reset

## Verify

From the repository root:

```powershell
npm run verify:phase11c:esp32-friendly-portal
```

Expected result:

```text
Phase 11C ESP32 friendly portal verify: OK
```

## Build and upload firmware

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_dht3_tls_hardened"

py -m platformio run
py -m platformio run -t upload
py -m platformio device monitor
```

After upload, open the ESP32 local IP in a browser, for example:

```text
http://192.168.1.212/
```

## Git push

```powershell
cd "D:\IoT Project\dotwatch"

git status
git add .
git commit -m "Improve ESP32 portal for general users"
git push origin main
```
