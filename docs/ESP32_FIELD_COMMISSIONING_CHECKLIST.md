# dotWatch ESP32 Field Commissioning Checklist

Production candidate source:

```text
esp32/dotwatch_esp32_product/src/main.cpp
```

## Before flashing

- [ ] ESP32 board model confirmed.
- [ ] USB cable supports data.
- [ ] PlatformIO installed and `pio` works in terminal.
- [ ] Device exists in backend/dashboard.
- [ ] Device code and secret are ready.
- [ ] Root CA is prepared for HTTPS production use.

## Static safety check

```powershell
cd "D:\IoT Project\dotwatch"
npm run check:esp32:field
```

Expected:

- [ ] Setup AP password is not blank.
- [ ] Insecure TLS fallback is disabled by default.
- [ ] Root CA support is present.

## Build

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\esp32-field-check.ps1 -Build
```

- [ ] Build succeeds.
- [ ] No library resolution errors.

## Upload and monitor

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\esp32-field-check.ps1 -Build -Upload -Monitor
```

- [ ] Upload succeeds.
- [ ] Serial monitor starts.
- [ ] Firmware version printed.

## Setup portal

- SSID: `dotWatch-ESP32-Setup`
- Password: `dotwatch-setup`
- URL: `http://192.168.4.1/`

Checklist:

- [ ] Connect to setup AP.
- [ ] Enter Wi-Fi SSID/password.
- [ ] Enter backend URL.
- [ ] Enter device code and secret.
- [ ] Enter admin PIN.
- [ ] Paste Root CA for HTTPS production.
- [ ] Save and reboot.

## Runtime check

- [ ] ESP32 connects to Wi-Fi.
- [ ] Local admin page opens from LAN IP.
- [ ] Last send status is OK.
- [ ] Dashboard latest values update.
- [ ] Metrics are mapped:
  - `metric_1` = temperature
  - `metric_2` = humidity
  - `metric_3` = Wi-Fi RSSI

## Troubleshooting notes

- If HTTPS sends fail, check Root CA first.
- If Wi-Fi fails, hold BOOT for reset window and reconfigure.
- If values are NaN, check DHT pin/type and wiring.
- If dashboard does not update, check device code/secret and backend logs.
